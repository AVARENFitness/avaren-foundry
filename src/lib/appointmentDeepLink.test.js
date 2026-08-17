import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APPOINTMENT_DEEP_LINK_EVENT,
  buildPushDeepLinkDedupeKey,
  consumePendingAppointmentDeepLink,
  markAppointmentDeepLinkHandled,
  parsePushDeepLinkUrl,
  peekPendingAppointmentDeepLink,
  PUSH_DEEP_LINK_TYPES,
  requestOpenAppointment,
  resetAppointmentDeepLinkState,
  resolvePushDeepLinkNavigation,
  shouldHandleAppointmentDeepLink,
  subscribeAppointmentDeepLink,
} from './appointmentDeepLink'

describe('appointmentDeepLink push URL parsing', () => {
  it('parses athlete appointment detail URLs before generic session routing', () => {
    expect(
      parsePushDeepLinkUrl('/?session=appt-1&open=appointment-detail'),
    ).toEqual({
      type: PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL,
      sessionId: 'appt-1',
      role: 'athlete',
    })
  })

  it('parses coach calendar URLs before generic session routing', () => {
    expect(parsePushDeepLinkUrl('/?open=coach-calendar&session=appt-1')).toEqual({
      type: PUSH_DEEP_LINK_TYPES.COACH_CALENDAR,
      sessionId: 'appt-1',
      role: 'coach',
    })
  })

  it('routes legacy session-only URLs to Account RSVP context', () => {
    expect(parsePushDeepLinkUrl('/?session=appt-legacy')).toEqual({
      type: PUSH_DEEP_LINK_TYPES.SESSION_RSVP,
      sessionId: 'appt-legacy',
      role: 'athlete',
    })
  })

  it('parses RSVP action URLs separately from appointment detail', () => {
    expect(
      parsePushDeepLinkUrl('/?session=appt-1&rsvp=confirmed'),
    ).toEqual({
      type: PUSH_DEEP_LINK_TYPES.RSVP_ACTION,
      sessionId: 'appt-1',
      rsvp: 'confirmed',
      role: 'athlete',
    })
  })
})

describe('appointmentDeepLink navigation resolution', () => {
  it('8.10.11: athlete appointment push resolves to Home + detail open', () => {
    const request = parsePushDeepLinkUrl(
      '/?session=appt-1&open=appointment-detail',
    )

    expect(resolvePushDeepLinkNavigation(request)).toEqual({
      screen: 'home',
      openAppointment: {
        sessionId: 'appt-1',
        role: 'athlete',
      },
    })
  })

  it('8.10.11: persisted Account tab must not win over appointment push routing', () => {
    const request = parsePushDeepLinkUrl(
      '/?session=appt-1&open=appointment-detail',
    )

    expect(resolvePushDeepLinkNavigation(request)?.screen).toBe('home')
    expect(resolvePushDeepLinkNavigation(request)?.screen).not.toBe('more')
  })

  it('coach appointment push resolves to coach calendar focus', () => {
    const request = parsePushDeepLinkUrl('/?open=coach-calendar&session=appt-1')

    expect(resolvePushDeepLinkNavigation(request)).toEqual({
      coachMode: true,
      coachScreen: 'calendar',
      focusSessionId: 'appt-1',
    })
  })

  it('series notification push resolves to athlete schedule', () => {
    const request = parsePushDeepLinkUrl('/?open=athlete-schedule')

    expect(resolvePushDeepLinkNavigation(request)).toEqual({
      screen: 'in-person-schedule',
    })
  })

  it('normal launch without deep link params resolves to null', () => {
    expect(parsePushDeepLinkUrl('/')).toBeNull()
    expect(resolvePushDeepLinkNavigation(null)).toBeNull()
  })
})

describe('appointmentDeepLink pending + idempotency', () => {
  afterEach(() => {
    resetAppointmentDeepLinkState()
  })

  it('8.10.11: app already open queues pending detail until Home subscribes', () => {
    const handler = vi.fn()

    expect(
      requestOpenAppointment('appt-1', { role: 'athlete' }),
    ).toBe(true)
    expect(handler).not.toHaveBeenCalled()

    const unsubscribe = subscribeAppointmentDeepLink(handler)
    expect(handler).toHaveBeenCalledWith({
      type: PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL,
      sessionId: 'appt-1',
      role: 'athlete',
    })
    expect(peekPendingAppointmentDeepLink({ role: 'athlete' })).toBeNull()

    unsubscribe()
  })

  it('8.10.11: cold launch can consume pending detail after auth readiness', () => {
    requestOpenAppointment('appt-2', { role: 'athlete' })

    expect(consumePendingAppointmentDeepLink({ role: 'athlete' })).toEqual({
      type: PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL,
      sessionId: 'appt-2',
      role: 'athlete',
    })
    expect(consumePendingAppointmentDeepLink({ role: 'athlete' })).toBeNull()
  })

  it('opens appointment detail exactly once for duplicate requests', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeAppointmentDeepLink(handler)

    expect(requestOpenAppointment('appt-3')).toBe(true)
    expect(requestOpenAppointment('appt-3')).toBe(false)
    expect(handler).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('marks handled only after successful open and blocks re-open', () => {
    expect(shouldHandleAppointmentDeepLink({ sessionId: 'appt-4' })).toBe(true)

    markAppointmentDeepLinkHandled({ sessionId: 'appt-4' })

    expect(shouldHandleAppointmentDeepLink({ sessionId: 'appt-4' })).toBe(false)
    expect(requestOpenAppointment('appt-4')).toBe(false)
  })

  it('dedupes duplicate push open URLs by canonical key', () => {
    const request = parsePushDeepLinkUrl(
      '/?session=appt-5&open=appointment-detail',
    )

    expect(buildPushDeepLinkDedupeKey(request)).toBe(
      'appointment-detail:appt-5:',
    )
  })

  it('dispatches AVAREN push open event for immediate listeners', () => {
    const handler = vi.fn()
    window.addEventListener(APPOINTMENT_DEEP_LINK_EVENT, handler)

    requestOpenAppointment('appt-6')

    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener(APPOINTMENT_DEEP_LINK_EVENT, handler)
    resetAppointmentDeepLinkState()
  })
})

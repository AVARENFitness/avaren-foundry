import { describe, expect, it } from 'vitest'
import {
  activeEndpointOwners,
  activeSubscriptionsForUser,
  applyPushEndpointOwnership,
  findActiveEndpointCollisions,
  maskPushEndpoint,
  selectAssignmentPushRecipients,
} from './pushSubscriptionOwnership'

const ENDPOINT_E = 'https://push.example/device-e'
const JAKE = 'user-jake'
const COACH = 'user-coach'
const JAKE_PHONE = 'https://push.example/jake-phone'
const JAKE_IPAD = 'https://push.example/jake-ipad'

describe('pushSubscriptionOwnership', () => {
  it('1-4. transfers endpoint E from Jake to main account', () => {
    const initial = [
      {
        id: '1',
        user_id: JAKE,
        endpoint: ENDPOINT_E,
        active: true,
        p256dh: 'jake-key',
        auth: 'jake-auth',
      },
    ]

    const next = applyPushEndpointOwnership({
      rows: initial,
      endpoint: ENDPOINT_E,
      newUserId: COACH,
      keys: { p256dh: 'coach-key', auth: 'coach-auth' },
    })

    expect(activeSubscriptionsForUser(next, JAKE)).toHaveLength(0)
    expect(activeSubscriptionsForUser(next, COACH)).toHaveLength(1)
    expect(next.find((row) => row.endpoint === ENDPOINT_E)?.user_id).toBe(COACH)
  })

  it('5. Jake assignment push excludes endpoint after ownership transfer', () => {
    const rows = applyPushEndpointOwnership({
      rows: [
        {
          id: '1',
          user_id: JAKE,
          endpoint: ENDPOINT_E,
          active: true,
        },
      ],
      endpoint: ENDPOINT_E,
      newUserId: COACH,
    })

    const recipients = selectAssignmentPushRecipients({
      subscriptions: rows,
      athleteId: JAKE,
    })

    expect(recipients).toHaveLength(0)
  })

  it('6. another Jake device endpoint remains eligible', () => {
    const rows = [
      {
        id: '1',
        user_id: COACH,
        endpoint: ENDPOINT_E,
        active: true,
      },
      {
        id: '2',
        user_id: JAKE,
        endpoint: JAKE_IPAD,
        active: true,
      },
    ]

    const recipients = selectAssignmentPushRecipients({
      subscriptions: rows,
      athleteId: JAKE,
    })

    expect(recipients).toHaveLength(1)
    expect(recipients[0].endpoint).toBe(JAKE_IPAD)
  })

  it('7. switching back to Jake transfers endpoint ownership again', () => {
    let rows = applyPushEndpointOwnership({
      rows: [{ id: '1', user_id: COACH, endpoint: ENDPOINT_E, active: true }],
      endpoint: ENDPOINT_E,
      newUserId: JAKE,
    })

    rows = applyPushEndpointOwnership({
      rows,
      endpoint: ENDPOINT_E,
      newUserId: JAKE,
      keys: { p256dh: 'jake-key', auth: 'jake-auth' },
    })

    expect(activeSubscriptionsForUser(rows, JAKE)[0]?.endpoint).toBe(ENDPOINT_E)
    expect(activeSubscriptionsForUser(rows, COACH)).toHaveLength(0)
  })

  it('8. multiple distinct endpoints for same user remain supported', () => {
    const rows = [
      { id: '1', user_id: JAKE, endpoint: JAKE_PHONE, active: true },
      { id: '2', user_id: JAKE, endpoint: JAKE_IPAD, active: true },
    ]

    expect(activeSubscriptionsForUser(rows, JAKE)).toHaveLength(2)
    expect(findActiveEndpointCollisions(rows)).toHaveLength(0)
  })

  it('9. cannot register endpoint for arbitrary user_id via model', () => {
    expect(() =>
      applyPushEndpointOwnership({
        rows: [],
        endpoint: ENDPOINT_E,
        newUserId: '',
      }),
    ).toThrow()
  })

  it('11-12. inactive rows do not receive push and collisions resolve after transfer', () => {
    const rows = applyPushEndpointOwnership({
      rows: [
        { id: '1', user_id: JAKE, endpoint: ENDPOINT_E, active: true },
        { id: '2', user_id: COACH, endpoint: ENDPOINT_E, active: false },
      ],
      endpoint: ENDPOINT_E,
      newUserId: COACH,
    })

    expect(findActiveEndpointCollisions(rows)).toHaveLength(0)
    expect(activeEndpointOwners(rows).get(ENDPOINT_E)).toBe(COACH)
    expect(
      selectAssignmentPushRecipients({
        subscriptions: rows.filter((row) => !row.active),
        athleteId: JAKE,
      }),
    ).toHaveLength(0)
  })

  it('20. coach device endpoint owned by coach does not receive Jake assignment push', () => {
    const rows = [
      { id: '1', user_id: COACH, endpoint: ENDPOINT_E, active: true },
      { id: '2', user_id: JAKE, endpoint: JAKE_IPAD, active: true },
    ]

    const coachDevice = selectAssignmentPushRecipients({
      subscriptions: rows,
      athleteId: JAKE,
    }).some((row) => row.endpoint === ENDPOINT_E)

    expect(coachDevice).toBe(false)
  })
})

export const APPOINTMENT_DEEP_LINK_EVENT = 'avaren:open-appointment'

export const PUSH_DEEP_LINK_TYPES = {
  APPOINTMENT_DETAIL: 'appointment-detail',
  COACH_CALENDAR: 'coach-calendar',
  ATHLETE_SCHEDULE: 'athlete-schedule',
  SESSION_RSVP: 'session-rsvp',
  RSVP_ACTION: 'rsvp-action',
  ASSIGNMENT: 'assignment',
  NOTIFICATIONS: 'notifications',
}

const DEFAULT_PUSH_ORIGIN = 'https://avaren.local'

let pendingAppointmentDeepLink = null
const handledAppointmentDeepLinks = new Set()
const activeAppointmentDeepLinkKeys = new Set()

export const buildAppointmentDeepLinkKey = ({ sessionId, role = 'athlete' } = {}) =>
  `${role}:${sessionId}`

export const buildPushDeepLinkDedupeKey = (request) => {
  if (!request?.type) return null

  if (request.sessionId) {
    return `${request.type}:${request.sessionId}:${request.rsvp ?? ''}`
  }

  if (request.assignmentId) {
    return `${request.type}:${request.assignmentId}`
  }

  return request.type
}

export const parsePushDeepLinkUrl = (rawUrl) => {
  if (!rawUrl) return null

  try {
    const url = new URL(rawUrl, DEFAULT_PUSH_ORIGIN)
    const assignmentId = url.searchParams.get('assignment')
    const sessionId = url.searchParams.get('session')
    const rsvp = url.searchParams.get('rsvp')
    const openTarget = url.searchParams.get('open')

    if (sessionId && rsvp) {
      return {
        type: PUSH_DEEP_LINK_TYPES.RSVP_ACTION,
        sessionId,
        rsvp,
        role: 'athlete',
      }
    }

    if (openTarget === PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL && sessionId) {
      return {
        type: PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL,
        sessionId,
        role: 'athlete',
      }
    }

    if (openTarget === PUSH_DEEP_LINK_TYPES.COACH_CALENDAR) {
      return {
        type: PUSH_DEEP_LINK_TYPES.COACH_CALENDAR,
        sessionId,
        role: 'coach',
      }
    }

    if (openTarget === PUSH_DEEP_LINK_TYPES.ATHLETE_SCHEDULE) {
      return {
        type: PUSH_DEEP_LINK_TYPES.ATHLETE_SCHEDULE,
        role: 'athlete',
      }
    }

    if (openTarget === 'session-rsvp' || (sessionId && !openTarget)) {
      return {
        type: PUSH_DEEP_LINK_TYPES.SESSION_RSVP,
        sessionId,
        role: 'athlete',
      }
    }

    if (assignmentId) {
      return {
        type: PUSH_DEEP_LINK_TYPES.ASSIGNMENT,
        assignmentId,
        role: 'athlete',
      }
    }

    if (openTarget === 'notifications') {
      return {
        type: PUSH_DEEP_LINK_TYPES.NOTIFICATIONS,
        role: 'athlete',
      }
    }

    return null
  } catch {
    return null
  }
}

export const resolvePushDeepLinkNavigation = (request) => {
  if (!request?.type) return null

  switch (request.type) {
    case PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL:
      return {
        screen: 'home',
        openAppointment: {
          sessionId: request.sessionId,
          role: request.role ?? 'athlete',
        },
      }
    case PUSH_DEEP_LINK_TYPES.COACH_CALENDAR:
      return {
        coachMode: true,
        coachScreen: 'calendar',
        focusSessionId: request.sessionId ?? null,
      }
    case PUSH_DEEP_LINK_TYPES.ATHLETE_SCHEDULE:
      return {
        screen: 'in-person-schedule',
      }
    case PUSH_DEEP_LINK_TYPES.RSVP_ACTION:
      return {
        screen: 'more',
        rsvpAction: {
          sessionId: request.sessionId,
          rsvp: request.rsvp,
        },
      }
    case PUSH_DEEP_LINK_TYPES.SESSION_RSVP:
      return {
        screen: 'more',
        sessionId: request.sessionId ?? null,
      }
    case PUSH_DEEP_LINK_TYPES.ASSIGNMENT:
      return {
        assignmentId: request.assignmentId,
      }
    case PUSH_DEEP_LINK_TYPES.NOTIFICATIONS:
      return {
        screen: 'notifications',
      }
    default:
      return null
  }
}

export const shouldHandleAppointmentDeepLink = ({
  sessionId,
  role = 'athlete',
} = {}) => {
  if (!sessionId) return false
  return !handledAppointmentDeepLinks.has(
    buildAppointmentDeepLinkKey({ sessionId, role }),
  )
}

export const markAppointmentDeepLinkHandled = ({
  sessionId,
  role = 'athlete',
} = {}) => {
  if (!sessionId) return

  handledAppointmentDeepLinks.add(buildAppointmentDeepLinkKey({ sessionId, role }))
  activeAppointmentDeepLinkKeys.delete(
    buildAppointmentDeepLinkKey({ sessionId, role }),
  )

  if (
    pendingAppointmentDeepLink?.sessionId === sessionId &&
    pendingAppointmentDeepLink?.role === role
  ) {
    pendingAppointmentDeepLink = null
  }
}

export const peekPendingAppointmentDeepLink = ({ role = 'athlete' } = {}) => {
  if (!pendingAppointmentDeepLink || pendingAppointmentDeepLink.role !== role) {
    return null
  }

  return pendingAppointmentDeepLink
}

export const consumePendingAppointmentDeepLink = ({ role = 'athlete' } = {}) => {
  const pending = peekPendingAppointmentDeepLink({ role })
  if (!pending) return null

  pendingAppointmentDeepLink = null
  return pending
}

export const releaseAppointmentDeepLinkClaim = ({
  sessionId,
  role = 'athlete',
} = {}) => {
  activeAppointmentDeepLinkKeys.delete(
    buildAppointmentDeepLinkKey({ sessionId, role }),
  )

  if (
    pendingAppointmentDeepLink?.sessionId === sessionId &&
    pendingAppointmentDeepLink?.role === role
  ) {
    pendingAppointmentDeepLink = null
  }
}

export const resetAppointmentDeepLinkState = () => {
  pendingAppointmentDeepLink = null
  handledAppointmentDeepLinks.clear()
  activeAppointmentDeepLinkKeys.clear()
}

export const requestOpenAppointment = (
  sessionId,
  { role = 'athlete' } = {},
) => {
  if (!sessionId || typeof window === 'undefined') return false

  const key = buildAppointmentDeepLinkKey({ sessionId, role })
  if (!shouldHandleAppointmentDeepLink({ sessionId, role })) return false
  if (activeAppointmentDeepLinkKeys.has(key)) return false

  activeAppointmentDeepLinkKeys.add(key)

  const request = {
    type: PUSH_DEEP_LINK_TYPES.APPOINTMENT_DETAIL,
    sessionId,
    role,
  }

  pendingAppointmentDeepLink = request

  window.dispatchEvent(
    new CustomEvent(APPOINTMENT_DEEP_LINK_EVENT, {
      detail: request,
    }),
  )

  return true
}

export const subscribeAppointmentDeepLink = (handler) => {
  if (typeof window === 'undefined') return () => {}

  const listener = (event) => {
    const detail = event.detail ?? {}
    if (detail.role !== 'athlete' || !detail.sessionId) return
    if (!shouldHandleAppointmentDeepLink(detail)) return

    pendingAppointmentDeepLink = null
    handler(detail)
  }

  window.addEventListener(APPOINTMENT_DEEP_LINK_EVENT, listener)

  const pending = consumePendingAppointmentDeepLink({ role: 'athlete' })
  if (pending && shouldHandleAppointmentDeepLink(pending)) {
    handler(pending)
  }

  return () => window.removeEventListener(APPOINTMENT_DEEP_LINK_EVENT, listener)
}

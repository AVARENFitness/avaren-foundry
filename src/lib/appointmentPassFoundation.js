import { APPOINTMENT_STATUS } from './coachingAppointment'
import { emptySessionPackage, normalizeSessionPackage } from './sessionPackages'

/** Initial pass usage policy — scheduling alone never consumes credit. */
export const PASS_USAGE_POLICY = {
  COMPLETED: 'consumes_credit',
  CANCELLED: 'no_credit',
  MISSED: 'no_credit_default',
  SCHEDULED: 'no_credit',
  RESCHEDULED: 'no_additional_credit',
}

export const PASS_ADJUSTMENT_TYPE = {
  BONUS: 'bonus',
  CORRECTION: 'correction',
  TRANSFER: 'transfer',
  COMP: 'comp',
  MANUAL_DEBIT: 'manual_debit',
}

export const deriveCompletedAppointmentCount = (appointments = []) =>
  (appointments ?? []).filter(
    (item) => item?.status === APPOINTMENT_STATUS.COMPLETED,
  ).length

export const derivePassUsageSnapshot = ({
  appointments = [],
  packageRow = null,
  adjustments = [],
} = {}) => {
  const pkg = normalizeSessionPackage(packageRow) ?? emptySessionPackage()
  const completedFromAppointments = deriveCompletedAppointmentCount(appointments)
  const adjustmentDelta = (adjustments ?? []).reduce(
    (sum, item) => sum + Number(item?.sessionDelta ?? 0),
    0,
  )

  const totalSessions = Math.max(0, Number(pkg.totalSessions ?? 0))
  const derivedUsed = Math.max(0, completedFromAppointments)
  const storedUsed = Math.max(0, Number(pkg.sessionsUsed ?? 0))
  const usedSessions = Math.max(derivedUsed, storedUsed)
  const remainingSessions = Math.max(0, totalSessions - usedSessions + adjustmentDelta)

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
    completedFromAppointments,
    adjustmentDelta,
    source: 'derived_from_completed_appointments',
    policy: PASS_USAGE_POLICY,
  }
}

export const appointmentConsumesPassCredit = (appointment = {}) =>
  appointment?.status === APPOINTMENT_STATUS.COMPLETED

export const scheduledAppointmentConsumesPassCredit = () => false

/** Deterministic AVA coach pass query contracts — model must not invent balances. */
export const AVA_COACH_PASS_QUERY_CONTRACT = {
  sessionsRemaining: ({ snapshot }) => snapshot?.remainingSessions ?? null,
  sessionsUsed: ({ snapshot }) => snapshot?.usedSessions ?? null,
  lastInPersonSession: ({ history = [] }) => history[0] ?? null,
  completedThisMonth: ({ appointments = [], monthKey = '' }) =>
    appointments.filter(
      (item) =>
        item?.status === APPOINTMENT_STATUS.COMPLETED &&
        String(item.sessionDate ?? '').startsWith(monthKey),
    ).length,
}

/** Athlete-safe pass query contract — own data only. */
export const AVA_ATHLETE_PASS_QUERY_CONTRACT = {
  sessionsRemaining: ({ snapshot }) => snapshot?.remainingSessions ?? null,
  sessionsUsed: ({ snapshot }) => snapshot?.usedSessions ?? null,
  nextSession: ({ upcoming = [] }) => upcoming[0] ?? null,
}

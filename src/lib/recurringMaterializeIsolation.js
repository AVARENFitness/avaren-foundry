export const APPOINTMENT_OVERLAP_SQLSTATE = '99001'
export const APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE = '23P01'
export const APPOINTMENT_OVERLAP_MESSAGE = 'appointment_overlap'

export const APPOINTMENT_OVERLAP_SQLSTATES = [
  APPOINTMENT_OVERLAP_SQLSTATE,
  APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE,
]

export const isAppointmentOverlapSqlState = (sqlState = '') =>
  APPOINTMENT_OVERLAP_SQLSTATES.includes(String(sqlState))

export const isAppointmentOverlapError = ({
  sqlState = '',
  code = '',
  message = '',
} = {}) => {
  const normalizedMessage = String(message)
  const normalizedCode = String(code || sqlState)

  return (
    isAppointmentOverlapSqlState(normalizedCode) ||
    normalizedMessage === APPOINTMENT_OVERLAP_MESSAGE ||
    normalizedMessage.includes('appointment_overlap') ||
    /coach_scheduled_sessions_no_overlap/i.test(normalizedMessage)
  )
}

export const appointmentsOverlap = (left = {}, right = {}) => {
  if (String(left.coachId ?? '') !== String(right.coachId ?? '')) return false
  if (String(left.status ?? 'scheduled') !== 'scheduled') return false
  if (String(right.status ?? 'scheduled') !== 'scheduled') return false

  const leftStart = left.startsAt ?? left.starts_at
  const leftEnd = left.endsAt ?? left.ends_at
  const rightStart = right.startsAt ?? right.starts_at
  const rightEnd = right.endsAt ?? right.ends_at

  if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false

  return leftStart < rightEnd && rightStart < leftEnd
}

export const assertNoScheduleOverlap = ({
  existingAppointments = [],
  candidate = {},
  excludeId = null,
} = {}) => {
  for (const appointment of existingAppointments) {
    if (excludeId && String(appointment.id) === String(excludeId)) continue

    if (appointmentsOverlap(appointment, candidate)) {
      const error = new Error(
        'conflicting key value violates exclusion constraint "coach_scheduled_sessions_no_overlap"',
      )
      error.sqlState = APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE
      error.code = APPOINTMENT_OVERLAP_EXCLUSION_SQLSTATE
      throw error
    }
  }
}

export const simulateConcurrentScheduleWrites = ({
  existingAppointments = [],
  writers = [],
} = {}) => {
  const ledger = [...existingAppointments]
  const results = []

  for (const writer of writers) {
    try {
      assertNoScheduleOverlap({
        existingAppointments: ledger,
        candidate: writer.candidate,
        excludeId: writer.excludeId ?? null,
      })
      const created = {
        id: writer.id,
        ...writer.candidate,
      }
      ledger.push(created)
      results.push({ id: writer.id, ok: true })
    } catch (error) {
      results.push({
        id: writer.id,
        ok: false,
        sqlState: error?.sqlState ?? error?.code ?? '',
        message: error?.message ?? '',
      })
    }
  }

  return { ledger, results }
}

export const simulateIsolatedMaterialization = ({
  occurrenceDates = [],
  existingDates = [],
  conflictingDates = [],
  fatalErrorDate = null,
} = {}) => {
  const existing = new Set(existingDates)
  const conflicts = new Set(conflictingDates)
  let created = 0
  let conflictCount = 0

  for (const date of occurrenceDates) {
    if (existing.has(date)) continue

    if (fatalErrorDate && date === fatalErrorDate) {
      throw new Error('materialize_series_failed')
    }

    if (conflicts.has(date)) {
      conflictCount += 1
      continue
    }

    existing.add(date)
    created += 1
  }

  return { created, conflicts: conflictCount, failed: 0 }
}

export const simulateAtomicMaterialization = ({
  occurrenceDates = [],
  existingDates = [],
  conflictingDates = [],
} = {}) => {
  const existing = new Set(existingDates)
  const created = []

  for (const date of occurrenceDates) {
    if (existing.has(date)) continue

    if (conflictingDates.includes(date)) {
      const error = new Error(APPOINTMENT_OVERLAP_MESSAGE)
      error.sqlState = APPOINTMENT_OVERLAP_SQLSTATE
      throw error
    }

    existing.add(date)
    created.push(date)
  }

  return { created: created.length, dates: created }
}

export const materializeUsesSavepointIsolation = (sqlSource = '') => {
  const normalized = String(sqlSource)
  return /savepoint|rollback to savepoint|release savepoint/i.test(normalized)
}

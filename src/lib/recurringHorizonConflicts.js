export const RECURRENCE_CONFLICT_STATUS = {
  UNRESOLVED: 'unresolved',
  RESOLVED: 'resolved',
  WAIVED: 'waived',
}

export const isRecurrenceDateAccountedFor = ({
  occurrenceDate = '',
  existingOccurrenceDates = [],
  conflictRecords = [],
} = {}) =>
  existingOccurrenceDates.includes(occurrenceDate) ||
  conflictRecords.some((record) => record.occurrenceDate === occurrenceDate)

export const recordRecurrenceConflict = ({
  seriesId = '',
  occurrenceDate = '',
  conflictingSessionId = null,
  conflictRecords = [],
} = {}) => {
  const existing = conflictRecords.find(
    (record) =>
      record.seriesId === seriesId && record.occurrenceDate === occurrenceDate,
  )

  if (existing) {
    return {
      conflictRecords,
      created: false,
    }
  }

  return {
    conflictRecords: [
      ...conflictRecords,
      {
        seriesId,
        occurrenceDate,
        conflictingSessionId,
        status: RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
      },
    ],
    created: true,
  }
}

export const simulateInRunOccurrenceLimitMaterialization = ({
  seriesId = 'series-1',
  existingSlotCount = 0,
  occurrenceDates = [],
  conflictingDates = [],
  initialConflictRecords = [],
  occurrenceLimit = null,
} = {}) => {
  let vOccurrenceSlots = existingSlotCount
  let conflictRecords = [...initialConflictRecords]
  let occurrenceDatesSet = []
  let created = 0
  let conflicts = 0

  for (const date of occurrenceDates) {
    if (occurrenceLimit != null && vOccurrenceSlots >= occurrenceLimit) {
      break
    }

    if (
      isRecurrenceDateAccountedFor({
        occurrenceDate: date,
        existingOccurrenceDates: occurrenceDatesSet,
        conflictRecords,
      })
    ) {
      continue
    }

    if (conflictingDates.includes(date)) {
      const result = recordRecurrenceConflict({
        seriesId,
        occurrenceDate: date,
        conflictingSessionId: `conflict-${date}`,
        conflictRecords,
      })
      conflictRecords = result.conflictRecords
      if (result.created) {
        conflicts += 1
        vOccurrenceSlots += 1
      }
      continue
    }

    occurrenceDatesSet.push(date)
    created += 1
    vOccurrenceSlots += 1
  }

  return {
    created,
    conflicts,
    conflictRecords,
    occurrenceDates: occurrenceDatesSet,
    vOccurrenceSlots,
  }
}

export const simulateIsolatedMaterializationWithConflicts = ({
  seriesId = 'series-1',
  occurrenceDates = [],
  existingOccurrenceDates = [],
  conflictingDates = [],
  initialConflictRecords = [],
  horizonEndDate = null,
  occurrenceLimit = null,
} = {}) => {
  let occurrenceDatesSet = [...existingOccurrenceDates]
  let conflictRecords = [...initialConflictRecords]
  let created = 0
  let conflicts = 0

  for (const date of occurrenceDates) {
    const lifetimeSlots = new Set([
      ...occurrenceDatesSet,
      ...conflictRecords
        .filter((record) => record.seriesId === seriesId)
        .map((record) => record.occurrenceDate),
    ]).size

    if (occurrenceLimit != null && lifetimeSlots >= occurrenceLimit) {
      break
    }

    if (
      isRecurrenceDateAccountedFor({
        occurrenceDate: date,
        existingOccurrenceDates: occurrenceDatesSet,
        conflictRecords,
      })
    ) {
      continue
    }

    if (conflictingDates.includes(date)) {
      const result = recordRecurrenceConflict({
        seriesId,
        occurrenceDate: date,
        conflictingSessionId: `conflict-${date}`,
        conflictRecords,
      })
      conflictRecords = result.conflictRecords
      if (result.created) {
        conflicts += 1
      }
      continue
    }

    occurrenceDatesSet.push(date)
    created += 1
  }

  const materializedThrough =
    horizonEndDate ??
    occurrenceDates.reduce((latest, date) => (date > latest ? date : latest), occurrenceDates[0] ?? '')

  const unaccountedDates = occurrenceDates.filter(
    (date) =>
      !isRecurrenceDateAccountedFor({
        occurrenceDate: date,
        existingOccurrenceDates: occurrenceDatesSet,
        conflictRecords,
      }),
  )

  return {
    created,
    conflicts,
    conflictRecords,
    occurrenceDates: occurrenceDatesSet,
    materializedThrough,
    unaccountedDates,
  }
}

export const resolveEligibleRecurrenceConflicts = ({
  seriesId = 'series-1',
  conflictRecords = [],
  conflictingDates = [],
  occurrenceEndAtByDate = {},
  existingOccurrenceDates = [],
  now = new Date(),
} = {}) => {
  let materialized = 0
  let waived = 0
  let linked = 0

  const nextRecords = conflictRecords.map((record) => {
    if (record.seriesId !== seriesId) return record
    if (record.status !== RECURRENCE_CONFLICT_STATUS.UNRESOLVED) return record

    if (existingOccurrenceDates.includes(record.occurrenceDate)) {
      linked += 1
      return {
        ...record,
        status: RECURRENCE_CONFLICT_STATUS.RESOLVED,
      }
    }

    const endsAt = occurrenceEndAtByDate[record.occurrenceDate]
    if (endsAt && new Date(endsAt) <= now) {
      waived += 1
      return {
        ...record,
        status: RECURRENCE_CONFLICT_STATUS.WAIVED,
      }
    }

    if (conflictingDates.includes(record.occurrenceDate)) {
      return record
    }

    materialized += 1
    return {
      ...record,
      status: RECURRENCE_CONFLICT_STATUS.RESOLVED,
    }
  })

  const nextOccurrenceDates = [
    ...existingOccurrenceDates,
    ...nextRecords
      .filter(
        (record) =>
          record.seriesId === seriesId &&
          record.status === RECURRENCE_CONFLICT_STATUS.RESOLVED &&
          !existingOccurrenceDates.includes(record.occurrenceDate) &&
          !conflictingDates.includes(record.occurrenceDate) &&
          (!occurrenceEndAtByDate[record.occurrenceDate] ||
            new Date(occurrenceEndAtByDate[record.occurrenceDate]) > now),
      )
      .map((record) => record.occurrenceDate),
  ]

  return {
    conflictRecords: nextRecords,
    materialized,
    waived,
    linked,
    resolved: materialized + waived + linked,
    occurrenceDates: nextOccurrenceDates,
  }
}

export const simulateDailyRecurrenceWorker = ({
  series = [],
  sessions = [],
  conflictRecords = [],
  todayKey = '',
  horizonWeeks = 12,
  thresholdDays = 14,
  conflictingDatesBySeries = {},
  occurrenceEndAtBySeries = {},
  now = new Date(),
} = {}) => {
  let seriesExtended = 0
  let occurrencesCreated = 0
  let conflictsMaterialized = 0
  let conflictsWaived = 0
  let conflictsLinked = 0
  let workingConflicts = [...conflictRecords]
  let workingSessions = [...sessions]

  const selectedSeries = series.filter((entry) => {
    if (entry.status !== 'active') return false
    if (entry.endsOn && entry.endsOn < todayKey) return false

    const needsHorizon =
      !entry.materializedThrough ||
      entry.materializedThrough <
        computeHorizonTargetKey({ todayKey, horizonWeeks, thresholdDays })

    const needsConflictCheck = workingConflicts.some(
      (record) =>
        record.seriesId === entry.id && record.status === RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
    )

    return needsHorizon || needsConflictCheck
  })

  for (const entry of selectedSeries) {
    const resolveResult = resolveEligibleRecurrenceConflicts({
      seriesId: entry.id,
      conflictRecords: workingConflicts,
      conflictingDates: conflictingDatesBySeries[entry.id] ?? [],
      occurrenceEndAtByDate: occurrenceEndAtBySeries[entry.id] ?? {},
      existingOccurrenceDates: workingSessions
        .filter((session) => session.recurrenceSeriesId === entry.id)
        .map((session) => session.recurrenceOccurrenceDate),
      now,
    })

    workingConflicts = resolveResult.conflictRecords
    conflictsMaterialized += resolveResult.materialized
    conflictsWaived += resolveResult.waived
    conflictsLinked += resolveResult.linked

    resolveResult.occurrenceDates.forEach((occurrenceDate) => {
      if (
        !workingSessions.some(
          (session) =>
            session.recurrenceSeriesId === entry.id &&
            session.recurrenceOccurrenceDate === occurrenceDate,
        )
      ) {
        workingSessions.push({
          recurrenceSeriesId: entry.id,
          recurrenceOccurrenceDate: occurrenceDate,
          status: 'scheduled',
        })
      }
    })

    const needsHorizon =
      !entry.materializedThrough ||
      entry.materializedThrough <
        computeHorizonTargetKey({ todayKey, horizonWeeks, thresholdDays })

    if (!needsHorizon) continue

    const materializeResult = simulateIsolatedMaterializationWithConflicts({
      seriesId: entry.id,
      occurrenceDates: entry.pendingOccurrenceDates ?? [],
      existingOccurrenceDates: workingSessions
        .filter((session) => session.recurrenceSeriesId === entry.id)
        .map((session) => session.recurrenceOccurrenceDate),
      conflictingDates: conflictingDatesBySeries[entry.id] ?? [],
      initialConflictRecords: workingConflicts.filter((record) => record.seriesId === entry.id),
      occurrenceLimit: entry.occurrenceLimit ?? null,
    })

    workingConflicts = [
      ...workingConflicts.filter((record) => record.seriesId !== entry.id),
      ...materializeResult.conflictRecords,
    ]
    materializeResult.occurrenceDates.forEach((occurrenceDate) => {
      if (
        !workingSessions.some(
          (session) =>
            session.recurrenceSeriesId === entry.id &&
            session.recurrenceOccurrenceDate === occurrenceDate,
        )
      ) {
        workingSessions.push({
          recurrenceSeriesId: entry.id,
          recurrenceOccurrenceDate: occurrenceDate,
          status: 'scheduled',
        })
      }
    })

    seriesExtended += 1
    occurrencesCreated += materializeResult.created
  }

  const conflictsRemaining = workingConflicts.filter(
    (record) => record.status === RECURRENCE_CONFLICT_STATUS.UNRESOLVED,
  ).length

  return {
    seriesExtended,
    occurrencesCreated,
    conflictsMaterialized,
    conflictsWaived,
    conflictsLinked,
    conflictsResolved: conflictsMaterialized + conflictsWaived + conflictsLinked,
    conflictsRemaining,
    conflictRecords: workingConflicts,
    sessions: workingSessions,
  }
}

const computeHorizonTargetKey = ({ todayKey, horizonWeeks, thresholdDays }) => {
  const [year, month, day] = todayKey.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day))
  target.setUTCDate(target.getUTCDate() + horizonWeeks * 7 - thresholdDays)
  return target.toISOString().slice(0, 10)
}

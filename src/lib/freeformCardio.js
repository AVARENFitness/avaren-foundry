export const CARDIO_ACTIVITIES = [
  { value: 'walk', label: 'Walk' },
  { value: 'run', label: 'Run' },
  { value: 'bike', label: 'Bike' },
  { value: 'elliptical', label: 'Elliptical' },
  { value: 'hike', label: 'Hike' },
  { value: 'swim', label: 'Swim' },
  { value: 'row', label: 'Row' },
  { value: 'stair_climber', label: 'Stair climber' },
  { value: 'mobility', label: 'Stretch & mobility' },
  { value: 'other', label: 'Other movement' },
]

export const normalizeCardioEntry = ({
  kind = 'walk',
  minutes,
  distance = '',
  unit = 'mi',
} = {}) => {
  const durationMinutes = Number(minutes)
  const hasDistance = distance !== '' && distance !== null && distance !== undefined
  const parsedDistance = hasDistance ? Number(distance) : null
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > 1440 ||
    (hasDistance && (!Number.isFinite(parsedDistance) || parsedDistance < 0)) ||
    !CARDIO_ACTIVITIES.some((item) => item.value === kind) ||
    !['mi', 'km'].includes(unit)
  ) return null

  return {
    id: crypto.randomUUID?.() ?? String(Date.now()),
    kind,
    durationMinutes,
    distance: parsedDistance,
    distanceUnit: unit,
  }
}

export const hasLoggedWorkoutActivity = (sets = [], cardioEntries = []) =>
  sets.length > 0 || (cardioEntries ?? []).some(
    (entry) => Number(entry?.durationMinutes) > 0,
  )

export const estimatedOneRepMax = (weight, reps) =>
  reps > 0 ? Math.round(weight * (1 + reps / 30) * 10) / 10 : 0

export const sessionVolume = (session) =>
  session.sets.reduce((sum, set) => sum + set.weight * set.reps, 0)

export const totalVolume = (history) =>
  history.reduce((sum, session) => sum + sessionVolume(session), 0)

export const totalSets = (history) =>
  history.reduce((sum, session) => sum + session.sets.length, 0)

export const personalBest = (history, exercise, field = 'weight') =>
  Math.max(
    0,
    ...history.flatMap((session) =>
      session.sets
        .filter((set) => set.exercise === exercise)
        .map((set) => Number(set[field] || 0)),
    ),
  )

export const recentExerciseSets = (history, exercise) => {
  const session = [...history]
    .reverse()
    .find((item) => item.sets.some((set) => set.exercise === exercise))
  return session?.sets.filter((set) => set.exercise === exercise) ?? []
}


export const exerciseNames = (history) =>
  [...new Set(history.flatMap((session) => session.sets.map((set) => set.exercise)))]

export const exerciseSessions = (history, exercise) =>
  history
    .filter((session) => session.sets.some((set) => set.exercise === exercise))
    .map((session) => {
      const sets = session.sets.filter((set) => set.exercise === exercise)
      return {
        id: session.id,
        date: session.date,
        workout: session.name,
        sets,
        heaviest: Math.max(0, ...sets.map((set) => Number(set.weight || 0))),
        bestE1RM: Math.max(
          0,
          ...sets.map((set) =>
            Number(
              set.estimatedOneRepMax ??
                estimatedOneRepMax(Number(set.weight || 0), Number(set.reps || 0)),
            ),
          ),
        ),
        volume: sets.reduce(
          (sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0),
          0,
        ),
      }
    })

export const exerciseProfile = (history, exercise) => {
  const sessions = exerciseSessions(history, exercise)
  const sets = sessions.flatMap((session) => session.sets)

  return {
    sessions,
    sessionCount: sessions.length,
    heaviest: Math.max(0, ...sets.map((set) => Number(set.weight || 0))),
    bestE1RM: Math.max(
      0,
      ...sets.map((set) =>
        Number(
          set.estimatedOneRepMax ??
            estimatedOneRepMax(Number(set.weight || 0), Number(set.reps || 0)),
        ),
      ),
    ),
    lifetimeVolume: sets.reduce(
      (sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0),
      0,
    ),
    totalSets: sets.length,
  }
}

export const consistencyStreak = (history) => {
  const dates = [...new Set(history.map((session) => session.date))]
    .sort()
    .reverse()

  if (!dates.length) return 0

  let count = 1
  for (let index = 1; index < dates.length; index += 1) {
    const newer = new Date(`${dates[index - 1]}T12:00:00`)
    const older = new Date(`${dates[index]}T12:00:00`)
    const difference = Math.round((newer - older) / 86400000)
    if (difference <= 2) count += 1
    else break
  }

  return count
}

export const recentPRs = (history, limit = 12) => {
  const records = {}
  const prs = []

  history.forEach((session) => {
    const grouped = {}
    session.sets.forEach((set) => {
      grouped[set.exercise] ??= []
      grouped[set.exercise].push(set)
    })

    Object.entries(grouped).forEach(([exercise, sets]) => {
      const heaviest = Math.max(...sets.map((set) => Number(set.weight || 0)))
      const bestE1RM = Math.max(
        ...sets.map((set) =>
          Number(
            set.estimatedOneRepMax ??
              estimatedOneRepMax(Number(set.weight || 0), Number(set.reps || 0)),
          ),
        ),
      )
      const volume = sets.reduce(
        (sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0),
        0,
      )

      const previous = records[exercise] ?? {
        heaviest: 0,
        bestE1RM: 0,
        volume: 0,
      }

      if (heaviest > previous.heaviest) {
        const bestSet = sets.find(
          (set) => Number(set.weight || 0) === heaviest,
        )
        prs.push({
          id: `${session.id}-${exercise}-weight`,
          date: session.date,
          exercise,
          type: 'Heaviest Set',
          value: `${heaviest} × ${bestSet?.reps ?? 0}`,
        })
      }

      if (bestE1RM > previous.bestE1RM) {
        prs.push({
          id: `${session.id}-${exercise}-e1rm`,
          date: session.date,
          exercise,
          type: 'Estimated 1RM',
          value: `${Math.round(bestE1RM)} lb`,
        })
      }

      if (volume > previous.volume) {
        prs.push({
          id: `${session.id}-${exercise}-volume`,
          date: session.date,
          exercise,
          type: 'Session Volume',
          value: `${Math.round(volume).toLocaleString()} lb`,
        })
      }

      records[exercise] = {
        heaviest: Math.max(previous.heaviest, heaviest),
        bestE1RM: Math.max(previous.bestE1RM, bestE1RM),
        volume: Math.max(previous.volume, volume),
      }
    })
  })

  return prs.reverse().slice(0, limit)
}

export const prsThisMonth = (history) => {
  const month = new Date().toISOString().slice(0, 7)
  return recentPRs(history, 1000).filter((pr) => pr.date.startsWith(month)).length
}


export const activeWorkoutSnapshot = (workout) => {
  if (!workout) {
    return {
      completedSets: 0,
      enteredSets: 0,
      totalSets: 0,
      completedExercises: 0,
      totalExercises: 0,
      volume: 0,
      elapsedSeconds: 0,
      intensity: '—',
    }
  }

  const sets = workout.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      ...set,
      exercise: exercise.name,
      muscle: exercise.muscle,
    })),
  )

  const entered = sets.filter(
    (set) => set.weight !== '' && set.reps !== '',
  )
  const completed = entered.filter((set) => set.done)
  const completedExercises = workout.exercises.filter((exercise) => {
    const exerciseSets = exercise.sets.filter(
      (set) => set.weight !== '' && set.reps !== '',
    )
    return (
      exerciseSets.length > 0 &&
      exerciseSets.every((set) => set.done)
    )
  }).length

  const volume = completed.reduce(
    (sum, set) =>
      sum +
      Number(set.weight || 0) *
        Number(set.reps || 0),
    0,
  )

  const elapsedSeconds = workout.startedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() -
            new Date(workout.startedAt).getTime()) /
            1000,
        ),
      )
    : 0

  const averageLoad =
    completed.length > 0
      ? completed.reduce(
          (sum, set) =>
            sum + Number(set.weight || 0),
          0,
        ) / completed.length
      : 0

  const intensity =
    completed.length === 0
      ? 'Building'
      : averageLoad >= 185
      ? 'High'
      : averageLoad >= 95
      ? 'Moderate'
      : 'Controlled'

  return {
    completedSets: completed.length,
    enteredSets: entered.length,
    totalSets: sets.length,
    completedExercises,
    totalExercises: workout.exercises.length,
    volume,
    elapsedSeconds,
    intensity,
  }
}

export const previousComparableSession = (
  history,
  workoutName,
) =>
  [...history]
    .reverse()
    .find((session) => session.name === workoutName) ??
  null

export const compareActiveWorkout = (
  workout,
  history,
) => {
  const current = activeWorkoutSnapshot(workout)
  const previous = previousComparableSession(
    history,
    workout?.name,
  )

  if (!previous) {
    return {
      previous: null,
      volumeChangePercent: null,
      setDifference: null,
      message:
        'This session will become the comparison baseline.',
    }
  }

  const previousVolume = sessionVolume(previous)
  const previousSets = previous.sets.length
  const volumeChangePercent =
    previousVolume > 0
      ? Math.round(
          ((current.volume - previousVolume) /
            previousVolume) *
            100,
        )
      : null

  const setDifference =
    current.completedSets - previousSets

  let message = 'Building toward the previous session.'

  if (
    previousVolume > 0 &&
    current.volume >= previousVolume
  ) {
    message =
      current.volume === previousVolume
        ? 'Matched the previous session’s volume.'
        : `Volume is ${Math.max(
            1,
            volumeChangePercent,
          )}% above the previous session.`
  } else if (
    previousSets > 0 &&
    current.completedSets >= previousSets
  ) {
    message =
      'Matched the previous session’s completed sets.'
  }

  return {
    previous,
    previousVolume,
    previousSets,
    volumeChangePercent,
    setDifference,
    message,
  }
}

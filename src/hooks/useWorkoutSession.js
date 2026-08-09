import { useCallback, useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import { newlyUnlockedForgeAchievements } from '../lib/forge'
import { estimatedOneRepMax } from '../lib/metrics'
import { newlyEarnedMilestones } from '../lib/milestones'
import {
  applyRecommendationToWorkout,
  TRAINING_RECOMMENDATIONS,
} from '../lib/trainingRecommendations'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'
import {
  attachExecutionMetadataToSession,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import {
  attachSessionModeMetadata,
  hasScheduledInPersonToday,
  resolveSessionMode,
  SESSION_MODE,
} from '../lib/sessionMode'

const makeSet = (number, type = 'Working') => ({
  id: crypto.randomUUID(),
  number,
  type,
  weight: '',
  reps: '',
  done: false,
})

export function useWorkoutSession({
  state,
  setState,
  navigate,
  getTrainingRecommendation,
  onOpenReadinessCheckIn,
  onOpenDailyReset,
}) {
  const [activeExercise, setActiveExerciseState] = useState(
    state.activeWorkout?.activeExerciseIndex ?? 0,
  )
  const [completedSession, setCompletedSession] = useState(null)
  const [earnedMilestones, setEarnedMilestones] = useState([])
  const [earnedForgeAchievements, setEarnedForgeAchievements] = useState([])
  const [isFinishing, setIsFinishing] = useState(false)

  const setActiveExercise = useCallback((value) => {
    setActiveExerciseState((currentIndex) => {
      const nextValue =
        typeof value === 'function' ? value(currentIndex) : value

      setState((current) =>
        current.activeWorkout
          ? {
              ...current,
              activeWorkout: {
                ...current.activeWorkout,
                activeExerciseIndex: nextValue,
              },
            }
          : current,
      )

      return nextValue
    })
  }, [setState])

  useEffect(() => {
    if (state.activeWorkout?.activeExerciseIndex !== undefined) {
      setActiveExerciseState(state.activeWorkout.activeExerciseIndex)
    }
  }, [])

  const plannedWorkout = useMemo(
    () => resolveTodayWorkoutContext(state).name,
    [state.weeklySchedule, state.selectedWorkout, state.program.nextWorkout, state.activeWorkout],
  )

  const buildActiveWorkout = useCallback((name) => {
    const definitions = state.program.workouts[name] ?? []

    return {
      id: crypto.randomUUID(),
      name,
      date: new Date().toISOString().slice(0, 10),
      startedAt: new Date().toISOString(),
      activeExerciseIndex: 0,
      exercises: definitions.map((exercise) => ({
        id: crypto.randomUUID(),
        name: exercise.name,
        muscle: exercise.muscle,
        supersetGroup: exercise.supersetGroup || '',
        sets: Array.from({ length: exercise.sets }, (_, index) =>
          makeSet(
            index + 1,
            index === 0 &&
              ['Bench Press', 'Barbell Squats', 'Standing Barbell Press'].includes(
                exercise.name,
              )
              ? 'Warm-up'
              : 'Working',
          ),
        ),
      })),
    }
  }, [state.program.workouts])

  const changeActiveWorkout = useCallback(async (name) => {
    const currentWorkout = state.activeWorkout
    if (!currentWorkout || currentWorkout.name === name) return

    const hasEnteredData = currentWorkout.exercises.some((exercise) =>
      exercise.sets.some(
        (set) =>
          set.weight !== '' ||
          set.reps !== '' ||
          set.done,
      ),
    )

    if (
      hasEnteredData &&
      !(await appUi.confirm({
        message: `Switch from ${currentWorkout.name} to ${name}? Your entered workout progress will be discarded.`,
        tone: 'danger',
        confirmLabel: 'Switch',
      }))
    ) {
      return
    }

    const replacement = buildActiveWorkout(name)
    setActiveExerciseState(0)
    setState((current) => ({
      ...current,
      selectedWorkout: name,
      activeWorkout: replacement,
    }))

    if (navigator.vibrate) navigator.vibrate(12)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [state.activeWorkout, buildActiveWorkout, setState])

  const restartActiveWorkout = useCallback(async () => {
    const currentWorkout = state.activeWorkout
    if (!currentWorkout) return

    const hasEnteredData = currentWorkout.exercises.some(
      (exercise) =>
        exercise.sets.some(
          (set) =>
            set.weight !== '' ||
            set.reps !== '' ||
            set.done,
        ),
    )

    if (
      hasEnteredData &&
      !(await appUi.confirm({
        message: `Restart ${currentWorkout.name}? All entered progress in this session will be discarded.`,
        tone: 'danger',
        confirmLabel: 'Restart',
      }))
    ) {
      return
    }

    const replacement = buildActiveWorkout(
      currentWorkout.name,
    )

    setActiveExerciseState(0)
    setState((current) => ({
      ...current,
      activeWorkout: replacement,
    }))

    if (navigator.vibrate) navigator.vibrate(14)

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }, [state.activeWorkout, buildActiveWorkout, setState])

  const endActiveWorkoutWithoutSaving = useCallback(async () => {
    const currentWorkout = state.activeWorkout
    if (!currentWorkout) return

    const hasEnteredData = currentWorkout.exercises.some(
      (exercise) =>
        exercise.sets.some(
          (set) =>
            set.weight !== '' ||
            set.reps !== '' ||
            set.done,
        ),
    )

    const message = hasEnteredData
      ? `End ${currentWorkout.name} without saving? All entered progress in this session will be discarded.`
      : `End ${currentWorkout.name} without saving? This session will be removed and nothing will be added to your training history.`

    if (!(await appUi.confirm({
      message,
      tone: 'danger',
      confirmLabel: 'End Workout',
    }))) return

    setActiveExerciseState(0)
    setIsFinishing(false)
    setState((current) => ({
      ...current,
      activeWorkout: null,
    }))

    if (navigator.vibrate) {
      navigator.vibrate([12, 25, 12])
    }

    navigate('home')
  }, [state.activeWorkout, navigate, setState])

  const startWorkout = useCallback(() => {
    if (state.activeWorkout) {
      navigate('gym')
      return
    }

    const { name } = resolveTodayWorkoutContext(state)
    const activeWorkout = attachSessionModeMetadata(
      buildActiveWorkout(name),
      SESSION_MODE.SOLO,
    )

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({ ...current, activeWorkout }))
    })
  }, [state.activeWorkout, state.weeklySchedule, state.selectedWorkout, state.program.nextWorkout, buildActiveWorkout, navigate, setState, setActiveExercise])

  const startWorkoutWithRecommendation = useCallback((
    recommendation,
    overrideWorkout = null,
  ) => {
    const resolvedRecommendation =
      recommendation ?? getTrainingRecommendation?.()
    if (
      resolvedRecommendation?.id ===
      TRAINING_RECOMMENDATIONS.CHECK_IN
    ) {
      onOpenReadinessCheckIn?.()
      return
    }

    if (
      resolvedRecommendation?.id ===
      TRAINING_RECOMMENDATIONS.RECOVERY_DAY
    ) {
      onOpenDailyReset?.()
      return
    }

    if (state.activeWorkout) {
      setState((current) => ({
        ...current,
        activeWorkout: applyRecommendationToWorkout(
          current.activeWorkout,
          resolvedRecommendation,
        ),
      }))
      navigate('gym')
      return
    }

    const name =
      overrideWorkout ||
      resolvedRecommendation?.alternateWorkout ||
      plannedWorkout

    const activeWorkout = applyRecommendationToWorkout(
      buildActiveWorkout(name),
      resolvedRecommendation,
    )

    setActiveExerciseState(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        selectedWorkout: name,
        activeWorkout,
      }))
    })
  }, [
    getTrainingRecommendation,
    onOpenReadinessCheckIn,
    onOpenDailyReset,
    state.activeWorkout,
    plannedWorkout,
    buildActiveWorkout,
    navigate,
    setState,
  ])

  const trainAsPlanned = useCallback(() => {
    startWorkout()
  }, [startWorkout])

  const startCoachAssignment = useCallback(async (
    assignment,
  ) => {
    const definition = assignment?.workout_payload

    if (
      !definition?.name ||
      !Array.isArray(definition.exercises)
    ) {
      appUi.toast(
        'This assignment does not contain a valid workout.',
        'error',
      )
      return
    }

    const activeWorkout = {
      id: crypto.randomUUID(),
      assignmentId: assignment.id,
      name: definition.name,
      date: new Date().toISOString().slice(0, 10),
      startedAt: new Date().toISOString(),
      activeExerciseIndex: 0,
      coachNotes: assignment.coach_notes ?? '',
      exercises: definition.exercises.map(
        (exercise) => ({
          id: crypto.randomUUID(),
          name: exercise.name,
          muscle: exercise.muscle ?? 'Other',
          supersetGroup:
            exercise.supersetGroup ?? '',
          sets: Array.from(
            { length: Number(exercise.sets) || 3 },
            (_, index) =>
              makeSet(index + 1, 'Working'),
          ),
        }),
      ),
    }

    try {
      await coachBackend.markAssignmentStarted(
        assignment.id,
      )
    } catch (error) {
      appUi.toast(error.message, 'error')
      return
    }

    let scheduledSessions = []
    try {
      scheduledSessions = await coachBackend.listAthleteScheduledSessions()
    } catch {
      scheduledSessions = []
    }

    const sessionMode = resolveSessionMode({
      assignmentId: assignment.id,
      coachAssigned: true,
      inPersonToday: hasScheduledInPersonToday(scheduledSessions),
    })

    const coachedWorkout = attachSessionModeMetadata(activeWorkout, sessionMode)

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        selectedWorkout: definition.name,
        activeWorkout: coachedWorkout,
      }))
    })
  }, [navigate, setState, setActiveExercise])

  const updateWorkoutMeta = useCallback((key, value) => {
    setState((current) => {
      if (!current.activeWorkout) return current

      return {
        ...current,
        activeWorkout: {
          ...current.activeWorkout,
          [key]: value,
        },
      }
    })
  }, [setState])

  const updateSet = useCallback((exerciseIndex, setIndex, key, value) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].sets[setIndex][key] = value

      if (key === 'done' && value && navigator.vibrate) {
        navigator.vibrate(18)
      }

      return { ...current, activeWorkout }
    })
  }, [setState])

  const addSet = useCallback((exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      const previous = exercise.sets.at(-1)
      exercise.sets.push({
        ...makeSet(exercise.sets.length + 1, previous?.type ?? 'Working'),
        weight: previous?.weight ?? '',
      })
      return { ...current, activeWorkout }
    })
  }, [setState])

  const repeatPreviousSet = useCallback((exerciseIndex, setIndex) => {
    if (setIndex <= 0) return
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const previous = activeWorkout.exercises[exerciseIndex].sets[setIndex - 1]
      const target = activeWorkout.exercises[exerciseIndex].sets[setIndex]
      target.type = previous.type
      target.weight = previous.weight
      target.reps = previous.reps
      target.done = false
      return { ...current, activeWorkout }
    })
  }, [setState])

  const skipExercise = useCallback((exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      exercise.skipped = true
      return { ...current, activeWorkout }
    })

    const next = Math.min(
      (state.activeWorkout?.exercises.length ?? 1) - 1,
      exerciseIndex + 1,
    )
    setActiveExercise(next)
  }, [state.activeWorkout, setActiveExercise, setState])

  const quickAddExercise = useCallback(({ name, sets, muscle }) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises.push({
        id: crypto.randomUUID(),
        name,
        muscle,
        oneTime: true,
        sets: Array.from({ length: Math.max(1, sets || 3) }, (_, index) =>
          makeSet(index + 1, 'Working'),
        ),
      })
      return { ...current, activeWorkout }
    })

    window.setTimeout(() => {
      const count = state.activeWorkout?.exercises.length ?? 0
      setActiveExercise(count)
    }, 0)
  }, [state.activeWorkout, setActiveExercise, setState])

  const removeSet = useCallback((exerciseIndex, setIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      if (exercise.sets.length <= 1) return current
      exercise.sets.splice(setIndex, 1)
      exercise.sets.forEach((set, index) => {
        set.number = index + 1
      })
      return { ...current, activeWorkout }
    })
  }, [setState])

  const undoSkipExercise = useCallback((exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].skipped = false
      return { ...current, activeWorkout }
    })
  }, [setState])

  const finishWorkout = useCallback(async () => {
    if (isFinishing) return
    setIsFinishing(true)
    const workout = state.activeWorkout
    if (!workout) return

    const sets = workout.exercises
      .filter((exercise) => !exercise.skipped)
      .flatMap((exercise) =>
      exercise.sets
        .filter((set) => Number(set.reps) > 0)
        .map((set) => ({
          exercise: exercise.name,
          muscle: exercise.muscle,
          type: set.type,
          weight: Number(set.weight || 0),
          reps: Number(set.reps || 0),
          estimatedOneRepMax: estimatedOneRepMax(
            Number(set.weight || 0),
            Number(set.reps || 0),
          ),
        })),
    )

    if (sets.length === 0) {
      appUi.toast('Log at least one set before finishing.', 'error')
      setIsFinishing(false)
      return
    }

    const incompleteEnteredSets = workout.exercises.flatMap((exercise) =>
      exercise.sets.filter(
        (set) =>
          (set.weight !== '' || set.reps !== '') &&
          !set.done,
      ),
    )

    if (
      incompleteEnteredSets.length > 0 &&
      !(await appUi.confirm({
        message: `${incompleteEnteredSets.length} entered set${
          incompleteEnteredSets.length === 1 ? '' : 's'
        } are not marked complete. Finish the workout anyway?`,
        confirmLabel: 'Finish Anyway',
      }))
    ) {
      setIsFinishing(false)
      return
    }

    const rotation = state.program.rotation
    const currentIndex = rotation.indexOf(workout.name)
    const nextWorkout = rotation[(currentIndex + 1) % rotation.length]

    const completedWorkoutSession = attachExecutionMetadataToSession(
      {
        id: workout.id,
        name: workout.name,
        date: workout.date,
        startedAt: workout.startedAt,
        finishedAt: new Date().toISOString(),
        intent: workout.intent ?? '',
        notes: workout.notes ?? '',
        reflection: workout.reflection ?? '',
        assignmentId: workout.assignmentId ?? null,
        sessionMode: workout.sessionMode ?? SESSION_MODE.SOLO,
        exercisesPerformed: workout.exercises.map((exercise) => ({
          name: exercise.name,
          skipped: Boolean(exercise.skipped),
          oneTime: Boolean(exercise.oneTime),
          sets: exercise.sets.filter((set) => Number(set.reps) > 0),
        })),
        sets,
      },
      isExecutionPlanCurrent(state.sessionExecutionPlan)
        ? state.sessionExecutionPlan
        : null,
    )

    const completionPayload = { session: completedWorkoutSession, nextWorkout }
    setCompletedSession(completionPayload)

    if (workout.assignmentId) {
      coachBackend
        .markAssignmentCompleted(
          workout.assignmentId,
          completedWorkoutSession.id,
          {
            durationMinutes: Math.max(
              1,
              Math.round(
                (new Date(completedWorkoutSession.finishedAt) -
                  new Date(completedWorkoutSession.startedAt)) /
                  60000,
              ),
            ),
            volume: completedWorkoutSession.sets.reduce(
              (total, set) =>
                total +
                Number(set.weight || 0) *
                  Number(set.reps || 0),
              0,
            ),
            sets: completedWorkoutSession.sets.length,
            exercises: [
              ...new Set(
                completedWorkoutSession.sets.map(
                  (set) => set.exercise,
                ),
              ),
            ].length,
            reflection: completedWorkoutSession.reflection ?? '',
            notes: completedWorkoutSession.notes ?? '',
          },
        )
        .catch((error) => {
          console.error(
            'Could not mark assignment complete:',
            error,
          )
        })
    }

    setState((current) => {
      const nextState = {
        ...current,
        program: { ...current.program, nextWorkout },
        selectedWorkout: nextWorkout,
        activeWorkout: null,
        sessionExecutionPlan: null,
        history: [...current.history, completedWorkoutSession],
        achievements:
          current.history.length === 0
            ? [
                ...current.achievements,
                {
                  id: crypto.randomUUID(),
                  name: 'First Foundry Workout',
                  earnedAt: new Date().toISOString(),
                },
              ]
            : current.achievements,
      }

      setEarnedMilestones(
        newlyEarnedMilestones(current, nextState),
      )
      setEarnedForgeAchievements(
        newlyUnlockedForgeAchievements(current, nextState),
      )

      return nextState
    })

    if (navigator.vibrate) navigator.vibrate([25, 40, 35])
    navigate('complete')
  }, [isFinishing, state.activeWorkout, state.program.rotation, state.history, state.achievements, state.sessionExecutionPlan, navigate, setState])

  const saveSessionReflection = useCallback((
    sessionId,
    reflection,
  ) => {
    setCompletedSession((current) =>
      current?.session?.id === sessionId
        ? {
            ...current,
            session: {
              ...current.session,
              reflection,
            },
          }
        : current,
    )

    setState((current) => ({
      ...current,
      history: current.history.map((workoutSession) =>
        workoutSession.id === sessionId
          ? {
              ...workoutSession,
              reflection,
            }
          : workoutSession,
      ),
    }))
  }, [setState])

  const resetWorkoutSession = useCallback(() => {
    setActiveExerciseState(0)
    setCompletedSession(null)
    setIsFinishing(false)
  }, [])

  return {
    activeExercise,
    setActiveExercise,
    setActiveExerciseState,
    completedSession,
    setCompletedSession,
    earnedMilestones,
    setEarnedMilestones,
    earnedForgeAchievements,
    setEarnedForgeAchievements,
    isFinishing,
    setIsFinishing,
    plannedWorkout,
    startWorkout,
    startWorkoutWithRecommendation,
    trainAsPlanned,
    startCoachAssignment,
    changeActiveWorkout,
    restartActiveWorkout,
    endActiveWorkoutWithoutSaving,
    updateWorkoutMeta,
    updateSet,
    addSet,
    repeatPreviousSet,
    skipExercise,
    quickAddExercise,
    removeSet,
    undoSkipExercise,
    finishWorkout,
    saveSessionReflection,
    resetWorkoutSession,
  }
}

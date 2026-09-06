import { useCallback, useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import { newlyUnlockedForgeAchievements } from '../lib/forge'
import { newlyEarnedMilestones } from '../lib/milestones'
import {
  applyRecommendationToWorkout,
  TRAINING_RECOMMENDATIONS,
} from '../lib/trainingRecommendations'
import { advanceProgramNextWorkout, normalizeProgramWorkoutName } from '../lib/programWorkout'
import { localCalendarDateKey } from '../lib/localCalendarDay'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'
import {
  createFreeformActiveWorkout,
  isFreeformWorkoutSession,
} from '../lib/freeformWorkout'
import {
  attachExecutionMetadataToSession,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import {
  attachSessionModeMetadata,
  resolveSessionMode,
  SESSION_MODE,
} from '../lib/sessionMode'
import { normalizeAthleteAppointmentsFromRpc } from '../lib/athleteAppointments'
import {
  findAppointmentLinkedToAssignment,
} from '../lib/coachingAppointment'

import { createRuntimeId } from '../lib/createRuntimeId'
import { buildCompletedSet, isActiveSetEntered } from '../lib/exerciseLoad'
import {
  rememberExerciseLoadType,
  rememberLoadTypesFromSession,
} from '../lib/exerciseLoadPreferences'
import {
  materializeWorkoutExercise,
  makeActiveSet,
} from '../lib/materializeWorkoutExercise'
import { sessionLoadVolume } from '../lib/workoutMetrics'
import { getNextExerciseIndex } from '../lib/workoutProgression'
import {
  insertExerciseAfterIndex,
  resolveQuickAddAfterIndex,
} from '../lib/activeWorkoutSession'
import {
  completeWorkoutSession,
  updateWorkoutSession,
} from '../lib/athleteWorkoutSessionsBackend'

const makeSet = makeActiveSet

export function useWorkoutSession({
  state,
  setState,
  navigate,
  athleteId = null,
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
  const [isStarting, setIsStarting] = useState(false)

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
    [
      state.weeklySchedule,
      state.selectedWorkout,
      state.program?.nextWorkout,
      state.activeWorkout,
      state.history,
    ],
  )

  const buildActiveWorkout = useCallback((name) => {
    const definitions = state.program.workouts[name] ?? []
    const loadPreferences = state.exerciseLoadPreferences ?? {}
    const history = state.history ?? []

    return {
      id: createRuntimeId(),
      name,
      date: localCalendarDateKey(),
      startedAt: new Date().toISOString(),
      activeExerciseIndex: 0,
      exercises: definitions.map((exercise) =>
        materializeWorkoutExercise(exercise, {
          loadPreferences,
          history,
        }),
      ),
    }
  }, [
    state.program.workouts,
    state.exerciseLoadPreferences,
    state.history,
  ])

  const changeActiveWorkout = useCallback(async (name) => {
    const currentWorkout = state.activeWorkout
    if (!currentWorkout || currentWorkout.name === name) return

    const hasEnteredData = currentWorkout.exercises.some((exercise) =>
      exercise.sets.some((set) =>
        isActiveSetEntered(set, exercise.loadType) || set.done,
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

    const hasEnteredData = currentWorkout.exercises.some((exercise) =>
      exercise.sets.some((set) =>
        isActiveSetEntered(set, exercise.loadType) || set.done,
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

    const replacement = isFreeformWorkoutSession(currentWorkout)
      ? createFreeformActiveWorkout()
      : buildActiveWorkout(currentWorkout.name)

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

    const hasEnteredData = currentWorkout.exercises.some((exercise) =>
      exercise.sets.some((set) =>
        isActiveSetEntered(set, exercise.loadType) || set.done,
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

    if (isStarting) return

    const { name } = resolveTodayWorkoutContext(state)
    if (!name) {
      appUi.toast('Choose a workout to start.', 'error')
      return
    }

    setIsStarting(true)

    const activeWorkout = attachSessionModeMetadata(
      buildActiveWorkout(name),
      SESSION_MODE.SOLO,
    )

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({ ...current, activeWorkout }))
      setIsStarting(false)
    })
  }, [state.activeWorkout, state.weeklySchedule, state.selectedWorkout, state.program.nextWorkout, buildActiveWorkout, navigate, setState, setActiveExercise, isStarting])

  const startFreeformWorkout = useCallback(() => {
    if (state.activeWorkout) {
      navigate('gym')
      return
    }

    if (isStarting) return
    setIsStarting(true)

    const activeWorkout = attachSessionModeMetadata(
      createFreeformActiveWorkout(),
      SESSION_MODE.SOLO,
    )

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        activeWorkout,
      }))
      setIsStarting(false)
    })
  }, [
    state.activeWorkout,
    navigate,
    setState,
    setActiveExercise,
    isStarting,
  ])

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

    if (state.activeWorkout) {
      if (state.activeWorkout.assignmentId === assignment.id) {
        navigate('gym')
        return
      }

      navigate('gym')
      return
    }

    if (isStarting) return
    setIsStarting(true)

    const activeWorkout = {
      id: createRuntimeId(),
      assignmentId: assignment.id,
      name: definition.name,
      date: localCalendarDateKey(),
      startedAt: new Date().toISOString(),
      activeExerciseIndex: 0,
      coachNotes: assignment.coach_notes ?? '',
      exercises: definition.exercises.map((exercise) =>
        materializeWorkoutExercise(exercise, {
          loadPreferences: state.exerciseLoadPreferences ?? {},
          history: state.history ?? [],
        }),
      ),
    }

    try {
      await coachBackend.markAssignmentStarted(
        assignment.id,
      )
    } catch (error) {
      appUi.toast(error.message, 'error')
      setIsStarting(false)
      return
    }

    let scheduledSessions = []
    try {
      const rows = await coachBackend.listAthleteScheduledSessions()
      scheduledSessions = normalizeAthleteAppointmentsFromRpc(rows)
    } catch {
      scheduledSessions = []
    }

    const linkedAppointment = findAppointmentLinkedToAssignment(
      scheduledSessions,
      assignment.id,
    )

    const sessionMode = resolveSessionMode({
      assignmentId: assignment.id,
      coachAssigned: true,
      linkedAppointmentToday: Boolean(linkedAppointment),
    })

    const coachedWorkout = attachSessionModeMetadata(
      {
        ...activeWorkout,
        assignmentId: assignment.id,
        scheduledSessionId: linkedAppointment?.id ?? null,
      },
      sessionMode,
    )

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        selectedWorkout: definition.name,
        activeWorkout: coachedWorkout,
      }))
      setIsStarting(false)
    })
  }, [
    navigate,
    setState,
    setActiveExercise,
    state.activeWorkout,
    state.exerciseLoadPreferences,
    state.history,
    isStarting,
  ])

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

  const updateSupersetRound = useCallback((group, round) => {
    setState((current) => {
      if (!current.activeWorkout || !group) return current

      return {
        ...current,
        activeWorkout: {
          ...current.activeWorkout,
          supersetRoundByGroup: {
            ...(current.activeWorkout.supersetRoundByGroup ?? {}),
            [group]: round,
          },
        },
      }
    })
  }, [setState])

  const updateRestTimer = useCallback((restTimer) => {
    setState((current) => {
      if (!current.activeWorkout) return current

      return {
        ...current,
        activeWorkout: {
          ...current.activeWorkout,
          restTimer: restTimer ?? null,
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

    const exercises = state.activeWorkout?.exercises ?? []
    const next = getNextExerciseIndex(exercises, exerciseIndex)
    setActiveExercise(next)
  }, [state.activeWorkout, setActiveExercise, setState])

  const quickAddExercise = useCallback(({ name, sets, muscle }) => {
    setState((current) => {
      if (!current.activeWorkout) return current

      const activeWorkout = structuredClone(current.activeWorkout)
      const afterIndex = resolveQuickAddAfterIndex({
        exercises: activeWorkout.exercises,
        activeExerciseIndex:
          activeWorkout.activeExerciseIndex ?? activeExercise,
      })
      const nextExercise = {
        id: createRuntimeId(),
        name,
        muscle,
        oneTime: true,
        sets: Array.from({ length: Math.max(1, sets || 3) }, (_, index) =>
          makeSet(index + 1, 'Working'),
        ),
      }

      activeWorkout.exercises = insertExerciseAfterIndex(
        activeWorkout.exercises,
        nextExercise,
        afterIndex,
      )

      // Preserve current position; do not jump onto the inserted exercise.
      if (
        !Number.isInteger(activeWorkout.activeExerciseIndex) ||
        activeWorkout.activeExerciseIndex < 0
      ) {
        activeWorkout.activeExerciseIndex = Math.max(0, Number(activeExercise) || 0)
      }

      return { ...current, activeWorkout }
    })
  }, [activeExercise, setState])

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
    if (!workout) {
      setIsFinishing(false)
      return
    }

    if (state.history.some((session) => session.id === workout.id)) {
      setState((current) => ({
        ...current,
        activeWorkout: null,
      }))
      setIsFinishing(false)
      navigate('home')
      return
    }

    const athleteBodyweight = Number(state.profile?.weight ?? state.bodyweight ?? 0)
    const bodyweightSnapshot =
      Number.isFinite(athleteBodyweight) && athleteBodyweight > 0
        ? athleteBodyweight
        : null

    const sets = workout.exercises
      .filter((exercise) => !exercise.skipped)
      .flatMap((exercise) =>
        exercise.sets
          .filter((set) => Number(set.reps) > 0)
          .map((set) =>
            buildCompletedSet({
              exercise,
              set,
              bodyweightAtSession: bodyweightSnapshot,
            }),
          ),
      )

    if (sets.length === 0) {
      appUi.toast('Log at least one set before finishing.', 'error')
      setIsFinishing(false)
      return
    }

    const incompleteEnteredSets = workout.exercises.flatMap((exercise) =>
      exercise.sets.filter(
        (set) =>
          isActiveSetEntered(set, exercise.loadType) &&
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

    const nextWorkout = isFreeformWorkoutSession(workout)
      ? normalizeProgramWorkoutName(state.program.nextWorkout)
      : advanceProgramNextWorkout({
          rotation: state.program.rotation,
          completedWorkoutName: workout.name,
          currentNextWorkout: state.program.nextWorkout,
        })

    const completedWorkoutSession = attachExecutionMetadataToSession(
      {
        id: workout.id,
        name: workout.name,
        workoutKey: workout.workoutKey ?? undefined,
        origin: workout.origin ?? null,
        date: workout.date,
        startedAt: workout.startedAt,
        finishedAt: new Date().toISOString(),
        intent: workout.intent ?? '',
        notes: workout.notes ?? '',
        reflection: workout.reflection ?? '',
        assignmentId: isFreeformWorkoutSession(workout)
          ? null
          : workout.assignmentId ?? null,
        sessionMode: workout.sessionMode ?? SESSION_MODE.SOLO,
        exercisesPerformed: workout.exercises.map((exercise) => ({
          name: exercise.name,
          skipped: Boolean(exercise.skipped),
          oneTime: Boolean(exercise.oneTime),
          loadType: exercise.loadType ?? null,
          prescription: exercise.prescription ?? null,
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

    if (athleteId) {
      completeWorkoutSession(athleteId, completedWorkoutSession).catch(
        (error) => {
          console.error('Could not persist durable workout session:', error)
        },
      )
    }

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
            volume: sessionLoadVolume(completedWorkoutSession),
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

    if (workout.scheduledSessionId) {
      coachBackend
        .updateScheduledSession(workout.scheduledSessionId, {
          workoutSessionId: completedWorkoutSession.id,
        })
        .catch((error) => {
          console.error(
            'Could not link workout session to appointment:',
            error,
          )
        })
    }

    setState((current) => {
      const nextState = {
        ...current,
        program: { ...current.program, nextWorkout },
        selectedWorkout: null,
        activeWorkout: null,
        sessionExecutionPlan: null,
        exerciseLoadPreferences: rememberLoadTypesFromSession(
          current.exerciseLoadPreferences,
          completedWorkoutSession,
        ),
        history: [...current.history, completedWorkoutSession],
        achievements:
          current.history.length === 0
            ? [
                ...current.achievements,
                {
                  id: createRuntimeId(),
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
  }, [isFinishing, state.activeWorkout, state.program.rotation, state.history, state.achievements, state.sessionExecutionPlan, athleteId, navigate, setState])

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

    setState((current) => {
      const nextHistory = current.history.map((workoutSession) =>
        workoutSession.id === sessionId
          ? {
              ...workoutSession,
              reflection,
            }
          : workoutSession,
      )

      const edited = nextHistory.find((session) => session.id === sessionId)
      if (athleteId && edited) {
        updateWorkoutSession(athleteId, edited).catch((error) => {
          console.error('Could not persist workout reflection edit:', error)
        })
      }

      return {
        ...current,
        history: nextHistory,
      }
    })
  }, [athleteId, setState])

  const updateExercise = useCallback((exerciseIndex, patch) => {
    setState((current) => {
      if (!current.activeWorkout) return current
      const activeWorkout = structuredClone(current.activeWorkout)
      const currentExercise = activeWorkout.exercises[exerciseIndex]
      activeWorkout.exercises[exerciseIndex] = {
        ...currentExercise,
        ...patch,
      }

      let exerciseLoadPreferences = current.exerciseLoadPreferences ?? {}
      if (patch?.loadType != null) {
        exerciseLoadPreferences = rememberExerciseLoadType(
          exerciseLoadPreferences,
          activeWorkout.exercises[exerciseIndex],
          patch.loadType,
        )
      }

      return {
        ...current,
        activeWorkout,
        exerciseLoadPreferences,
      }
    })
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
    startFreeformWorkout,
    startWorkoutWithRecommendation,
    trainAsPlanned,
    startCoachAssignment,
    changeActiveWorkout,
    restartActiveWorkout,
    endActiveWorkoutWithoutSaving,
    updateWorkoutMeta,
    updateSupersetRound,
    updateRestTimer,
    updateSet,
    updateExercise,
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

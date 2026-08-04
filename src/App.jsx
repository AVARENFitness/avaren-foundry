import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from './components/AppShell'
import HomeScreen from './screens/HomeScreen'
import GymScreen from './screens/GymScreen'
import ProgressScreen from './screens/ProgressScreen'
import MoreScreen from './screens/MoreScreen'
import WeeklyPlannerScreen from './screens/WeeklyPlannerScreen'
import HistoryScreen from './screens/HistoryScreen'
import ForgeScreen from './screens/ForgeScreen'
import CoachScreen from './screens/CoachScreen'
import WorkoutBuilderScreen from './screens/WorkoutBuilderScreen'
import CompletionScreen from './screens/CompletionScreen'
import WorkoutIntelligenceSummary from './components/WorkoutIntelligenceSummary'
import MobilityScreen from './screens/MobilityScreen'
import MobilityPrompt from './components/MobilityPrompt'
import {
  buildAdaptiveDailyReset,
  buildRecoveryFlow,
  calculateRecoveryIntelligence,
} from './data/mobility'
import CloudStatus from './components/CloudStatus'
import {
  chooseNewestState,
  loadCloudState,
  saveCloudState,
} from './lib/cloudSync'
import AuthScreen from './screens/AuthScreen'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { BASELINES, DEFAULT_PROGRAM } from './data/defaultProgram'
import { estimatedOneRepMax, recentPRs } from './lib/metrics'
import { newlyUnlockedForgeAchievements } from './lib/forge'
import { newlyEarnedMilestones } from './lib/milestones'
import { loadState, saveState } from './lib/storage'
import {
  COACH_ACTIONS,
  coachSnapshot,
  recordCoachInsightShown,
} from './lib/coach'
import {
  calculateReadiness,
  readinessEntryForDate,
  saveReadinessEntry,
} from './lib/readiness'
import ReadinessCheckIn from './components/ReadinessCheckIn'
import NotificationScreen from './screens/NotificationScreen'
import ReadinessTrendsScreen from './screens/ReadinessTrendsScreen'
import {
  applyRecommendationToWorkout,
  buildTrainingRecommendation,
  TRAINING_RECOMMENDATIONS,
} from './lib/trainingRecommendations'
import {
  NOTIFICATION_ACTIONS,
  dismissNotification,
  markNotificationActedOn,
  markNotificationRead,
  notificationSnapshot as buildNotificationSnapshot,
} from './lib/notifications'

const createInitialState = () => ({
  program: DEFAULT_PROGRAM,
  activeWorkout: null,
  history: [],
  achievements: [],
  baselines: BASELINES,
  selectedWorkout: DEFAULT_PROGRAM.nextWorkout,
  weeklySchedule: {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  lastBackupAt: null,
  schemaVersion: 2,
  mobility: {
    durationPreferences: {},
    completed: [],
  },
  coach: {
    history: [],
    lastShownInsight: null,
  },
  readiness: {
    entries: [],
    lastPromptedDate: null,
  },
  notifications: {
    read: [],
    dismissed: [],
    actedOn: [],
  },
})

const makeSet = (number, type = 'Working') => ({
  id: crypto.randomUUID(),
  number,
  type,
  weight: '',
  reps: '',
  done: false,
})

function App() {
  const [screen, setScreen] = useState('home')
  const [state, setState] = useState(() => createInitialState())
  const [activeExercise, setActiveExerciseState] = useState(
    state.activeWorkout?.activeExerciseIndex ?? 0,
  )

  const setActiveExercise = (value) => {
    const nextValue = typeof value === 'function' ? value(activeExercise) : value
    setActiveExerciseState(nextValue)
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
  }
  const [completedSession, setCompletedSession] = useState(null)
  const [earnedMilestones, setEarnedMilestones] = useState([])
  const [earnedForgeAchievements, setEarnedForgeAchievements] = useState([])
  const [isFinishing, setIsFinishing] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [mobilityFlow, setMobilityFlow] = useState(null)
  const [showReadinessCheckIn, setShowReadinessCheckIn] =
    useState(false)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudStatus, setCloudStatus] = useState(
    navigator.onLine ? 'ready' : 'offline',
  )
  const hydratedUserId = useRef(null)
  const cloudSaveTimer = useRef(null)
  const latestStateRef = useRef(state)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Unable to restore session:', error)
      setSession(data?.session ?? null)
      setAuthLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setAuthLoading(false)

        if (nextSession) {
          setScreen('home')
          setShowReadinessCheckIn(false)
          window.scrollTo({ top: 0, behavior: 'auto' })
        }

        if (!nextSession) {
          hydratedUserId.current = null
          setCloudReady(false)
          setState(createInitialState())
          setActiveExerciseState(0)
          setCompletedSession(null)
          setMobilityFlow(null)
          setCloudStatus(navigator.onLine ? 'ready' : 'offline')
        }
      },
    )

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 820)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !cloudReady) return
    saveState(state, userId)
  }, [state, session?.user?.id, cloudReady])

  useEffect(() => {
    latestStateRef.current = state
  }, [state])

  useEffect(() => {
    if (state.activeWorkout?.activeExerciseIndex !== undefined) {
      setActiveExerciseState(state.activeWorkout.activeExerciseIndex)
    }
  }, [])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || hydratedUserId.current === userId) return

    let cancelled = false
    setCloudReady(false)
    setCloudStatus(navigator.onLine ? 'syncing' : 'offline')

    const hydrateAccount = async () => {
      try {
        const localAccountState = loadState(createInitialState(), userId)
        const cloudRecord = await loadCloudState(userId)
        if (cancelled) return

        const decision = chooseNewestState(localAccountState, cloudRecord)

        setState({
          ...createInitialState(),
          ...decision.state,
          activeWorkout: decision.state?.activeWorkout ?? null,
        })
        setActiveExerciseState(
          decision.state?.activeWorkout?.activeExerciseIndex ?? 0,
        )

        if (decision.uploadLocal && navigator.onLine) {
          await saveCloudState(userId, decision.state)
        }

        hydratedUserId.current = userId
        setCloudReady(true)
        setCloudStatus(navigator.onLine ? 'synced' : 'offline')
      } catch (error) {
        console.error('Foundry cloud hydration failed:', error)
        hydratedUserId.current = userId
        setCloudReady(true)
        setCloudStatus(navigator.onLine ? 'error' : 'offline')
      }
    }

    hydrateAccount()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !cloudReady) return

    window.clearTimeout(cloudSaveTimer.current)

    cloudSaveTimer.current = window.setTimeout(async () => {
      if (!navigator.onLine) {
        setCloudStatus('offline')
        return
      }

      try {
        setCloudStatus('syncing')
        await saveCloudState(userId, latestStateRef.current)
        setCloudStatus('synced')
      } catch (error) {
        console.error('Foundry cloud save failed:', error)
        setCloudStatus(navigator.onLine ? 'error' : 'offline')
      }
    }, 1200)

    return () => window.clearTimeout(cloudSaveTimer.current)
  }, [state, session?.user?.id, cloudReady])

  useEffect(() => {
    const handleOffline = () => setCloudStatus('offline')

    const handleOnline = async () => {
      const userId = session?.user?.id

      if (!userId || !cloudReady) {
        setCloudStatus('ready')
        return
      }

      try {
        setCloudStatus('syncing')
        await saveCloudState(userId, latestStateRef.current)
        setCloudStatus('synced')
      } catch (error) {
        console.error('Foundry reconnect sync failed:', error)
        setCloudStatus('error')
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [session?.user?.id, cloudReady])

  const scheduledWorkout = state.weeklySchedule?.[new Date().getDay()]
  const plannedWorkout =
    scheduledWorkout && scheduledWorkout !== 'Rest'
      ? scheduledWorkout
      : state.selectedWorkout || state.program.nextWorkout

  const readiness = calculateReadiness(state)

  useEffect(() => {
    if (
      !session?.user?.id ||
      !cloudReady ||
      screen !== 'home' ||
      readiness.completed ||
      showReadinessCheckIn
    ) {
      return
    }

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const isMorning = now.getHours() < 12
    const alreadyPrompted =
      state.readiness?.lastPromptedDate === today

    if (!isMorning || alreadyPrompted) return

    const timer = window.setTimeout(
      () => setShowReadinessCheckIn(true),
      500,
    )

    return () => window.clearTimeout(timer)
  }, [
    session?.user?.id,
    cloudReady,
    screen,
    readiness.completed,
    showReadinessCheckIn,
    state.readiness?.lastPromptedDate,
  ])

  const adaptiveDailyReset = buildAdaptiveDailyReset({
    history: state.history,
    plannedWorkout,
    durationPreferences:
      state.mobility?.durationPreferences ?? {},
    readiness,
  })

  const recoveryIntelligence =
    calculateRecoveryIntelligence(state)


  const coach = coachSnapshot(state, {
    limit: 3,
    cooldownDays: 5,
  })

  const notifications = buildNotificationSnapshot(state)

  const trainingRecommendation =
    buildTrainingRecommendation(state, plannedWorkout)


  const saveReadinessCheckIn = (values) => {
    setState((current) => ({
      ...current,
      readiness: saveReadinessEntry(
        current.readiness ?? {
          entries: [],
          lastPromptedDate: null,
        },
        values,
      ),
    }))
    setShowReadinessCheckIn(false)

    if (navigator.vibrate) {
      navigator.vibrate([18, 30, 18])
    }
  }


  const updateNotificationState = (updater) => {
    setState((current) => ({
      ...current,
      notifications: updater(
        current.notifications ?? {
          read: [],
          dismissed: [],
          actedOn: [],
        },
      ),
    }))
  }

  const handleNotificationRead = (notification) => {
    updateNotificationState((current) =>
      markNotificationRead(current, notification),
    )
  }

  const handleNotificationDismiss = (notification) => {
    updateNotificationState((current) =>
      dismissNotification(current, notification),
    )
  }

  const handleNotificationAction = (notification) => {
    updateNotificationState((current) =>
      markNotificationActedOn(current, notification),
    )

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.OPEN_READINESS
    ) {
      setShowReadinessCheckIn(true)
      return
    }

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.START_WORKOUT
    ) {
      startWorkout()
      return
    }

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.START_RECOVERY
    ) {
      const lastWorkout = [...state.history]
        .sort((first, second) =>
          String(first?.date).localeCompare(
            String(second?.date),
          ),
        )
        .at(-1)

      if (lastWorkout) {
        openRecoveryFlow(lastWorkout)
      }
      return
    }

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.OPEN_PLANNER
    ) {
      navigate('planner')
      return
    }

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.OPEN_FORGE
    ) {
      navigate('forge')
      return
    }

    if (
      notification.action ===
      NOTIFICATION_ACTIONS.OPEN_JOURNEY
    ) {
      navigate('history')
    }
  }

  const handleCoachInsightSeen = (insight) => {
    if (!insight) return

    setState((current) => {
      const currentCoach = current.coach ?? {
        history: [],
        lastShownInsight: null,
      }

      if (
        currentCoach.lastShownInsight ===
        insight.fingerprint
      ) {
        return current
      }

      return {
        ...current,
        coach: recordCoachInsightShown(
          currentCoach,
          insight,
        ),
      }
    })
  }

  const handleCoachAction = (action) => {
    if (action === COACH_ACTIONS.START_RESET) {
      openDailyReset()
      return
    }

    if (action === COACH_ACTIONS.START_RECOVERY) {
      const lastWorkout = [...state.history]
        .sort((first, second) =>
          String(first?.date).localeCompare(
            String(second?.date),
          ),
        )
        .at(-1)

      if (lastWorkout) {
        openRecoveryFlow(lastWorkout)
      } else {
        openDailyReset()
      }
      return
    }

    if (action === COACH_ACTIONS.START_WORKOUT) {
      startWorkout()
      return
    }

    if (action === COACH_ACTIONS.OPEN_PROGRESS) {
      navigate('progress')
      return
    }

    if (action === COACH_ACTIONS.OPEN_JOURNEY) {
      navigate('history')
    }
  }

  const openDailyReset = () => {
    setMobilityFlow(adaptiveDailyReset)
    navigate('mobility')
  }

  const openHomeReset = () => {
    const lastWorkout = [...state.history]
      .sort((first, second) => String(first?.date).localeCompare(String(second?.date)))
      .at(-1)

    if (lastWorkout) {
      openRecoveryFlow(lastWorkout)
      return
    }

    openDailyReset()
  }

  const openRecoveryFlow = (
    session = completedSession?.session,
  ) => {
    setMobilityFlow(
      buildRecoveryFlow(
        session,
        state.mobility?.durationPreferences ?? {},
      ),
    )
    navigate('mobility')
  }

  const saveMobilityDuration = (movementId, seconds) => {
    setState((current) => ({
      ...current,
      mobility: {
        ...(current.mobility ?? {}),
        durationPreferences: {
          ...(current.mobility?.durationPreferences ?? {}),
          [movementId]: seconds,
        },
        completed: current.mobility?.completed ?? [],
      },
    }))
  }

  const completeMobilityFlow = () => {
    const completion = {
      id: crypto.randomUUID(),
      flowId: mobilityFlow?.id,
      title: mobilityFlow?.title,
      completedAt: new Date().toISOString(),
    }

    setState((current) => ({
      ...current,
      mobility: {
        ...(current.mobility ?? {}),
        durationPreferences:
          current.mobility?.durationPreferences ?? {},
        completed: [
          ...(current.mobility?.completed ?? []),
          completion,
        ],
      },
    }))

    setMobilityFlow(null)
    navigate('home')
  }

  const navigate = (nextScreen, callback) => {
    setTransitioning(true)
    window.setTimeout(() => {
      callback?.()
      setScreen(nextScreen)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.setTimeout(() => setTransitioning(false), 260)
    }, 180)
  }

  const buildActiveWorkout = (name) => {
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
  }

  const changeActiveWorkout = (name) => {
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
      !confirm(
        `Switch from ${currentWorkout.name} to ${name}? Your entered workout progress will be discarded.`,
      )
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
  }

  const restartActiveWorkout = () => {
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
      !confirm(
        `Restart ${currentWorkout.name}? All entered progress in this session will be discarded.`,
      )
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
  }

  const endActiveWorkoutWithoutSaving = () => {
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

    if (!confirm(message)) return

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
  }

  const startWorkoutWithRecommendation = (
    recommendation = trainingRecommendation,
    overrideWorkout = null,
  ) => {
    if (
      recommendation?.id ===
      TRAINING_RECOMMENDATIONS.CHECK_IN
    ) {
      setShowReadinessCheckIn(true)
      return
    }

    if (
      recommendation?.id ===
      TRAINING_RECOMMENDATIONS.RECOVERY_DAY
    ) {
      openDailyReset()
      return
    }

    if (state.activeWorkout) {
      setState((current) => ({
        ...current,
        activeWorkout: applyRecommendationToWorkout(
          current.activeWorkout,
          recommendation,
        ),
      }))
      navigate('gym')
      return
    }

    const name =
      overrideWorkout ||
      recommendation?.alternateWorkout ||
      plannedWorkout

    const activeWorkout = applyRecommendationToWorkout(
      buildActiveWorkout(name),
      recommendation,
    )

    setActiveExerciseState(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        selectedWorkout: name,
        activeWorkout,
      }))
    })
  }

  const trainAsPlanned = () => {
    startWorkout()
  }

  const startWorkout = () => {
    if (state.activeWorkout) {
      navigate('gym')
      return
    }

    const scheduled = state.weeklySchedule?.[new Date().getDay()]
    const name =
      state.selectedWorkout ||
      (scheduled && scheduled !== 'Rest' ? scheduled : null) ||
      state.program.nextWorkout
    const activeWorkout = buildActiveWorkout(name)

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({ ...current, activeWorkout }))
    })
  }

  const updateWorkoutMeta = (key, value) => {
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
  }

  const updateSet = (exerciseIndex, setIndex, key, value) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].sets[setIndex][key] = value

      if (key === 'done' && value && navigator.vibrate) {
        navigator.vibrate(18)
      }

      return { ...current, activeWorkout }
    })
  }

  const addSet = (exerciseIndex) => {
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
  }

  const repeatPreviousSet = (exerciseIndex, setIndex) => {
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
  }

  const skipExercise = (exerciseIndex) => {
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
  }

  const quickAddExercise = ({ name, sets, muscle }) => {
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
  }

  const removeSet = (exerciseIndex, setIndex) => {
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
  }

  const undoSkipExercise = (exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].skipped = false
      return { ...current, activeWorkout }
    })
  }

  const finishWorkout = () => {
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
      alert('Log at least one set before finishing.')
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
      !confirm(
        `${incompleteEnteredSets.length} entered set${
          incompleteEnteredSets.length === 1 ? '' : 's'
        } are not marked complete. Finish the workout anyway?`,
      )
    ) {
      setIsFinishing(false)
      return
    }

    const rotation = state.program.rotation
    const currentIndex = rotation.indexOf(workout.name)
    const nextWorkout = rotation[(currentIndex + 1) % rotation.length]

    const completedSession = {
      id: workout.id,
      name: workout.name,
      date: workout.date,
      startedAt: workout.startedAt,
      finishedAt: new Date().toISOString(),
      intent: workout.intent ?? '',
      notes: workout.notes ?? '',
      reflection: workout.reflection ?? '',
      sets,
    }

    const completionPayload = { session: completedSession, nextWorkout }
    setCompletedSession(completionPayload)

    setState((current) => {
      const nextState = {
        ...current,
        program: { ...current.program, nextWorkout },
        selectedWorkout: nextWorkout,
        activeWorkout: null,
        history: [...current.history, completedSession],
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
  }

  const saveSessionReflection = (
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
      history: current.history.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              reflection,
            }
          : session,
      ),
    }))
  }

  const activeScreen = useMemo(() => {
    if (screen === 'mobility' && mobilityFlow) {
      return (
        <MobilityScreen
          flow={mobilityFlow}
          savedDurations={state.mobility?.durationPreferences ?? {}}
          onSaveDuration={saveMobilityDuration}
          onComplete={completeMobilityFlow}
          onClose={() => {
            setMobilityFlow(null)
            navigate('home')
          }}
        />
      )
    }

    if (screen === 'gym') {
      return (
        <GymScreen
          state={state}
          onStart={startWorkout}
          activeExercise={activeExercise}
          setActiveExercise={setActiveExercise}
          onSetChange={updateSet}
          onWorkoutMetaChange={updateWorkoutMeta}
          onAddSet={addSet}
          onFinish={finishWorkout}
          isFinishing={isFinishing}
          onRepeatSet={repeatPreviousSet}
          onSkipExercise={skipExercise}
          onQuickAddExercise={quickAddExercise}
          onRemoveSet={removeSet}
          onUndoSkip={undoSkipExercise}
          workoutOptions={state.program.rotation}
          onChangeWorkout={changeActiveWorkout}
          onRestartWorkout={restartActiveWorkout}
          onEndWorkout={endActiveWorkoutWithoutSaving}
          recommendation={trainingRecommendation}
        />
      )
    }

    if (screen === 'complete') {
      if (!completedSession?.session) {
        return (
          <section className="completion-recovery">
            <span className="eyebrow">WORKOUT SAVED</span>
            <h1>Completion data unavailable.</h1>
            <p>Your workout was saved safely. Return Home to continue.</p>
            <button
              className="gold-button machined"
              onClick={() => {
                setIsFinishing(false)
                navigate('home')
              }}
            >
              Return Home
            </button>
          </section>
        )
      }

      const completedSessionId =
        completedSession?.session?.id

      const completionPrs =
        completedSessionId
          ? recentPRs(
              state.history,
              1000,
            ).filter((pr) =>
              String(pr.id).startsWith(
                `${completedSessionId}-`,
              ),
            )
          : []

      return (
        <>
          <WorkoutIntelligenceSummary
            session={completedSession?.session}
            recentPrs={completionPrs}
          milestones={earnedMilestones}
          />
          <MobilityPrompt
            type="recovery"
            subtitle="ADAPTIVE RECOVERY"
            title="Recovery Flow"
            detail="Equipment-free · Start when ready"
            reason={
              buildRecoveryFlow(
                completedSession?.session,
                state.mobility?.durationPreferences ?? {},
              ).reason
            }
            focusAreas={
              buildRecoveryFlow(
                completedSession?.session,
                state.mobility?.durationPreferences ?? {},
              ).focusAreas
            }
            onOpen={() =>
              openRecoveryFlow(completedSession?.session)
            }
          />
          <CompletionScreen
          session={completedSession?.session}
          nextWorkout={completedSession?.nextWorkout}
          recentPrs={completionPrs}
          milestones={earnedMilestones}
          forgeAchievements={earnedForgeAchievements}
          onSaveReflection={saveSessionReflection}
          onDone={() => {
            setCompletedSession(null)
            setEarnedMilestones([])
            setEarnedForgeAchievements([])
            setIsFinishing(false)
            navigate('home')
          }}
          />
        </>
      )
    }

    if (screen === 'readiness-trends') {
      return (
        <ReadinessTrendsScreen
          state={state}
          onClose={() => navigate('progress')}
        />
      )
    }

    if (screen === 'progress') {
      return (
        <ProgressScreen
          state={state}
          onOpenReadinessTrends={() =>
            navigate('readiness-trends')
          }
        />
      )
    }

    if (screen === 'builder') {
      return (
        <WorkoutBuilderScreen
          program={state.program}
          onSave={(program) =>
            setState((current) => ({ ...current, program }))
          }
          onClose={() => navigate('more')}
        />
      )
    }

    if (screen === 'planner') {
      return (
        <WeeklyPlannerScreen
          program={state.program}
          schedule={state.weeklySchedule}
          onSave={(weeklySchedule) => {
            setState((current) => ({ ...current, weeklySchedule }))
            navigate('home')
          }}
          onClose={() => navigate('more')}
        />
      )
    }

    if (screen === 'notifications') {
      return (
        <NotificationScreen
          snapshot={notifications}
          onClose={() => navigate('home')}
          onRead={handleNotificationRead}
          onDismiss={handleNotificationDismiss}
          onAction={handleNotificationAction}
        />
      )
    }

    if (screen === 'coach') {
      return (
        <CoachScreen
          state={state}
          onClose={() => navigate('more')}
          onAction={handleCoachAction}
        />
      )
    }

    if (screen === 'forge') {
      return (
        <ForgeScreen
          state={state}
          onClose={() => navigate('more')}
        />
      )
    }

    if (screen === 'history') {
      return (
        <HistoryScreen
          state={state}
          onClose={() => navigate('more')}
          onDelete={(sessionId) =>
            setState((current) => ({
              ...current,
              history: current.history.filter(
                (session) => session.id !== sessionId,
              ),
            }))
          }
        />
      )
    }

    if (screen === 'more') {
      return (
        <MoreScreen
          state={state}
          setState={setState}
          fallbackState={createInitialState()}
          onOpenBuilder={() => navigate('builder')}
          onOpenPlanner={() => navigate('planner')}
          onOpenHistory={() => navigate('history')}
          onOpenForge={() => navigate('forge')}
          onOpenCoach={() => navigate('coach')}
          onOpenNotifications={() =>
            navigate('notifications')
          }
          onOpenMobility={openDailyReset}
          onOpenReset={openDailyReset}
          mobilityTitle={adaptiveDailyReset.title}
          mobilityMinutes={Math.max(
            1,
            Math.round(
              adaptiveDailyReset.movements.reduce(
                (total, movement) =>
                  total +
                  Number(
                    state.mobility
                      ?.durationPreferences
                      ?.[movement.id] ??
                      movement.seconds ??
                      30,
                  ),
                0,
              ) / 60,
            ),
          )}
          notificationCount={
            notifications.unreadCount
          }
          session={session}
        />
      )
    }

    return (
      <>
        <HomeScreen
          state={state}
          onStart={startWorkout}
          setScreen={setScreen}
          recoveryIntelligence={recoveryIntelligence}
          coachInsight={coach.primary}
          onCoachAction={handleCoachAction}
          onCoachInsightSeen={handleCoachInsightSeen}
          userName={
            session?.user?.user_metadata?.display_name ??
            session?.user?.email?.split('@')[0] ??
            ''
          }
          readiness={readiness}
          onOpenReadiness={() =>
            setShowReadinessCheckIn(true)
          }
          onOpenReadinessTrends={() =>
            navigate('readiness-trends')
          }
          notificationSnapshot={notifications}
          onOpenNotifications={() =>
            navigate('notifications')
          }
          trainingRecommendation={trainingRecommendation}
          onApplyRecommendation={() =>
            startWorkoutWithRecommendation()
          }
          onTrainAsPlanned={trainAsPlanned}
          onRecommendationRecovery={openDailyReset}
          onOpenMobility={openDailyReset}
          onOpenReset={openHomeReset}
          mobilityTitle={adaptiveDailyReset.title}
          mobilityMinutes={Math.max(
            1,
            Math.round(
              adaptiveDailyReset.movements.reduce(
                (total, movement) =>
                  total +
                  Number(
                    state.mobility
                      ?.durationPreferences
                      ?.[movement.id] ??
                      movement.seconds ??
                      30,
                  ),
                0,
              ) / 60,
            ),
          )}
          onSelectWorkout={(workout) =>
            setState((current) => ({
              ...current,
              selectedWorkout: workout,
            }))
          }
        />
      </>
    )
  }, [screen, state, activeExercise, completedSession, mobilityFlow, earnedMilestones, earnedForgeAchievements])

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <span className="eyebrow">CLOUD SETUP REQUIRED</span>
          <h2>Supabase is not configured.</h2>
          <p className="auth-copy">
            Add your Supabase URL and publishable key to .env.local, then restart the app.
          </p>
        </section>
      </main>
    )
  }

  if (authLoading) {
    return (
      <main className="auth-screen">
        <section className="auth-card auth-loading">
          <img className="foundation-loading-mark" src="/brand/foundation/icon-192.png" alt="" aria-hidden="true" />
          <span className="eyebrow">AVAREN</span>
          <h2>Opening The Foundry...</h2>
        </section>
      </main>
    )
  }

  if (!session) return <AuthScreen />

  if (showSplash) {
    return (
      <div className="splash-screen">
        <img className="foundation-splash-mark" src="/brand/foundation/icon-192.png" alt="AVAREN" />
        <div className="splash-overline">AVAREN</div>
        <div className="splash-title">THE FOUNDRY</div>
        <div className="splash-line" />
      </div>
    )
  }

  return (
    <AppShell
      screen={screen}
      setScreen={(next) => navigate(next)}
      activeWorkout={state.activeWorkout}
      transitioning={transitioning}
    >
      <CloudStatus status={cloudStatus} />
      {activeScreen}
      {showReadinessCheckIn && (
        <ReadinessCheckIn
          initialValues={
            readinessEntryForDate(
              state.readiness ?? {},
            ) ?? undefined
          }
          onSave={saveReadinessCheckIn}
          onClose={() =>
            setShowReadinessCheckIn(false)
          }
        />
      )}
    </AppShell>
  )
}

export default App

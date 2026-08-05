import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from './components/AppShell'
import CoachShell from './components/CoachShell'
import { isCoachAccount } from './config/coachAccess'
import { registerPushWorker, syncPushSubscription } from './lib/pushNotifications'
import { coachBackend } from './lib/coachBackend'
import {
  assignmentNotificationBackend,
  mapAssignmentNotification,
} from './lib/assignmentNotifications'
import HomeScreen from './screens/HomeScreen'
import GymScreen from './screens/GymScreen'
import ProgressScreen from './screens/ProgressScreen'
import MoreScreen from './screens/MoreScreen'
import TrainHubScreen from './screens/TrainHubScreen'
import NutritionScreen from './screens/NutritionScreen'
import { createNutritionState, nutritionDateKey, nutritionTotals } from './lib/nutrition'
import { nutritionBackend } from './lib/nutritionBackend'
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
import OnboardingScreen from './screens/OnboardingScreen'
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
  coachWorkspace: {
    role: 'athlete',
    modeEnabled: false,
    clients: [],
    invitations: [],
    assignments: [],
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
  onboarding: {
    completed: false,
    completedAt: null,
  },
  nutrition: createNutritionState(),
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
  const [coachScreen, setCoachScreen] =
    useState('clients')
  const [selectedCoachClient, setSelectedCoachClient] =
    useState(null)
  const [remoteNotifications, setRemoteNotifications] =
    useState([])
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
  const [showOnboarding, setShowOnboarding] =
    useState(false)
  const [isReplayingOnboarding, setIsReplayingOnboarding] =
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
          setShowOnboarding(false)
          setIsReplayingOnboarding(false)
          window.scrollTo({ top: 0, behavior: 'auto' })
        }

        if (!nextSession) {
          hydratedUserId.current = null
          setCloudReady(false)
          setState(createInitialState())
          setActiveExerciseState(0)
          setCompletedSession(null)
          setMobilityFlow(null)
          setShowOnboarding(false)
          setIsReplayingOnboarding(false)
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

        const hasExistingUsage =
          (decision.state?.history?.length ?? 0) > 0 ||
          (decision.state?.achievements?.length ?? 0) > 0 ||
          (decision.state?.mobility?.completed?.length ?? 0) > 0 ||
          Boolean(decision.state?.activeWorkout)

        const hydratedState = {
          ...createInitialState(),
          ...decision.state,
          activeWorkout:
            decision.state?.activeWorkout ?? null,
          onboarding:
            decision.state?.onboarding ?? {
              completed: hasExistingUsage,
              completedAt:
                hasExistingUsage
                  ? new Date().toISOString()
                  : null,
            },
        }

        setState(hydratedState)
        setShowOnboarding(
          !hydratedState.onboarding?.completed,
        )
        setIsReplayingOnboarding(false)
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
    recentCompletions:
      state.mobility?.completed ?? [],
    preferences:
      state.mobility?.preferences ?? {},
  })

  const recoveryIntelligence =
    calculateRecoveryIntelligence(state)


  const coach = coachSnapshot(state, {
    limit: 3,
    cooldownDays: 5,
  })

  const localNotificationSnapshot =
    buildNotificationSnapshot(state)
  const mappedRemoteNotifications =
    remoteNotifications.map(mapAssignmentNotification)
  const combinedNotifications = [
    ...mappedRemoteNotifications,
    ...localNotificationSnapshot.notifications,
  ].sort(
    (first, second) =>
      Number(second.priority ?? 0) -
        Number(first.priority ?? 0) ||
      new Date(second.createdAt).getTime() -
        new Date(first.createdAt).getTime(),
  )
  const notifications = {
    notifications: combinedNotifications,
    unread: combinedNotifications.filter(
      (notification) => !notification.read,
    ),
    unreadCount: combinedNotifications.filter(
      (notification) => !notification.read,
    ).length,
    primary:
      combinedNotifications.find(
        (notification) => !notification.read,
      ) ?? combinedNotifications[0] ?? null,
  }

  const trainingRecommendation =
    buildTrainingRecommendation(state, plannedWorkout)

  useEffect(() => {
    const userId = session?.user?.id

    if (!userId || !cloudReady) {
      setRemoteNotifications([])
      return undefined
    }

    let active = true
    const loadRemoteNotifications = async () => {
      try {
        const rows = await assignmentNotificationBackend.list()
        if (active) setRemoteNotifications(rows)
      } catch (error) {
        console.error('Could not load assignment notifications:', error)
      }
    }

    loadRemoteNotifications()
    const unsubscribe = assignmentNotificationBackend.subscribe(
      userId,
      loadRemoteNotifications,
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [session?.user?.id, cloudReady])

  useEffect(() => {
    registerPushWorker().catch((error) => {
      console.warn('Could not register the push worker:', error)
    })
  }, [])

  useEffect(() => {
    if (!session?.user?.id || !cloudReady) return

    syncPushSubscription().catch((error) => {
      console.warn('Could not sync the push subscription:', error)
    })
  }, [session?.user?.id, cloudReady])

  useEffect(() => {
    if ('setAppBadge' in navigator) {
      if (notifications.unreadCount > 0) {
        navigator.setAppBadge(notifications.unreadCount).catch(() => {})
      } else {
        navigator.clearAppBadge?.().catch(() => {})
      }
    }
  }, [notifications.unreadCount])


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

  const handleNotificationRead = async (notification) => {
    if (notification.remote) {
      await assignmentNotificationBackend.markRead(
        notification.remoteId,
      )
      setRemoteNotifications((current) =>
        current.map((item) =>
          item.id === notification.remoteId
            ? {
                ...item,
                read_at: item.read_at ?? new Date().toISOString(),
              }
            : item,
        ),
      )
      return
    }

    updateNotificationState((current) =>
      markNotificationRead(current, notification),
    )
  }

  const handleNotificationDismiss = async (notification) => {
    if (notification.remote) {
      await assignmentNotificationBackend.dismiss(
        notification.remoteId,
      )
      setRemoteNotifications((current) =>
        current.filter(
          (item) => item.id !== notification.remoteId,
        ),
      )
      return
    }

    updateNotificationState((current) =>
      dismissNotification(current, notification),
    )
  }

  const handleNotificationAction = async (notification) => {
    if (notification.remote) {
      await handleNotificationRead(notification)

      if (notification.action === 'open-assignment') {
        try {
          const assignment =
            await coachBackend.getAthleteAssignment(
              notification.assignmentId,
            )
          await startCoachAssignment(assignment)
        } catch (error) {
          alert(error.message)
        }
        return
      }

      if (notification.action === 'open-coach-assignment') {
        setCoachScreen('assignments')
        enterCoachMode()
        return
      }
    }

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
        state.mobility?.preferences ?? {},
      ),
    )
    navigate('mobility')
  }

  const updateMobilityPreferences = (
    patch,
  ) => {
    setState((current) => ({
      ...current,
      mobility: {
        ...(current.mobility ?? {}),
        durationPreferences:
          current.mobility?.durationPreferences ?? {},
        completed:
          current.mobility?.completed ?? [],
        preferences: {
          routineLength:
            current.mobility?.preferences
              ?.routineLength ??
            'standard',
          dislikedMovementIds:
            current.mobility?.preferences
              ?.dislikedMovementIds ??
            [],
          ...patch,
        },
      },
    }))
  }

  const restoreMobilityMovement = (
    movementId,
  ) => {
    const current =
      state.mobility?.preferences
        ?.dislikedMovementIds ?? []

    updateMobilityPreferences({
      dislikedMovementIds:
        current.filter(
          (id) => id !== movementId,
        ),
    })
  }

  const restoreAllMobilityMovements = () => {
    updateMobilityPreferences({
      dislikedMovementIds: [],
    })
  }

  const avoidMobilityMovement = (
    movementId,
  ) => {
    const current =
      state.mobility?.preferences
        ?.dislikedMovementIds ?? []

    updateMobilityPreferences({
      dislikedMovementIds: [
        ...new Set([
          ...current,
          movementId,
        ]),
      ],
    })
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
        preferences:
          current.mobility?.preferences ?? {
            routineLength: 'standard',
            dislikedMovementIds: [],
          },
      },
    }))
  }

  const completeMobilityFlow = () => {
    const completion = {
      id: crypto.randomUUID(),
      flowId: mobilityFlow?.id,
      title: mobilityFlow?.title,
      movementIds:
        mobilityFlow?.movements?.map((movement) => movement.id) ?? [],
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
        preferences:
          current.mobility?.preferences ?? {
            routineLength: 'standard',
            dislikedMovementIds: [],
          },
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

  const startCoachAssignment = async (
    assignment,
  ) => {
    const definition = assignment?.workout_payload

    if (
      !definition?.name ||
      !Array.isArray(definition.exercises)
    ) {
      alert(
        'This assignment does not contain a valid workout.',
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
      alert(error.message)
      return
    }

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({
        ...current,
        selectedWorkout: definition.name,
        activeWorkout,
      }))
    })
  }

  useEffect(() => {
    if (!session?.user?.id || !cloudReady) return undefined

    const openPushUrl = async (rawUrl) => {
      const url = new URL(rawUrl, window.location.origin)
      const assignmentId = url.searchParams.get('assignment')
      const openTarget = url.searchParams.get('open')

      if (assignmentId) {
        try {
          const assignment =
            await coachBackend.getAthleteAssignment(assignmentId)
          await startCoachAssignment(assignment)
        } catch (error) {
          alert(error.message)
        }
      } else if (openTarget === 'notifications') {
        navigate('notifications')
      }

      window.history.replaceState({}, '', window.location.pathname)
    }

    const currentUrl = window.location.href
    if (
      new URL(currentUrl).searchParams.has('assignment') ||
      new URL(currentUrl).searchParams.has('open')
    ) {
      openPushUrl(currentUrl)
    }

    const onMessage = (event) => {
      if (event.data?.type === 'AVAREN_PUSH_OPEN') {
        openPushUrl(event.data.url)
      }
    }

    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [session?.user?.id, cloudReady])

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

    if (workout.assignmentId) {
      coachBackend
        .markAssignmentCompleted(
          workout.assignmentId,
          completedSession.id,
          {
            durationMinutes: Math.max(
              1,
              Math.round(
                (new Date(completedSession.finishedAt) -
                  new Date(completedSession.startedAt)) /
                  60000,
              ),
            ),
            volume: completedSession.sets.reduce(
              (total, set) =>
                total +
                Number(set.weight || 0) *
                  Number(set.reps || 0),
              0,
            ),
            sets: completedSession.sets.length,
            exercises: [
              ...new Set(
                completedSession.sets.map(
                  (set) => set.exercise,
                ),
              ),
            ].length,
            reflection: completedSession.reflection ?? '',
            notes: completedSession.notes ?? '',
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

  const completeOnboarding = () => {
    if (!isReplayingOnboarding) {
      setState((current) => ({
        ...current,
        onboarding: {
          completed: true,
          completedAt:
            new Date().toISOString(),
        },
      }))
    }

    setShowOnboarding(false)
    setIsReplayingOnboarding(false)
    setScreen('home')
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  const setCoachWorkspace = (
    updater,
  ) => {
    setState((current) => ({
      ...current,
      coachWorkspace:
        typeof updater === 'function'
          ? updater(
              current.coachWorkspace ?? {
                role: 'athlete',
                modeEnabled: false,
                clients: [],
                invitations: [],
                assignments: [],
              },
            )
          : updater,
    }))
  }

  const enterCoachMode = () => {
    if (!isCoachAccount(session)) {
      return
    }

    setCoachWorkspace((current) => ({
      ...current,
      role: 'coach',
      modeEnabled: true,
    }))
    setSelectedCoachClient(null)
    setCoachScreen('clients')
    setScreen('coach-hub')
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  const exitCoachMode = () => {
    setCoachWorkspace((current) => ({
      ...current,
      modeEnabled: false,
    }))
    setScreen('more')
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  const replayOnboarding = () => {
    setIsReplayingOnboarding(true)
    setShowOnboarding(true)
    window.scrollTo({
      top: 0,
      behavior: 'auto',
    })
  }

  const activeScreen = useMemo(() => {
    if (screen === 'mobility' && mobilityFlow) {
      return (
        <MobilityScreen
          flow={mobilityFlow}
          savedDurations={state.mobility?.durationPreferences ?? {}}
          onSaveDuration={saveMobilityDuration}
          routineLength={
            state.mobility?.preferences
              ?.routineLength ??
            'standard'
          }
          dislikedMovementIds={
            state.mobility?.preferences
              ?.dislikedMovementIds ??
            []
          }
          onRoutineLengthChange={(value) =>
            updateMobilityPreferences({
              routineLength: value,
            })
          }
          onAvoidMovement={avoidMobilityMovement}
          onRestoreMovement={restoreMobilityMovement}
          onRestoreAllMovements={restoreAllMobilityMovements}
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

    if (screen === 'train') {
      return (
        <TrainHubScreen
          state={state}
          onStart={startWorkout}
          navigate={navigate}
        />
      )
    }

    if (screen === 'nutrition') {
      return (
        <NutritionScreen
          nutrition={state.nutrition}
          onChange={(updater) => {
            setState((current) => {
              const nextNutrition =
                typeof updater === 'function'
                  ? updater(current.nutrition ?? createNutritionState())
                  : updater

              const today = nextNutrition.days?.[nutritionDateKey()]
              nutritionBackend
                .syncProfile(session?.user?.id, nextNutrition)
                .catch((error) => console.error('Nutrition profile sync failed:', error))
              if (today) {
                nutritionBackend
                  .syncDay(session?.user?.id, today)
                  .catch((error) => console.error('Nutrition day sync failed:', error))
              }

              return { ...current, nutrition: nextNutrition }
            })
          }}
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

    if (
      screen === 'coach-hub' &&
      isCoachAccount(session)
    ) {
      return (
        <CoachScreen
          workspace={
            state.coachWorkspace ?? {
              role: 'coach',
              modeEnabled: true,
              clients: [],
              invitations: [],
              assignments: [],
            }
          }
          setWorkspace={setCoachWorkspace}
          screen={coachScreen}
          program={state.program}
          selectedClient={selectedCoachClient}
          setSelectedClient={setSelectedCoachClient}
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
          onUpdateSession={(sessionId, patch) =>
            setState((current) => ({
              ...current,
              history: current.history.map((session) =>
                session.id === sessionId
                  ? { ...session, ...patch }
                  : session,
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
          onOpenCoach={enterCoachMode}
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
          onReplayTour={replayOnboarding}
          session={session}
          coachRole={
            state.coachWorkspace?.role ??
            'athlete'
          }
          coachAccessEnabled={
            isCoachAccount(session)
          }
          onEnterCoachMode={enterCoachMode}
          onStartCoachAssignment={startCoachAssignment}
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
          onStartCoachAssignment={
            startCoachAssignment
          }
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
          nutritionSummary={(() => {
            const day = state.nutrition?.days?.[nutritionDateKey()]
            const totals = nutritionTotals(day)
            return {
              calories: Math.round(totals.calories),
              goal: Number(state.nutrition?.goals?.calories ?? 2200),
              protein: Math.round(totals.protein),
              proteinGoal: Number(state.nutrition?.goals?.protein ?? 170),
              waterOz: Number(day?.waterOz ?? 0),
            }
          })()}
        />
      </>
    )
  }, [
    screen,
    state,
    activeExercise,
    completedSession,
    mobilityFlow,
    earnedMilestones,
    earnedForgeAchievements,
    coachScreen,
    selectedCoachClient,
    remoteNotifications,
  ])

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

  if (showOnboarding && cloudReady) {
    return (
      <OnboardingScreen
        isReplay={isReplayingOnboarding}
        onComplete={completeOnboarding}
        onClose={() => {
          setShowOnboarding(false)
          setIsReplayingOnboarding(false)
        }}
      />
    )
  }

  if (
    screen === 'coach-hub' &&
    isCoachAccount(session)
  ) {
    return (
      <CoachShell
        screen={coachScreen}
        setScreen={setCoachScreen}
        onNavigate={(nextScreen) => {
          setSelectedCoachClient(null)
          setCoachScreen(nextScreen)
        }}
        coachName={
          session?.user?.user_metadata
            ?.display_name ||
          session?.user?.email
            ?.split('@')[0] ||
          'Coach'
        }
        onExit={exitCoachMode}
      >
        {activeScreen}
      </CoachShell>
    )
  }

  return (
    <AppShell
      screen={screen}
      setScreen={(next) => navigate(next)}
      activeWorkout={state.activeWorkout}
      transitioning={transitioning}
      notificationCount={notifications.unreadCount}
      onOpenNotifications={() => navigate('notifications')}
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

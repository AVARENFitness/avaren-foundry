import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthSession } from './hooks/useAuthSession'
import { appUi } from './lib/appUi'
import { useNavigation } from './hooks/useNavigation'
import { useWorkoutSession } from './hooks/useWorkoutSession'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'
import { AvaUiProvider } from './ava/AvaUiProvider'
import { isImmersiveScreen } from './lib/immersiveScreens'
import { STATE_SCHEMA_VERSION } from './lib/stateSchema'
import CoachShell from './components/CoachShell'
import {
  canAccessCoachHub,
  useCoachAccess,
} from './hooks/useCoachAccess'
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
import { respondToSessionRsvpFromPush } from './components/AthleteScheduledSessions'
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
import AuthScreen from './screens/AuthScreen'
import { BASELINES, DEFAULT_PROGRAM } from './data/defaultProgram'
import { recentPRs } from './lib/metrics'
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
import { buildTrainingRecommendation } from './lib/trainingRecommendations'
import {
  NOTIFICATION_ACTIONS,
  dismissNotification,
  markNotificationActedOn,
  markNotificationRead,
  notificationSnapshot as buildNotificationSnapshot,
} from './lib/notifications'

const createInitialState = (ownerUserId = null) => ({
  ownerUserId,
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
  schemaVersion: STATE_SCHEMA_VERSION,
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


function App() {
  const [remoteNotifications, setRemoteNotifications] =
    useState([])
  const [state, setState] = useState(() => createInitialState())
  const [showSplash, setShowSplash] = useState(true)
  const [mobilityFlow, setMobilityFlow] = useState(null)
  const [showReadinessCheckIn, setShowReadinessCheckIn] =
    useState(false)
  const [showOnboarding, setShowOnboarding] =
    useState(false)
  const [isReplayingOnboarding, setIsReplayingOnboarding] =
    useState(false)

  const sessionBridgeRef = useRef({})
  const openDailyResetRef = useRef(() => {})
  const trainingRecommendationRef = useRef(null)

  const setCoachWorkspace = useCallback((updater) => {
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
  }, [])

  const handleAuthenticated = useCallback(() => {
    sessionBridgeRef.current.setScreen?.('home')
    setShowReadinessCheckIn(false)
    setShowOnboarding(false)
    setIsReplayingOnboarding(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const handleSignedOut = useCallback(() => {
    setState(createInitialState())
    sessionBridgeRef.current.resetWorkoutSession?.()
    setMobilityFlow(null)
    setShowOnboarding(false)
    setIsReplayingOnboarding(false)
  }, [])

  const handleAccountHydrated = useCallback((hydratedState, decision) => {
    setShowOnboarding(!hydratedState.onboarding?.completed)
    setIsReplayingOnboarding(false)
    sessionBridgeRef.current.setActiveExerciseState?.(
      decision.state?.activeWorkout?.activeExerciseIndex ?? 0,
    )
  }, [])

  const {
    session,
    authLoading,
    cloudReady,
    cloudStatus,
    isSupabaseConfigured,
  } = useAuthSession({
    state,
    setState,
    createInitialState,
    onAuthenticated: handleAuthenticated,
    onSignedOut: handleSignedOut,
    onAccountHydrated: handleAccountHydrated,
  })

  const handleNutritionChange = useCallback((nextNutrition) => {
    setState((current) => {
      const resolvedNutrition =
        typeof nextNutrition === 'function'
          ? nextNutrition(current.nutrition ?? createNutritionState())
          : nextNutrition

      const today = resolvedNutrition.days?.[nutritionDateKey()]
      nutritionBackend
        .syncProfile(session?.user?.id, resolvedNutrition)
        .catch((error) => console.error('Nutrition profile sync failed:', error))
      if (today) {
        nutritionBackend
          .syncDay(session?.user?.id, today)
          .catch((error) => console.error('Nutrition day sync failed:', error))
      }

      return { ...current, nutrition: resolvedNutrition }
    })
  }, [session?.user?.id])

  const {
    authorized: coachAuthorized,
    loading: coachAccessLoading,
  } = useCoachAccess(session)

  const {
    screen,
    setScreen,
    coachScreen,
    setCoachScreen,
    selectedCoachClient,
    setSelectedCoachClient,
    transitioning,
    navigate,
    enterCoachMode,
    exitCoachMode,
  } = useNavigation({
    session,
    setCoachWorkspace,
    coachAuthorized,
  })

  useEffect(() => {
    if (
      screen === 'coach-hub' &&
      !coachAccessLoading &&
      !canAccessCoachHub(session, coachAuthorized)
    ) {
      setScreen('more')
      setCoachWorkspace((current) => ({
        ...current,
        modeEnabled: false,
        role: 'athlete',
      }))
    }
  }, [
    screen,
    coachAccessLoading,
    coachAuthorized,
    session,
    setScreen,
    setCoachWorkspace,
  ])

  sessionBridgeRef.current.setScreen = setScreen

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 820)
    return () => clearTimeout(timer)
  }, [])

  const {
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
  } = useWorkoutSession({
    state,
    setState,
    navigate,
    getTrainingRecommendation: () => trainingRecommendationRef.current,
    onOpenReadinessCheckIn: () => setShowReadinessCheckIn(true),
    onOpenDailyReset: () => openDailyResetRef.current(),
  })

  sessionBridgeRef.current.setActiveExerciseState = setActiveExerciseState
  sessionBridgeRef.current.resetWorkoutSession = resetWorkoutSession

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

  trainingRecommendationRef.current = trainingRecommendation

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
          appUi.toast(error.message, 'error')
        }
        return
      }

      if (notification.action === 'open-coach-assignment') {
        setCoachScreen('assignments')
        enterCoachMode()
        return
      }

      if (notification.action === 'open-coach-calendar') {
        setCoachScreen('calendar')
        enterCoachMode()
        return
      }

      if (notification.action === 'open-session-rsvp') {
        navigate('more')
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

  openDailyResetRef.current = openDailyReset

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

  useEffect(() => {
    if (!session?.user?.id || !cloudReady) return undefined

    const openPushUrl = async (rawUrl) => {
      const url = new URL(rawUrl, window.location.origin)
      const assignmentId = url.searchParams.get('assignment')
      const sessionId = url.searchParams.get('session')
      const rsvp = url.searchParams.get('rsvp')
      const openTarget = url.searchParams.get('open')

      if (sessionId && rsvp) {
        try {
          await respondToSessionRsvpFromPush(
            sessionId,
            rsvp === 'confirmed' ? 'confirmed' : 'cannot_attend',
          )
          appUi.toast(
            rsvp === 'confirmed'
              ? 'Session confirmed.'
              : 'Coach notified you cannot make it.',
            'success',
          )
        } catch (error) {
          appUi.toast(error.message, 'error')
        }
        navigate('more')
      } else if (sessionId || openTarget === 'session-rsvp') {
        navigate('more')
      } else if (assignmentId) {
        try {
          const assignment =
            await coachBackend.getAthleteAssignment(assignmentId)
          await startCoachAssignment(assignment)
        } catch (error) {
          appUi.toast(error.message, 'error')
        }
      } else if (openTarget === 'notifications') {
        navigate('notifications')
      }

      window.history.replaceState({}, '', window.location.pathname)
    }

    const currentUrl = window.location.href
    const currentParams = new URL(currentUrl).searchParams
    if (
      currentParams.has('assignment') ||
      currentParams.has('open') ||
      currentParams.has('session')
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
  }, [session?.user?.id, cloudReady, navigate, startCoachAssignment])

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
        <ErrorBoundary
          boundary="gym"
          onReturnHome={() => navigate('home')}
        >
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
        </ErrorBoundary>
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
          onChange={handleNutritionChange}
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
      canAccessCoachHub(session, coachAuthorized)
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
          coachEmail={
            session?.user?.user_metadata?.display_name ??
            session?.user?.email ??
            'Coach'
          }
          onOpenClientProfile={(client) => {
            setSelectedCoachClient(client)
            setCoachScreen('clients')
          }}
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
          fallbackState={createInitialState(session?.user?.id)}
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
          coachAccessEnabled={canAccessCoachHub(
            session,
            coachAuthorized,
          )}
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
    coachAuthorized,
    session,
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
    canAccessCoachHub(session, coachAuthorized)
  ) {
    return (
      <ErrorBoundary
        boundary="coach-hub"
        onReturnHome={() => {
          exitCoachMode()
          navigate('home')
        }}
      >
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
      </ErrorBoundary>
    )
  }

  return (
    <AvaUiProvider
      enabled={!isImmersiveScreen(screen, { mobilityFlow })}
      nutrition={state.nutrition ?? createNutritionState()}
      onNutritionChange={handleNutritionChange}
    >
      <AppShell
        screen={screen}
        setScreen={(next) => navigate(next)}
        activeWorkout={state.activeWorkout}
        transitioning={transitioning}
        immersive={isImmersiveScreen(screen, { mobilityFlow })}
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
    </AvaUiProvider>
  )
}

export default App

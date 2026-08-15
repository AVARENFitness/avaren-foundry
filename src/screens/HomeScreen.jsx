import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  Check,
  ChevronRight,
  HeartPulse,
  Moon,
  Sun,
  Utensils,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocalCalendarDay } from '../hooks/useLocalCalendarDay'
import { useAvaUi } from '../ava/useAvaUi'
import AthleteAssignmentHome from '../components/AthleteAssignmentHome'
import AvaDailyBriefing from '../components/AvaDailyBriefing'
import { buildAvaDailyBriefing } from '../lib/avaIntelligence'
import { AVA_ACTION_TYPES } from '../lib/avaActions'
import { coachBackend } from '../lib/coachBackend'
import { resolveActiveCoachAssignment } from '../lib/coachAssignments'
import { recentPRs, sessionVolume } from '../lib/metrics'
import { resolveTodayWorkoutContext } from '../lib/todayWorkout'
import {
  getAthleteHomeState,
  HOME_ACTION_IDS,
  mobilityCompletedToday,
} from '../lib/athleteHomeState'
import {
  listProgramWorkoutChoices,
  normalizeProgramWorkoutName,
  resolveWorkoutDaySummary,
} from '../lib/programWorkout'
import { isWeeklyCheckInDue } from '../lib/weeklyCheckIn'
import { buildPlanningOwnership, coachOwnershipLabel } from '../lib/planOwnership'
import {
  executionPlanSummaryLabel,
  isExecutionPlanCurrent,
} from '../lib/sessionExecutionPlan'
import AthleteNextAppointment, {
  AthleteAppointmentWeekStrip,
} from '../components/AthleteNextAppointment'
import AthleteAppointmentDetailSheet from '../components/AthleteAppointmentDetailSheet'
import {
  markAppointmentDeepLinkHandled,
  releaseAppointmentDeepLinkClaim,
  shouldHandleAppointmentDeepLink,
  subscribeAppointmentDeepLink,
} from '../lib/appointmentDeepLink'
import { useAthleteAppointments } from '../hooks/useAthleteAppointments'
import { logHomeAppointmentCheckpoint } from '../lib/athleteAppointmentTrace'
import {
  appointmentLinksToAssignment,
  formatAppointmentHeadline,
} from '../lib/coachingAppointment'
import { nextUpcomingAppointmentFromRpc } from '../lib/athleteAppointments'
import { dateKey } from '../lib/appointmentScheduling'
import WorkoutSelector from '../components/WorkoutSelector'
import {
  hasScheduledInPersonToday,
  resolveSessionMode,
  sessionModeLabel,
} from '../lib/sessionMode'

const DAY_MS = 86400000

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const sessionDate = (session) =>
  session?.finishedAt ??
  (session?.date ? `${session.date}T12:00:00` : null)

export default function HomeScreen({
  state,
  onStart,
  setScreen,
  recoveryIntelligence,
  userName,
  readiness,
  onOpenReadiness,
  onOpenMobility,
  onOpenReset,
  mobilityTitle = 'Morning Movement',
  mobilityMinutes = 7,
  onStartCoachAssignment,
  nutritionSummary,
  showCoachHubShortcut = false,
  onOpenCoachHub,
  weeklyCheckInStatus = null,
  currentWeeklyCheckInState = null,
  onOpenWeeklyCheckIn,
  weeklyCheckInConfirmation = false,
  onSelectWorkout,
  weeklyCheckInRequired = true,
  navigateToBuilder,
  trainingRecommendation = null,
}) {
  const { openAva } = useAvaUi()
  const localCalendarDay = useLocalCalendarDay()
  const [assignments, setAssignments] = useState([])
  const [showWorkoutSelector, setShowWorkoutSelector] = useState(false)
  const {
    appointments: scheduledSessions,
    upcomingAppointments,
    nextAppointment,
    refreshAppointments: reloadAppointments,
    ready: appointmentsReady,
  } = useAthleteAppointments()
  const [detailAppointment, setDetailAppointment] = useState(null)

  useEffect(() => () => setDetailAppointment(null), [])

  useEffect(() => {
    return subscribeAppointmentDeepLink(({ sessionId, role = 'athlete' }) => {
      if (role !== 'athlete' || !sessionId) return
      if (!shouldHandleAppointmentDeepLink({ sessionId, role })) return

      const openDetail = (appointment) => {
        if (!appointment) return
        setDetailAppointment(appointment)
        markAppointmentDeepLinkHandled({ sessionId, role })
      }

      const appointment =
        scheduledSessions.find((entry) => entry.id === sessionId) ??
        upcomingAppointments.find((entry) => entry.id === sessionId) ??
        (nextAppointment?.id === sessionId ? nextAppointment : null)

      if (appointment) {
        openDetail(appointment)
        return
      }

      void reloadAppointments().then((rows) => {
        const resolved = rows.find((entry) => entry.id === sessionId)
        if (resolved) {
          openDetail(resolved)
          return
        }

        releaseAppointmentDeepLinkClaim({ sessionId, role })
      })
    })
  }, [
    scheduledSessions,
    upcomingAppointments,
    nextAppointment,
    reloadAppointments,
  ])

  useEffect(() => {
    logHomeAppointmentCheckpoint({
      appointmentStateReady: appointmentsReady,
      upcomingCount: upcomingAppointments.length,
      nextAppointmentPresent: Boolean(nextAppointment),
      rendered: Boolean(nextAppointment),
    })
  }, [appointmentsReady, upcomingAppointments.length, nextAppointment])

  useEffect(() => {
    coachBackend
      .listAthleteAssignments()
      .then(setAssignments)
      .catch(() => {})
  }, [])

  const activeCoachAssignment = useMemo(
    () => resolveActiveCoachAssignment(assignments),
    [assignments],
  )

  const avaBriefing = useMemo(() => {
    try {
      return buildAvaDailyBriefing(state, {
        assignments,
        activeCoachAssignment,
        userName,
        weeklyCheckInState: currentWeeklyCheckInState,
        weeklyCheckInRequired,
      })
    } catch (error) {
      console.error('[ava-briefing] Failed to build athlete Home briefing:', error)
      return null
    }
  }, [state, assignments, activeCoachAssignment, userName, currentWeeklyCheckInState, weeklyCheckInRequired])

  const dashboard = useMemo(() => {
    const now = new Date()
    const workoutContext = resolveTodayWorkoutContext(state, {
      now,
      assignments,
      activeCoachAssignment,
    })
    const isRestDay = workoutContext.isRestDay
    const workoutName =
      state.activeWorkout?.name ||
      workoutContext.displayName ||
      null
    const firstName = userName?.trim()?.split(/\s+/)[0] || null
    const workoutsThisWeek = state.history.filter((session) => {
      const date = sessionDate(session)
      return date && Date.now() - new Date(date).getTime() < 7 * DAY_MS
    })
    const weeklyVolume = workoutsThisWeek.reduce(
      (total, session) => total + sessionVolume(session),
      0,
    )
    const weeklyPRs = recentPRs(state.history, 100).filter(
      (pr) =>
        Date.now() - new Date(`${pr.date}T12:00:00`).getTime() <
        7 * DAY_MS,
    )

    const coachOwnership = buildPlanningOwnership({
      todayWorkout: workoutContext,
      activeAssignment: activeCoachAssignment,
      hasCoachRelationship: Boolean(assignments.length),
    })
    const executionFocusLabel = isExecutionPlanCurrent(state.sessionExecutionPlan)
      ? executionPlanSummaryLabel(state.sessionExecutionPlan)
      : null
    const inPersonToday =
      appointmentsReady && hasScheduledInPersonToday(scheduledSessions)
    const nextAppt = appointmentsReady
      ? nextAppointment ?? nextUpcomingAppointmentFromRpc(scheduledSessions)
      : null
    const linkedAppointmentToday = appointmentLinksToAssignment(
      nextAppt,
      activeCoachAssignment?.id ?? null,
    ) && nextAppt?.sessionDate === dateKey(now)
    const sessionMode = resolveSessionMode({
      assignmentId: activeCoachAssignment?.id ?? null,
      coachAssigned: Boolean(activeCoachAssignment),
      linkedAppointmentToday,
    })
    const coachedSessionLabel = sessionModeLabel(sessionMode)

    const workoutDaySummary = resolveWorkoutDaySummary(
      state,
      { todayWorkoutContext: workoutContext },
      now,
    )
    const recommendedWorkout =
      workoutDaySummary.nextRecommendedWorkout ??
      normalizeProgramWorkoutName(state.program?.nextWorkout) ??
      state.program?.rotation?.[0] ??
      null

    return {
      greeting: `${greetingForHour(now.getHours())}${firstName ? `, ${firstName}` : ''}`,
      date: now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
      workoutName,
      isRestDay,
      coachLabel: coachedSessionLabel ?? coachOwnershipLabel(coachOwnership),
      inPersonToday,
      nextAppointment: nextAppt,
      linkedAppointmentToday,
      sessionMode,
      executionFocusLabel,
      workouts: workoutsThisWeek.length,
      volume: Math.round(weeklyVolume),
      prs: weeklyPRs.length,
      workoutDaySummary,
      recommendedWorkout,
      programWorkouts: listProgramWorkoutChoices(state),
    }
  }, [state, userName, assignments, activeCoachAssignment, scheduledSessions, nextAppointment, appointmentsReady])

  const readinessScore = readiness?.completed
    ? readiness.score
    : recoveryIntelligence?.score ?? 0
  const readinessLabel = readiness?.completed
    ? readiness.status ?? 'Ready'
    : "Complete today's readiness"
  const movementDone = mobilityCompletedToday(
    state.mobility?.completed,
    'daily-reset',
  )
  const resetDone = mobilityCompletedToday(
    state.mobility?.completed,
    'recovery-flow',
  )

  const weeklyCheckInDue =
    weeklyCheckInRequired && isWeeklyCheckInDue(currentWeeklyCheckInState)
  const readinessDue = !readiness?.completed

  const homeState = useMemo(() => {
    const now = new Date()
    const nextAppt = appointmentsReady
      ? nextAppointment ?? nextUpcomingAppointmentFromRpc(scheduledSessions)
      : null
    const loadAdjusted = Boolean(
      trainingRecommendation?.recommendation &&
        trainingRecommendation.recommendation !== 'train-normal',
    )

    return getAthleteHomeState({
      now,
      state,
      readiness,
      nutritionSummary,
      nextAppointment: nextAppt,
      weeklyCheckInDue,
      readinessDue,
      weeklyCheckInRequired,
      loadAdjusted,
      readinessFactors: readiness?.factors ?? [],
      assignments,
      activeCoachAssignment,
    })
  }, [
    state,
    readiness,
    nutritionSummary,
    nextAppointment,
    scheduledSessions,
    appointmentsReady,
    weeklyCheckInDue,
    readinessDue,
    weeklyCheckInRequired,
    trainingRecommendation,
    assignments,
    activeCoachAssignment,
    localCalendarDay,
  ])

  const handlePrimaryHomeAction = () => {
    const action = homeState.primaryAction
    if (!action?.id) return

    switch (action.id) {
      case HOME_ACTION_IDS.CONTINUE_WORKOUT:
      case HOME_ACTION_IDS.START_WORKOUT: {
        const assignmentId = action.meta?.assignmentId
        if (assignmentId && activeCoachAssignment?.id === assignmentId) {
          onStartCoachAssignment?.(activeCoachAssignment)
          return
        }
        onStart()
        return
      }
      case HOME_ACTION_IDS.RECOVERY_FLOW:
        onOpenReset()
        return
      case HOME_ACTION_IDS.MORNING_MOVEMENT:
        onOpenMobility()
        return
      case HOME_ACTION_IDS.NUTRITION:
        setScreen('nutrition')
        return
      case HOME_ACTION_IDS.APPOINTMENT:
      case HOME_ACTION_IDS.VIEW_SCHEDULE:
        setScreen('schedule')
        return
      case HOME_ACTION_IDS.READINESS:
        onOpenReadiness()
        return
      case HOME_ACTION_IDS.WEEKLY_CHECKIN:
        onOpenWeeklyCheckIn?.()
        return
      case HOME_ACTION_IDS.VIEW_TRAIN:
        setScreen('train')
        return
      default:
        break
    }
  }

  const handleSecondaryHomeAction = (action) => {
    if (!action?.id) return

    switch (action.id) {
      case HOME_ACTION_IDS.RECOVERY_FLOW:
        onOpenReset()
        return
      case HOME_ACTION_IDS.MORNING_MOVEMENT:
        onOpenMobility()
        return
      case HOME_ACTION_IDS.NUTRITION:
        setScreen('nutrition')
        return
      case HOME_ACTION_IDS.APPOINTMENT:
      case HOME_ACTION_IDS.VIEW_SCHEDULE:
        setScreen('schedule')
        return
      default:
        break
    }
  }

  const dailyPreview = [
    readiness?.completed
      ? `${readinessScore} readiness`
      : 'Readiness pending',
    `${nutritionSummary?.calories || 0} cal logged`,
  ].join(' · ')

  const handleAvaAction = (action) => {
    if (!action) return

    switch (action.type) {
      case AVA_ACTION_TYPES.CONTINUE_WORKOUT:
      case AVA_ACTION_TYPES.START_WORKOUT: {
        const assignmentId = action.meta?.assignmentId
        if (assignmentId && activeCoachAssignment?.id === assignmentId) {
          onStartCoachAssignment?.(activeCoachAssignment)
          return
        }
        onStart()
        return
      }
      case AVA_ACTION_TYPES.MORNING_MOVEMENT:
        onOpenMobility()
        return
      case AVA_ACTION_TYPES.RECOVERY_FLOW:
        onOpenReset()
        return
      case AVA_ACTION_TYPES.CHECK_READINESS:
      case AVA_ACTION_TYPES.BUILD_BASELINE:
        onOpenReadiness()
        return
      case AVA_ACTION_TYPES.OPEN_WEEKLY_CHECKIN:
        onOpenWeeklyCheckIn?.()
        return
      case AVA_ACTION_TYPES.VIEW_PLAN:
        setScreen('train')
        return
      case AVA_ACTION_TYPES.OPEN_NUTRITION:
        setScreen('nutrition')
        return
      default:
        break
    }
  }

  return (
    <div className="home-3">
      <header className="home-3-header home-3-header--quiet">
        <span className="eyebrow">{dashboard.date}</span>
        <h1>{dashboard.greeting}</h1>
      </header>

      {showCoachHubShortcut && (
        <button
          type="button"
          className="home-coach-hub-shortcut"
          onClick={onOpenCoachHub}
        >
          <span className="home-coach-hub-shortcut-icon">
            <BriefcaseBusiness size={18} strokeWidth={1.75} />
          </span>
          <span className="home-coach-hub-shortcut-copy">
            <strong>Coach Hub</strong>
            <span>Clients, reviews, and assignments</span>
          </span>
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      )}

      <AvaDailyBriefing
        briefing={avaBriefing}
        onAction={handleAvaAction}
        onAskAva={openAva}
      />

      <AthleteNextAppointment
        appointment={appointmentsReady ? nextAppointment : null}
        onViewDetails={setDetailAppointment}
      />

      <AthleteAppointmentDetailSheet
        appointment={detailAppointment}
        open={Boolean(detailAppointment)}
        onClose={() => setDetailAppointment(null)}
        onUpdated={(updated) => {
          reloadAppointments()
          setDetailAppointment(updated)
        }}
      />

      <section className="home-today-plan">
        <span className="eyebrow">
          {homeState.primaryAction?.eyebrow ?? 'TODAY'}
        </span>
        {homeState.sections.showWorkoutCompleteState &&
        !state.activeWorkout ? (
          <>
            <h2>{homeState.primaryAction?.label ?? 'Workout complete'}</h2>
            {homeState.primaryAction?.detail ? (
              <p>{homeState.primaryAction.detail}</p>
            ) : null}
            {!activeCoachAssignment &&
            homeState.recommendation?.canStartAnotherToday ? (
              <button
                type="button"
                className="ui-btn-secondary athlete-choose-workout-action home-choose-workout-link"
                onClick={() => setShowWorkoutSelector(true)}
              >
                Choose another workout
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            ) : null}
          </>
        ) : dashboard.isRestDay &&
          !activeCoachAssignment &&
          !state.activeWorkout ? (
          <>
            <h2>Rest day</h2>
            <p>Your schedule calls for recovery today.</p>
          </>
        ) : homeState.primaryAction?.id === HOME_ACTION_IDS.START_WORKOUT ||
          homeState.primaryAction?.id === HOME_ACTION_IDS.CONTINUE_WORKOUT ? (
          <>
            {dashboard.coachLabel ? (
              <span className="home-coach-ownership eyebrow">{dashboard.coachLabel}</span>
            ) : null}
            <h2>{dashboard.workoutName}</h2>
            {dashboard.linkedAppointmentToday && dashboard.nextAppointment ? (
              <p className="home-in-person-note">
                {formatAppointmentHeadline(dashboard.nextAppointment)} with Coach
              </p>
            ) : null}
            {dashboard.executionFocusLabel ? (
              <p className="home-execution-focus">{dashboard.executionFocusLabel} active</p>
            ) : null}
            <p>
              {activeCoachAssignment
                ? 'Your coach programmed this session.'
                : 'Scheduled on your weekly plan.'}
            </p>
            <button
              type="button"
              className="gold-button machined home-start-session"
              onClick={handlePrimaryHomeAction}
            >
              {homeState.primaryAction?.label ?? 'Start Session'}
            </button>
            {!state.activeWorkout && dashboard.programWorkouts.length > 1 ? (
              <button
                type="button"
                className="ui-btn-secondary athlete-choose-workout-action home-choose-workout-link"
                onClick={() => setShowWorkoutSelector(true)}
              >
                Choose another workout
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            ) : null}
          </>
        ) : homeState.primaryAction ? (
          <>
            <h2>{homeState.primaryAction.label}</h2>
            {homeState.primaryAction.detail ? (
              <p>{homeState.primaryAction.detail}</p>
            ) : null}
            {[
              HOME_ACTION_IDS.RECOVERY_FLOW,
              HOME_ACTION_IDS.MORNING_MOVEMENT,
              HOME_ACTION_IDS.NUTRITION,
              HOME_ACTION_IDS.APPOINTMENT,
              HOME_ACTION_IDS.READINESS,
              HOME_ACTION_IDS.WEEKLY_CHECKIN,
            ].includes(homeState.primaryAction.id) ? (
              <button
                type="button"
                className="gold-button machined home-start-session"
                onClick={handlePrimaryHomeAction}
              >
                {homeState.primaryAction.label}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <h2>Open schedule</h2>
            <p>Review your week and choose the next session that fits.</p>
          </>
        )}

        {homeState.secondaryActions.length > 0 ? (
          <div className="home-secondary-actions">
            {homeState.secondaryActions.slice(0, 2).map((action) => (
              <button
                key={action.id}
                type="button"
                className="home-today-plan-link"
                onClick={() => handleSecondaryHomeAction(action)}
              >
                {action.label}
                <ChevronRight size={16} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            className="home-today-plan-link"
            onClick={() => {
              setDetailAppointment(null)
              setScreen('schedule')
            }}
          >
            View schedule
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        )}
      </section>

      <AthleteAppointmentWeekStrip
        appointments={appointmentsReady ? upcomingAppointments : []}
      />

      <div className="home-assignment-slot">
        {!activeCoachAssignment && (
          <AthleteAssignmentHome
            compact
            onStartAssignment={onStartCoachAssignment}
          />
        )}
      </div>

      {weeklyCheckInConfirmation && (
        <p className="home-weekly-checkin-confirmation" role="status">
          Weekly check-in sent
        </p>
      )}

      {(readinessDue || weeklyCheckInDue) && (
        <section className="home-reminders" aria-label="Essentials">
          {readinessDue && (
            <button
              type="button"
              className="home-reminder-row home-reminder-row--daily"
              onClick={onOpenReadiness}
            >
              <HeartPulse size={18} strokeWidth={1.75} />
              <div>
                <span className="home-reminder-eyebrow">DAILY READINESS</span>
                <strong>How are you today?</strong>
                <span>Quick check-in for today&apos;s training context.</span>
              </div>
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          )}

          {weeklyCheckInDue && (
            <div className="home-reminder-row home-reminder-row--weekly">
              <CalendarCheck2 size={18} strokeWidth={1.75} />
              <div>
                <span className="home-reminder-eyebrow">WEEKLY CHECK-IN</span>
                <strong>Give your coach a quick read on your week.</strong>
              </div>
              <button
                type="button"
                className="home-reminder-action"
                onClick={onOpenWeeklyCheckIn}
              >
                Check In
              </button>
            </div>
          )}
        </section>
      )}

      <details className="foundry-disclosure home-daily-panel">
        <summary>
          <span>Daily essentials</span>
          <small>{dailyPreview}</small>
        </summary>

        <div className="home-daily-list">
          <button className="home-daily-row" onClick={onOpenReadiness}>
            <HeartPulse size={18} />
            <div>
              <strong>Readiness</strong>
              <span>
                {readiness?.completed
                  ? `${readinessScore} · ${readinessLabel}`
                  : readinessLabel}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className="home-daily-row"
            onClick={() => setScreen('nutrition')}
          >
            <Utensils size={18} />
            <div>
              <strong>Nutrition</strong>
              <span>
                {nutritionSummary?.calories || 0} /{' '}
                {nutritionSummary?.goal || 2200} cal ·{' '}
                {nutritionSummary?.protein || 0}g protein
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className={`home-daily-row ${movementDone ? 'is-complete' : ''}`}
            onClick={onOpenMobility}
          >
            {movementDone ? <Check size={18} /> : <Sun size={18} />}
            <div>
              <strong>Movement</strong>
              <span>
                {movementDone
                  ? 'Complete'
                  : `${mobilityMinutes} min · ${mobilityTitle}`}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>

          <button
            className={`home-daily-row ${resetDone ? 'is-complete' : ''}`}
            onClick={onOpenReset}
          >
            {resetDone ? <Check size={18} /> : <Moon size={18} />}
            <div>
              <strong>Recovery</strong>
              <span>
                {resetDone ? 'Complete' : 'Mobility and stretching'}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </details>

      <details className="foundry-disclosure home-week-panel">
        <summary>
          <span>This week</span>
          <small>
            {dashboard.workouts} workouts ·{' '}
            {dashboard.volume.toLocaleString()} lb · {dashboard.prs} PRs
          </small>
        </summary>

        <div className="home-week-stats">
          <article>
            <strong>{dashboard.workouts}</strong>
            <span>Workouts</span>
          </article>
          <article>
            <strong>{dashboard.volume.toLocaleString()}</strong>
            <span>Volume</span>
          </article>
          <article>
            <strong>{dashboard.prs}</strong>
            <span>PRs</span>
          </article>
        </div>

        <button
          className="home-week-link"
          onClick={() => setScreen('progress')}
        >
          View full progress
          <ArrowRight size={16} />
        </button>
      </details>

      {showWorkoutSelector ? (
        <WorkoutSelector
          workouts={dashboard.programWorkouts}
          recommendedWorkout={dashboard.recommendedWorkout}
          selectedWorkout={state.selectedWorkout}
          coachAssignedWorkout={
            activeCoachAssignment
              ? dashboard.workoutDaySummary?.recommendedTodayWorkout
              : null
          }
          onSelect={(workout) => {
            onSelectWorkout?.(workout)
            setShowWorkoutSelector(false)
          }}
          onClose={() => setShowWorkoutSelector(false)}
          onOpenBuilder={() => {
            setShowWorkoutSelector(false)
            if (navigateToBuilder) {
              navigateToBuilder()
              return
            }
            setScreen('builder')
          }}
        />
      ) : null}
    </div>
  )
}

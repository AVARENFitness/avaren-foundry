import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  HeartPulse,
  Package,
  PenLine,
  Plus,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import CollapsibleIdentityPanel, {
  IDENTITY_EDITOR_MODE,
} from '../components/ui/CollapsibleIdentityPanel'
import { coachBackend } from '../lib/coachBackend'
import { invalidateCoachPortfolioCache } from '../lib/coachPortfolioService'
import { buildClientIntelligence } from '../lib/clientIntelligence'
import {
  getAthleteDisplayName,
  getClientDisplayName,
  sanitizeCoachLabelDraft,
} from '../lib/clientDisplayName'
import {
  formatWeekRangeLabel,
  getCoachWeekRange,
  getWeeklyReviewStatus,
  normalizeWeeklyReview,
} from '../lib/weeklyReview'
import {
  formatWeeklyCheckInSummary,
} from '../lib/weeklyCheckIn'
import { weeklyCheckInBackend } from '../lib/weeklyCheckInBackend'
import { isOpenFollowUp, normalizeCoachFollowUp } from '../lib/coachFollowUp'
import {
  endBusinessClientCoaching,
  reopenBusinessClientCoaching,
  unlinkBusinessClientAccount,
  END_COACHING_COPY,
  REOPEN_COACHING_COPY,
  UNLINK_ACCOUNT_COPY,
  mapLifecycleActionError,
} from '../lib/coachClientLifecycle'
import {
  hasLinkedAthlete,
  isArchivedBusinessClient,
  resolveAthleteDataId,
  resolveCanonicalLinkedUserId,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'
import {
  canInviteBusinessClientToAvaren,
  findPendingInviteForBusinessClient,
  mapInviteUserMessage,
  normalizeInviteEmail,
  resolveClientInviteStatus,
  resolveClientInviteStatusLabel,
} from '../lib/coachClientInvite'
import { LIFECYCLE_SUCCESS, validateInviteEmail } from '../lib/coachClientUi'
import {
  canLoadAthleteIntelligence,
  isWeeklyCheckInEligible,
} from '../lib/weeklyCheckInEligibility'
import { appUi } from '../lib/appUi'
import AppUiBackdrop from '../components/ui/AppUiBackdrop'
import AppUiCloseButton from '../components/ui/AppUiCloseButton'
import ClientIntelligenceDashboard from '../components/ClientIntelligenceDashboard'
import CoachClientInPersonPanel from '../components/coach/CoachClientInPersonPanel'
import CoachEndCoachingSheet, {
  CoachCoachingRequirementsPanel,
  CoachClientManagementPanel,
} from '../components/coach/CoachClientManagementPanel'
import CoachClientProfileShell from '../components/CoachClientProfileShell'
import CoachClientDocumentsPanel from '../components/coach/CoachClientDocumentsPanel'
import CoachSessionDetailHost from '../components/coach/CoachSessionDetailHost'
import EmptyState from '../components/ui/EmptyState'
import CoachMessageLauncher from '../components/CoachMessageLauncher'
import CoachFloorMode from '../components/CoachFloorMode'
import { coachFloorBackend } from '../lib/coachFloorSession'
import {
  ATHLETE_GOAL_LABELS,
  athleteGoalBackend,
  formatGoalTarget,
} from '../lib/athleteGoals'

const ICON = { size: 18, strokeWidth: 1.75 }

const formatDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : 'No due date'

function ProfileSection({ eyebrow, title, description, primaryAction, children }) {
  return (
    <section className="coach-client-profile-section">
      <header className="coach-client-profile-section-header">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>

      {primaryAction}

      <div className="coach-client-profile-section-content">
        {children}
      </div>
    </section>
  )
}

export default function CoachClientProfile({
  client,
  invitations = [],
  assignments = [],
  clientNotes = '',
  notesUpdatedAt = null,
  onClientNotesChange,
  onSaveNotes,
  onSaveCoachLabel,
  coachLabelsEnabled = false,
  coachEmail = 'Coach',
  onBack,
  onAssignWorkout,
  onBuildWorkout,
  onAssignProgram,
  onBuildProgram,
  onOpenWeeklyReview,
  onScheduleAppointment,
  notice = '',
  onClientUpdated,
  onClientArchived,
  onInvitationsChanged,
  initialActiveSection = 'overview',
}) {
  const [showInviteSheet, setShowInviteSheet] = useState(false)
  const [inviteEmailDraft, setInviteEmailDraft] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [passAvaContext, setPassAvaContext] = useState(null)

  const [activeSection, setActiveSection] = useState(initialActiveSection)
  const [athleteState, setAthleteState] = useState(null)
  const [nutritionProfile, setNutritionProfile] = useState(null)
  const [nutritionDays, setNutritionDays] = useState([])
  const [intelligenceLoading, setIntelligenceLoading] = useState(true)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [currentWeekReview, setCurrentWeekReview] = useState(null)
  const [currentWeeklyCheckIn, setCurrentWeeklyCheckIn] = useState(null)
  const [structuredGoal, setStructuredGoal] = useState(null)
  const [coachLabelDraft, setCoachLabelDraft] = useState(() =>
    sanitizeCoachLabelDraft(client.coach_label ?? ''),
  )
  const [savedCoachLabel, setSavedCoachLabel] = useState(() =>
    sanitizeCoachLabelDraft(client.coach_label ?? ''),
  )
  const [coachLabelMode, setCoachLabelMode] = useState(IDENTITY_EDITOR_MODE.VIEW)
  const [coachLabelError, setCoachLabelError] = useState('')
  const coachLabelSavedTimerRef = useRef(null)
  const [notesMode, setNotesMode] = useState(IDENTITY_EDITOR_MODE.VIEW)
  const [notesDraft, setNotesDraft] = useState(clientNotes)
  const [notesError, setNotesError] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [clientFollowUps, setClientFollowUps] = useState([])
  const [followUpBusyId, setFollowUpBusyId] = useState(null)
  const [showEndCoaching, setShowEndCoaching] = useState(false)
  const [showAdHocFloorMode, setShowAdHocFloorMode] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [offlineTrainingHistory, setOfflineTrainingHistory] = useState([])
  const [offlineTrainingLoading, setOfflineTrainingLoading] = useState(false)

  const linkedAthleteId = useMemo(
    () => resolveAthleteDataId(client),
    [client],
  )
  const businessClientId = useMemo(
    () => resolveRecordBusinessClientId(client),
    [client],
  )
  const athleteIntelligenceEnabled = useMemo(
    () => canLoadAthleteIntelligence(client),
    [client],
  )
  const weeklyCheckInEnabled = useMemo(
    () => isWeeklyCheckInEligible(client),
    [client],
  )

  useEffect(() => {
    setActiveSection(initialActiveSection || 'overview')
  }, [client?.id, client?.athlete_id, initialActiveSection])

  const updateFollowUpStatus = async (followUpId, status) => {
    setFollowUpBusyId(followUpId)
    try {
      const updated = await coachBackend.updateClientFollowUpStatus(
        followUpId,
        status,
      )
      setClientFollowUps((current) =>
        current
          .map((row) => (row.id === followUpId ? updated : row))
          .filter(isOpenFollowUp),
      )
      invalidateCoachPortfolioCache()
    } finally {
      setFollowUpBusyId(null)
    }
  }

  useEffect(() => {
    return () => {
      if (coachLabelSavedTimerRef.current) {
        clearTimeout(coachLabelSavedTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const label = sanitizeCoachLabelDraft(client.coach_label ?? '')
    setCoachLabelDraft(label)
    setSavedCoachLabel(label)
    setCoachLabelMode(IDENTITY_EDITOR_MODE.VIEW)
    setCoachLabelError('')
  }, [client])

  useEffect(() => {
    setNotesDraft(clientNotes)
    setNotesMode(IDENTITY_EDITOR_MODE.VIEW)
    setNotesError('')
  }, [clientNotes, client.athlete_id])

  const athleteDisplayName = useMemo(
    () => getAthleteDisplayName(client),
    [client],
  )

  const handleCoachLabelSave = async () => {
    if (!onSaveCoachLabel) return
    setCoachLabelMode(IDENTITY_EDITOR_MODE.SAVING)
    setCoachLabelError('')
    try {
      await onSaveCoachLabel(coachLabelDraft)
      const next = sanitizeCoachLabelDraft(coachLabelDraft)
      setSavedCoachLabel(next)
      setCoachLabelDraft(next)
      setCoachLabelMode(IDENTITY_EDITOR_MODE.SAVED)
      if (coachLabelSavedTimerRef.current) {
        clearTimeout(coachLabelSavedTimerRef.current)
      }
      coachLabelSavedTimerRef.current = setTimeout(() => {
        setCoachLabelMode(IDENTITY_EDITOR_MODE.VIEW)
      }, 1400)
    } catch (error) {
      setCoachLabelError(error?.message ?? 'Could not save coach label.')
      setCoachLabelMode(IDENTITY_EDITOR_MODE.ERROR)
    }
  }

  const handleCoachLabelClear = async () => {
    setCoachLabelDraft('')
    if (!onSaveCoachLabel) return
    setCoachLabelMode(IDENTITY_EDITOR_MODE.SAVING)
    setCoachLabelError('')
    try {
      await onSaveCoachLabel('')
      setSavedCoachLabel('')
      setCoachLabelMode(IDENTITY_EDITOR_MODE.SAVED)
      if (coachLabelSavedTimerRef.current) {
        clearTimeout(coachLabelSavedTimerRef.current)
      }
      coachLabelSavedTimerRef.current = setTimeout(() => {
        setCoachLabelMode(IDENTITY_EDITOR_MODE.VIEW)
      }, 1400)
    } catch (error) {
      setCoachLabelError(error?.message ?? 'Could not remove coach label.')
      setCoachLabelMode(IDENTITY_EDITOR_MODE.ERROR)
    }
  }

  const handleNotesSave = async () => {
    if (!onSaveNotes) return
    setNotesSaving(true)
    setNotesError('')
    try {
      onClientNotesChange?.(notesDraft)
      await onSaveNotes?.(notesDraft)
      setNotesMode(IDENTITY_EDITOR_MODE.VIEW)
    } catch (error) {
      setNotesError(error?.message ?? 'Could not save notes.')
      setNotesMode(IDENTITY_EDITOR_MODE.ERROR)
    } finally {
      setNotesSaving(false)
    }
  }

  const clientAssignments = useMemo(
    () =>
      linkedAthleteId
        ? assignments.filter((item) => item.athlete_id === linkedAthleteId)
        : [],
    [assignments, linkedAthleteId],
  )

  const nextAssignment = useMemo(
    () =>
      [...clientAssignments]
        .filter((item) => ['assigned', 'started'].includes(item.status))
        .sort((a, b) =>
          String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')),
        )[0] ?? null,
    [clientAssignments],
  )

  const intelligence = useMemo(
    () =>
      buildClientIntelligence({
        client,
        assignments: clientAssignments,
        athleteState,
        nutritionProfile,
        nutritionDays,
        clientNotes,
        notesUpdatedAt,
      }),
    [
      client,
      clientAssignments,
      athleteState,
      nutritionProfile,
      nutritionDays,
      clientNotes,
      notesUpdatedAt,
    ],
  )

  useEffect(() => {
    let active = true

    if (!athleteIntelligenceEnabled) {
      setAthleteState(null)
      setNutritionProfile(null)
      setNutritionDays([])
      setCurrentWeekReview(null)
      setCurrentWeeklyCheckIn(null)
      setIntelligenceLoading(false)
      setIntelligenceError('')
      return undefined
    }

    setIntelligenceLoading(true)
    setIntelligenceError('')

    Promise.all([
      coachBackend.getAthleteFoundryState(linkedAthleteId),
      coachBackend.getAthleteNutritionSnapshot(linkedAthleteId),
      coachBackend.getClientWeeklyReview(linkedAthleteId),
      weeklyCheckInBackend.getClientWeeklyCheckIn(linkedAthleteId),
    ])
      .then(([state, nutrition, review, weeklyCheckIn]) => {
        if (!active) return
        setAthleteState(state)
        setNutritionProfile(nutrition.profile)
        setNutritionDays(nutrition.days)
        setCurrentWeekReview(normalizeWeeklyReview(review))
        setCurrentWeeklyCheckIn(weeklyCheckIn)
      })
      .catch((error) => {
        if (!active) return
        setIntelligenceError(
          error?.message ?? 'Could not load client intelligence.',
        )
      })
      .finally(() => {
        if (active) setIntelligenceLoading(false)
      })

    return () => {
      active = false
    }
  }, [linkedAthleteId, athleteIntelligenceEnabled])

  useEffect(() => {
    let active = true

    if (!linkedAthleteId) {
      setStructuredGoal(null)
      return undefined
    }

    athleteGoalBackend
      .getAthleteGoal(linkedAthleteId)
      .then((goal) => {
        if (active) setStructuredGoal(goal)
      })
      .catch(() => {
        if (active) setStructuredGoal(null)
      })

    return () => {
      active = false
    }
  }, [linkedAthleteId])

  useEffect(() => {
    let active = true

    if (!linkedAthleteId) {
      setClientFollowUps([])
      return undefined
    }

    coachBackend
      .listCoachClientFollowUps()
      .then((rows) => {
        if (!active) return
        setClientFollowUps(
          (rows ?? [])
            .map(normalizeCoachFollowUp)
            .filter(
              (item) =>
                item.athleteId === linkedAthleteId && isOpenFollowUp(item),
            ),
        )
      })
      .catch(() => {
        if (active) setClientFollowUps([])
      })

    return () => {
      active = false
    }
  }, [client.athlete_id])

  useEffect(() => {
    if (!passAvaContext || !import.meta.env?.DEV) return
    console.debug('[ava-coach-pass-context]', passAvaContext)
  }, [passAvaContext])

  useEffect(() => {
    let active = true

    if (
      activeSection !== 'training' ||
      athleteIntelligenceEnabled ||
      !businessClientId
    ) {
      setOfflineTrainingHistory([])
      setOfflineTrainingLoading(false)
      return undefined
    }

    setOfflineTrainingLoading(true)
    coachFloorBackend
      .listFloorSessions({ businessClientId, limit: 20 })
      .then((rows) => {
        if (!active) return
        setOfflineTrainingHistory(
          (rows ?? [])
            .filter((row) => row.status === 'completed')
            .slice(0, 12),
        )
      })
      .catch(() => {
        if (active) setOfflineTrainingHistory([])
      })
      .finally(() => {
        if (active) setOfflineTrainingLoading(false)
      })

    return () => {
      active = false
    }
  }, [activeSection, athleteIntelligenceEnabled, businessClientId])

  const handleSectionAction = (action) => {
    if (!action) return

    if (action === 'assignment') {
      onAssignWorkout?.()
      return
    }

    if (action === 'notes') {
      setActiveSection('notes')
      return
    }

    if (['training', 'progress', 'sessions'].includes(action)) {
      setActiveSection(action)
    }
  }

  const programLabel =
    nextAssignment?.title ??
    (clientAssignments.length ? 'Individual programming' : 'No program assigned')

  const profileStatusLine = useMemo(() => {
    const lifecycle = isArchivedBusinessClient(client)
      ? 'Past client'
      : 'Active client'
    const inviteStatus = resolveClientInviteStatus({ client, invitations })
    return `${lifecycle} · ${resolveClientInviteStatusLabel(inviteStatus)}`
  }, [client, invitations])

  const handleInviteToAvaren = () => {
    const businessClientId = resolveRecordBusinessClientId(client)
    if (!businessClientId) return

    if (
      findPendingInviteForBusinessClient(
        invitations,
        businessClientId,
        client.email ?? client.athlete_email ?? '',
      )
    ) {
      appUi.toast('An invitation is already pending for this client.', 'info')
      return
    }

    setInviteEmailDraft(normalizeInviteEmail(client.email ?? client.athlete_email ?? ''))
    setInviteError('')
    setShowInviteSheet(true)
  }

  const submitInviteToAvaren = async () => {
    const businessClientId = resolveRecordBusinessClientId(client)
    if (!businessClientId) return

    const email = normalizeInviteEmail(inviteEmailDraft)
    const emailError = validateInviteEmail(email)
    if (emailError) {
      setInviteError(emailError)
      return
    }

    setLifecycleBusy(true)
    setInviteError('')
    try {
      if (normalizeInviteEmail(client.email ?? '') !== email) {
        await coachBackend.updateBusinessClientEmail({
          businessClientId,
          email,
        })
        onClientUpdated?.(
          {
            ...client,
            email,
          },
          { refreshRoster: true },
        )
      }

      await coachBackend.inviteAthlete(email, { businessClientId })
      setShowInviteSheet(false)
      appUi.toast(LIFECYCLE_SUCCESS.INVITE_SENT, 'success')
      await onInvitationsChanged?.()
    } catch (error) {
      setInviteError(mapInviteUserMessage(error))
    } finally {
      setLifecycleBusy(false)
    }
  }

  const connectionDetail = useMemo(() => {
    if (!hasLinkedAthlete(client)) return null
    const linkedAt = client.bridgeCreatedAt ?? client.linked_at ?? null
    if (!linkedAt) return null
    return `Connected since ${new Date(linkedAt).toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })}`
  }, [client])

  const weeklyReviewStatus = useMemo(
    () =>
      weeklyCheckInEnabled
        ? getWeeklyReviewStatus({ currentReview: currentWeekReview })
        : { status: 'N/A' },
    [currentWeekReview, weeklyCheckInEnabled],
  )

  const weeklyCheckInSummary = useMemo(
    () =>
      weeklyCheckInEnabled
        ? formatWeeklyCheckInSummary(currentWeeklyCheckIn)
        : null,
    [currentWeeklyCheckIn, weeklyCheckInEnabled],
  )

  const coachingStatusPanel =
    weeklyCheckInEnabled &&
    (weeklyCheckInSummary || weeklyReviewStatus.status !== 'REVIEWED') ? (
      <article className="coach-profile-status-card coach-profile-status-card--compact">
        <div className="coach-profile-status-card-copy">
          <span className="eyebrow">COACHING</span>
          <strong className="coach-profile-status-card-title">
            {weeklyCheckInSummary
              ? 'Check-in · Received'
              : 'Check-in · Waiting'}
            {' · '}
            {weeklyReviewStatus.status === 'REVIEWED'
              ? 'Review · Done'
              : 'Review · Open'}
          </strong>
        </div>
        {weeklyReviewStatus.status !== 'REVIEWED' ? (
          <button
            type="button"
            className="coach-secondary-button coach-profile-status-action"
            onClick={onOpenWeeklyReview}
          >
            Review
          </button>
        ) : null}
      </article>
    ) : null

  const attentionPanel =
    clientFollowUps.length > 0 ? (
      <section className="coach-client-followup-panel">
        <span className="eyebrow">ATTENTION</span>
        {clientFollowUps.map((item) => (
          <article key={item.id} className="coach-client-followup-card">
            <div>
              <strong>{item.summary}</strong>
              <small>{item.reasonType.replace(/_/g, ' ').toLowerCase()}</small>
            </div>
            <div className="coach-client-followup-actions">
              <button
                type="button"
                className="coach-secondary-button"
                disabled={followUpBusyId === item.id}
                onClick={() => updateFollowUpStatus(item.id, 'reviewed')}
              >
                Review
              </button>
              <button
                type="button"
                className="coach-secondary-button"
                disabled={followUpBusyId === item.id}
                onClick={() => updateFollowUpStatus(item.id, 'resolved')}
              >
                Resolve
              </button>
            </div>
          </article>
        ))}
      </section>
    ) : null

  const handleEndCoachingConfirm = async ({ unlinkAccount = false } = {}) => {
    if (!businessClientId || lifecycleBusy) return

    setLifecycleBusy(true)
    try {
      const updated = await endBusinessClientCoaching(
        coachBackend,
        businessClientId,
        { unlinkAccount },
      )
      setShowEndCoaching(false)
      onClientUpdated?.(updated)
      onClientArchived?.(updated)
      appUi.toast(END_COACHING_COPY.success, 'success')
    } catch (error) {
      appUi.toast(mapLifecycleActionError(error), 'error')
    } finally {
      setLifecycleBusy(false)
    }
  }

  const handleReopenCoaching = async () => {
    if (!businessClientId || lifecycleBusy) return

    const confirmed = await appUi.confirm({
      message: REOPEN_COACHING_COPY.message,
      confirmLabel: REOPEN_COACHING_COPY.confirmLabel,
    })
    if (!confirmed) return

    setLifecycleBusy(true)
    try {
      const updated = await reopenBusinessClientCoaching(
        coachBackend,
        businessClientId,
      )
      onClientUpdated?.(updated)
      appUi.toast(REOPEN_COACHING_COPY.success, 'success')
    } catch (error) {
      appUi.toast(mapLifecycleActionError(error), 'error')
    } finally {
      setLifecycleBusy(false)
    }
  }

  const handleUnlinkAccount = async () => {
    if (!businessClientId || lifecycleBusy) return

    const confirmed = await appUi.confirm({
      message: UNLINK_ACCOUNT_COPY.message,
      confirmLabel: UNLINK_ACCOUNT_COPY.confirmLabel,
      tone: 'danger',
    })
    if (!confirmed) return

    setLifecycleBusy(true)
    try {
      const updated = await unlinkBusinessClientAccount(
        coachBackend,
        businessClientId,
      )
      onClientUpdated?.(updated)
      appUi.toast(UNLINK_ACCOUNT_COPY.success, 'success')
    } catch (error) {
      appUi.toast(mapLifecycleActionError(error), 'error')
    } finally {
      setLifecycleBusy(false)
    }
  }

  const messagingAthleteId =
    client?.athlete_id ??
    client?.linked_user_id ??
    client?.linkedUserId ??
    null

  const clientManagementPanel = businessClientId ? (
    <>
      <CoachCoachingRequirementsPanel
        client={client}
        submitting={lifecycleBusy}
        onUpdateWeeklyCheckInRequired={async (weeklyCheckInRequired) => {
          setLifecycleBusy(true)
          try {
            const updated = await coachBackend.updateBusinessClientCoachingRequirements(
              {
                businessClientId,
                weeklyCheckInRequired,
              },
            )
            onClientUpdated?.(updated, { refreshRoster: false })
          } catch (error) {
            appUi.toast(
              error?.message ?? 'Unable to update weekly check-in requirement.',
              'error',
            )
            throw error
          } finally {
            setLifecycleBusy(false)
          }
        }}
      />
      <CoachClientManagementPanel
        client={client}
        submitting={lifecycleBusy}
        onEndCoaching={() => setShowEndCoaching(true)}
        onReopenCoaching={handleReopenCoaching}
        onUnlinkAccount={handleUnlinkAccount}
        onInviteToAvaren={
          canInviteBusinessClientToAvaren({ client, invitations })
            ? handleInviteToAvaren
            : undefined
        }
      />
    </>
  ) : null

  const renderSection = (openSession) => {
    switch (activeSection) {
      case 'overview':
      case 'today':
        return (
          <>
            {clientFollowUps.length > 0 ? attentionPanel : null}
            <CoachClientInPersonPanel
              client={client}
              onOpenSession={openSession}
              onPassContextChange={setPassAvaContext}
              showHistory={false}
            />
            <div className="coach-client-overview-actions coach-client-overview-actions--calm">
              {!isArchivedBusinessClient(client) ? (
                <button
                  type="button"
                  className="gold-button machined coach-primary-action coach-client-start-training"
                  onClick={() => setShowAdHocFloorMode(true)}
                >
                  <Dumbbell {...ICON} />
                  Start Training
                </button>
              ) : null}
              <button
                type="button"
                className="coach-secondary-button coach-client-schedule-primary"
                onClick={onScheduleAppointment}
              >
                Schedule appointment
              </button>
              <details className="coach-client-more-actions">
                <summary>More actions</summary>
                <div>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={onAssignWorkout}
                  >
                    Assign workout
                  </button>
                  <CoachMessageLauncher
                    otherUserId={messagingAthleteId}
                    otherName={athleteDisplayName}
                    label="Message athlete"
                    className="coach-secondary-button"
                  />
                </div>
              </details>
            </div>
          </>
        )

      case 'sessions':
        return (
          <CoachClientInPersonPanel
            client={client}
            onOpenSession={openSession}
            onPassContextChange={setPassAvaContext}
            showPassPanel={false}
            showUpcoming={false}
          />
        )
      case 'training':
        if (!athleteIntelligenceEnabled) {
          return (
            <ProfileSection
              eyebrow="TRAINING"
              title="In-person training"
              description="This coaching record works without an AVAREN athlete account."
              primaryAction={
                !isArchivedBusinessClient(client) ? (
                  <div className="coach-client-training-actions">
                    <button
                      type="button"
                      className="gold-button machined coach-primary-action coach-client-profile-section-action"
                      onClick={() => setShowAdHocFloorMode(true)}
                    >
                      <Dumbbell {...ICON} />
                      Start In-Person Session
                    </button>
                    <button
                      type="button"
                      className="coach-secondary-button coach-client-profile-section-action"
                      onClick={onScheduleAppointment}
                    >
                      Schedule appointment
                    </button>
                  </div>
                ) : null
              }
            >
              {offlineTrainingLoading ? (
                <p className="coach-client-in-person-loading">
                  Loading training history…
                </p>
              ) : offlineTrainingHistory.length > 0 ? (
                <div className="coach-client-profile-activity">
                  {offlineTrainingHistory.map((session) => {
                    const payload = session.workoutPayload ?? {}
                    const sets = Array.isArray(payload.sets) ? payload.sets : []
                    const exerciseCount = Array.isArray(payload.exercisesPerformed)
                      ? payload.exercisesPerformed.length
                      : new Set(
                          sets
                            .map((set) => String(set?.exercise ?? '').trim())
                            .filter(Boolean),
                        ).size

                    return (
                      <article
                        key={session.id}
                        className="coach-profile-activity-row"
                      >
                        <strong>{session.workoutName || 'In-person workout'}</strong>
                        <span>
                          {session.completedAt
                            ? new Date(session.completedAt).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : 'Completed session'}
                          {exerciseCount > 0
                            ? ` · ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`
                            : ''}
                          {sets.length > 0
                            ? ` · ${sets.length} set${sets.length === 1 ? '' : 's'}`
                            : ''}
                        </span>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No coached workouts recorded yet"
                  description="Start an in-person session to build this client’s training history. App connection is optional."
                  actionLabel="Start In-Person Session"
                  onAction={
                    isArchivedBusinessClient(client)
                      ? undefined
                      : () => setShowAdHocFloorMode(true)
                  }
                />
              )}
            </ProfileSection>
          )
        }

        return (
          <>
            <ProfileSection
              eyebrow="TRAINING"
              title="Programming"
            description="Goals, program focus, and assignment workflow."
            primaryAction={
              <div className="coach-client-training-actions">
                <button
                  type="button"
                  className="gold-button machined coach-primary-action coach-client-profile-section-action"
                  onClick={onAssignWorkout}
                >
                  <Plus {...ICON} />
                  Assign Workout
                </button>
                <div className="coach-client-training-secondary-actions">
                  <button
                    type="button"
                    className="coach-secondary-button coach-client-profile-section-action"
                    onClick={onBuildWorkout}
                  >
                    Build New Workout
                  </button>
                  <button
                    type="button"
                    className="coach-secondary-button coach-client-profile-section-action"
                    onClick={onAssignProgram}
                    data-testid="coach-client-assign-program"
                  >
                    Assign Program
                  </button>
                </div>
              </div>
            }
          >
            <div className="coach-client-profile-overview">
              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <Target {...ICON} />
                </span>
                <div>
                  <small>Current goal</small>
                  <strong>
                    {structuredGoal
                      ? ATHLETE_GOAL_LABELS[structuredGoal.primaryGoal] ??
                        'Goal set'
                      : 'No structured goal yet'}
                  </strong>
                  {structuredGoal && formatGoalTarget(structuredGoal) ? (
                    <span>{formatGoalTarget(structuredGoal)}</span>
                  ) : null}
                </div>
              </article>

              <article className="coach-profile-card">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <ClipboardList {...ICON} />
                </span>
                <div>
                  <small>Current program</small>
                  <strong>{programLabel}</strong>
                </div>
              </article>

              <article className="coach-profile-card coach-profile-card--wide">
                <span className="coach-profile-card-icon" aria-hidden="true">
                  <CalendarDays {...ICON} />
                </span>
                <div>
                  <small>Next assigned workout</small>
                  {nextAssignment ? (
                    <>
                      <strong>{nextAssignment.title}</strong>
                      <span>
                        {nextAssignment.status} · {formatDate(nextAssignment.due_date)}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Nothing scheduled</strong>
                      <span>Assign a workout when programming is ready.</span>
                    </>
                  )}
                </div>
              </article>
            </div>

            {structuredGoal ? (
              <section className="coach-client-goal-context">
                <div>
                  <small>Goal context</small>
                  <strong>
                    {ATHLETE_GOAL_LABELS[structuredGoal.primaryGoal] ?? 'Goal set'}
                  </strong>
                </div>
                {structuredGoal.priorityAreas?.length ? (
                  <span>{structuredGoal.priorityAreas.join(' · ')}</span>
                ) : null}
                {structuredGoal.note ? <p>{structuredGoal.note}</p> : null}
              </section>
            ) : null}

            {intelligence.training.recentSessions.length > 0 && (
              <div className="coach-client-profile-activity">
                {intelligence.training.recentSessions.map((session) => (
                  <article key={session.id} className="coach-profile-activity-row">
                    <strong>{session.name}</strong>
                    <span>
                      {session.relativeLabel}
                      {session.volume
                        ? ` · ${Math.round(session.volume).toLocaleString()} lb`
                        : ''}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </ProfileSection>
          </>
        )

      case 'business':
        return (
          <>
            {attentionPanel}
            <CoachClientInPersonPanel
              client={client}
              onOpenSession={openSession}
              onPassContextChange={setPassAvaContext}
              showHistory={false}
            />
          </>
        )

      case 'notes':
        return (
          <>
            <CollapsibleIdentityPanel
              eyebrow="COACH NOTES"
              title="Private notes"
              hint="Only visible to you — never shown to the athlete."
              mode={
                notesMode === IDENTITY_EDITOR_MODE.ERROR
                  ? IDENTITY_EDITOR_MODE.ERROR
                  : notesSaving
                    ? IDENTITY_EDITOR_MODE.SAVING
                    : notesMode
              }
              canEdit={Boolean(onSaveNotes)}
              isEmpty={!clientNotes.trim()}
              errorMessage={notesError}
              editLabel="Edit notes"
              addLabel="Add notes"
              saveLabel="Save notes"
              onEdit={() => {
                setNotesDraft(clientNotes)
                setNotesError('')
                setNotesMode(IDENTITY_EDITOR_MODE.EDITING)
              }}
              onCancel={() => {
                setNotesDraft(clientNotes)
                setNotesError('')
                setNotesMode(IDENTITY_EDITOR_MODE.VIEW)
              }}
              onSave={handleNotesSave}
              viewContent={
                <>
                  <p className="coach-profile-notes-preview">
                    {clientNotes.trim() || 'No private notes yet.'}
                  </p>
                  {notesUpdatedAt && (
                    <small className="client-intelligence-notes-updated">
                      Updated{' '}
                      {new Date(notesUpdatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </small>
                  )}
                </>
              }
              editingContent={
                <textarea
                  className="coach-field-input coach-profile-notes-input"
                  rows={6}
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Goals, limitations, check-in notes, programming context…"
                />
              }
            />
          </>
        )


      case 'documents':
        return <CoachClientDocumentsPanel client={client} />

      case 'manage':
        return (
          <>
            {coachLabelsEnabled ? (
              <CollapsibleIdentityPanel
                eyebrow="ROSTER NICKNAME"
                title="Coach label"
                hint="Only visible to you."
                mode={coachLabelMode}
                canEdit={Boolean(onSaveCoachLabel)}
                isEmpty={!savedCoachLabel}
                successMessage="Label saved"
                errorMessage={coachLabelError}
                editLabel="Edit"
                addLabel="Add label"
                saveLabel="Save label"
                clearLabel="Remove label"
                showClear={Boolean(savedCoachLabel)}
                onEdit={() => {
                  setCoachLabelDraft(savedCoachLabel)
                  setCoachLabelError('')
                  setCoachLabelMode(IDENTITY_EDITOR_MODE.EDITING)
                }}
                onCancel={() => {
                  setCoachLabelDraft(savedCoachLabel)
                  setCoachLabelError('')
                  setCoachLabelMode(IDENTITY_EDITOR_MODE.VIEW)
                }}
                onSave={handleCoachLabelSave}
                onClear={handleCoachLabelClear}
                viewContent={
                  <>
                    <div className="identity-summary-row">
                      <small>Athlete</small>
                      <strong>{athleteDisplayName}</strong>
                    </div>
                    <div className="identity-summary-row">
                      <small>Roster label</small>
                      <strong>{savedCoachLabel || 'None set'}</strong>
                    </div>
                  </>
                }
                editingContent={
                  <>
                    <div className="identity-summary-row identity-summary-row--compact">
                      <small>Athlete</small>
                      <strong>{athleteDisplayName}</strong>
                    </div>
                    <label className="coach-field coach-field--wide">
                      <span>Coach label</span>
                      <input
                        className="coach-field-input"
                        type="text"
                        name="coach_label"
                        value={coachLabelDraft}
                        disabled={coachLabelMode === IDENTITY_EDITOR_MODE.SAVING}
                        onChange={(event) =>
                          setCoachLabelDraft(
                            sanitizeCoachLabelDraft(event.target.value),
                          )
                        }
                        placeholder="e.g. Jake"
                        autoComplete="off"
                      />
                    </label>
                  </>
                }
              />
            ) : null}
            {clientManagementPanel}
          </>
        )

      case 'progress':
        if (!athleteIntelligenceEnabled) {
          return (
            <EmptyState
              icon={BarChart3}
              title="No athlete progress data yet"
              description="Connect an AVAREN account to view athlete-submitted training, readiness, recovery, performance, and nutrition data."
            />
          )
        }

        return (
          <ClientIntelligenceDashboard
            intelligence={intelligence}
            loading={intelligenceLoading}
            error={intelligenceError}
            onSectionAction={handleSectionAction}
            onAssignWorkout={onAssignWorkout}
            onSaveNotes={() => setActiveSection('notes')}
          />
        )

      default:
        return null
    }
  }

  return (
    <CoachSessionDetailHost
      clients={[client]}
      assignments={assignments}
      onOpenClientProfile={() => {}}
    >
      {(openSession) => (
    <CoachClientProfileShell
      clientName={getClientDisplayName(client)}
      clientEmail={client.email ?? client.athlete_email ?? ''}
      profileStatusLine={profileStatusLine}
      connectionDetail={connectionDetail}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onBack={onBack}
      coachingStatusPanel={coachingStatusPanel}
    >
      {renderSection(openSession)}
      {notice && <p className="coach-hub-notice">{notice}</p>}
      <CoachEndCoachingSheet
        open={showEndCoaching}
        clientName={getClientDisplayName(client)}
        linked={hasLinkedAthlete(client)}
        submitting={lifecycleBusy}
        onClose={() => setShowEndCoaching(false)}
        onConfirm={handleEndCoachingConfirm}
      />
      <AppUiBackdrop
        open={showInviteSheet}
        onClose={lifecycleBusy ? undefined : () => setShowInviteSheet(false)}
        className="coach-lifecycle-backdrop"
      >
        <section
          className="coach-lifecycle-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coach-invite-avaren-title"
          data-testid="coach-invite-avaren-sheet"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="coach-lifecycle-sheet-header">
            <div>
              <span className="eyebrow">APP ACCESS</span>
              <h2 id="coach-invite-avaren-title">Invite to AVAREN</h2>
              <p>
                Send a pending invitation for {getClientDisplayName(client)}. They
                stay on your roster even before they accept.
              </p>
            </div>
            <AppUiCloseButton
              onClick={() => setShowInviteSheet(false)}
              disabled={lifecycleBusy}
            />
          </header>
          <div className="coach-lifecycle-sheet-body">
            <label className="coach-field coach-field--wide">
              <span>Email *</span>
              <input
                className="coach-field-input"
                type="email"
                value={inviteEmailDraft}
                onChange={(event) => setInviteEmailDraft(event.target.value)}
                disabled={lifecycleBusy}
                aria-label="Invitation email"
              />
            </label>
            {inviteError ? (
              <p className="coach-create-client-error">{inviteError}</p>
            ) : null}
          </div>
          <footer className="coach-lifecycle-sheet-footer">
            <button
              type="button"
              className="coach-secondary-button"
              onClick={() => setShowInviteSheet(false)}
              disabled={lifecycleBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="gold-button machined coach-primary-action"
              onClick={submitInviteToAvaren}
              disabled={lifecycleBusy}
            >
              {lifecycleBusy ? 'Sending…' : 'Send invitation'}
            </button>
          </footer>
        </section>
      </AppUiBackdrop>
      {showAdHocFloorMode ? (
        <CoachFloorMode
          adHoc
          client={client}
          assignments={assignments}
          passSummary={null}
          onClose={() => setShowAdHocFloorMode(false)}
          onSessionRecorded={() => onClientUpdated?.(client, { refreshRoster: true })}
        />
      ) : null}
    </CoachClientProfileShell>
      )}
    </CoachSessionDetailHost>
  )
}

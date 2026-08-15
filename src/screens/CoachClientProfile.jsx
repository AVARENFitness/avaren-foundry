import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
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
  resolveClientIdentityBadge,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'
import {
  canLoadAthleteIntelligence,
  isWeeklyCheckInEligible,
} from '../lib/weeklyCheckInEligibility'
import { appUi } from '../lib/appUi'
import {
  emptySessionPackage,
  formatPackageDate,
  normalizeSessionPackage,
} from '../lib/sessionPackages'
import ClientIntelligenceDashboard from '../components/ClientIntelligenceDashboard'
import CoachClientInPersonPanel from '../components/coach/CoachClientInPersonPanel'
import CoachEndCoachingSheet, {
  CoachCoachingRequirementsPanel,
  CoachClientManagementPanel,
} from '../components/coach/CoachClientManagementPanel'
import CoachClientProfileShell from '../components/CoachClientProfileShell'
import CoachSessionDetailHost from '../components/coach/CoachSessionDetailHost'
import EmptyState from '../components/ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }

const formatDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : 'No due date'

const goalFromNotes = (value = '') => {
  const trimmed = value.trim()
  if (!trimmed) return 'No goal recorded yet'
  return trimmed.split('\n').find(Boolean) ?? 'No goal recorded yet'
}

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
}) {
  const [passAvaContext, setPassAvaContext] = useState(null)
  const [activeSection, setActiveSection] = useState('overview')
  const [packageSummary, setPackageSummary] = useState(emptySessionPackage())
  const [packageLoading, setPackageLoading] = useState(true)
  const [athleteState, setAthleteState] = useState(null)
  const [nutritionProfile, setNutritionProfile] = useState(null)
  const [nutritionDays, setNutritionDays] = useState([])
  const [intelligenceLoading, setIntelligenceLoading] = useState(true)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [currentWeekReview, setCurrentWeekReview] = useState(null)
  const [currentWeeklyCheckIn, setCurrentWeeklyCheckIn] = useState(null)
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
  const [lifecycleBusy, setLifecycleBusy] = useState(false)

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

  const recentActivity = useMemo(
    () =>
      [...clientAssignments]
        .filter((item) => item.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completed_at).getTime() -
            new Date(a.completed_at).getTime(),
        )
        .slice(0, 4),
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
    setPackageLoading(true)

    if (!linkedAthleteId) {
      setPackageSummary(emptySessionPackage())
      setPackageLoading(false)
      return undefined
    }

    coachBackend
      .getSessionPackage(linkedAthleteId)
      .then((row) => {
        if (active) setPackageSummary(normalizeSessionPackage(row))
      })
      .catch(() => {
        if (active) setPackageSummary(emptySessionPackage())
      })
      .finally(() => {
        if (active) setPackageLoading(false)
      })

    return () => {
      active = false
    }
  }, [linkedAthleteId])

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
    return `${lifecycle} · ${resolveClientIdentityBadge(client)}`
  }, [client])

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
      />
    </>
  ) : null

  const renderSection = (openSession) => {
    switch (activeSection) {
      case 'overview':
      case 'today':
        return (
          <>
            {clientFollowUps.length > 0 ? (
              attentionPanel
            ) : (
              <section className="coach-client-overview-attention coach-client-overview-attention--clear">
                <span className="eyebrow">ATTENTION</span>
                <strong>All caught up</strong>
              </section>
            )}
            <CoachClientInPersonPanel
              client={client}
              onOpenSession={openSession}
              onPassContextChange={setPassAvaContext}
              showHistory={false}
            />
            {intelligence?.training?.recentSessions?.[0] ? (
              <section className="coach-client-overview-recent">
                <span className="eyebrow">RECENT TRAINING</span>
                <div className="coach-client-overview-recent-row">
                  <div>
                    <strong>Last workout</strong>
                    <span>
                      {intelligence.training.recentSessions[0].name}
                      {intelligence.training.recentSessions[0].relativeLabel
                        ? ` · ${intelligence.training.recentSessions[0].relativeLabel}`
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => setActiveSection('training')}
                  >
                    View training
                  </button>
                </div>
              </section>
            ) : null}
            <div className="coach-client-overview-actions">
              <button
                type="button"
                className="coach-secondary-button"
                onClick={onScheduleAppointment}
              >
                Schedule appointment
              </button>
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => setActiveSection('sessions')}
              >
                View usage
              </button>
              <button
                type="button"
                className="gold-button machined coach-primary-action"
                onClick={onAssignWorkout}
              >
                Assign workout
              </button>
              <button
                type="button"
                className="coach-secondary-button"
                onClick={() => setActiveSection('notes')}
              >
                Add note
              </button>
            </div>
            {clientManagementPanel}
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
            <EmptyState
              icon={Activity}
              title="No athlete training data yet"
              description="Connect an AVAREN account to view athlete-submitted workouts and assignment delivery."
            />
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
                  <strong>{goalFromNotes(clientNotes)}</strong>
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
            ) : (
              <section className="identity-panel identity-panel--view">
                <header className="identity-panel-header">
                  <div>
                    <span className="eyebrow">ROSTER NICKNAME</span>
                    <h3>Coach label</h3>
                    <p>Private labels unlock after the identity migration is applied.</p>
                  </div>
                </header>
                <div className="identity-panel-summary">
                  <div className="identity-summary-row">
                    <small>Athlete</small>
                    <strong>{athleteDisplayName}</strong>
                  </div>
                </div>
              </section>
            )}

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
    </CoachClientProfileShell>
      )}
    </CoachSessionDetailHost>
  )
}

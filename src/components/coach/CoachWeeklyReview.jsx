import { ArrowLeft, CalendarRange, CheckCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { appUi } from '../../lib/appUi'
import { buildClientIntelligence, buildWeeklyReviewSnapshot } from '../../lib/clientIntelligence'
import { coachBackend } from '../../lib/coachBackend'
import {
  formatWeekRangeLabel,
  getCoachWeekRange,
  getWeeklyReviewStatus,
  normalizeWeeklyReview,
  sanitizeWeeklyReviewDraft,
  weeklyReviewDraftFromRecord,
  WEEKLY_REVIEW_DECISIONS,
  WEEKLY_REVIEW_STATUS,
} from '../../lib/weeklyReview'

const ICON = { size: 18, strokeWidth: 1.75 }

const displayName = (email = '') => {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const decisionLabel = (id) =>
  WEEKLY_REVIEW_DECISIONS.find((item) => item.id === id)?.label ?? id

export default function CoachWeeklyReview({
  client,
  assignments = [],
  initialReviewId = null,
  onBack,
  onSaved,
  notice = '',
}) {
  const weekRange = useMemo(() => getCoachWeekRange(), [])
  const clientAssignments = useMemo(
    () => assignments.filter((item) => item.athlete_id === client.athlete_id),
    [assignments, client.athlete_id],
  )

  const [athleteState, setAthleteState] = useState(null)
  const [nutritionProfile, setNutritionProfile] = useState(null)
  const [nutritionDays, setNutritionDays] = useState([])
  const [currentReview, setCurrentReview] = useState(null)
  const [reviewHistory, setReviewHistory] = useState([])
  const [draft, setDraft] = useState(weeklyReviewDraftFromRecord(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [viewingHistorical, setViewingHistorical] = useState(null)

  const intelligence = useMemo(
    () =>
      buildClientIntelligence({
        client,
        assignments: clientAssignments,
        athleteState,
        nutritionProfile,
        nutritionDays,
      }),
    [client, clientAssignments, athleteState, nutritionProfile, nutritionDays],
  )

  const snapshot = useMemo(
    () =>
      buildWeeklyReviewSnapshot({
        intelligence,
        assignments: clientAssignments,
        weekRange: viewingHistorical?.snapshot?.weekRange ?? weekRange,
        now: new Date(),
      }),
    [intelligence, clientAssignments, weekRange, viewingHistorical],
  )

  const reviewStatus = useMemo(
    () =>
      getWeeklyReviewStatus({
        currentReview: viewingHistorical ?? currentReview,
        weekRange,
      }),
    [currentReview, viewingHistorical, weekRange],
  )

  const loadReviews = async () => {
    const [review, history, state, nutrition] = await Promise.all([
      coachBackend.getClientWeeklyReview(client.athlete_id, weekRange.weekStart),
      coachBackend.listClientWeeklyReviews(client.athlete_id),
      coachBackend.getAthleteFoundryState(client.athlete_id),
      coachBackend.getAthleteNutritionSnapshot(client.athlete_id),
    ])

    const normalizedCurrent = normalizeWeeklyReview(review)
    const normalizedHistory = (history ?? []).map(normalizeWeeklyReview).filter(Boolean)

    setCurrentReview(normalizedCurrent)
    setReviewHistory(normalizedHistory)
    setAthleteState(state)
    setNutritionProfile(nutrition.profile)
    setNutritionDays(nutrition.days)

    if (initialReviewId) {
      const historical = normalizedHistory.find((item) => item.id === initialReviewId)
      if (historical) {
        setViewingHistorical(historical)
        setDraft(weeklyReviewDraftFromRecord(historical))
        return
      }
    }

    setViewingHistorical(
      normalizedCurrent?.weekStart === weekRange.weekStart
        ? null
        : null,
    )
    setDraft(weeklyReviewDraftFromRecord(normalizedCurrent))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    loadReviews()
      .catch((loadError) => {
        if (!active) return
        setError(loadError?.message ?? 'Could not load weekly review.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [client.athlete_id, initialReviewId])

  const isHistorical =
    Boolean(viewingHistorical) &&
    viewingHistorical?.weekStart !== weekRange.weekStart
  const isReadOnly = isHistorical

  const handleSave = async () => {
    const cleaned = sanitizeWeeklyReviewDraft(draft)
    if (!cleaned.decision) {
      appUi.toast('Choose a weekly decision before saving.', 'info')
      return
    }

    setSaving(true)
    setError('')

    try {
      const saved = await coachBackend.saveClientWeeklyReview({
        athleteId: client.athlete_id,
        weekStart: weekRange.weekStart,
        weekEnd: weekRange.weekEnd,
        decision: cleaned.decision,
        observation: cleaned.observation,
        priorities: cleaned.priorities,
        followUpRequired: cleaned.followUpRequired,
        followUpNote: cleaned.followUpNote,
        snapshot,
      })

      const normalized = normalizeWeeklyReview(saved)
      setCurrentReview(normalized)
      setDraft(weeklyReviewDraftFromRecord(normalized))
      await loadReviews()
      appUi.toast('Weekly review saved.', 'success')
      onSaved?.(normalized)
    } catch (saveError) {
      setError(saveError?.message ?? 'Could not save weekly review.')
    } finally {
      setSaving(false)
    }
  }

  const openHistorical = (review) => {
    setViewingHistorical(review)
    setDraft(weeklyReviewDraftFromRecord(review))
  }

  const returnToCurrentWeek = () => {
    setViewingHistorical(null)
    setDraft(weeklyReviewDraftFromRecord(currentReview))
  }

  const activeWeekLabel = formatWeekRangeLabel(
    viewingHistorical?.weekStart ?? weekRange.weekStart,
    viewingHistorical?.weekEnd ?? weekRange.weekEnd,
  )

  const statusLabel = isHistorical
    ? 'HISTORICAL REVIEW'
    : currentReview?.weekStart === weekRange.weekStart
    ? WEEKLY_REVIEW_STATUS.REVIEWED
    : WEEKLY_REVIEW_STATUS.READY

  return (
    <section className="coach-hub-screen coach-weekly-review-screen">
      <button type="button" className="coach-back-link" onClick={onBack}>
        <ArrowLeft {...ICON} />
        Back to client
      </button>

      <header className="coach-weekly-review-hero">
        <span className="eyebrow">WEEKLY REVIEW</span>
        <h1>{displayName(client.athlete_email)}</h1>
        <p>{activeWeekLabel}</p>
        <div className="coach-weekly-review-status-row">
          <span className={`coach-weekly-review-status ${isHistorical ? 'historical' : ''}`}>
            {statusLabel}
          </span>
          {reviewHistory.find((item) => item.weekStart !== weekRange.weekStart) && (
            <small>
              Last review{' '}
              {formatWeekRangeLabel(
                reviewHistory[0]?.weekStart,
                reviewHistory[0]?.weekEnd,
              )}
            </small>
          )}
        </div>
      </header>

      {loading ? (
        <section className="coach-command-panel coach-weekly-review-loading">
          <CalendarRange {...ICON} />
          <strong>Preparing weekly review…</strong>
          <span>Summarizing training, recovery, and progress context.</span>
        </section>
      ) : (
        <>
          {error && <p className="coach-hub-notice">{error}</p>}
          {notice && <p className="coach-hub-notice">{notice}</p>}

          {isHistorical && (
            <div className="coach-weekly-review-banner">
              <strong>Viewing a previous week</strong>
              <button type="button" className="coach-secondary-button" onClick={returnToCurrentWeek}>
                Return to this week
              </button>
            </div>
          )}

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">SNAPSHOT</span>
              <h2>This week at a glance</h2>
            </header>
            <div className="coach-weekly-review-grid">
              <article className="coach-profile-card">
                <div>
                  <small>Training</small>
                  <strong>
                    {snapshot.training.workoutsCompleted
                      ? `${snapshot.training.workoutsCompleted} workout${snapshot.training.workoutsCompleted === 1 ? '' : 's'}`
                      : 'No data this week'}
                  </strong>
                  <span>
                    {snapshot.training.priorWeekWorkouts !== null
                      ? `Previous week: ${snapshot.training.priorWeekWorkouts}`
                      : snapshot.training.consistency}
                    {snapshot.training.weekVolume
                      ? ` · ${snapshot.training.weekVolume.toLocaleString()} lb`
                      : ''}
                  </span>
                </div>
              </article>
              <article className="coach-profile-card">
                <div>
                  <small>Recovery</small>
                  <strong>
                    {snapshot.recovery.available
                      ? `${snapshot.recovery.score} · ${snapshot.recovery.status}`
                      : 'No data this week'}
                  </strong>
                  <span>{snapshot.recovery.mobility ?? snapshot.recovery.trend ?? 'Readiness not logged.'}</span>
                </div>
              </article>
              <article className="coach-profile-card">
                <div>
                  <small>Nutrition</small>
                  <strong>
                    {snapshot.nutrition.shared
                      ? snapshot.nutrition.daysLogged !== null
                        ? `${snapshot.nutrition.daysLogged} day${snapshot.nutrition.daysLogged === 1 ? '' : 's'} logged`
                        : snapshot.nutrition.status
                      : 'Not shared'}
                  </strong>
                  <span>
                    {snapshot.nutrition.calorieAdherence
                      ? `${snapshot.nutrition.calorieAdherence}% calorie adherence`
                      : snapshot.nutrition.status}
                  </span>
                </div>
              </article>
              <article className="coach-profile-card">
                <div>
                  <small>Progress</small>
                  <strong>
                    {snapshot.progress.prs.length
                      ? `${snapshot.progress.prs.length} recent marker${snapshot.progress.prs.length === 1 ? '' : 's'}`
                      : snapshot.progress.streak
                      ? `${snapshot.progress.streak}-day rhythm`
                      : 'No data this week'}
                  </strong>
                  <span>
                    {snapshot.training.activeAssignment
                      ? `Active assignment: ${snapshot.training.activeAssignment}`
                      : 'No active assignment'}
                  </span>
                </div>
              </article>
            </div>
          </section>

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">WINS</span>
              <h2>Wins this week</h2>
            </header>
            {snapshot.wins.length ? (
              <div className="coach-command-wins-list">
                {snapshot.wins.map((win) => (
                  <article key={win.id} className="coach-command-win-row">
                    <div>
                      <strong>{win.label}</strong>
                      <span>{win.detail}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="coach-command-empty-copy">
                <strong>No standout wins yet this week.</strong>
                <span>Positive signals will appear when the client logs meaningful progress.</span>
              </div>
            )}
          </section>

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">REVIEW</span>
              <h2>Coach review</h2>
            </header>
            {snapshot.reviewItems.length ? (
              <div className="coach-command-attention-list">
                {snapshot.reviewItems.map((item) => (
                  <article
                    key={item.id}
                    className={`coach-command-attention-item severity-${item.severity}`}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="coach-command-empty-copy">
                <strong>No review flags this week.</strong>
                <span>Use your observation to capture anything the data may not show.</span>
              </div>
            )}
          </section>

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">DECISION</span>
              <h2>Weekly decision</h2>
              <p>Select the direction for the week ahead.</p>
            </header>
            <div className="coach-weekly-review-decisions">
              {WEEKLY_REVIEW_DECISIONS.map((option) => (
                <label
                  key={option.id}
                  className={
                    draft.decision === option.id ? 'active' : ''
                  }
                >
                  <input
                    type="radio"
                    name="weekly-decision"
                    value={option.id}
                    checked={draft.decision === option.id}
                    disabled={isReadOnly}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        decision: option.id,
                      }))
                    }
                  />
                  <div>
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">NOTES</span>
              <h2>Coach observation</h2>
            </header>
            <textarea
              className="coach-field-input coach-profile-notes-input"
              rows={5}
              value={draft.observation}
              disabled={isReadOnly}
              placeholder="Private observations about training quality, communication, context, or adjustments worth remembering."
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  observation: event.target.value,
                }))
              }
            />

            <header>
              <span className="eyebrow">PRIORITIES</span>
              <h2>Next week priorities</h2>
            </header>
            <div className="coach-weekly-review-priorities">
              {draft.priorities.map((priority, index) => (
                <input
                  key={`priority-${index}`}
                  className="coach-field-input"
                  value={priority}
                  disabled={isReadOnly}
                  placeholder={
                    index === 0
                      ? 'Complete all scheduled sessions'
                      : index === 1
                      ? 'Keep effort controlled on key lifts'
                      : 'Optional third priority'
                  }
                  onChange={(event) =>
                    setDraft((current) => {
                      const priorities = [...current.priorities]
                      priorities[index] = event.target.value
                      return { ...current, priorities }
                    })
                  }
                />
              ))}
            </div>

            <label className="coach-weekly-review-followup">
              <input
                type="checkbox"
                checked={draft.followUpRequired}
                disabled={isReadOnly}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    followUpRequired: event.target.checked,
                  }))
                }
              />
              <span>Follow-up needed before programming changes</span>
            </label>

            {draft.followUpRequired && (
              <textarea
                className="coach-field-input coach-profile-notes-input"
                rows={3}
                value={draft.followUpNote}
                disabled={isReadOnly}
                placeholder="Short follow-up note for yourself."
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    followUpNote: event.target.value,
                  }))
                }
              />
            )}
          </section>

          {!isReadOnly && (
            <button
              type="button"
              className="gold-button machined coach-weekly-review-save"
              disabled={saving}
              onClick={handleSave}
            >
              <CheckCircle2 {...ICON} />
              {saving ? 'Saving…' : 'Save Weekly Review'}
            </button>
          )}

          <section className="coach-weekly-review-panel">
            <header>
              <span className="eyebrow">HISTORY</span>
              <h2>Review history</h2>
            </header>
            {reviewHistory.length ? (
              <div className="coach-weekly-review-history">
                {reviewHistory.map((review) => (
                  <button
                    key={review.id}
                    type="button"
                    className={
                      (viewingHistorical?.id ?? currentReview?.id) === review.id
                        ? 'active'
                        : ''
                    }
                    onClick={() => openHistorical(review)}
                  >
                    <div>
                      <strong>
                        {formatWeekRangeLabel(review.weekStart, review.weekEnd)}
                      </strong>
                      <span>
                        {decisionLabel(review.decision)}
                        {review.priorities?.length
                          ? ` · ${review.priorities[0]}`
                          : ''}
                        {review.followUpRequired ? ' · Follow-up' : ''}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="coach-command-empty-copy">
                <strong>No previous reviews yet.</strong>
                <span>Your first saved review will appear here.</span>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

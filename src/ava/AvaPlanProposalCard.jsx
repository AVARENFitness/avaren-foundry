import { AVA_ACTION_IDS } from './actions/avaActionTypes'

const formatWorkout = (name) =>
  name ? String(name).replace(/\s*\+\s*/g, ' · ') : null

const renderDiffRows = (diff = []) => {
  if (!diff.length) return null

  return diff.map((entry, index) => {
    if (entry.kind === 'shorten') {
      return (
        <div key={`${entry.kind}-${index}`} className="ava-plan-diff-row">
          <span className="ava-plan-diff-label">Shorten</span>
          <strong>{formatWorkout(entry.workout)}</strong>
          <span className="ava-plan-diff-change">
            {entry.from} → {entry.to}
          </span>
        </div>
      )
    }

    if (entry.kind === 'assign') {
      return (
        <div key={`${entry.kind}-${index}`} className="ava-plan-diff-row">
          <span className="ava-plan-diff-label">Move</span>
          <strong>{formatWorkout(entry.to)}</strong>
          <span className="ava-plan-diff-change">
            {entry.dayName}
            {entry.from ? ` · was ${formatWorkout(entry.from)}` : ''}
          </span>
        </div>
      )
    }

    if (entry.kind === 'recovery') {
      return (
        <div key={`${entry.kind}-${index}`} className="ava-plan-diff-row">
          <span className="ava-plan-diff-label">Clear</span>
          <strong>{entry.dayName}</strong>
          <span className="ava-plan-diff-change">
            {formatWorkout(entry.from)} → Recovery
          </span>
        </div>
      )
    }

    return null
  })
}

const renderPreviewDays = (proposal = {}) => {
  const days = proposal.proposedPlan?.week?.days ?? []
  const highlights = days.filter(
    (day) => day.proposedSession || (day.assignedSession && day.assignedSession !== 'Rest'),
  )

  if (!highlights.length && proposal.proposedPlan?.daily?.workout) {
    const daily = proposal.proposedPlan.daily
    return (
      <div className="ava-plan-preview-day">
        <span>Today</span>
        <strong>
          {formatWorkout(daily.workout)}
          {daily.sessionExecutionPlan?.maxMinutes
            ? ` · ${daily.sessionExecutionPlan.maxMinutes} min focus`
            : ''}
        </strong>
      </div>
    )
  }

  return highlights.slice(0, 4).map((day) => (
    <div key={day.date} className="ava-plan-preview-day">
      <span>{day.dayName}</span>
      <strong>
        {day.proposedSession
          ? formatWorkout(day.proposedSession)
          : day.status === 'recovery'
            ? 'Recovery'
            : formatWorkout(day.assignedSession)}
      </strong>
    </div>
  ))
}

export default function AvaPlanProposalCard({
  proposal,
  onApply,
  onKeepCurrent,
  busy = false,
  applied = false,
}) {
  if (!proposal) return null

  const why =
    proposal.evidence?.slice(0, 3).join(' ') ??
    proposal.rationale?.slice(0, 2).join(' ')

  return (
    <section className="ava-plan-card" aria-label="AVA plan proposal">
      <header className="ava-plan-card-header">
        <span className="eyebrow">AVA PLAN</span>
        {proposal.summary ? <p>{proposal.summary}</p> : null}
      </header>

      <div className="ava-plan-preview">{renderPreviewDays(proposal)}</div>

      {proposal.diff?.length ? (
        <div className="ava-plan-diff">{renderDiffRows(proposal.diff)}</div>
      ) : null}

      {why ? (
        <div className="ava-plan-why">
          <span className="ava-plan-why-label">Why</span>
          <p>{why}</p>
        </div>
      ) : null}

      {!applied ? (
        <div className="ava-plan-actions">
          <button
            type="button"
            className="gold-button ava-plan-apply"
            disabled={busy}
            onClick={() => onApply?.(AVA_ACTION_IDS.APPLY_PLAN_PROPOSAL)}
          >
            Apply plan
          </button>
          <button
            type="button"
            className="ava-plan-keep"
            disabled={busy}
            onClick={() => onKeepCurrent?.(AVA_ACTION_IDS.CANCEL_PLAN_PROPOSAL)}
          >
            Keep current plan
          </button>
        </div>
      ) : null}
    </section>
  )
}

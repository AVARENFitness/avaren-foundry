import { FOLLOWUP_REASON_LABEL } from '../lib/coachFollowUp'

export default function AvaFollowUpProposalCard({
  proposal = null,
  onSend,
  onCancel,
  busy = false,
}) {
  if (!proposal?.summary) return null

  const reasonLabel =
    FOLLOWUP_REASON_LABEL[proposal.reasonType] ?? 'Follow-up'

  return (
    <div className="ava-followup-card">
      <span className="eyebrow">FLAG FOR COACH</span>
      <h3>{proposal.summary}</h3>
      <p className="ava-followup-meta">{reasonLabel}</p>
      <p className="ava-followup-note">
        Your coach will see this as a follow-up item — not a chat transcript.
      </p>
      <div className="ava-followup-actions">
        <button
          type="button"
          className="gold-button machined"
          disabled={busy}
          onClick={() => onSend?.(proposal)}
        >
          Send to coach
        </button>
        <button
          type="button"
          className="avaren-secondary-button"
          disabled={busy}
          onClick={() => onCancel?.()}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

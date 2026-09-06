import { UserCheck, UserX } from 'lucide-react'
import { invitationHomeMessage } from '../lib/athleteCoachInvitations'

export default function AthleteCoachInvitationCard({
  invitation,
  pending = false,
  onAccept,
  onDecline,
  compact = false,
}) {
  if (!invitation?.id) return null

  return (
    <article
      className={
        compact
          ? 'athlete-coach-invitation athlete-coach-invitation--compact'
          : 'athlete-coach-invitation athlete-coach-invitation--home'
      }
      data-testid="athlete-coach-invitation-card"
      data-invitation-id={invitation.id}
    >
      <div>
        {!compact ? <span className="eyebrow">COACH INVITATION</span> : null}
        <strong>{compact ? 'Coach invitation' : invitationHomeMessage(invitation)}</strong>
        {compact ? <span>{invitationHomeMessage(invitation)}</span> : null}
      </div>
      <div className="athlete-coach-invitation-actions">
        <button
          type="button"
          className="gold-button machined"
          disabled={pending}
          onClick={() => onAccept?.(invitation)}
        >
          <UserCheck size={16} strokeWidth={1.75} aria-hidden="true" />
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDecline?.(invitation)}
        >
          <UserX size={16} strokeWidth={1.75} aria-hidden="true" />
          Decline
        </button>
      </div>
    </article>
  )
}

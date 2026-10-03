import { MessageCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import CoachMessageLauncher from './CoachMessageLauncher'

export default function AthleteCoachMessagingCard() {
  const [relationships, setRelationships] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    coachBackend
      .listAthleteCoachRelationships()
      .then((rows) => {
        if (active) setRelationships(rows ?? [])
      })
      .catch(() => {
        if (active) setRelationships([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const relationship = useMemo(
    () => relationships?.[0] ?? null,
    [relationships],
  )

  if (loading || !relationship?.coach_id) return null

  return (
    <section className="athlete-coach-message-card">
      <span className="athlete-coach-message-icon">
        <MessageCircle size={19} />
      </span>
      <div>
        <span className="eyebrow">COACH MESSAGING</span>
        <strong>Message your coach</strong>
        <p>
          Keep quick coaching questions and updates inside AVAREN.
        </p>
        <CoachMessageLauncher
          otherUserId={relationship.coach_id}
          otherName="AVAREN Coach"
          label="Open messages"
          className="gold-button machined"
        />
      </div>
    </section>
  )
}

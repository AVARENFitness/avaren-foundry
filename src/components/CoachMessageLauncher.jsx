import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import CoachAthleteMessageSheet from './CoachAthleteMessageSheet'

export default function CoachMessageLauncher({
  otherUserId,
  otherName,
  label = 'Message',
  className = 'coach-secondary-button',
}) {
  const [open, setOpen] = useState(false)

  if (!otherUserId) return null

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        <MessageCircle size={17} />
        {label}
      </button>
      <CoachAthleteMessageSheet
        open={open}
        onClose={() => setOpen(false)}
        otherUserId={otherUserId}
        otherName={otherName}
      />
    </>
  )
}

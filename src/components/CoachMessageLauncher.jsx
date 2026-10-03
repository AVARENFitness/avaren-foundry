import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import CoachAthleteMessageSheet from './CoachAthleteMessageSheet'
import { coachMessagingBackend } from '../lib/coachMessaging'
import { supabase } from '../lib/supabase'

export default function CoachMessageLauncher({
  otherUserId,
  otherName,
  label = 'Message',
  className = 'coach-secondary-button',
}) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    if (!otherUserId) {
      setUnreadCount(0)
      return undefined
    }

    Promise.all([
      supabase.auth.getUser(),
      coachMessagingBackend.getOrCreateConversation(otherUserId),
    ])
      .then(async ([userResult, conversation]) => {
        if (!active) return

        const viewerId = userResult?.data?.user?.id ?? null
        const refresh = async () => {
          const next = await coachMessagingBackend.getUnreadCount(
            conversation.id,
          )
          if (active) setUnreadCount(next)
        }

        await refresh()
        unsubscribe = coachMessagingBackend.subscribe(
          conversation.id,
          (message) => {
            if (message.senderId !== viewerId && !open) {
              void refresh()
            }
          },
        )
      })
      .catch(() => {
        if (active) setUnreadCount(0)
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [otherUserId, open])

  if (!otherUserId) return null

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setUnreadCount(0)
          setOpen(true)
        }}
      >
        <MessageCircle size={17} />
        {label}
        {unreadCount > 0 ? (
          <span className="coach-message-launcher-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
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

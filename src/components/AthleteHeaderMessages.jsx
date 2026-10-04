import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import CoachAthleteMessageSheet from './CoachAthleteMessageSheet'
import { coachBackend } from '../lib/coachBackend'
import { coachMessagingBackend } from '../lib/coachMessaging'
import {
  MESSAGE_DEEP_LINK_EVENT,
} from '../lib/appointmentDeepLink'

export default function AthleteHeaderMessages() {
  const [coachId, setCoachId] = useState(null)
  const [threadUserId, setThreadUserId] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    const connect = async (otherUserId, { show = false } = {}) => {
      if (!otherUserId) return

      const conversation =
        await coachMessagingBackend.getOrCreateConversation(otherUserId)

      if (!active) return

      setThreadUserId(otherUserId)
      setConversationId(conversation.id)

      const refreshUnread = async () => {
        const next =
          await coachMessagingBackend.getUnreadCount(conversation.id)
        if (active) setUnreadCount(next)
      }

      await refreshUnread()

      unsubscribe()
      unsubscribe = coachMessagingBackend.subscribe(
        conversation.id,
        (message) => {
          if (!active) return
          if (message.senderId === otherUserId && !open) {
            void refreshUnread()
          }
        },
      )

      if (show && active) {
        setUnreadCount(0)
        setOpen(true)
      }
    }

    coachBackend
      .listAthleteCoachRelationships()
      .then(async (rows) => {
        const relationship = rows?.[0] ?? null
        const nextCoachId = relationship?.coach_id ?? null
        if (!active || !nextCoachId) return

        setCoachId(nextCoachId)
        await connect(nextCoachId)
      })
      .catch(() => {})

    const onDeepLink = (event) => {
      const otherUserId = event.detail?.otherUserId
      if (!otherUserId) return
      void connect(otherUserId, { show: true })
    }

    window.addEventListener(MESSAGE_DEEP_LINK_EVENT, onDeepLink)

    return () => {
      active = false
      unsubscribe()
      window.removeEventListener(MESSAGE_DEEP_LINK_EVENT, onDeepLink)
    }
  }, [open])

  const targetUserId = threadUserId ?? coachId

  return (
    <>
      {coachId ? (
        <button
          type="button"
          className="app-message-button"
          onClick={() => {
            setThreadUserId(coachId)
            setUnreadCount(0)
            setOpen(true)
          }}
          aria-label={`Messages${unreadCount ? `, ${unreadCount} unread` : ''}`}
        >
          <MessageCircle size={19} />
          {unreadCount > 0 ? (
            <span>{unreadCount > 99 ? '99+' : unreadCount}</span>
          ) : null}
        </button>
      ) : null}

      <CoachAthleteMessageSheet
        open={open && Boolean(targetUserId)}
        onClose={() => {
          setOpen(false)
          if (conversationId) {
            void coachMessagingBackend
              .getUnreadCount(conversationId)
              .then(setUnreadCount)
              .catch(() => {})
          }
        }}
        otherUserId={targetUserId}
        otherName={targetUserId === coachId ? 'AVAREN Coach' : 'Messages'}
      />
    </>
  )
}

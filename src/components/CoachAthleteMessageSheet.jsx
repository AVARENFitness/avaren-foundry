import { ArrowUp, LoaderCircle, MessageCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { coachMessagingBackend } from '../lib/coachMessaging'
import { supabase } from '../lib/supabase'

const mergeMessage = (items, next) => {
  if (!next?.id) return items
  const exists = items.some((item) => item.id === next.id)
  return exists
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt)),
      )
}

const timeLabel = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : ''

export default function CoachAthleteMessageSheet({
  open,
  onClose,
  otherUserId,
  otherName = 'Coach',
}) {
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [viewerId, setViewerId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    let active = true

    if (!open || !otherUserId) {
      setConversation(null)
      setMessages([])
      setError('')
      return undefined
    }

    setLoading(true)
    setError('')

    Promise.all([
      supabase.auth.getUser(),
      coachMessagingBackend.getOrCreateConversation(otherUserId),
    ])
      .then(async ([userResult, nextConversation]) => {
        if (!active) return
        const userId = userResult?.data?.user?.id ?? null
        setViewerId(userId)
        setConversation(nextConversation)

        const nextMessages = await coachMessagingBackend.listMessages(
          nextConversation.id,
        )
        if (!active) return
        setMessages(nextMessages)

        await coachMessagingBackend
          .markConversationRead(nextConversation.id)
          .catch(() => {})
      })
      .catch((loadError) => {
        if (!active) return
        setError(
          /active_coaching_relationship_required/i.test(
            String(loadError?.message ?? ''),
          )
            ? 'Messaging is available while this coaching relationship is active.'
            : loadError?.message ?? 'Could not load messages.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, otherUserId])

  useEffect(() => {
    if (!open || !conversation?.id) return undefined

    return coachMessagingBackend.subscribe(
      conversation.id,
      async (message) => {
        setMessages((current) => mergeMessage(current, message))
        if (message.senderId !== viewerId) {
          await coachMessagingBackend
            .markConversationRead(conversation.id)
            .catch(() => {})
        }
      },
    )
  }, [open, conversation?.id, viewerId])

  useEffect(() => {
    if (!open) return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [open, messages.length])

  const canSend = useMemo(
    () =>
      Boolean(conversation?.id) &&
      Boolean(draft.trim()) &&
      !sending,
    [conversation?.id, draft, sending],
  )

  const send = async () => {
    if (!canSend) return

    const body = draft.trim()
    setSending(true)
    setError('')
    setDraft('')

    try {
      const message = await coachMessagingBackend.sendMessage(
        conversation.id,
        body,
      )
      setMessages((current) => mergeMessage(current, message))
    } catch (sendError) {
      setDraft(body)
      setError(
        /active_coaching_relationship_required/i.test(
          String(sendError?.message ?? ''),
        )
          ? 'This coaching relationship is no longer active.'
          : sendError?.message ?? 'Could not send that message.',
      )
    } finally {
      setSending(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="coach-message-backdrop"
      data-app-ui-backdrop="open"
      onClick={onClose}
    >
      <section
        className="coach-message-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Messages with ${otherName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-message-header">
          <div>
            <span className="eyebrow">MESSAGES</span>
            <h2>{otherName}</h2>
            <p>Private coaching conversation</p>
          </div>
          <button
            type="button"
            className="coach-message-close"
            onClick={onClose}
            aria-label="Close messages"
          >
            <X size={19} />
          </button>
        </header>

        <div className="coach-message-thread">
          {loading ? (
            <div className="coach-message-empty">
              <LoaderCircle className="spin" size={22} />
              <span>Loading conversation…</span>
            </div>
          ) : messages.length ? (
            messages.map((message) => {
              const mine = message.senderId === viewerId
              return (
                <article
                  key={message.id}
                  className={`coach-message-bubble ${
                    mine ? 'mine' : 'theirs'
                  }`}
                >
                  <p>{message.body}</p>
                  <small>
                    {timeLabel(message.createdAt)}
                    {mine && message.readAt ? ' · Read' : ''}
                  </small>
                </article>
              )
            })
          ) : (
            <div className="coach-message-empty">
              <MessageCircle size={23} />
              <strong>Start the conversation</strong>
              <span>
                Messages stay attached to the coaching relationship.
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error ? (
          <p className="coach-message-error">{error}</p>
        ) : null}

        <footer className="coach-message-compose">
          <textarea
            rows={1}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message…"
            aria-label="Message"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void send()}
            aria-label="Send message"
          >
            {sending ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowUp size={19} />
            )}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

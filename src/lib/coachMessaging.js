import { supabase } from './supabase'

const normalizeConversation = (row = null) =>
  row
    ? {
        id: row.id,
        coachId: row.coach_id,
        athleteId: row.athlete_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
      }
    : null

export const normalizeCoachMessage = (row = null) =>
  row
    ? {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body ?? '',
        createdAt: row.created_at,
        readAt: row.read_at,
      }
    : null

export const coachMessagingBackend = {
  async getOrCreateConversation(otherUserId) {
    const { data, error } = await supabase.rpc(
      'get_or_create_coach_conversation',
      { p_other_user_id: otherUserId },
    )
    if (error) throw error
    return normalizeConversation(Array.isArray(data) ? data[0] : data)
  },

  async listMessages(conversationId, limit = 100) {
    if (!conversationId) return []

    const { data, error } = await supabase
      .from('coach_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) throw error
    return (data ?? []).map(normalizeCoachMessage)
  },

  async getUnreadCount(conversationId) {
    if (!conversationId) return 0

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) return 0

    const { count, error } = await supabase
      .from('coach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .is('read_at', null)

    if (error) throw error
    return count ?? 0
  },

  async sendMessage(conversationId, body) {
    const text = String(body ?? '').trim()
    if (!conversationId || !text) {
      throw new Error('Write a message first.')
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user) throw new Error('You must be signed in.')

    const { data, error } = await supabase
      .from('coach_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: text.slice(0, 4000),
      })
      .select('*')
      .single()

    if (error) throw error

    const message = normalizeCoachMessage(data)

    supabase.functions
      .invoke('send-message-push', {
        body: { messageId: message.id },
      })
      .catch(() => {})

    return message
  },

  async markConversationRead(conversationId) {
    if (!conversationId) return 0

    const { data, error } = await supabase.rpc(
      'mark_coach_conversation_read',
      { p_conversation_id: conversationId },
    )

    if (error) throw error
    return Number(data ?? 0)
  },

  subscribe(conversationId, onMessage) {
    if (!conversationId || typeof onMessage !== 'function') {
      return () => {}
    }

    const channel = supabase
      .channel(`coach-messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => onMessage(normalizeCoachMessage(payload.new)),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}

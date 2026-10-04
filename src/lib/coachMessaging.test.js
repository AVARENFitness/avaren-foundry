import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()
const mockGetUser = vi.fn()
const mockInvoke = vi.fn()
const mockFrom = vi.fn()
const mockChannel = vi.fn()
const mockRemoveChannel = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
    },
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
    channel: (...args) => mockChannel(...args),
    removeChannel: (...args) => mockRemoveChannel(...args),
  },
}))

import {
  coachMessagingBackend,
  normalizeCoachMessage,
} from './coachMessaging'

describe('coachMessagingBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })
    mockInvoke.mockResolvedValue({ data: { delivered: 1 }, error: null })
  })

  it('normalizes realtime/database message rows', () => {
    expect(
      normalizeCoachMessage({
        id: 'message-1',
        conversation_id: 'conversation-1',
        sender_id: 'coach-1',
        body: 'How did training feel?',
        created_at: '2026-10-03T16:00:00.000Z',
        read_at: null,
      }),
    ).toEqual({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'coach-1',
      body: 'How did training feel?',
      createdAt: '2026-10-03T16:00:00.000Z',
      readAt: null,
    })
  })

  it('normalizes a Postgres composite RPC row when returned as an array', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'conversation-1',
          coach_id: 'coach-1',
          athlete_id: 'athlete-1',
          created_at: '2026-10-03T16:00:00.000Z',
          updated_at: '2026-10-03T16:00:00.000Z',
          last_message_at: null,
        },
      ],
      error: null,
    })

    const result =
      await coachMessagingBackend.getOrCreateConversation('athlete-1')

    expect(mockRpc).toHaveBeenCalledWith(
      'get_or_create_coach_conversation',
      { p_other_user_id: 'athlete-1' },
    )
    expect(result).toMatchObject({
      id: 'conversation-1',
      coachId: 'coach-1',
      athleteId: 'athlete-1',
    })
  })

  it('uses the narrow read-receipt RPC instead of generic row updates', async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null })

    const result =
      await coachMessagingBackend.markConversationRead('conversation-1')

    expect(mockRpc).toHaveBeenCalledWith(
      'mark_coach_conversation_read',
      { p_conversation_id: 'conversation-1' },
    )
    expect(result).toBe(3)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('sends a trimmed durable message then requests a privacy-safe push', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'message-1',
        conversation_id: 'conversation-1',
        sender_id: 'user-1',
        body: 'Checking in',
        created_at: '2026-10-03T16:00:00.000Z',
        read_at: null,
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    mockFrom.mockReturnValue({ insert })

    const result = await coachMessagingBackend.sendMessage(
      'conversation-1',
      '  Checking in  ',
    )

    expect(insert).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      sender_id: 'user-1',
      body: 'Checking in',
    })
    expect(result.body).toBe('Checking in')
    expect(mockInvoke).toHaveBeenCalledWith('send-message-push', {
      body: { messageId: 'message-1' },
    })
  })

  it('keeps the durable message successful when phone push delivery is unavailable', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'message-2',
        conversation_id: 'conversation-1',
        sender_id: 'user-1',
        body: 'Still saved',
        created_at: '2026-10-04T19:30:00.000Z',
        read_at: null,
      },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn(() => ({ select }))
    mockFrom.mockReturnValue({ insert })
    mockInvoke.mockRejectedValueOnce(new Error('push unavailable'))

    const result = await coachMessagingBackend.sendMessage(
      'conversation-1',
      'Still saved',
    )

    expect(result.body).toBe('Still saved')
    expect(mockInvoke).toHaveBeenCalledWith('send-message-push', {
      body: { messageId: 'message-2' },
    })
  })

  it('counts only unread messages sent by the other participant', async () => {
    const isNull = vi.fn().mockResolvedValue({
      count: 2,
      error: null,
    })
    const neq = vi.fn(() => ({ is: isNull }))
    const eq = vi.fn(() => ({ neq }))
    const select = vi.fn(() => ({ eq }))
    mockFrom.mockReturnValue({ select })

    const result =
      await coachMessagingBackend.getUnreadCount('conversation-1')

    expect(select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    })
    expect(eq).toHaveBeenCalledWith(
      'conversation_id',
      'conversation-1',
    )
    expect(neq).toHaveBeenCalledWith('sender_id', 'user-1')
    expect(isNull).toHaveBeenCalledWith('read_at', null)
    expect(result).toBe(2)
  })
})

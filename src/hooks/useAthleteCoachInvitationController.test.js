import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAthleteCoachInvitationController } from './useAthleteCoachInvitationController'

const listAthleteInvitations = vi.fn()
const acceptInvitation = vi.fn()
const declineInvitation = vi.fn()
const getUserProfile = vi.fn()

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteInvitations: (...args) => listAthleteInvitations(...args),
    acceptInvitation: (...args) => acceptInvitation(...args),
    declineInvitation: (...args) => declineInvitation(...args),
  },
}))

vi.mock('../lib/userProfileBackend', () => ({
  userProfileBackend: {
    getUserProfile: (...args) => getUserProfile(...args),
  },
}))

describe('useAthleteCoachInvitationController', () => {
  beforeEach(() => {
    listAthleteInvitations.mockReset()
    acceptInvitation.mockReset()
    declineInvitation.mockReset()
    getUserProfile.mockReset()
    getUserProfile.mockResolvedValue(null)
  })

  it('loads pending invitations and removes them after accept', async () => {
    listAthleteInvitations
      .mockResolvedValueOnce([
        {
          id: 'inv-1',
          coach_id: 'coach-1',
          athlete_email: 'a@example.com',
          status: 'pending',
          coach_display_name: 'Jordan',
        },
      ])
      .mockResolvedValueOnce([])
    acceptInvitation.mockResolvedValue({ ok: true })

    const { result } = renderHook(() =>
      useAthleteCoachInvitationController('user-1'),
    )

    await waitFor(() => expect(result.current.invitations).toHaveLength(1))
    expect(result.current.invitations[0].id).toBe('inv-1')

    await act(async () => {
      await result.current.acceptInvitation('inv-1')
    })

    expect(acceptInvitation).toHaveBeenCalledWith('inv-1')
    await waitFor(() => expect(result.current.invitations).toHaveLength(0))
  })

  it('removes declined invitations and does not keep them after refresh', async () => {
    listAthleteInvitations
      .mockResolvedValueOnce([
        {
          id: 'inv-2',
          coach_id: 'coach-2',
          athlete_email: 'a@example.com',
          status: 'pending',
        },
      ])
      .mockResolvedValueOnce([])
    declineInvitation.mockResolvedValue({ ok: true })

    const { result } = renderHook(() =>
      useAthleteCoachInvitationController('user-1'),
    )

    await waitFor(() => expect(result.current.invitations).toHaveLength(1))

    await act(async () => {
      await result.current.declineInvitation('inv-2')
    })

    expect(declineInvitation).toHaveBeenCalledWith('inv-2')
    await waitFor(() => expect(result.current.invitations).toHaveLength(0))

    await act(async () => {
      await result.current.refreshInvitations()
    })

    expect(result.current.invitations).toHaveLength(0)
  })

  it('accepted invite does not reappear after refresh', async () => {
    listAthleteInvitations
      .mockResolvedValueOnce([
        {
          id: 'inv-3',
          coach_id: 'coach-3',
          athlete_email: 'a@example.com',
          status: 'pending',
        },
      ])
      .mockResolvedValue([])
    acceptInvitation.mockResolvedValue({ ok: true })

    const { result } = renderHook(() =>
      useAthleteCoachInvitationController('user-1'),
    )

    await waitFor(() => expect(result.current.invitations).toHaveLength(1))

    await act(async () => {
      await result.current.acceptInvitation('inv-3')
    })

    await act(async () => {
      await result.current.refreshInvitations()
    })

    expect(result.current.invitations).toEqual([])
  })
})

import React, { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import HomeScreen from '../screens/HomeScreen'
import NotificationScreen from '../screens/NotificationScreen'
import { AthleteCoachInvitationsProvider } from './useAthleteCoachInvitations'
import {
  ATHLETE_INVITATION_ACTIONS,
  buildInvitationNotification,
  buildInvitationNotifications,
  dedupeAthleteInvitations,
} from '../lib/athleteCoachInvitations'
import { createNutritionState } from '../lib/nutrition'
import { FROZEN_COACH_WEEK, installFrozenCoachWeek } from '../test/frozenTime'

installFrozenCoachWeek(FROZEN_COACH_WEEK)

const acceptInvitation = vi.fn()
const declineInvitation = vi.fn()

vi.mock('../ava/useAvaUi', () => ({
  useAvaUi: () => ({ openAva: vi.fn() }),
}))

vi.mock('./useAthleteAppointments', () => ({
  useAthleteAppointments: () => ({
    status: 'ready',
    loading: false,
    ready: true,
    error: null,
    appointments: [],
    upcomingAppointments: [],
    nextAppointment: null,
    refreshAppointments: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listAthleteAssignments: vi.fn().mockResolvedValue([]),
    listAthleteScheduledSessions: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../components/AthleteAssignmentHome', () => ({
  default: () => null,
}))

vi.mock('../components/AvaDailyBriefing', () => ({
  default: () => null,
}))

vi.mock('../components/PushNotificationSettings', () => ({
  default: () => null,
}))

vi.mock('../lib/avaIntelligence', () => ({
  buildAvaDailyBriefing: () => null,
}))

const invitation = {
  id: 'inv-home-1',
  coachId: 'coach-1',
  coachDisplayName: 'Morgan',
  status: 'pending',
  createdAt: '2026-09-06T12:00:00.000Z',
}

const baseState = {
  program: { nextWorkout: { name: 'Chest + Back' } },
  activeWorkout: null,
  history: [],
  weeklySchedule: {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  mobility: { completed: [], durationPreferences: {} },
  readiness: { entries: [], lastPromptedDate: null },
  nutrition: createNutritionState(),
  notifications: { read: [], dismissed: [], actedOn: [] },
}

function SharedInvitationSurfaces({
  initialInvitations = [invitation],
}) {
  const [pending, setPending] = useState(initialInvitations)

  const value = {
    invitations: pending,
    status: 'ready',
    loading: false,
    ready: true,
    error: null,
    pendingId: null,
    refreshInvitations: vi.fn(),
    acceptInvitation: async (id) => {
      await acceptInvitation(id)
      setPending((current) => current.filter((item) => item.id !== id))
    },
    declineInvitation: async (id) => {
      await declineInvitation(id)
      setPending((current) => current.filter((item) => item.id !== id))
    },
  }

  const notificationItems = buildInvitationNotifications(pending)

  return (
    <AthleteCoachInvitationsProvider value={value}>
      <HomeScreen
        state={baseState}
        onStart={vi.fn()}
        setScreen={vi.fn()}
        recoveryIntelligence={{ score: 70 }}
        userName="Athlete"
        readiness={{ completed: true, score: 80, status: 'Ready' }}
        onOpenReadiness={vi.fn()}
        onOpenMobility={vi.fn()}
        onOpenReset={vi.fn()}
        nutritionSummary={{
          calories: 0,
          goal: 2200,
          protein: 0,
          proteinGoal: 170,
          waterOz: 0,
        }}
      />
      <NotificationScreen
        snapshot={{
          notifications: notificationItems,
          unreadCount: notificationItems.length,
        }}
        onClose={vi.fn()}
        onRead={vi.fn()}
        onDismiss={vi.fn()}
        onAction={async (notification) => {
          if (notification.action === ATHLETE_INVITATION_ACTIONS.DECLINE) {
            await value.declineInvitation(notification.invitationId)
            return
          }
          await value.acceptInvitation(notification.invitationId)
        }}
      />
    </AthleteCoachInvitationsProvider>
  )
}

describe('athlete coach invitation Home + Notifications surfaces', () => {
  beforeEach(() => {
    acceptInvitation.mockReset()
    declineInvitation.mockReset()
    acceptInvitation.mockResolvedValue({
      invitationId: invitation.id,
      decision: 'accept',
    })
    declineInvitation.mockResolvedValue({
      invitationId: invitation.id,
      decision: 'decline',
    })
  })

  it('pending invite appears on Home', () => {
    render(<SharedInvitationSurfaces />)

    const homeCard = screen.getByTestId('athlete-coach-invitation-card')
    expect(homeCard).toHaveAttribute('data-invitation-id', 'inv-home-1')
    expect(homeCard).toHaveTextContent('Morgan invited you to train with AVAREN')
  })

  it('pending invite appears in Notifications with the same id', () => {
    render(<SharedInvitationSurfaces />)

    expect(
      screen.getByTestId('athlete-coach-invitation-notification'),
    ).toHaveAttribute('data-invitation-id', 'inv-home-1')
    expect(screen.getAllByRole('button', { name: /Accept/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Decline/i }).length).toBeGreaterThan(0)
  })

  it('Accept from Home removes from both surfaces', async () => {
    render(<SharedInvitationSurfaces />)

    fireEvent.click(screen.getAllByRole('button', { name: /Accept/i })[0])

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith('inv-home-1')
      expect(
        screen.queryByText(/Morgan invited you to train with AVAREN/i),
      ).not.toBeInTheDocument()
    })
  })

  it('Accept from Notifications removes from both surfaces', async () => {
    render(<SharedInvitationSurfaces />)

    fireEvent.click(screen.getAllByRole('button', { name: /Accept/i })[1])

    await waitFor(() => {
      expect(acceptInvitation).toHaveBeenCalledWith('inv-home-1')
      expect(
        screen.queryByText(/Morgan invited you to train with AVAREN/i),
      ).not.toBeInTheDocument()
    })
  })

  it('Decline from Home removes from both surfaces', async () => {
    render(<SharedInvitationSurfaces />)

    fireEvent.click(screen.getAllByRole('button', { name: /Decline/i })[0])

    await waitFor(() => {
      expect(declineInvitation).toHaveBeenCalledWith('inv-home-1')
      expect(
        screen.queryByText(/Morgan invited you to train with AVAREN/i),
      ).not.toBeInTheDocument()
    })
  })

  it('Decline from Notifications removes from both surfaces', async () => {
    render(<SharedInvitationSurfaces />)

    fireEvent.click(screen.getAllByRole('button', { name: /Decline/i })[1])

    await waitFor(() => {
      expect(declineInvitation).toHaveBeenCalledWith('inv-home-1')
      expect(
        screen.queryByText(/Morgan invited you to train with AVAREN/i),
      ).not.toBeInTheDocument()
    })
  })

  it('one invitation is not duplicated', () => {
    const invitations = dedupeAthleteInvitations([invitation, { ...invitation }])
    const notifications = buildInvitationNotifications([
      invitation,
      { ...invitation },
    ])

    expect(invitations).toHaveLength(1)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].fingerprint).toBe(
      buildInvitationNotification(invitation).fingerprint,
    )

    render(<SharedInvitationSurfaces initialInvitations={invitations} />)
    expect(screen.getAllByTestId('athlete-coach-invitation-card')).toHaveLength(1)
    expect(
      screen.getAllByTestId('athlete-coach-invitation-notification'),
    ).toHaveLength(1)
  })
})

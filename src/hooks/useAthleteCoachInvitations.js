import { useAthleteCoachInvitationsContext } from '../context/athleteCoachInvitationsContext'
import { AthleteCoachInvitationsProvider } from '../context/AthleteCoachInvitationsProvider'

export { AthleteCoachInvitationsProvider }

const EMPTY_INVITATIONS = {
  invitations: [],
  status: 'idle',
  loading: false,
  ready: false,
  error: null,
  pendingId: null,
  refreshInvitations: async () => [],
  acceptInvitation: async () => null,
  declineInvitation: async () => null,
}

export function useAthleteCoachInvitations() {
  const context = useAthleteCoachInvitationsContext()
  if (!context) return EMPTY_INVITATIONS
  return context
}

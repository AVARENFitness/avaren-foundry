import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { coachBackend } from '../lib/coachBackend'
import {
  dedupeAthleteInvitations,
  normalizeAthleteInvitation,
  respondToAthleteInvitation,
} from '../lib/athleteCoachInvitations'
import { userProfileBackend } from '../lib/userProfileBackend'

const enrichCoachNames = async (invitations = []) => {
  const coachIds = [
    ...new Set(
      invitations.map((item) => item.coachId).filter(Boolean).map(String),
    ),
  ]
  if (!coachIds.length) return invitations

  const profiles = await Promise.all(
    coachIds.map(async (coachId) => {
      try {
        const profile = await userProfileBackend.getUserProfile(coachId)
        return [coachId, profile]
      } catch {
        return [coachId, null]
      }
    }),
  )

  const nameByCoachId = Object.fromEntries(
    profiles.map(([coachId, profile]) => {
      const displayName = String(profile?.display_name ?? '').trim()
      const preferred = String(profile?.preferred_name ?? '').trim()
      const first = String(profile?.first_name ?? '').trim()
      const last = String(profile?.last_name ?? '').trim()
      const full = [first, last].filter(Boolean).join(' ').trim()
      return [coachId, displayName || preferred || full || null]
    }),
  )

  return invitations.map((invitation) => ({
    ...invitation,
    coachDisplayName:
      invitation.coachDisplayName ||
      nameByCoachId[String(invitation.coachId)] ||
      null,
  }))
}

/**
 * Canonical athlete invitation controller — one fetch + accept/decline path
 * shared by Home, Notifications, and AthleteCoachPanel via context.
 */
export function useAthleteCoachInvitationController(userId = null) {
  const [invitations, setInvitations] = useState([])
  const [status, setStatus] = useState(userId ? 'loading' : 'idle')
  const [error, setError] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const fetchTicket = useRef(0)
  const userIdRef = useRef(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => {
    fetchTicket.current += 1
    setInvitations([])
    setError(null)
    setPendingId(null)
    setStatus(userId ? 'loading' : 'idle')
  }, [userId])

  const refreshInvitations = useCallback(async () => {
    const scopedUserId = userIdRef.current
    const ticket = ++fetchTicket.current

    if (!scopedUserId) {
      setInvitations([])
      setStatus('idle')
      setError(null)
      return []
    }

    setStatus('loading')
    try {
      const rows = await coachBackend.listAthleteInvitations()
      if (ticket !== fetchTicket.current) return []

      const normalized = dedupeAthleteInvitations(
        (rows ?? []).map(normalizeAthleteInvitation).filter(Boolean),
      )
      const enriched = await enrichCoachNames(normalized)
      if (ticket !== fetchTicket.current) return []

      setInvitations(enriched)
      setError(null)
      setStatus('ready')
      return enriched
    } catch (loadError) {
      if (ticket !== fetchTicket.current) return []
      setInvitations([])
      setError(loadError?.message ?? 'Could not load invitations.')
      setStatus('error')
      return []
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    void refreshInvitations()
    return undefined
  }, [userId, refreshInvitations])

  const removeInvitationLocally = useCallback((invitationId) => {
    const id = String(invitationId)
    setInvitations((current) =>
      current.filter((invitation) => invitation.id !== id),
    )
  }, [])

  const respond = useCallback(
    async (invitationId, decision) => {
      const id = invitationId == null ? null : String(invitationId)
      if (!id) throw new Error('Invitation id is required.')
      if (pendingId) return null

      setPendingId(id)
      setError(null)
      try {
        await respondToAthleteInvitation({ invitationId: id, decision })
        removeInvitationLocally(id)
        void refreshInvitations()
        return { invitationId: id, decision }
      } catch (respondError) {
        setError(respondError?.message ?? 'Could not update invitation.')
        throw respondError
      } finally {
        setPendingId(null)
      }
    },
    [pendingId, refreshInvitations, removeInvitationLocally],
  )

  const acceptInvitation = useCallback(
    (invitationId) => respond(invitationId, 'accept'),
    [respond],
  )

  const declineInvitation = useCallback(
    (invitationId) => respond(invitationId, 'decline'),
    [respond],
  )

  return useMemo(
    () => ({
      invitations,
      status,
      loading: status === 'loading',
      ready: status === 'ready',
      error,
      pendingId,
      refreshInvitations,
      acceptInvitation,
      declineInvitation,
    }),
    [
      invitations,
      status,
      error,
      pendingId,
      refreshInvitations,
      acceptInvitation,
      declineInvitation,
    ],
  )
}

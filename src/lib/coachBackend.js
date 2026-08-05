import { supabase } from './supabase'

const normalizeEmail = (value = '') =>
  String(value).trim().toLowerCase()

const missingBackend = (error) =>
  error?.code === '42P01' ||
  /does not exist/i.test(error?.message ?? '')

const unwrap = async (request) => {
  const result = await request

  if (result.error && missingBackend(result.error)) {
    throw new Error(
      'Coach backend is not installed. Run docs/supabase/AVAREN_COACH_BACKEND.sql in Supabase SQL Editor.',
    )
  }

  if (result.error) throw result.error
  return result.data ?? []
}

const currentUser = async () => {
  const { data, error } =
    await supabase.auth.getUser()

  if (error) throw error
  if (!data.user) {
    throw new Error('You must be signed in.')
  }

  return data.user
}

export const coachBackend = {
  async inviteAthlete(email) {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_invitations')
        .insert({
          coach_id: user.id,
          athlete_email: normalizeEmail(email),
        })
        .select()
        .single(),
    )
  },

  async listCoachInvitations() {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_invitations')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', {
          ascending: false,
        }),
    )
  },

  async cancelInvitation(id) {
    return unwrap(
      supabase
        .from('coach_invitations')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select(),
    )
  },

  async listAthleteInvitations() {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_invitations')
        .select('*')
        .eq(
          'athlete_email',
          normalizeEmail(user.email),
        )
        .eq('status', 'pending')
        .order('created_at', {
          ascending: false,
        }),
    )
  },

  async acceptInvitation(id) {
    return unwrap(
      supabase.rpc(
        'accept_coach_invitation',
        { invitation_id: id },
      ),
    )
  },

  async declineInvitation(id) {
    return unwrap(
      supabase.rpc(
        'decline_coach_invitation',
        { invitation_id: id },
      ),
    )
  },

  async listClients() {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_clients')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', {
          ascending: false,
        }),
    )
  },

  async createAssignment({
    athleteId,
    title,
    workout,
    coachNotes,
    dueDate,
  }) {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_assignments')
        .insert({
          coach_id: user.id,
          athlete_id: athleteId,
          title,
          workout_payload: workout,
          coach_notes: coachNotes ?? '',
          due_date: dueDate || null,
        })
        .select()
        .single(),
    )
  },

  async listCoachAssignments() {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_assignments')
        .select('*')
        .eq('coach_id', user.id)
        .order('assigned_at', {
          ascending: false,
        }),
    )
  },

  async listAthleteAssignments() {
    const user = await currentUser()

    return unwrap(
      supabase
        .from('coach_assignments')
        .select('*')
        .eq('athlete_id', user.id)
        .in('status', ['assigned', 'started'])
        .order('due_date', {
          ascending: true,
          nullsFirst: false,
        }),
    )
  },

  async markAssignmentStarted(id) {
    return unwrap(
      supabase
        .from('coach_assignments')
        .update({
          status: 'started',
          started_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single(),
    )
  },

  async markAssignmentCompleted(
    id,
    completedSessionId,
  ) {
    return unwrap(
      supabase
        .from('coach_assignments')
        .update({
          status: 'completed',
          completed_at:
            new Date().toISOString(),
          completed_session_id:
            completedSessionId,
        })
        .eq('id', id)
        .select()
        .single(),
    )
  },
}

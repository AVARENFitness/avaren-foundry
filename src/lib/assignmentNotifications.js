import { supabase } from './supabase'

const missingBackend = (error) =>
  error?.code === '42P01' ||
  /does not exist/i.test(error?.message ?? '')

const unwrap = async (request) => {
  const result = await request

  if (result.error && missingBackend(result.error)) {
    throw new Error(
      'Assignment notifications are not installed yet. Run docs/supabase/AVAREN_ASSIGNMENT_NOTIFICATIONS_6_3_2.sql in Supabase SQL Editor.',
    )
  }

  if (result.error) throw result.error
  return result.data ?? []
}

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

export const assignmentNotificationBackend = {
  async list() {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
    )
  },

  async markRead(id) {
    return unwrap(
      supabase
        .from('coach_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single(),
    )
  },

  async dismiss(id) {
    return unwrap(
      supabase
        .from('coach_notifications')
        .update({
          read_at: new Date().toISOString(),
          dismissed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single(),
    )
  },

  async deliveryForAssignments(assignmentIds = []) {
    if (!assignmentIds.length) return []
    return unwrap(
      supabase
        .from('coach_notifications')
        .select('id, assignment_id, read_at, created_at, dismissed_at')
        .in('assignment_id', assignmentIds)
        .eq('type', 'assignment-created'),
    )
  },

  subscribe(userId, onChange) {
    if (!userId) return () => {}

    const channel = supabase
      .channel(`coach-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coach_notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => onChange?.(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}

const appointmentPriority = (type) => {
  if (type === 'appointment-athlete-cannot-attend') return 112
  if (type === 'appointment-athlete-confirmed') return 96
  if (type === 'appointment-cancelled') return 94
  if (type === 'appointment-rescheduled') return 92
  if (type === 'appointment-scheduled') return 90
  if (type === 'appointment-coach-reminder-2h') return 86
  if (type === 'appointment-athlete-reminder-2h') return 84
  return 88
}

const appointmentActionLabel = (action) => {
  if (action === 'open-appointment-detail') return 'Open Session'
  if (action === 'open-coach-calendar') return 'Open Calendar'
  return null
}

export const mapAssignmentNotification = (row) => ({
  id: row.id,
  type:
    row.type === 'assignment-completed'
      ? 'workout'
      : row.type?.startsWith('session-')
      ? 'session'
      : row.type?.startsWith('appointment-')
      ? 'appointment'
      : 'assignment',
  priority:
    row.type?.startsWith('appointment-')
      ? appointmentPriority(row.type)
      : row.type === 'session-rsvp-declined'
      ? 110
      : row.type === 'session-rsvp-confirmed'
      ? 95
      : row.type === 'session-reminder'
      ? 88
      : row.type === 'assignment-created'
      ? 100
      : 90,
  title: row.title,
  body: row.body,
  action: row.action,
  actionLabel:
    row.action === 'open-assignment'
      ? 'Open Workout'
      : row.action === 'open-coach-assignment'
      ? 'Open Coach Hub'
      : row.action === 'open-coach-calendar'
      ? 'Open Calendar'
      : row.action === 'open-appointment-detail'
      ? 'Open Session'
      : row.action === 'open-session-rsvp'
      ? 'Respond'
      : appointmentActionLabel(row.action),
  createdAt: row.created_at,
  fingerprint: `remote:${row.id}`,
  read: Boolean(row.read_at),
  remote: true,
  remoteId: row.id,
  assignmentId: row.assignment_id,
  scheduledSessionId: row.scheduled_session_id,
  payload: row.payload ?? {},
})

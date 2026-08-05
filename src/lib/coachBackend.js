import { supabase } from './supabase'

const normalizeEmail = (value = '') => String(value).trim().toLowerCase()
const missingBackend = (error) => error?.code === '42P01' || /does not exist/i.test(error?.message ?? '')
const unwrap = async (request) => {
  const result = await request
  if (result.error && missingBackend(result.error)) throw new Error('Coach backend is not installed. Run the Supabase coach migrations.')
  if (result.error) throw result.error
  return result.data ?? []
}
const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

export const coachBackend = {
  async inviteAthlete(email) {
    const user = await currentUser()
    return unwrap(supabase.from('coach_invitations').insert({ coach_id: user.id, athlete_email: normalizeEmail(email) }).select().single())
  },
  async listCoachInvitations() {
    const user = await currentUser()
    return unwrap(supabase.from('coach_invitations').select('*').eq('coach_id', user.id).order('created_at', { ascending: false }))
  },
  async cancelInvitation(id) {
    return unwrap(supabase.from('coach_invitations').update({ status: 'cancelled' }).eq('id', id).select())
  },
  async listAthleteInvitations() {
    const user = await currentUser()
    return unwrap(supabase.from('coach_invitations').select('*').eq('athlete_email', normalizeEmail(user.email)).eq('status', 'pending').order('created_at', { ascending: false }))
  },
  async acceptInvitation(id) { return unwrap(supabase.rpc('accept_coach_invitation', { invitation_id: id })) },
  async declineInvitation(id) { return unwrap(supabase.rpc('decline_coach_invitation', { invitation_id: id })) },
  async listClients() {
    const user = await currentUser()
    return unwrap(supabase.from('coach_clients').select('*').eq('coach_id', user.id).order('created_at', { ascending: false }))
  },
  async createAssignment({ athleteId, title, workout, coachNotes, dueDate, priority = 'normal' }) {
    const user = await currentUser()
    const assignment = await unwrap(
      supabase
        .from('coach_assignments')
        .insert({
          coach_id: user.id,
          athlete_id: athleteId,
          title,
          workout_payload: workout,
          coach_notes: coachNotes ?? '',
          due_date: dueDate || null,
          priority,
        })
        .select()
        .single(),
    )

    const { error: pushError } = await supabase.functions.invoke(
      'send-assignment-push',
      { body: { assignmentId: assignment.id } },
    )

    if (pushError) {
      console.warn(
        'Assignment saved, but phone push could not be sent:',
        pushError,
      )
    }

    return assignment
  },

  async listWorkoutTemplates() {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_workout_templates')
        .select('*')
        .eq('coach_id', user.id)
        .order('updated_at', { ascending: false }),
    )
  },
  async saveWorkoutTemplate({ id, name, workout }) {
    const user = await currentUser()
    const payload = {
      coach_id: user.id,
      name,
      workout_payload: workout,
      updated_at: new Date().toISOString(),
    }
    if (id) payload.id = id
    return unwrap(
      supabase
        .from('coach_workout_templates')
        .upsert(payload)
        .select()
        .single(),
    )
  },
  async deleteWorkoutTemplate(id) {
    return unwrap(
      supabase
        .from('coach_workout_templates')
        .delete()
        .eq('id', id)
        .select(),
    )
  },
  async updateAssignment(id, patch) {
    return unwrap(
      supabase
        .from('coach_assignments')
        .update(patch)
        .eq('id', id)
        .in('status', ['assigned'])
        .select()
        .single(),
    )
  },
  async listCoachAssignments() {
    const user = await currentUser()
    return unwrap(supabase.from('coach_assignments').select('*').eq('coach_id', user.id).order('assigned_at', { ascending: false }))
  },
  async getAthleteAssignment(id) {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_assignments')
        .select('*')
        .eq('id', id)
        .eq('athlete_id', user.id)
        .single(),
    )
  },
  async listAthleteAssignments({ activeOnly = true } = {}) {
    const user = await currentUser()
    let query = supabase.from('coach_assignments').select('*').eq('athlete_id', user.id)
    if (activeOnly) query = query.in('status', ['assigned', 'started'])
    return unwrap(query.order('due_date', { ascending: true, nullsFirst: false }))
  },
  async markAssignmentStarted(id) {
    return unwrap(supabase.from('coach_assignments').update({ status: 'started', started_at: new Date().toISOString() }).eq('id', id).select().single())
  },
  async markAssignmentCompleted(id, completedSessionId, completionSummary = {}) {
    return unwrap(supabase.from('coach_assignments').update({ status: 'completed', completed_at: new Date().toISOString(), completed_session_id: completedSessionId, completion_summary: completionSummary }).eq('id', id).select().single())
  },
  async cancelAssignment(id) {
    return unwrap(
      supabase
        .from('coach_assignments')
        .update({
          status: 'cancelled',
          completed_at: null,
        })
        .eq('id', id)
        .in('status', ['assigned', 'started'])
        .select()
        .single(),
    )
  },
  async createScheduledAssignment(payload) {
    const assignment = await this.createAssignment(payload)
    const user = await currentUser()
    await unwrap(supabase.from('coach_schedule_items').insert({ coach_id: user.id, athlete_id: payload.athleteId, assignment_id: assignment.id, kind: 'workout', title: payload.title, scheduled_date: payload.dueDate, notes: payload.coachNotes ?? '' }).select().single())
    return assignment
  },
  async createScheduleItem({ athleteId, kind, title, scheduledDate, notes = '' }) {
    const user = await currentUser()
    return unwrap(supabase.from('coach_schedule_items').insert({ coach_id: user.id, athlete_id: athleteId, kind, title, scheduled_date: scheduledDate, notes }).select().single())
  },
  async listScheduleItems({ athleteId = null, startDate = null, endDate = null } = {}) {
    const user = await currentUser()
    let query = supabase.from('coach_schedule_items').select('*').eq('coach_id', user.id)
    if (athleteId) query = query.eq('athlete_id', athleteId)
    if (startDate) query = query.gte('scheduled_date', startDate)
    if (endDate) query = query.lte('scheduled_date', endDate)
    return unwrap(query.order('scheduled_date', { ascending: true }))
  },
  async listAthleteSchedule({ startDate = null, endDate = null } = {}) {
    const user = await currentUser()
    let query = supabase.from('coach_schedule_items').select('*').eq('athlete_id', user.id)
    if (startDate) query = query.gte('scheduled_date', startDate)
    if (endDate) query = query.lte('scheduled_date', endDate)
    return unwrap(query.order('scheduled_date', { ascending: true }))
  },
  async rescheduleAssignment(id, dueDate) {
    const assignment = await unwrap(supabase.from('coach_assignments').update({ due_date: dueDate }).eq('id', id).in('status', ['assigned', 'started']).select().single())
    await supabase.from('coach_schedule_items').update({ scheduled_date: dueDate, updated_at: new Date().toISOString() }).eq('assignment_id', id)
    const user = await currentUser()
    await supabase.from('coach_notifications').insert({ recipient_id: assignment.athlete_id, actor_id: user.id, assignment_id: id, type: 'assignment-due', title: 'Workout rescheduled', body: `${assignment.title} · Moved to ${dueDate}`, action: 'open-assignment', payload: { assignmentId: id, dueDate } })
    const { error } = await supabase.functions.invoke('send-assignment-push', { body: { assignmentId: id, eventType: 'rescheduled', title: 'Workout rescheduled', body: `${assignment.title} · Moved to ${dueDate}` } })
    if (error) console.warn('Reschedule push failed', error)
    return assignment
  },
  async duplicateAssignmentWeek({ startDate, endDate, athleteId = null }) {
    const user = await currentUser()
    let query = supabase.from('coach_assignments').select('*').eq('coach_id', user.id).gte('due_date', startDate).lte('due_date', endDate).in('status', ['assigned','started'])
    if (athleteId) query = query.eq('athlete_id', athleteId)
    const source = await unwrap(query)
    const created = []
    for (const item of source) {
      const due = new Date(`${item.due_date}T12:00:00`)
      due.setDate(due.getDate() + 7)
      created.push(await this.createScheduledAssignment({ athleteId: item.athlete_id, title: item.title, workout: item.workout_payload, coachNotes: item.coach_notes, dueDate: due.toISOString().slice(0,10), priority: item.priority ?? 'normal' }))
    }
    let scheduleQuery = supabase.from('coach_schedule_items').select('*').eq('coach_id', user.id).gte('scheduled_date', startDate).lte('scheduled_date', endDate).neq('kind', 'workout')
    if (athleteId) scheduleQuery = scheduleQuery.eq('athlete_id', athleteId)
    const scheduleRows = await unwrap(scheduleQuery)
    for (const item of scheduleRows) {
      const next = new Date(`${item.scheduled_date}T12:00:00`)
      next.setDate(next.getDate() + 7)
      await this.createScheduleItem({ athleteId: item.athlete_id, kind: item.kind, title: item.title, scheduledDate: next.toISOString().slice(0,10), notes: item.notes })
    }
    return created
  },
  async listPrograms() {
    const user = await currentUser()
    return unwrap(supabase.from('coach_programs').select('*').eq('coach_id', user.id).order('updated_at', { ascending: false }))
  },
  async saveProgram({ id, name, description = '', durationWeeks = 4, days = [] }) {
    const user = await currentUser()
    const payload = { coach_id: user.id, name, description, duration_weeks: durationWeeks, program_payload: { days }, updated_at: new Date().toISOString() }
    if (id) payload.id = id
    return unwrap(supabase.from('coach_programs').upsert(payload).select().single())
  },
  async deleteProgram(id) { return unwrap(supabase.from('coach_programs').delete().eq('id', id).select()) },
  async assignProgram({ programId, athleteId, startDate }) {
    const program = await unwrap(supabase.from('coach_programs').select('*').eq('id', programId).single())
    const start = new Date(`${startDate}T12:00:00`)
    const created = []
    for (let week = 0; week < Number(program.duration_weeks || 1); week += 1) {
      for (const day of program.program_payload?.days ?? []) {
        const date = new Date(start)
        const delta = (Number(day.weekday) - date.getDay() + 7) % 7
        date.setDate(date.getDate() + week * 7 + delta)
        const scheduledDate = date.toISOString().slice(0,10)
        if (day.kind === 'workout' && day.workoutPayload) created.push(await this.createScheduledAssignment({ athleteId, title: day.title || day.workoutPayload.name || program.name, workout: day.workoutPayload, coachNotes: `${program.name}${program.description ? ` · ${program.description}` : ''}`, dueDate: scheduledDate }))
        else await this.createScheduleItem({ athleteId, kind: day.kind, title: day.title || (day.kind === 'rest' ? 'Rest Day' : 'Deload Day'), scheduledDate, notes: program.name })
      }
    }
    return created
  },
  async getClientNotes(athleteId) {
    const user = await currentUser()
    const rows = await unwrap(supabase.from('coach_client_notes').select('*').eq('coach_id', user.id).eq('athlete_id', athleteId).limit(1))
    return rows[0] ?? null
  },
  async saveClientNotes(athleteId, notes) {
    const user = await currentUser()
    return unwrap(supabase.from('coach_client_notes').upsert({ coach_id: user.id, athlete_id: athleteId, notes, updated_at: new Date().toISOString() }, { onConflict: 'coach_id,athlete_id' }).select().single())
  },
}

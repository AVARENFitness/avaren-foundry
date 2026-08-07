import { supabase } from './supabase'
import {
  mapCompleteScheduledSessionRpcError,
  normalizeCompleteScheduledSessionRpcResult,
  normalizeUndoScheduledSessionRpcResult,
} from './coachScheduledSessions'
import {
  mapRsvpRpcError,
  normalizeRsvpRpcResult,
} from './sessionRsvp'
import { buildScheduleInstant } from './sessionReminders'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'
import { getCoachWeekRange } from './weeklyReview'

const normalizeEmail = (value = '') => String(value).trim().toLowerCase()
const missingBackend = (error) =>
  error?.code === '42P01' ||
  error?.code === '42883' ||
  /does not exist/i.test(error?.message ?? '')
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
    await unwrap(
      supabase.rpc('cancel_coach_assignment', {
        assignment_id: id,
      }),
    )
    return true
  },
  async deleteAssignment(id) {
    await unwrap(
      supabase.rpc('delete_coach_assignment', {
        assignment_id: id,
      }),
    )
    return true
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

  async getAthleteFoundryState(athleteId) {
    try {
      const { data, error } = await supabase
        .from('foundry_state')
        .select('state, updated_at')
        .eq('user_id', athleteId)
        .maybeSingle()

      if (error) {
        if (missingBackend(error)) return null
        return null
      }

      return data?.state ?? null
    } catch {
      return null
    }
  },

  async getAthleteNutritionSnapshot(athleteId, { days = 14 } = {}) {
    const end = new Date()
    const start = new Date(end.getTime() - (days - 1) * 86400000)
    const startKey = start.toISOString().slice(0, 10)

    try {
      const profileResult = await supabase
        .from('nutrition_profiles')
        .select('*')
        .eq('user_id', athleteId)
        .maybeSingle()

      if (profileResult.error && !missingBackend(profileResult.error)) {
        return { profile: null, days: [] }
      }

      const daysResult = await supabase
        .from('nutrition_days')
        .select('*')
        .eq('user_id', athleteId)
        .gte('log_date', startKey)
        .order('log_date', { ascending: false })

      if (daysResult.error && !missingBackend(daysResult.error)) {
        return {
          profile: profileResult.data ?? null,
          days: [],
        }
      }

      return {
        profile: profileResult.data ?? null,
        days: daysResult.data ?? [],
      }
    } catch {
      return { profile: null, days: [] }
    }
  },

  async listAthleteFoundryStates(athleteIds = []) {
    if (!athleteIds.length) return {}

    try {
      const { data, error } = await supabase
        .from('foundry_state')
        .select('user_id, state')
        .in('user_id', athleteIds)

      if (error) {
        if (missingBackend(error)) return {}
        return {}
      }

      return Object.fromEntries(
        (data ?? []).map((row) => [row.user_id, row.state ?? null]),
      )
    } catch {
      return {}
    }
  },

  async listAthleteNutritionSnapshots(athleteIds = [], { days = 14 } = {}) {
    if (!athleteIds.length) return {}

    const end = new Date()
    const start = new Date(end.getTime() - (days - 1) * 86400000)
    const startKey = start.toISOString().slice(0, 10)

    try {
      const [profilesResult, daysResult] = await Promise.all([
        supabase
          .from('nutrition_profiles')
          .select('*')
          .in('user_id', athleteIds),
        supabase
          .from('nutrition_days')
          .select('*')
          .in('user_id', athleteIds)
          .gte('log_date', startKey)
          .order('log_date', { ascending: false }),
      ])

      const profiles = profilesResult.data ?? []
      const days = daysResult.data ?? []
      const byAthlete = Object.fromEntries(
        athleteIds.map((id) => [id, { profile: null, days: [] }]),
      )

      profiles.forEach((profile) => {
        byAthlete[profile.user_id] = {
          profile,
          days: byAthlete[profile.user_id]?.days ?? [],
        }
      })

      days.forEach((day) => {
        if (!byAthlete[day.user_id]) {
          byAthlete[day.user_id] = { profile: null, days: [] }
        }
        byAthlete[day.user_id].days.push(day)
      })

      return byAthlete
    } catch {
      return {}
    }
  },

  async getClientWeeklyReview(athleteId, weekStart = null) {
    const user = await currentUser()
    const week = weekStart ?? getCoachWeekRange().weekStart

    try {
      const rows = await unwrap(
        supabase
          .from('coach_weekly_reviews')
          .select('*')
          .eq('coach_id', user.id)
          .eq('athlete_id', athleteId)
          .eq('week_start', week)
          .limit(1),
      )
      return rows[0] ?? null
    } catch (error) {
      if (missingBackend(error)) return null
      throw error
    }
  },

  async listClientWeeklyReviews(athleteId, limit = 12) {
    const user = await currentUser()

    try {
      return unwrap(
        supabase
          .from('coach_weekly_reviews')
          .select('*')
          .eq('coach_id', user.id)
          .eq('athlete_id', athleteId)
          .order('week_start', { ascending: false })
          .limit(limit),
      )
    } catch (error) {
      if (missingBackend(error)) return []
      throw error
    }
  },

  async listCoachWeeklyReviews(weekStart = null) {
    const user = await currentUser()
    const week = weekStart ?? getCoachWeekRange().weekStart

    try {
      return unwrap(
        supabase
          .from('coach_weekly_reviews')
          .select('*')
          .eq('coach_id', user.id)
          .eq('week_start', week)
          .order('updated_at', { ascending: false }),
      )
    } catch (error) {
      if (missingBackend(error)) return []
      throw error
    }
  },

  async saveClientWeeklyReview({
    athleteId,
    weekStart,
    weekEnd,
    decision,
    observation = '',
    priorities = [],
    followUpRequired = false,
    followUpNote = '',
    snapshot = {},
  }) {
    const user = await currentUser()

    try {
      return unwrap(
        supabase
          .from('coach_weekly_reviews')
          .upsert(
            {
              coach_id: user.id,
              athlete_id: athleteId,
              week_start: weekStart,
              week_end: weekEnd,
              decision,
              observation,
              priorities,
              follow_up_required: followUpRequired,
              follow_up_note: followUpNote,
              snapshot,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'coach_id,athlete_id,week_start' },
          )
          .select()
          .single(),
      )
    } catch (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Weekly reviews are not installed. Run AVAREN_COACH_WEEKLY_REVIEWS_7_5.sql.',
        )
      }
      throw error
    }
  },

  async getSessionPackage(athleteId) {
    const user = await currentUser()
    const rows = await unwrap(
      supabase
        .from('coach_session_packages')
        .select('*')
        .eq('coach_id', user.id)
        .eq('athlete_id', athleteId)
        .limit(1),
    )
    return rows[0] ?? null
  },

  async saveSessionPackage(athleteId, packageState) {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_session_packages')
        .upsert(
          {
            coach_id: user.id,
            athlete_id: athleteId,
            total_sessions: packageState.totalSessions,
            sessions_remaining: packageState.sessionsRemaining,
            sessions_used: packageState.sessionsUsed,
            purchased_at: packageState.purchasedAt,
            expires_at: packageState.expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'coach_id,athlete_id' },
        )
        .select()
        .single(),
    )
  },

  async listSessionHistory(athleteId, limit = 20) {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_session_history')
        .select('*')
        .eq('coach_id', user.id)
        .eq('athlete_id', athleteId)
        .order('session_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
    )
  },

  async insertSessionHistoryEntry({
    packageId,
    athleteId,
    sessionDate,
    coachLabel,
    note = '',
  }) {
    const user = await currentUser()
    return unwrap(
      supabase
        .from('coach_session_history')
        .insert({
          package_id: packageId,
          coach_id: user.id,
          athlete_id: athleteId,
          session_date: sessionDate,
          coach_label: coachLabel,
          note,
        })
        .select()
        .single(),
    )
  },

  async deleteSessionHistoryEntry(id) {
    return unwrap(
      supabase
        .from('coach_session_history')
        .delete()
        .eq('id', id)
        .select(),
    )
  },

  async getAthleteSessionPackage() {
    const user = await currentUser()
    const rows = await unwrap(
      supabase
        .from('coach_session_packages')
        .select('*')
        .eq('athlete_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1),
    )
    return rows[0] ?? null
  },

  async listScheduledSessions({ startDate, endDate, athleteId = null } = {}) {
    const user = await currentUser()
    let query = supabase
      .from('coach_scheduled_sessions')
      .select('*')
      .eq('coach_id', user.id)
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (athleteId) query = query.eq('athlete_id', athleteId)

    return unwrap(query)
  },

  async createScheduledSession({
    athleteId,
    sessionDate,
    startTime,
    durationMinutes = null,
    coachNote = '',
    startsAt = null,
    scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
  }) {
    const user = await currentUser()
    const instant = buildScheduleInstant({
      sessionDate,
      startTime,
      scheduleTimezone,
    })
    const resolvedStartsAt = startsAt ?? instant.startsAt
    const resolvedTimezone = instant.scheduleTimezone

    return unwrap(
      supabase
        .from('coach_scheduled_sessions')
        .insert({
          coach_id: user.id,
          athlete_id: athleteId,
          session_date: sessionDate,
          start_time: startTime,
          starts_at: resolvedStartsAt,
          schedule_timezone: resolvedTimezone,
          duration_minutes: durationMinutes,
          coach_note: coachNote,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single(),
    )
  },

  async updateScheduledSession(id, patch) {
    const payload = { updated_at: new Date().toISOString() }
    if (patch.sessionDate !== undefined) payload.session_date = patch.sessionDate
    if (patch.startTime !== undefined) payload.start_time = patch.startTime
    if (patch.durationMinutes !== undefined) {
      payload.duration_minutes = patch.durationMinutes
    }
    if (patch.coachNote !== undefined) payload.coach_note = patch.coachNote
    if (patch.status !== undefined) payload.status = patch.status
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt
    if (patch.sessionHistoryId !== undefined) {
      payload.session_history_id = patch.sessionHistoryId
    }
    if (patch.scheduleTimezone !== undefined) {
      payload.schedule_timezone = patch.scheduleTimezone
    }
    if (patch.startsAt !== undefined) {
      payload.starts_at = patch.startsAt
    } else if (patch.sessionDate !== undefined || patch.startTime !== undefined) {
      const sessionDate = patch.sessionDate
      const startTime = patch.startTime
      const scheduleTimezone =
        patch.scheduleTimezone ?? DEFAULT_COACH_SCHEDULE_TIMEZONE
      if (sessionDate && startTime) {
        const instant = buildScheduleInstant({
          sessionDate,
          startTime,
          scheduleTimezone,
        })
        payload.starts_at = instant.startsAt
        payload.schedule_timezone = instant.scheduleTimezone
      }
    }

    return unwrap(
      supabase
        .from('coach_scheduled_sessions')
        .update(payload)
        .eq('id', id)
        .select()
        .single(),
    )
  },

  async completeScheduledSessionAtomic(sessionId, coachLabel = '') {
    const { data, error } = await supabase.rpc(
      'complete_coach_scheduled_session',
      {
        p_scheduled_session_id: sessionId,
        p_coach_label: coachLabel,
      },
    )

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Atomic session completion is not installed. Run AVAREN_COACH_SESSION_COMPLETION_ATOMIC_7_1.sql.',
        )
      }
      return mapCompleteScheduledSessionRpcError(error)
    }

    return normalizeCompleteScheduledSessionRpcResult(data)
  },

  async undoScheduledSessionCompletionAtomic(sessionId) {
    const { data, error } = await supabase.rpc(
      'undo_complete_coach_scheduled_session',
      {
        p_scheduled_session_id: sessionId,
      },
    )

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Atomic session completion is not installed. Run AVAREN_COACH_SESSION_COMPLETION_ATOMIC_7_1.sql.',
        )
      }
      return mapCompleteScheduledSessionRpcError(error)
    }

    return normalizeUndoScheduledSessionRpcResult(data)
  },

  async listAthleteScheduledSessions() {
    const { data, error } = await supabase.rpc('list_athlete_scheduled_sessions')

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Athlete session scheduling is not installed. Run AVAREN_COACH_SESSION_RSVP_7_1.sql.',
        )
      }
      throw error
    }

    return Array.isArray(data) ? data : data ?? []
  },

  async updateSessionRsvp(sessionId, rsvpStatus) {
    const { data, error } = await supabase.rpc('update_scheduled_session_rsvp', {
      p_session_id: sessionId,
      p_rsvp_status: rsvpStatus,
    })

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Session RSVP is not installed. Run AVAREN_COACH_SESSION_RSVP_7_1.sql.',
        )
      }
      return mapRsvpRpcError(error)
    }

    return normalizeRsvpRpcResult(data)
  },
}

import { supabase } from './supabase'
import { enrichCoachClientRecord } from './clientDisplayName'
import { coachClientLabelsBackend } from './coachClientLabelsBackend'
import { userProfileBackend } from './userProfileBackend'
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
import {
  FOLLOWUP_STATUS,
  normalizeCoachFollowUp,
  validateCoachFollowUpInput,
} from './coachFollowUp'
import {
  findOverlappingAppointment,
  mapAppointmentOverlapError,
} from './coachingAppointment'
import {
  logAppointmentReadDiagnostics,
  normalizeAthleteAppointmentsFromRpc,
  parseAthleteScheduledSessionsRpc,
} from './athleteAppointments'
import {
  logAthleteRpcCheckpoint,
  resolveAuthenticatedUserId,
} from './athleteAppointmentTrace'
import {
  buildFollowUpInsertDiagnostics,
  buildScheduleConflictFollowUpForensics,
  inferFollowUpScheduledSessionFailure,
  resolveFollowUpCoachId,
} from './appointmentFollowUpIdentity'
import {
  APPOINTMENT_LINKAGE_ERROR,
} from './coachBusinessClientLinkage'
import {
  mapPassRpcError,
  normalizePassUsageRpcResult,
} from './coachPass'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'

const normalizeEmail = (value = '') => String(value).trim().toLowerCase()

const devFollowUpStore = new Map()

const readDevFollowUps = (coachId = null) =>
  devFollowUpStore.get(String(coachId ?? '')) ?? []

const writeDevFollowUp = (coachId = null, item = null) => {
  const key = String(coachId ?? '')
  const rows = readDevFollowUps(key)
  devFollowUpStore.set(key, [item, ...rows])
  return item
}

export const resetDevCoachFollowUpStore = () => {
  devFollowUpStore.clear()
}
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
    return unwrap(
      supabase
        .from('coach_clients')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false }),
    )
  },
  async listClientsWithIdentity() {
    const clients = await this.listClients()
    const athleteIds = clients.map((client) => client.athlete_id).filter(Boolean)

    const [profilesById, labelsById] = await Promise.all([
      userProfileBackend.listProfilesForAthletes(athleteIds),
      coachClientLabelsBackend.listOwnCoachLabels(),
    ])

    return clients.map((client) =>
      enrichCoachClientRecord(client, {
        profile: profilesById[client.athlete_id] ?? null,
        coachLabel: labelsById[client.athlete_id]?.coach_label ?? '',
        businessClientId: client.business_client_id ?? null,
      }),
    )
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
    businessClientId = null,
    sessionDate,
    startTime,
    durationMinutes = null,
    coachNote = '',
    startsAt = null,
    scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
    assignmentId = null,
    locationType = 'default',
    locationName = '',
    appointmentType = 'IN_PERSON_TRAINING',
    existingSessions = null,
  }) {
    const user = await currentUser()
    let resolvedBusinessClientId = businessClientId

    if (athleteId && !resolvedBusinessClientId) {
      resolvedBusinessClientId = await this.resolveBusinessClientId(athleteId)
    }

    if (athleteId && !resolvedBusinessClientId) {
      throw new Error(APPOINTMENT_LINKAGE_ERROR)
    }

    const instant = buildScheduleInstant({
      sessionDate,
      startTime,
      scheduleTimezone,
    })
    const resolvedStartsAt = startsAt ?? instant.startsAt
    const resolvedTimezone = instant.scheduleTimezone
    const resolvedDuration = durationMinutes ?? 60

    const candidate = {
      coachId: user.id,
      sessionDate,
      startTime,
      startsAt: resolvedStartsAt,
      durationMinutes: resolvedDuration,
      status: 'scheduled',
    }

    if (Array.isArray(existingSessions)) {
      const overlap = findOverlappingAppointment(candidate, existingSessions)
      if (overlap) {
        throw new Error('appointment_overlap')
      }
    }

    try {
      return await unwrap(
        supabase
          .from('coach_scheduled_sessions')
          .insert({
            coach_id: user.id,
            athlete_id: athleteId,
            business_client_id: resolvedBusinessClientId,
            session_date: sessionDate,
            start_time: startTime,
            starts_at: resolvedStartsAt,
            schedule_timezone: resolvedTimezone,
            duration_minutes: resolvedDuration,
            coach_note: coachNote,
            assignment_id: assignmentId ?? null,
            location_type: locationType,
            location_name: locationName,
            appointment_type: appointmentType,
            status: 'scheduled',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single(),
      )
    } catch (error) {
      const mapped = mapAppointmentOverlapError(error)
      if (mapped) throw new Error(mapped.message)
      throw error
    }
  },

  async updateScheduledSession(id, patch, { existingSessions = null } = {}) {
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
    if (patch.assignmentId !== undefined) payload.assignment_id = patch.assignmentId
    if (patch.locationType !== undefined) payload.location_type = patch.locationType
    if (patch.locationName !== undefined) payload.location_name = patch.locationName
    if (patch.workoutSessionId !== undefined) {
      payload.workout_session_id = patch.workoutSessionId
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

    if (Array.isArray(existingSessions) && payload.status !== 'cancelled') {
      const current = existingSessions.find((item) => item.id === id)
      const candidate = {
        ...(current ?? {}),
        id,
        coachId: current?.coachId,
        sessionDate: payload.session_date ?? current?.sessionDate,
        startTime: payload.start_time ?? current?.startTime,
        startsAt: payload.starts_at ?? current?.startsAt,
        durationMinutes: payload.duration_minutes ?? current?.durationMinutes,
        status: payload.status ?? current?.status ?? 'scheduled',
      }
      const overlap = findOverlappingAppointment(candidate, existingSessions, {
        excludeId: id,
      })
      if (overlap) {
        throw new Error('appointment_overlap')
      }
    }

    try {
      return await unwrap(
        supabase
          .from('coach_scheduled_sessions')
          .update(payload)
          .eq('id', id)
          .select()
          .single(),
      )
    } catch (error) {
      const mapped = mapAppointmentOverlapError(error)
      if (mapped) throw new Error(mapped.message)
      throw error
    }
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

  async listAthleteScheduledSessions({ expectedUserId = null, controlAppointmentId = null } = {}) {
    const authUserId = await resolveAuthenticatedUserId()

    if (
      expectedUserId &&
      authUserId &&
      authUserId !== expectedUserId &&
      import.meta.env.DEV
    ) {
      logAthleteRpcCheckpoint({
        authUserId,
        expectedUserId,
        rpcOk: false,
        rawData: null,
        error: { code: 'auth_user_mismatch', message: 'auth_user_mismatch' },
        controlAppointmentId,
      })
    }

    const { data, error } = await supabase.rpc('list_athlete_scheduled_sessions')

    logAthleteRpcCheckpoint({
      authUserId,
      expectedUserId,
      rpcOk: !error,
      rawData: data,
      error,
      controlAppointmentId,
    })

    if (error) {
      if (missingBackend(error)) {
        const installError = new Error(
          'Athlete session scheduling is not installed. Run AVAREN_COACH_APPOINTMENTS_8_3.sql.',
        )
        installError.code = error.code ?? null
        installError.details = error.details ?? null
        installError.hint = error.hint ?? null
        installError.cause = error
        throw installError
      }
      throw error
    }

    const rows = parseAthleteScheduledSessionsRpc(data)
    logAppointmentReadDiagnostics(rows, { source: 'coachBackend.listAthleteScheduledSessions' })
    return rows
  },

  async listAthleteScheduledSessionHistory() {
    const { data, error } = await supabase.rpc(
      'list_athlete_scheduled_session_history',
    )

    if (error) {
      if (missingBackend(error)) return []
      throw error
    }

    return parseAthleteScheduledSessionsRpc(data)
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

  async getAthleteCoachId() {
    const user = await currentUser()
    const { data, error } = await supabase
      .from('coach_clients')
      .select('coach_id')
      .eq('athlete_id', user.id)
      .limit(1)
      .maybeSingle()

    if (error) {
      if (missingBackend(error)) return null
      throw error
    }

    return data?.coach_id ?? null
  },

  async getCoachIdFromAssignment(assignmentId = null) {
    if (!assignmentId) return null

    const user = await currentUser()
    const { data, error } = await supabase
      .from('coach_assignments')
      .select('coach_id')
      .eq('id', assignmentId)
      .eq('athlete_id', user.id)
      .maybeSingle()

    if (error) {
      if (missingBackend(error)) return null
      throw error
    }

    return data?.coach_id ?? null
  },

  async createClientFollowUp({
    reasonType = null,
    summary = '',
    sourceType = 'ava_athlete',
    sessionId = null,
    assignmentId = null,
    scheduledSessionId = null,
    coachId = null,
    appointmentContext = null,
  } = {}) {
    const user = await currentUser()
    let resolvedCoachId

    try {
      resolvedCoachId = await resolveFollowUpCoachId({
        coachId,
        assignmentId,
        scheduledSessionId,
        fetchCoachIdFromAssignment: (id) => this.getCoachIdFromAssignment(id),
        fetchDefaultCoachId: () => this.getAthleteCoachId(),
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[follow-up-insert]', {
          ...buildFollowUpInsertDiagnostics({
            athleteId: user.id,
            coachId,
            scheduledSessionId,
            assignmentId,
            reasonType,
            sourceType,
          }),
          error: error.message,
        })
      }
      throw error
    }

    const validation = validateCoachFollowUpInput({
      athleteId: user.id,
      reasonType,
      summary,
      sourceType,
    })

    if (!validation.ok) {
      throw new Error('Could not create coach follow-up.')
    }

    if (!resolvedCoachId) {
      throw new Error('No coach relationship found for this athlete.')
    }

    if (import.meta.env.DEV) {
      console.warn('[follow-up-insert]', buildFollowUpInsertDiagnostics({
        athleteId: user.id,
        coachId: resolvedCoachId,
        scheduledSessionId,
        assignmentId,
        reasonType,
        sourceType,
      }))
    }

    const payload = {
      coach_id: resolvedCoachId,
      athlete_id: user.id,
      reason_type: reasonType,
      source_type: sourceType,
      summary: String(summary).trim(),
      status: FOLLOWUP_STATUS.OPEN,
      session_id: sessionId ?? null,
      assignment_id: assignmentId ?? null,
      scheduled_session_id: scheduledSessionId ?? null,
    }

    if (import.meta.env.DEV && scheduledSessionId) {
      const forensics = buildScheduleConflictFollowUpForensics({
        appointment: appointmentContext ?? {
          id: scheduledSessionId,
          coachId: resolvedCoachId,
        },
        authAthleteId: user.id,
        followUpPayload: payload,
      })
      console.warn('[follow-up-insert-forensics]', forensics)
    }

    try {
      const row = await unwrap(
        supabase
          .from('coach_client_followups')
          .insert(payload)
          .select()
          .single(),
      )
      return normalizeCoachFollowUp(row)
    } catch (error) {
      if (import.meta.env.DEV && scheduledSessionId) {
        const forensics = buildScheduleConflictFollowUpForensics({
          appointment: appointmentContext ?? {
            id: scheduledSessionId,
            coachId: resolvedCoachId,
          },
          authAthleteId: user.id,
          followUpPayload: payload,
        })
        const inferred = inferFollowUpScheduledSessionFailure({
          errorMessage: error?.message ?? String(error),
          forensics,
        })
        console.warn('[follow-up-insert-failure]', {
          error: error?.message ?? String(error),
          forensics,
          inferredFailure: inferred,
        })
      }
      if (missingBackend(error)) {
        return writeDevFollowUp(
          resolvedCoachId,
          normalizeCoachFollowUp({
            ...payload,
            coachId: resolvedCoachId,
            athleteId: user.id,
            reasonType,
            sourceType,
          }),
        )
      }
      throw error
    }
  },

  async listAthleteFollowUps() {
    const user = await currentUser()

    try {
      const rows = await unwrap(
        supabase
          .from('coach_client_followups')
          .select('*')
          .eq('athlete_id', user.id)
          .order('created_at', { ascending: false }),
      )
      return (rows ?? []).map(normalizeCoachFollowUp)
    } catch (error) {
      if (missingBackend(error)) return []
      throw error
    }
  },

  async listCoachClientFollowUps({ status = null } = {}) {
    const user = await currentUser()

    try {
      let query = supabase
        .from('coach_client_followups')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const rows = await unwrap(query)
      return (rows ?? []).map(normalizeCoachFollowUp)
    } catch (error) {
      if (missingBackend(error)) {
        const devRows = readDevFollowUps(user.id)
        return status
          ? devRows.filter((item) => item.status === status)
          : devRows
      }
      throw error
    }
  },

  async updateClientFollowUpStatus(followUpId, status) {
    const user = await currentUser()

    try {
      const { data, error } = await supabase.rpc(
        'update_coach_client_followup_status',
        {
          p_followup_id: followUpId,
          p_status: status,
        },
      )

      if (error) {
        if (missingBackend(error)) {
          throw new Error(
            'Coach follow-up lifecycle is not installed. Run AVAREN_COACH_CLIENT_FOLLOWUPS_8_2.sql.',
          )
        }
        throw error
      }

      return normalizeCoachFollowUp(data)
    } catch (error) {
      if (missingBackend(error)) {
        const rows = readDevFollowUps(user.id)
        const index = rows.findIndex((item) => item.id === followUpId)
        if (index === -1) throw new Error('Follow-up not found.')
        const updated = normalizeCoachFollowUp({
          ...rows[index],
          status,
          reviewedAt:
            status === FOLLOWUP_STATUS.REVIEWED ||
            status === FOLLOWUP_STATUS.RESOLVED
              ? new Date().toISOString()
              : null,
          resolvedAt:
            status === FOLLOWUP_STATUS.RESOLVED
              ? new Date().toISOString()
              : null,
        })
        rows[index] = updated
        devFollowUpStore.set(String(user.id), rows)
        return updated
      }
      throw error
    }
  },

  async resolveBusinessClientId(athleteId) {
    const user = await currentUser()
    const rows = await unwrap(
      supabase
        .from('coach_clients')
        .select('business_client_id')
        .eq('coach_id', user.id)
        .eq('athlete_id', athleteId)
        .limit(1),
    )
    const bridgeId = rows[0]?.business_client_id ?? null
    if (bridgeId) return bridgeId

    const businessClients = await unwrap(
      supabase
        .from('coach_business_clients')
        .select('id')
        .eq('coach_id', user.id)
        .eq('linked_user_id', athleteId)
        .limit(2),
    )

    if ((businessClients ?? []).length === 1) {
      return businessClients[0].id
    }

    return null
  },

  async listClientPassBalances(businessClientId) {
    const user = await currentUser()
    const rows = await unwrap(
      supabase
        .from('coach_client_pass_balances')
        .select('*')
        .eq('coach_id', user.id)
        .eq('business_client_id', businessClientId)
        .order('starts_at', { ascending: false }),
    )
    return rows ?? []
  },

  async listClientPassLedger(businessClientId, limit = 100) {
    const user = await currentUser()
    const rows = await unwrap(
      supabase
        .from('coach_client_pass_ledger')
        .select('*, coach_client_passes(name)')
        .eq('coach_id', user.id)
        .eq('business_client_id', businessClientId)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
    return (rows ?? []).map((row) => ({
      ...row,
      pass_name: row.coach_client_passes?.name ?? null,
    }))
  },

  async createCoachClientPass({
    businessClientId,
    name,
    sessionsPurchased,
    startsAt,
    expiresAt = null,
    notes = '',
  }) {
    const { data, error } = await supabase.rpc('create_coach_client_pass', {
      p_business_client_id: businessClientId,
      p_name: name,
      p_sessions_purchased: sessionsPurchased,
      p_starts_at: startsAt,
      p_expires_at: expiresAt,
      p_notes: notes,
    })

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Training pass RPCs are not installed. Run AVAREN_COACH_BUSINESS_CLIENTS_8_4_1D_RLS_RPC.sql.',
        )
      }
      throw new Error(mapPassRpcError(error).message)
    }

    return data
  },

  async recordCompletedSessionPassUsage(sessionId, passId = null) {
    const resolvedPassId = passId ?? null
    const rpcArgs = {
      p_scheduled_session_id: sessionId,
      p_pass_id: resolvedPassId,
    }

    if (import.meta.env?.DEV) {
      console.debug('[coach-pass-rpc-request]', {
        rpcCalled: 'record_completed_session_pass_usage',
        sessionIdSent: Boolean(sessionId),
        passIdSent: Boolean(resolvedPassId),
        passId: resolvedPassId,
      })
    }

    const { data, error } = await supabase.rpc(
      'record_completed_session_pass_usage',
      rpcArgs,
    )

    if (import.meta.env?.DEV) {
      console.debug('[coach-pass-rpc-response]', {
        rpcCalled: 'record_completed_session_pass_usage',
        rpcData: data ?? null,
        rpcErrorCode: error?.code ?? null,
        rpcErrorMessage: error?.message ?? null,
      })
    }

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Pass usage RPCs are not installed. Run AVAREN_COACH_BUSINESS_CLIENTS_8_4_1D_RLS_RPC.sql.',
        )
      }
      return mapPassRpcError(error)
    }

    const result = normalizePassUsageRpcResult(data)
    if (import.meta.env?.DEV) {
      result.rawData = data ?? null
    }
    return result
  },

  async setMissedSessionChargeDecision(sessionId, decision) {
    const { data, error } = await supabase.rpc(
      'set_missed_session_charge_decision',
      {
        p_scheduled_session_id: sessionId,
        p_decision: decision,
      },
    )

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Missed charge RPCs are not installed. Run AVAREN_COACH_BUSINESS_CLIENTS_8_4_1D_RLS_RPC.sql.',
        )
      }
      return mapPassRpcError(error)
    }

    return normalizePassUsageRpcResult(data)
  },

  async recordMissedSessionPassCharge(sessionId, passId) {
    const { data, error } = await supabase.rpc(
      'record_missed_session_pass_charge',
      {
        p_scheduled_session_id: sessionId,
        p_pass_id: passId,
      },
    )

    if (error) {
      if (missingBackend(error)) {
        throw new Error(
          'Missed charge RPCs are not installed. Run AVAREN_COACH_BUSINESS_CLIENTS_8_4_1D_RLS_RPC.sql.',
        )
      }
      return mapPassRpcError(error)
    }

    return normalizePassUsageRpcResult(data)
  },

  async completeInPersonAppointment(sessionId, { passId = null } = {}) {
    const completedAt = new Date().toISOString()
    const session = await this.updateScheduledSession(sessionId, {
      status: SCHEDULED_SESSION_STATUS.COMPLETED,
      completedAt,
    })
    const passResult = await this.recordCompletedSessionPassUsage(
      sessionId,
      passId,
    )

    return {
      session,
      passResult,
    }
  },

  async markInPersonAppointmentMissed(sessionId) {
    return this.updateScheduledSession(sessionId, {
      status: SCHEDULED_SESSION_STATUS.MISSED,
    })
  },

  async getAthleteTrainingPassSummary() {
    const { data, error } = await supabase.rpc('get_my_training_pass_summary')

    if (error) {
      if (missingBackend(error)) return []
      throw error
    }

    return Array.isArray(data) ? data : []
  },

  async listAthletePassUsageHistory(limit = 30) {
    const { data, error } = await supabase.rpc('list_my_pass_usage_history', {
      p_limit: limit,
    })

    if (error) {
      if (missingBackend(error)) return []
      throw error
    }

    return Array.isArray(data) ? data : []
  },
}

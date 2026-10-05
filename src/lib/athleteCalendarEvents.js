import { supabase } from './supabase'
import { buildScheduleInstant } from './sessionReminders'
import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

export const ATHLETE_CALENDAR_EVENT_CATEGORY = {
  PERSONAL: 'personal',
  WORK: 'work',
  SCHOOL: 'school',
  APPOINTMENT: 'appointment',
  OTHER: 'other',
}

export const ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL = {
  [ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL]: 'Personal',
  [ATHLETE_CALENDAR_EVENT_CATEGORY.WORK]: 'Work',
  [ATHLETE_CALENDAR_EVENT_CATEGORY.SCHOOL]: 'School',
  [ATHLETE_CALENDAR_EVENT_CATEGORY.APPOINTMENT]: 'Appointment',
  [ATHLETE_CALENDAR_EVENT_CATEGORY.OTHER]: 'Other',
}

export const normalizeAthleteCalendarEvent = (row) => {
  if (!row) return null

  return {
    id: row.id,
    athleteId: row.athlete_id ?? row.athleteId ?? null,
    title: row.title ?? 'Private event',
    sessionDate: row.event_date ?? row.eventDate ?? row.sessionDate ?? null,
    eventDate: row.event_date ?? row.eventDate ?? row.sessionDate ?? null,
    startTime: String(row.start_time ?? row.startTime ?? '').slice(0, 5),
    durationMinutes: row.duration_minutes ?? row.durationMinutes ?? 60,
    startsAt: row.starts_at ?? row.startsAt ?? null,
    endsAt: row.ends_at ?? row.endsAt ?? null,
    scheduleTimezone:
      row.schedule_timezone ??
      row.scheduleTimezone ??
      DEFAULT_COACH_SCHEDULE_TIMEZONE,
    category: row.category ?? ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL,
    notes: row.notes ?? '',
    locationName: row.location_name ?? row.locationName ?? '',
    status: row.status ?? 'scheduled',
    isAthletePrivateEvent: true,
    isPrivateEvent: true,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export const athleteCalendarEventCategoryLabel = (event = {}) =>
  ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL[event.category] ??
  ATHLETE_CALENDAR_EVENT_CATEGORY_LABEL[ATHLETE_CALENDAR_EVENT_CATEGORY.OTHER]

export const createAthleteCalendarEventDraft = (eventDate = '') => ({
  title: '',
  eventDate,
  startTime: '09:00',
  durationMinutes: '60',
  category: ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL,
  locationName: '',
  notes: '',
})

const requireUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  const user = data?.user
  if (!user?.id) throw new Error('not_authenticated')
  return user
}

export const athleteCalendarBackend = {
  async list({ startDate, endDate } = {}) {
    const user = await requireUser()
    const { data, error } = await supabase
      .from('athlete_calendar_events')
      .select('*')
      .eq('athlete_id', user.id)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .eq('status', 'scheduled')
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) throw error
    return data ?? []
  },

  async create({
    title,
    eventDate,
    startTime,
    durationMinutes = 60,
    category = ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL,
    notes = '',
    locationName = '',
    scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
  }) {
    const user = await requireUser()
    const duration = Number(durationMinutes) || 60
    const instant = buildScheduleInstant({
      sessionDate: eventDate,
      startTime,
      scheduleTimezone,
    })
    const startsAt = instant.startsAt
    const endsAt = startsAt
      ? new Date(new Date(startsAt).getTime() + duration * 60000).toISOString()
      : null

    const { data, error } = await supabase
      .from('athlete_calendar_events')
      .insert({
        athlete_id: user.id,
        title: String(title ?? '').trim(),
        event_date: eventDate,
        start_time: startTime,
        duration_minutes: duration,
        starts_at: startsAt,
        ends_at: endsAt,
        schedule_timezone: instant.scheduleTimezone,
        category,
        notes,
        location_name: locationName,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(
    id,
    {
      title,
      eventDate,
      startTime,
      durationMinutes = 60,
      category = ATHLETE_CALENDAR_EVENT_CATEGORY.PERSONAL,
      notes = '',
      locationName = '',
      scheduleTimezone = DEFAULT_COACH_SCHEDULE_TIMEZONE,
    },
  ) {
    const user = await requireUser()
    const duration = Number(durationMinutes) || 60
    const instant = buildScheduleInstant({
      sessionDate: eventDate,
      startTime,
      scheduleTimezone,
    })
    const startsAt = instant.startsAt
    const endsAt = startsAt
      ? new Date(new Date(startsAt).getTime() + duration * 60000).toISOString()
      : null

    const { data, error } = await supabase
      .from('athlete_calendar_events')
      .update({
        title: String(title ?? '').trim(),
        event_date: eventDate,
        start_time: startTime,
        duration_minutes: duration,
        starts_at: startsAt,
        ends_at: endsAt,
        schedule_timezone: instant.scheduleTimezone,
        category,
        notes,
        location_name: locationName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('athlete_id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async remove(id) {
    const user = await requireUser()
    const { data, error } = await supabase
      .from('athlete_calendar_events')
      .delete()
      .eq('id', id)
      .eq('athlete_id', user.id)
      .select()
      .single()

    if (error) throw error
    return data
  },
}

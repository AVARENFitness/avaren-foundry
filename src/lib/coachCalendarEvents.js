import { DEFAULT_COACH_SCHEDULE_TIMEZONE } from './sessionTimezone'

export const COACH_CALENDAR_EVENT_CATEGORY = {
  PERSONAL: 'personal',
  ADMIN: 'admin',
  MEETING: 'meeting',
  UNAVAILABLE: 'unavailable',
  OTHER: 'other',
}

export const COACH_CALENDAR_EVENT_CATEGORY_LABEL = {
  [COACH_CALENDAR_EVENT_CATEGORY.PERSONAL]: 'Personal',
  [COACH_CALENDAR_EVENT_CATEGORY.ADMIN]: 'Admin',
  [COACH_CALENDAR_EVENT_CATEGORY.MEETING]: 'Meeting',
  [COACH_CALENDAR_EVENT_CATEGORY.UNAVAILABLE]: 'Unavailable',
  [COACH_CALENDAR_EVENT_CATEGORY.OTHER]: 'Other',
}

export const normalizeCoachCalendarEvent = (row) => {
  if (!row) return null

  return {
    id: row.id,
    coachId: row.coach_id ?? row.coachId ?? null,
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
    category: row.category ?? COACH_CALENDAR_EVENT_CATEGORY.PERSONAL,
    notes: row.notes ?? '',
    locationName: row.location_name ?? row.locationName ?? '',
    status: row.status ?? 'scheduled',
    isCoachPrivateEvent: true,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export const coachCalendarEventCategoryLabel = (event = {}) =>
  COACH_CALENDAR_EVENT_CATEGORY_LABEL[event.category] ??
  COACH_CALENDAR_EVENT_CATEGORY_LABEL[COACH_CALENDAR_EVENT_CATEGORY.OTHER]

export const createCoachCalendarEventDraft = (eventDate = '') => ({
  title: '',
  eventDate,
  startTime: '09:00',
  durationMinutes: '60',
  category: COACH_CALENDAR_EVENT_CATEGORY.PERSONAL,
  locationName: '',
  notes: '',
})

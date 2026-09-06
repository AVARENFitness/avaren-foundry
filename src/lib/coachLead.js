import { createRuntimeId } from './createRuntimeId'

export const LEAD_STAGE = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  CONSULTATION_SCHEDULED: 'CONSULTATION_SCHEDULED',
  TRIAL_COMPLETED: 'TRIAL_COMPLETED',
  WON: 'WON',
  LOST: 'LOST',
}

export const LEAD_STAGE_LABEL = {
  [LEAD_STAGE.NEW]: 'New',
  [LEAD_STAGE.CONTACTED]: 'Contacted',
  [LEAD_STAGE.CONSULTATION_SCHEDULED]: 'Consultation scheduled',
  [LEAD_STAGE.TRIAL_COMPLETED]: 'Trial completed',
  [LEAD_STAGE.WON]: 'Won',
  [LEAD_STAGE.LOST]: 'Lost',
}

const ALLOWED_STAGES = new Set(Object.values(LEAD_STAGE))

const padDatePart = (value) => String(value).padStart(2, '0')

export const leadFollowUpDateValue = (value) => {
  if (!value) return ''

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return `${date.getFullYear()}-${padDatePart(
    date.getMonth() + 1,
  )}-${padDatePart(date.getDate())}`
}

export const leadFollowUpDateToIso = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(value ?? '').trim(),
  )

  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  // Store date-only follow-ups at 9:00 AM local time.
  // This avoids UTC-midnight date shifting while keeping
  // the canonical database field as timestamptz.
  const localDate = new Date(
    year,
    month - 1,
    day,
    9,
    0,
    0,
    0,
  )

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null
  }

  return localDate.toISOString()
}

export const formatLeadFollowUpDate = (value) => {
  if (!value) return ''

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() !== new Date().getFullYear()
        ? 'numeric'
        : undefined,
  })
}

export const normalizeCoachLead = (row = {}) => ({
  id: row.id ?? createRuntimeId(),
  coachId: row.coach_id ?? row.coachId ?? null,
  firstName: String(
    row.first_name ?? row.firstName ?? '',
  ).trim(),
  lastName: String(
    row.last_name ?? row.lastName ?? '',
  ).trim(),
  preferredName: String(
    row.preferred_name ?? row.preferredName ?? '',
  ).trim(),
  phone: String(row.phone ?? '').trim(),
  email: String(row.email ?? '').trim(),
  goal: String(row.goal ?? row.reason ?? '').trim(),
  source: String(row.source ?? '').trim(),
  notes: String(row.notes ?? '').trim(),
  stage: row.stage ?? LEAD_STAGE.NEW,
  nextFollowUpAt:
    row.next_follow_up_at ??
    row.nextFollowUpAt ??
    null,
  businessClientId:
    row.business_client_id ??
    row.businessClientId ??
    null,
  createdAt:
    row.created_at ??
    row.createdAt ??
    new Date().toISOString(),
  updatedAt:
    row.updated_at ??
    row.updatedAt ??
    new Date().toISOString(),
})

export const leadDisplayName = (lead = {}) => {
  const preferred = String(
    lead.preferredName ?? '',
  ).trim()

  if (preferred) return preferred

  const parts = [
    lead.firstName,
    lead.lastName,
  ].filter(Boolean)

  if (parts.length) return parts.join(' ')

  return 'Lead'
}

export const isValidLeadStage = (stage) =>
  ALLOWED_STAGES.has(stage)

export const isLeadFollowUpDue = (
  lead = {},
  now = new Date(),
) => {
  if (!lead?.nextFollowUpAt) return false

  if (
    lead.stage === LEAD_STAGE.WON ||
    lead.stage === LEAD_STAGE.LOST
  ) {
    return false
  }

  const dueDate = leadFollowUpDateValue(
    lead.nextFollowUpAt,
  )

  const nowDate = leadFollowUpDateValue(
    typeof now === 'number'
      ? new Date(now)
      : now,
  )

  return Boolean(
    dueDate &&
    nowDate &&
    dueDate <= nowDate
  )
}

export const isLeadConvertible = (lead = {}) =>
  lead.stage === LEAD_STAGE.WON &&
  !lead.businessClientId

export const buildLeadCreatePayload = ({
  firstName,
  lastName = '',
  preferredName = '',
  phone = '',
  email = '',
  goal = '',
  source = '',
  notes = '',
} = {}) => ({
  first_name: String(firstName ?? '').trim(),
  last_name: String(lastName ?? '').trim(),
  preferred_name: String(preferredName ?? '').trim(),
  phone: String(phone ?? '').trim(),
  email: String(email ?? '').trim(),
  goal: String(goal ?? '').trim(),
  source: String(source ?? '').trim(),
  notes: String(notes ?? '').trim(),
  stage: LEAD_STAGE.NEW,
})

export const buildLeadConversionNote = (lead = {}) => {
  const parts = []

  if (lead.goal) {
    parts.push(`Goal: ${lead.goal}`)
  }

  if (lead.source) {
    parts.push(`Source: ${lead.source}`)
  }

  if (lead.notes) {
    parts.push(lead.notes)
  }

  return parts.join('\n').trim()
}
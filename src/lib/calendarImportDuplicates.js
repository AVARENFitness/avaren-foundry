import { getClientDisplayName } from './clientDisplayName'
import { resolveRecordBusinessClientId } from './coachBusinessClient'

const clean = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const day = item => String(item?.sessionDate ?? item?.eventDate ?? '')
const start = item => String(item?.startTime ?? '').slice(0, 5)
const minutes = time => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const isTraining = item => !item?.isCoachPrivateEvent && !item?.isAthletePrivateEvent &&
  Boolean(item?.businessClientId ?? item?.business_client_id ?? item?.athleteId ?? item?.athlete_id)

export function classifyCalendarImportEntry(item, existingItems = [], clients = []) {
  if (!item?.date || !item?.startTime || !Number(item.durationMinutes)) return { kind: 'new' }
  const itemStart = minutes(item.startTime)
  if (itemStart == null) return { kind: 'new' }
  const itemEnd = itemStart + Number(item.durationMinutes)
  const client = clients.find(c => String(resolveRecordBusinessClientId(c)) === String(item.businessClientId))
  const label = clean(item.title)
  const candidateNames = new Set([label, clean(getClientDisplayName(client ?? {}))].filter(Boolean))
  let conflict = null
  for (const existing of existingItems) {
    if (existing?.status === 'cancelled' || day(existing) !== item.date) continue
    const existingStart = minutes(start(existing))
    const existingDuration = Number(existing.durationMinutes)
    if (existingStart == null || !Number.isFinite(existingDuration) || existingDuration <= 0) continue
    if (!(itemStart < existingStart + existingDuration && existingStart < itemEnd)) continue
    const sameTime = itemStart === existingStart && existingDuration === Number(item.durationMinutes)
    const existingBusinessId = existing.businessClientId ?? existing.business_client_id
    const sameClientId = Boolean(item.businessClientId && existingBusinessId &&
      String(item.businessClientId) === String(existingBusinessId))
    const knownClient = clients.find(c =>
      String(resolveRecordBusinessClientId(c)) === String(existingBusinessId))
    const nameMatch = Boolean(
      label &&
      [existing.title, getClientDisplayName(knownClient ?? {})].some(name => candidateNames.has(clean(name)) && clean(name)),
    )
    // A name alone can never identify a training appointment as an exact duplicate.
    // Match the canonical client identity and full time window.
    const duplicate = sameTime && (item.suggestedType === 'training_candidate'
      ? isTraining(existing) && sameClientId
      : !isTraining(existing) && nameMatch)
    if (duplicate) return { kind: 'duplicate' }
    conflict = { kind: 'conflict', conflictingTitle: String(existing.title ?? getClientDisplayName(knownClient ?? {}) ?? 'another appointment') }
  }
  return conflict ?? { kind: 'new' }
}

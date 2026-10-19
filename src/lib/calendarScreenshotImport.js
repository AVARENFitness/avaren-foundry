import { getClientDisplayName } from './clientDisplayName'
import { resolveRecordBusinessClientId } from './coachBusinessClient'

const clean = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function matchCalendarImportClient(label, clients = []) {
  const raw = String(label ?? '').trim()
  const query = clean(raw)
  if (!query) return { status: 'unmatched', client: null, candidates: [] }
  const named = clients.map(client => ({
    client,
    name: clean(getClientDisplayName(client)),
    id: resolveRecordBusinessClientId(client),
  })).filter(item => item.name && item.id)
  const exact = named.filter(item => item.name === query)
  if (exact.length === 1) return { status: 'matched', client: exact[0].client, candidates: exact }
  if (exact.length > 1) return { status: 'ambiguous', client: null, candidates: exact }

  // Narrow Google Calendar columns truncate names; never silently link a
  // partial label to a person. Slash labels can refer to more than one client.
  const parts = raw.split('/').map(clean).filter(Boolean)
  const searchParts = parts.length > 1 ? parts : [query]
  const possible = named.filter(item => {
    if (query.length >= 3 && item.name.startsWith(query)) return true
    return searchParts.some(part => {
    if (part.length < 2) return false
    return item.name === part ||
      item.name.startsWith(part + ' ') ||
      (part.length >= (parts.length > 1 ? 2 : 3) && item.name.startsWith(part)) ||
      (part.length >= 3 && item.name.split(' ').some(word => word.startsWith(part)))
    })
  })
  if (possible.length) return { status: 'ambiguous', client: null, candidates: possible }
  return { status: 'unmatched', client: null, candidates: [] }
}

export function prepareCalendarImportReview(entries = [], clients = []) {
  return (Array.isArray(entries) ? entries : []).slice(0, 60).map((entry, index) => {
    const title = String(entry?.title ?? '').trim().slice(0, 120)
    const date = String(entry?.date ?? '')
    const startTime = String(entry?.startTime ?? '')
    const durationMinutes = Number(entry?.durationMinutes)
    const parsedDate = new Date(date + 'T12:00:00Z')
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date
    const expectedDay = Number(entry?.weekday)
    const matchesColumn = !Number.isInteger(expectedDay) || expectedDay < 0 || expectedDay > 6 || (validDate && parsedDate.getUTCDay() === expectedDay)
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    const validDuration = Number.isInteger(durationMinutes) && durationMinutes > 0 && durationMinutes <= 1440
    const match = matchCalendarImportClient(title, clients)
    const geometryConflict = entry?.geometryValid === false
    const needsReview = !title || !validDate || !validTime || !validDuration || !matchesColumn || geometryConflict || match.status === 'ambiguous'
    return {
      id: 'import-' + index,
      title,
      date: validDate ? date : '',
      startTime: validTime ? startTime : '',
      durationMinutes: validDuration ? durationMinutes : 60,
      suggestedType: match.status === 'matched' ? 'training_candidate' : 'private',
      businessClientId: match.status === 'matched' ? resolveRecordBusinessClientId(match.client) : null,
      matchStatus: match.status,
      dateConflict: !matchesColumn,
      geometryConflict,
      weekday: Number.isInteger(expectedDay) ? expectedDay : null,
      candidates: match.candidates.map(item => ({ name: item.name, id: item.id })),
      needsReview,
      selected: false,
    }
  })
}

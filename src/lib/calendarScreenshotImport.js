import { getClientDisplayName } from './clientDisplayName'
import { resolveRecordBusinessClientId } from './coachBusinessClient'

const clean = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export function matchCalendarImportClient(label, clients = []) {
  const query = clean(label)
  if (!query) return { status: 'unmatched', client: null, candidates: [] }
  const named = clients.map(client => ({ client, name: clean(getClientDisplayName(client)), id: resolveRecordBusinessClientId(client) })).filter(item => item.name && item.id)
  const exact = named.filter(item => item.name === query)
  if (exact.length === 1) return { status: 'matched', client: exact[0].client, candidates: exact }
  if (exact.length > 1) return { status: 'ambiguous', client: null, candidates: exact }
  const firstNames = query.includes(' ') ? [] : named.filter(item => item.name.split(' ')[0] === query)
  if (firstNames.length === 1) return { status: 'matched', client: firstNames[0].client, candidates: firstNames }
  return firstNames.length ? { status: 'ambiguous', client: null, candidates: firstNames } : { status: 'unmatched', client: null, candidates: [] }
}

export function prepareCalendarImportReview(entries = [], clients = []) {
  return (Array.isArray(entries) ? entries : []).slice(0, 60).map((entry, index) => {
    const title = String(entry?.title ?? '').trim().slice(0, 120)
    const date = String(entry?.date ?? '')
    const startTime = String(entry?.startTime ?? '')
    const durationMinutes = Number(entry?.durationMinutes)
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + 'T12:00:00'))
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    const validDuration = Number.isInteger(durationMinutes) && durationMinutes > 0 && durationMinutes <= 1440
    const match = matchCalendarImportClient(title, clients)
    const needsReview = !title || !validDate || !validTime || !validDuration || match.status === 'ambiguous'
    return {
      id: 'import-' + index,
      title,
      date: validDate ? date : '',
      startTime: validTime ? startTime : '',
      durationMinutes: validDuration ? durationMinutes : 60,
      suggestedType: match.status === 'matched' ? 'training_candidate' : 'private',
      businessClientId: match.status === 'matched' ? resolveRecordBusinessClientId(match.client) : null,
      matchStatus: match.status,
      candidates: match.candidates.map(item => ({ name: item.name, id: item.id })),
      needsReview,
      selected: false,
    }
  })
}

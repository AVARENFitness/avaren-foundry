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
  return firstNames.length ? { status: 'ambiguous', client: null, candidates: firstNames } : { status: 'unmatched', client: null, candidates: [] }
}

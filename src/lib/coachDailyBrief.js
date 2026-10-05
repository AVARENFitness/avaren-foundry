import { supabase } from './supabase'
import { resolveRecordBusinessClientId } from './coachBusinessClient'

const CACHE_PREFIX = 'avaren-coach-daily-brief'
const ACTION_TYPES = new Set([
  'open_client',
  'open_training',
  'open_sessions',
])

const dateKey = () => new Date().toISOString().slice(0, 10)

const simpleHash = (value = '') => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const clientKey = (client = {}) =>
  resolveRecordBusinessClientId(client) ?? client.athlete_id ?? null

const normalizeAttentionFact = (item = {}) => ({
  businessClientId:
    item.businessClientId ?? resolveRecordBusinessClientId(item.client) ?? null,
  athleteId: item.athleteId ?? item.client?.athlete_id ?? null,
  clientName: item.clientName ?? 'Client',
  category: item.category ?? item.type ?? 'ATTENTION',
  description: String(item.description ?? item.item?.description ?? '').slice(0, 320),
  priority: Number(item.priorityScore ?? item.priority ?? 0),
  actionLabel: String(item.actionLabel ?? 'Open client').slice(0, 80),
})

const normalizeWinFact = (win = {}) => ({
  businessClientId: resolveRecordBusinessClientId(win.client) ?? null,
  athleteId: win.client?.athlete_id ?? null,
  clientName: win.clientName ?? 'Client',
  label: String(win.label ?? '').slice(0, 180),
  detail: String(win.detail ?? '').slice(0, 240),
})

const buildTodayFact = ({
  session,
  client,
  rosterEntry,
} = {}) => ({
  sessionId: session?.id ?? null,
  businessClientId: resolveRecordBusinessClientId(client) ?? null,
  athleteId: client?.athlete_id ?? null,
  clientName: rosterEntry?.clientName ?? client?.displayName ?? client?.display_name ?? 'Client',
  startTime: session?.startTime ?? session?.start_time ?? null,
  workout: session?.linkedWorkoutTitle ?? null,
  lastTraining: rosterEntry?.intelligence?.training?.lastSession
    ? {
        name: rosterEntry.intelligence.training.lastSession.name,
        relativeLabel: rosterEntry.intelligence.training.lastSession.relativeLabel,
        sets: rosterEntry.intelligence.training.lastSession.sets ?? null,
      }
    : null,
  readiness: rosterEntry?.intelligence?.readiness?.available
    ? {
        band: rosterEntry.intelligence.readiness.band ?? null,
        score: rosterEntry.intelligence.readiness.score ?? null,
        status: rosterEntry.intelligence.readiness.status ?? null,
      }
    : null,
  checkInStatus: rosterEntry?.athleteCheckInStatus ?? null,
})

export const buildCoachDailyBriefPacket = ({
  attentionItems = [],
  wins = [],
  todaySessions = [],
  clients = [],
  rosterEntries = [],
} = {}) => {
  const clientByBusinessId = Object.fromEntries(
    clients
      .map((client) => [resolveRecordBusinessClientId(client), client])
      .filter(([id]) => Boolean(id)),
  )
  const clientByAthleteId = Object.fromEntries(
    clients
      .map((client) => [client.athlete_id, client])
      .filter(([id]) => Boolean(id)),
  )
  const rosterByBusinessId = Object.fromEntries(
    rosterEntries
      .map((entry) => [resolveRecordBusinessClientId(entry.client), entry])
      .filter(([id]) => Boolean(id)),
  )
  const rosterByAthleteId = Object.fromEntries(
    rosterEntries
      .map((entry) => [entry.client?.athlete_id, entry])
      .filter(([id]) => Boolean(id)),
  )

  const today = todaySessions
    .map((session) => {
      const client =
        clientByBusinessId[session.businessClientId] ??
        clientByAthleteId[session.athleteId] ??
        null
      if (!client) return null
      const rosterEntry =
        rosterByBusinessId[resolveRecordBusinessClientId(client)] ??
        rosterByAthleteId[client.athlete_id] ??
        null
      return buildTodayFact({ session, client, rosterEntry })
    })
    .filter(Boolean)
    .slice(0, 8)

  return {
    date: dateKey(),
    attention: attentionItems.map(normalizeAttentionFact).slice(0, 6),
    today,
    wins: wins.map(normalizeWinFact).slice(0, 5),
  }
}

export const coachDailyBriefSignature = (packet = {}) =>
  simpleHash(JSON.stringify(packet))

const cacheKey = (signature) =>
  `${CACHE_PREFIX}:${dateKey()}:${signature}`

export const readCoachDailyBriefCache = (signature) => {
  if (!signature || typeof sessionStorage === 'undefined') return null
  try {
    const value = JSON.parse(sessionStorage.getItem(cacheKey(signature)) || 'null')
    return value?.brief ?? null
  } catch {
    return null
  }
}

export const writeCoachDailyBriefCache = (signature, brief) => {
  if (!signature || !brief || typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(
    cacheKey(signature),
    JSON.stringify({ savedAt: new Date().toISOString(), brief }),
  )
}

export const clearCoachDailyBriefCache = () => {
  if (typeof sessionStorage === 'undefined') return
  const prefix = `${CACHE_PREFIX}:${dateKey()}:`
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => sessionStorage.removeItem(key))
}

const fallbackActionType = (attention = {}) => {
  const category = String(attention.category ?? '')
  if (
    category.includes('MISSED_TRAINING') ||
    category.includes('PROGRAM_CHANGE') ||
    category.includes('RECOVERY') ||
    category.includes('PAIN')
  ) {
    return 'open_training'
  }
  if (
    category.includes('LOW_SESSION_BALANCE') ||
    category.includes('NO_NEXT_APPOINTMENT') ||
    category.includes('MISSED_APPOINTMENT')
  ) {
    return 'open_sessions'
  }
  return 'open_client'
}

export const buildCoachDailyBriefFallback = (packet = {}) => ({
  headline: packet.attention?.length
    ? `${packet.attention.length} client${packet.attention.length === 1 ? '' : 's'} worth your attention`
    : 'No urgent coaching issues surfaced',
  summary: packet.attention?.length
    ? 'AVAREN ranked the highest-value coaching items from current client data.'
    : 'Use today’s session prep below and keep an eye on normal client progress.',
  attention: (packet.attention ?? []).slice(0, 3).map((item) => ({
    businessClientId: item.businessClientId,
    clientName: item.clientName,
    title: item.description,
    why: item.description,
    actionLabel: item.actionLabel || 'Open client',
    actionType: fallbackActionType(item),
  })),
  todayPrep: (packet.today ?? []).slice(0, 4).map((item) => ({
    sessionId: item.sessionId,
    businessClientId: item.businessClientId,
    clientName: item.clientName,
    cue:
      item.readiness?.status ??
      (item.lastTraining
        ? `Last training: ${item.lastTraining.name} · ${item.lastTraining.relativeLabel ?? 'recently'}`
        : 'No recent training detail to review.'),
    actionLabel: 'Open client',
    actionType: 'open_client',
  })),
  wins: (packet.wins ?? []).slice(0, 3).map((item) => ({
    businessClientId: item.businessClientId,
    clientName: item.clientName,
    line: [item.label, item.detail].filter(Boolean).join(' · '),
  })),
})

const allowedIds = (packet = {}) =>
  new Set(
    [
      ...(packet.attention ?? []),
      ...(packet.today ?? []),
      ...(packet.wins ?? []),
    ]
      .map((item) => item.businessClientId)
      .filter(Boolean),
  )

export const normalizeCoachDailyBrief = (brief = {}, packet = {}) => {
  const ids = allowedIds(packet)
  const normalizeAction = (item = {}) => {
    const businessClientId = ids.has(item.businessClientId)
      ? item.businessClientId
      : null
    if (!businessClientId) return null
    const actionType = ACTION_TYPES.has(item.actionType)
      ? item.actionType
      : 'open_client'
    return {
      businessClientId,
      clientName: String(item.clientName ?? 'Client').slice(0, 120),
      title: String(item.title ?? '').slice(0, 180),
      why: String(item.why ?? '').slice(0, 320),
      cue: String(item.cue ?? '').slice(0, 320),
      actionLabel: String(item.actionLabel ?? 'Open client').slice(0, 80),
      actionType,
      sessionId: item.sessionId ?? null,
    }
  }

  return {
    headline: String(brief.headline ?? '').slice(0, 180),
    summary: String(brief.summary ?? '').slice(0, 420),
    attention: (brief.attention ?? [])
      .map(normalizeAction)
      .filter(Boolean)
      .slice(0, 3),
    todayPrep: (brief.todayPrep ?? [])
      .map(normalizeAction)
      .filter(Boolean)
      .slice(0, 4),
    wins: (brief.wins ?? [])
      .map((item) => {
        if (!ids.has(item.businessClientId)) return null
        return {
          businessClientId: item.businessClientId,
          clientName: String(item.clientName ?? 'Client').slice(0, 120),
          line: String(item.line ?? '').slice(0, 320),
        }
      })
      .filter(Boolean)
      .slice(0, 3),
  }
}

export async function requestCoachDailyBrief(packet) {
  const { data, error } = await supabase.functions.invoke('coach-daily-brief', {
    body: { packet },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.reason ?? 'AVA brief unavailable.')
  return normalizeCoachDailyBrief(data.brief, packet)
}

export const findBriefClient = (clients = [], businessClientId = null) =>
  clients.find((client) => clientKey(client) === businessClientId) ?? null

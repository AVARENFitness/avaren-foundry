import { getClientDisplayName } from './clientDisplayName.js'
import { normalizeCoachingRequirements } from './coachClientRequirements.js'

export const BUSINESS_CLIENT_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
}

export const CLIENT_APP_ACCESS = {
  CONNECTED: 'connected',
  NO_APP: 'no_app',
}

export const CLIENT_IDENTITY_BADGE = {
  CONNECTED: 'Connected',
  NO_APP: 'No app account',
  PAST: 'Past client',
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const INVALID_UUID_LITERALS = new Set(['null', 'undefined', ''])

export const isInvalidUuidLiteral = (value) => {
  if (value == null) return true
  const normalized = String(value).trim()
  if (!normalized) return true
  return INVALID_UUID_LITERALS.has(normalized.toLowerCase())
}

export const isValidUuid = (value) => {
  if (isInvalidUuidLiteral(value)) return false
  return UUID_PATTERN.test(String(value).trim())
}

/** Safe for Supabase UUID columns — blocks null, undefined, and string "null". */
export const isQuerySafeAthleteId = (value) => !isInvalidUuidLiteral(value)

const isClientRecord = (client) =>
  client != null && typeof client === 'object'

/** Public resolver — explicit business-client fields only. */
export const resolveBusinessClientId = (client) => {
  if (!isClientRecord(client)) return null
  return client.businessClientId ?? client.business_client_id ?? null
}

/** Roster/RPC rows may only expose `id` as the business client uuid. */
export const resolveRecordBusinessClientId = (client) => {
  if (!isClientRecord(client)) return null
  return (
    client.businessClientId ??
    client.business_client_id ??
    client.id ??
    null
  )
}

export const isExplicitlyOfflineClient = (client) => {
  if (!isClientRecord(client)) return false
  return client.linked_user_id === null || client.linkedUserId === null
}

/** Canonical AVAREN account link — linked_user_id only, never stale athlete_id. */
export const resolveCanonicalLinkedUserId = (client) => {
  if (!isClientRecord(client)) return null
  if (isExplicitlyOfflineClient(client)) return null
  const linked = client.linked_user_id ?? client.linkedUserId ?? null
  return isQuerySafeAthleteId(linked) ? linked : null
}

/** Athlete id for portfolio/intelligence — linked account or legacy bridge row. */
export const resolveAthleteDataId = (client) => {
  if (!isClientRecord(client)) return null
  if (isExplicitlyOfflineClient(client)) return null

  const linked = resolveCanonicalLinkedUserId(client)
  if (linked) return linked

  const athleteId = client.athlete_id ?? null
  return isQuerySafeAthleteId(athleteId) ? athleteId : null
}

/** Athlete UUID for linked-app data queries. Returns null for offline clients. */
export const resolveLinkedAthleteId = (client) => resolveAthleteDataId(client)

/** @deprecated Prefer resolveCanonicalLinkedUserId for connection eligibility. */
export const resolveLinkedUserId = (client) =>
  resolveCanonicalLinkedUserId(client)

export const hasLinkedAthlete = (client) =>
  Boolean(resolveCanonicalLinkedUserId(client))

export const isLinkedBusinessClient = (client) => hasLinkedAthlete(client)

export const isOfflineBusinessClient = (client) =>
  isClientRecord(client) && !isLinkedBusinessClient(client)

export const isActiveBusinessClient = (client) => {
  if (!isClientRecord(client)) return false
  return (
    String(
      client.status ?? client.business_client_status ?? BUSINESS_CLIENT_STATUS.ACTIVE,
    ) === BUSINESS_CLIENT_STATUS.ACTIVE
  )
}

export const isArchivedBusinessClient = (client) => {
  if (!isClientRecord(client)) return false
  return (
    String(
      client.status ?? client.business_client_status ?? BUSINESS_CLIENT_STATUS.ACTIVE,
    ) === BUSINESS_CLIENT_STATUS.ARCHIVED
  )
}

export const resolveClientAppAccess = (client = {}) =>
  isLinkedBusinessClient(client)
    ? CLIENT_APP_ACCESS.CONNECTED
    : CLIENT_APP_ACCESS.NO_APP

export const resolveClientIdentityBadge = (client = {}) => {
  if (isArchivedBusinessClient(client)) return CLIENT_IDENTITY_BADGE.PAST
  if (isLinkedBusinessClient(client)) return CLIENT_IDENTITY_BADGE.CONNECTED
  return CLIENT_IDENTITY_BADGE.NO_APP
}

export const resolveCoachClientRosterKey = (client) => {
  const businessClientId = resolveRecordBusinessClientId(client)
  if (businessClientId) return `bc:${businessClientId}`
  const athleteId = resolveLinkedUserId(client)
  if (athleteId) return `athlete:${athleteId}`
  return null
}

export const buildBusinessClientDisplayInput = (client = {}) =>
  getClientDisplayName({
    coachLabel: client.coach_label ?? client.coachLabel ?? '',
    profile: {
      first_name: client.first_name ?? '',
      last_name: client.last_name ?? '',
      preferred_name: client.preferred_name ?? '',
      display_name: client.display_name ?? '',
    },
    legacyName: client.display_name ?? client.legacyName ?? '',
    email: client.email ?? client.athlete_email ?? '',
  })

export const attachCoachingRequirementsToBusinessClients = (
  clients = [],
  requirementsById = {},
) =>
  clients.map((client) => {
    const businessClientId = resolveRecordBusinessClientId(client)
    const coachingRequirements =
      (businessClientId ? requirementsById[businessClientId] : null) ??
      client.coaching_requirements ??
      client.coachingRequirements ??
      null

    if (!coachingRequirements) return client

    return {
      ...client,
      coaching_requirements: coachingRequirements,
      coachingRequirements,
    }
  })

export const normalizeBusinessClientRecord = (record = {}, enrichments = {}) => {
  const rawLinked = record.linked_user_id ?? record.linkedUserId ?? null
  const canonicalLinkedId =
    rawLinked === null
      ? null
      : isQuerySafeAthleteId(rawLinked)
        ? rawLinked
        : null

  const rawRequirements =
    record.coaching_requirements ?? record.coachingRequirements ?? null
  const normalizedRequirements =
    rawRequirements && typeof rawRequirements === 'object'
      ? normalizeCoachingRequirements(rawRequirements)
      : null

  return {
    ...record,
    business_client_id: resolveRecordBusinessClientId(record),
    businessClientId: resolveRecordBusinessClientId(record),
    linked_user_id: canonicalLinkedId,
    linkedUserId: canonicalLinkedId,
    athlete_id: canonicalLinkedId,
    status: record.status ?? BUSINESS_CLIENT_STATUS.ACTIVE,
    displayName: buildBusinessClientDisplayInput({ ...record, ...enrichments }),
    appAccess: resolveClientAppAccess({
      ...record,
      linked_user_id: canonicalLinkedId,
    }),
    identityBadge: resolveClientIdentityBadge({
      ...record,
      linked_user_id: canonicalLinkedId,
    }),
    coaching_requirements:
      normalizedRequirements ?? { weekly_check_in: 'required' },
    coachingRequirements:
      normalizedRequirements ?? { weekly_check_in: 'required' },
    rosterKey: resolveCoachClientRosterKey({
      ...record,
      linked_user_id: canonicalLinkedId,
    }),
    ...enrichments,
    linked_user_id: canonicalLinkedId,
    linkedUserId: canonicalLinkedId,
    athlete_id: canonicalLinkedId ?? enrichments.athlete_id ?? null,
  }
}

export const mergeCoachRosterRecords = ({
  businessClients = [],
  bridgeClients = [],
  profilesById = {},
  labelsById = {},
} = {}) => {
  const bridgeByBusinessId = new Map(
    bridgeClients
      .filter((client) => client.business_client_id)
      .map((client) => [client.business_client_id, client]),
  )

  const roster = businessClients.map((client) => {
    const businessClientId = resolveRecordBusinessClientId(client)
    const bridge = bridgeByBusinessId.get(businessClientId) ?? null
    const athleteId = resolveCanonicalLinkedUserId(client)
    const profile = athleteId ? profilesById[athleteId] ?? null : null
    const coachLabel = athleteId ? labelsById[athleteId]?.coach_label ?? '' : ''

    return normalizeBusinessClientRecord(client, {
      athlete_id: athleteId,
      athlete_email: bridge?.athlete_email ?? client.email ?? '',
      coach_label: coachLabel,
      profile,
      bridgeCreatedAt: bridge?.created_at ?? null,
      hasCoachBridge: Boolean(bridge),
    })
  })

  const seen = new Set(roster.map((client) => client.rosterKey).filter(Boolean))

  for (const bridge of bridgeClients) {
    if (bridge.business_client_id) continue
    const key = resolveCoachClientRosterKey(bridge)
    if (key && seen.has(key)) continue
    roster.push(
      normalizeBusinessClientRecord(
        {
          id: bridge.business_client_id,
          business_client_id: bridge.business_client_id,
          linked_user_id: bridge.athlete_id,
          status: BUSINESS_CLIENT_STATUS.ACTIVE,
          athlete_email: bridge.athlete_email,
        },
        {
          athlete_id: bridge.athlete_id,
          coach_label: labelsById[bridge.athlete_id]?.coach_label ?? '',
          profile: profilesById[bridge.athlete_id] ?? null,
          bridgeCreatedAt: bridge.created_at ?? null,
          hasCoachBridge: true,
        },
      ),
    )
  }

  return roster.sort((left, right) =>
    String(left.displayName ?? '').localeCompare(String(right.displayName ?? '')),
  )
}

export const buildScheduledSessionClientPayload = ({
  businessClientId,
  athleteId = null,
  businessClient = null,
} = {}) => {
  if (!businessClientId) {
    return { ok: false, error: 'business_client_required' }
  }

  const linkedUserId =
    businessClient?.linked_user_id ?? businessClient?.linkedUserId ?? null

  if (linkedUserId) {
    const resolvedAthleteId = athleteId ?? linkedUserId
    if (resolvedAthleteId !== linkedUserId) {
      return { ok: false, error: 'appointment_athlete_link_mismatch' }
    }
    return {
      ok: true,
      businessClientId,
      athleteId: linkedUserId,
    }
  }

  if (athleteId) {
    return { ok: false, error: 'appointment_offline_client_no_athlete' }
  }

  return {
    ok: true,
    businessClientId,
    athleteId: null,
  }
}

export const filterActiveRoster = (clients = []) =>
  clients.filter((client) => isActiveBusinessClient(client))

export const filterArchivedRoster = (clients = []) =>
  clients.filter((client) => isArchivedBusinessClient(client))

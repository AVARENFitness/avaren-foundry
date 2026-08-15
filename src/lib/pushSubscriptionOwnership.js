/**
 * Pure ownership model for browser-scoped Web Push endpoints.
 * Mirrors register_push_subscription RPC semantics for tests.
 */

export const applyPushEndpointOwnership = ({
  rows = [],
  endpoint,
  newUserId,
  keys = {},
  meta = {},
}) => {
  if (!endpoint || !newUserId) {
    throw new Error('endpoint and newUserId are required')
  }

  const deactivated = rows.map((row) =>
    row.endpoint === endpoint && row.user_id !== newUserId && row.active
      ? { ...row, active: false }
      : row,
  )

  const existing = deactivated.find((row) => row.endpoint === endpoint)
  const timestamp = meta.now ?? new Date().toISOString()

  if (existing) {
    return deactivated.map((row) =>
      row.endpoint === endpoint
        ? {
            ...row,
            user_id: newUserId,
            p256dh: keys.p256dh ?? row.p256dh,
            auth: keys.auth ?? row.auth,
            user_agent: meta.userAgent ?? row.user_agent ?? '',
            platform: meta.platform ?? row.platform ?? '',
            active: true,
            last_seen_at: timestamp,
            updated_at: timestamp,
          }
        : row,
    )
  }

  return [
    ...deactivated,
    {
      id: meta.id ?? `sub-${endpoint.slice(-8)}`,
      user_id: newUserId,
      endpoint,
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
      user_agent: meta.userAgent ?? '',
      platform: meta.platform ?? '',
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
      last_seen_at: timestamp,
    },
  ]
}

export const activeSubscriptionsForUser = (rows = [], userId) =>
  rows.filter((row) => row.active && row.user_id === userId)

export const activeEndpointOwners = (rows = []) => {
  const owners = new Map()
  for (const row of rows) {
    if (!row.active) continue
    owners.set(row.endpoint, row.user_id)
  }
  return owners
}

export const findActiveEndpointCollisions = (rows = []) => {
  const byEndpoint = new Map()

  for (const row of rows) {
    if (!row.active) continue
    const bucket = byEndpoint.get(row.endpoint) ?? new Set()
    bucket.add(row.user_id)
    byEndpoint.set(row.endpoint, bucket)
  }

  return [...byEndpoint.entries()]
    .filter(([, userIds]) => userIds.size > 1)
    .map(([endpoint, userIds]) => ({
      endpoint,
      userIds: [...userIds],
    }))
}

export const maskPushEndpoint = (endpoint = '') => {
  if (!endpoint) return ''
  if (endpoint.length <= 24) return `${endpoint.slice(0, 8)}…`
  return `${endpoint.slice(0, 16)}…${endpoint.slice(-6)}`
}

export const selectAssignmentPushRecipients = ({
  subscriptions = [],
  athleteId,
}) =>
  subscriptions.filter(
    (row) => row.active && row.user_id === athleteId,
  )

import { createRuntimeId } from './createRuntimeId'

const DAY_MS = 86400000

export const todayKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10)

const startOfDay = (value = new Date()) => {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export const emptySessionPackage = () => ({
  id: null,
  totalSessions: 0,
  sessionsRemaining: 0,
  sessionsUsed: 0,
  purchasedAt: null,
  expiresAt: null,
})

export const normalizeSessionPackage = (row) => {
  if (!row) return emptySessionPackage()

  return {
    id: row.id ?? null,
    totalSessions: Number(row.total_sessions ?? 0),
    sessionsRemaining: Number(row.sessions_remaining ?? 0),
    sessionsUsed: Number(row.sessions_used ?? 0),
    purchasedAt: row.purchased_at ?? null,
    expiresAt: row.expires_at ?? null,
  }
}

export const normalizeSessionHistoryEntry = (row) => {
  if (!row) return null

  return {
    id: row.id,
    packageId: row.package_id,
    sessionDate: row.session_date,
    coachLabel: row.coach_label ?? '',
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

export const isPackageExpired = (pkg, now = new Date()) => {
  if (!pkg?.expiresAt) return false
  const expires = startOfDay(`${pkg.expiresAt}T12:00:00`)
  return startOfDay(now).getTime() > expires.getTime()
}

export const canRecordSession = (pkg, now = new Date()) =>
  Boolean(
    pkg &&
      pkg.sessionsRemaining > 0 &&
      !isPackageExpired(pkg, now),
  )

export const packageIsComplete = (pkg) =>
  Boolean(pkg && pkg.totalSessions > 0 && pkg.sessionsRemaining <= 0)

export const addSessionsToPackage = (
  pkg = emptySessionPackage(),
  count,
  options = {},
) => {
  const added = Math.max(0, Math.floor(Number(count) || 0))
  if (added <= 0) {
    return { ok: false, error: 'invalid_count' }
  }

  const isFirstPurchase = (pkg.totalSessions ?? 0) === 0
  const purchasedAt =
    options.purchasedAt ??
    (isFirstPurchase ? todayKey(options.now) : pkg.purchasedAt)

  return {
    ok: true,
    package: {
      ...pkg,
      totalSessions: (pkg.totalSessions ?? 0) + added,
      sessionsRemaining: (pkg.sessionsRemaining ?? 0) + added,
      sessionsUsed: pkg.sessionsUsed ?? 0,
      purchasedAt,
      expiresAt:
        options.expiresAt !== undefined
          ? options.expiresAt
          : pkg.expiresAt ?? null,
    },
    added,
  }
}

export const recordSessionOnPackage = (
  pkg,
  options = {},
) => {
  if (!canRecordSession(pkg, options.now)) {
    return { ok: false, error: 'no_sessions_remaining' }
  }

  const historyEntry = {
    id: options.historyId ?? createRuntimeId(),
    packageId: pkg.id,
    sessionDate: options.sessionDate ?? todayKey(options.now),
    coachLabel: options.coachLabel ?? 'Coach',
    note: options.note ?? '',
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
  }

  return {
    ok: true,
    package: {
      ...pkg,
      sessionsRemaining: pkg.sessionsRemaining - 1,
      sessionsUsed: pkg.sessionsUsed + 1,
    },
    historyEntry,
    undoSnapshot: {
      package: { ...pkg },
      historyEntryId: historyEntry.id,
    },
  }
}

export const undoSessionRecord = (
  pkg,
  history = [],
  undoSnapshot,
) => {
  if (!undoSnapshot?.historyEntryId || !undoSnapshot.package) {
    return { ok: false, error: 'missing_undo_snapshot' }
  }

  const entryExists = history.some(
    (item) => item.id === undoSnapshot.historyEntryId,
  )

  if (!entryExists) {
    return { ok: false, error: 'history_not_found' }
  }

  return {
    ok: true,
    package: { ...undoSnapshot.package },
    history: history.filter(
      (item) => item.id !== undoSnapshot.historyEntryId,
    ),
  }
}

export const formatPackageDate = (value) => {
  if (!value) return '—'
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const daysUntilExpiration = (pkg, now = new Date()) => {
  if (!pkg?.expiresAt) return null
  const expires = startOfDay(`${pkg.expiresAt}T12:00:00`).getTime()
  const today = startOfDay(now).getTime()
  return Math.round((expires - today) / DAY_MS)
}

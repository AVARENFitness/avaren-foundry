import {
  STATE_SCHEMA_VERSION,
  migrateStoredState,
} from './stateSchema'

const STORAGE_PREFIX = 'avaren-foundry-user'
const BACKUP_META_PREFIX = 'avaren-foundry-last-backup'

const keyFor = (userId) => `${STORAGE_PREFIX}:${String(userId)}`
const backupKeyFor = (userId) => `${BACKUP_META_PREFIX}:${String(userId)}`

export function normalizeAppState(value, fallback, userId = null) {
  return normalizeState(value, fallback, userId)
}

const normalizeState = (value, fallback, userId = null) => {
  const migrated = migrateStoredState(value ?? {}, fallback)

  return {
    ownerUserId: userId ?? migrated?.ownerUserId ?? null,
    ...fallback,
    ...migrated,
    schemaVersion: STATE_SCHEMA_VERSION,
    program: {
      ...fallback.program,
      ...(migrated?.program ?? {}),
      workouts: {
        ...fallback.program.workouts,
        ...(migrated?.program?.workouts ?? {}),
      },
    },
    weeklySchedule: migrated?.weeklySchedule ?? fallback.weeklySchedule,
    mobility: {
      ...(fallback.mobility ?? {}),
      ...(migrated?.mobility ?? {}),
      durationPreferences: {
        ...(fallback.mobility?.durationPreferences ?? {}),
        ...(migrated?.mobility?.durationPreferences ?? {}),
      },
      completed: migrated?.mobility?.completed ?? [],
    },
    readiness: {
      ...(fallback.readiness ?? {}),
      ...(migrated?.readiness ?? {}),
      entries: migrated?.readiness?.entries ?? [],
    },
    notifications: {
      ...(fallback.notifications ?? {}),
      ...(migrated?.notifications ?? {}),
    },
    onboarding: {
      ...(fallback.onboarding ?? {}),
      ...(migrated?.onboarding ?? {}),
    },
    coachWorkspace: {
      ...(fallback.coachWorkspace ?? {}),
      ...(migrated?.coachWorkspace ?? {}),
      clients:
        migrated?.coachWorkspace?.clients ??
        fallback.coachWorkspace?.clients ??
        [],
      invitations:
        migrated?.coachWorkspace?.invitations ??
        fallback.coachWorkspace?.invitations ??
        [],
      assignments:
        migrated?.coachWorkspace?.assignments ??
        fallback.coachWorkspace?.assignments ??
        [],
    },
    nutrition: {
      ...(fallback.nutrition ?? {}),
      ...(migrated?.nutrition ?? {}),
      goals: {
        ...(fallback.nutrition?.goals ?? {}),
        ...(migrated?.nutrition?.goals ?? {}),
      },
      days: migrated?.nutrition?.days ?? fallback.nutrition?.days ?? {},
      savedFoods:
        migrated?.nutrition?.savedFoods ??
        fallback.nutrition?.savedFoods ??
        [],
      recipes:
        migrated?.nutrition?.recipes ?? fallback.nutrition?.recipes ?? [],
      recentFoodIds:
        migrated?.nutrition?.recentFoodIds ??
        fallback.nutrition?.recentFoodIds ??
        [],
    },
    lastSavedAt: migrated?.lastSavedAt ?? null,
  }
}

export function loadState(fallback, userId) {
  if (!userId) return normalizeState({}, fallback, null)
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return normalizeState({}, fallback, userId)
    const parsed = JSON.parse(raw)
    if (parsed?.ownerUserId && parsed.ownerUserId !== userId) {
      console.warn('Ignored AVAREN cache owned by another user.')
      return normalizeState({}, fallback, userId)
    }
    return normalizeState(parsed, fallback, userId)
  } catch {
    return normalizeState({}, fallback, userId)
  }
}

export function saveState(value, userId) {
  if (!userId) return
  localStorage.setItem(
    keyFor(userId),
    JSON.stringify({
      ...value,
      ownerUserId: userId,
      schemaVersion: STATE_SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString(),
    }),
  )
}

export function exportState(value, userId) {
  const payload = {
    app: 'AVAREN — The Foundry',
    userId,
    exportedAt: new Date().toISOString(),
    schemaVersion: STATE_SCHEMA_VERSION,
    state: { ...value, ownerUserId: userId },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `foundry-backup-${new Date().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  localStorage.setItem(backupKeyFor(userId), new Date().toISOString())
}

export async function importState(file, fallback, userId) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  const imported = parsed?.state ?? parsed
  if (parsed?.userId && parsed.userId !== userId) {
    throw new Error('This backup belongs to a different AVAREN account.')
  }
  if (imported?.ownerUserId && imported.ownerUserId !== userId) {
    throw new Error('This backup belongs to a different AVAREN account.')
  }
  const normalized = normalizeState(imported, fallback, userId)
  localStorage.setItem(keyFor(userId), JSON.stringify(normalized))
  return normalized
}

export function lastBackupAt(userId) {
  return userId ? localStorage.getItem(backupKeyFor(userId)) : null
}

export function clearState(userId) {
  if (userId) localStorage.removeItem(keyFor(userId))
}

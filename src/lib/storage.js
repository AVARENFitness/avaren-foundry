const STORAGE_PREFIX = 'avaren-foundry-user'
const BACKUP_META_PREFIX = 'avaren-foundry-last-backup'
const SCHEMA_VERSION = 3

const keyFor = (userId) => `${STORAGE_PREFIX}:${String(userId)}`
const backupKeyFor = (userId) => `${BACKUP_META_PREFIX}:${String(userId)}`

const normalizeState = (value, fallback, userId = null) => ({
  ownerUserId: userId ?? value?.ownerUserId ?? null,
  ...fallback,
  ...value,
  schemaVersion: SCHEMA_VERSION,
  program: {
    ...fallback.program,
    ...(value?.program ?? {}),
    workouts: {
      ...fallback.program.workouts,
      ...(value?.program?.workouts ?? {}),
    },
  },
  weeklySchedule: value?.weeklySchedule ?? fallback.weeklySchedule,
  mobility: {
    ...(fallback.mobility ?? {}),
    ...(value?.mobility ?? {}),
    durationPreferences: {
      ...(fallback.mobility?.durationPreferences ?? {}),
      ...(value?.mobility?.durationPreferences ?? {}),
    },
    completed: value?.mobility?.completed ?? [],
  },
  readiness: {
    ...(fallback.readiness ?? {}),
    ...(value?.readiness ?? {}),
    entries: value?.readiness?.entries ?? [],
  },
  notifications: {
    ...(fallback.notifications ?? {}),
    ...(value?.notifications ?? {}),
  },
  onboarding: {
    ...(fallback.onboarding ?? {}),
    ...(value?.onboarding ?? {}),
  },
  coachWorkspace: {
    ...(fallback.coachWorkspace ?? {}),
    ...(value?.coachWorkspace ?? {}),
    clients:
      value?.coachWorkspace?.clients ??
      fallback.coachWorkspace?.clients ??
      [],
    invitations:
      value?.coachWorkspace?.invitations ??
      fallback.coachWorkspace?.invitations ??
      [],
    assignments:
      value?.coachWorkspace?.assignments ??
      fallback.coachWorkspace?.assignments ??
      [],
  },
  nutrition: {
    ...(fallback.nutrition ?? {}),
    ...(value?.nutrition ?? {}),
    goals: {
      ...(fallback.nutrition?.goals ?? {}),
      ...(value?.nutrition?.goals ?? {}),
    },
    days: value?.nutrition?.days ?? fallback.nutrition?.days ?? {},
    savedFoods: value?.nutrition?.savedFoods ?? fallback.nutrition?.savedFoods ?? [],
    recipes: value?.nutrition?.recipes ?? fallback.nutrition?.recipes ?? [],
    recentFoodIds: value?.nutrition?.recentFoodIds ?? fallback.nutrition?.recentFoodIds ?? [],
  },
  lastSavedAt: value?.lastSavedAt ?? null,
})

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
      schemaVersion: SCHEMA_VERSION,
      lastSavedAt: new Date().toISOString(),
    }),
  )
}

export function exportState(value, userId) {
  const payload = {
    app: 'AVAREN — The Foundry',
    userId,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
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

const STORAGE_PREFIX = 'avaren-foundry-user'
const BACKUP_META_PREFIX = 'avaren-foundry-last-backup'
const SCHEMA_VERSION = 2

const keyFor = (userId) => `${STORAGE_PREFIX}:${String(userId)}`
const backupKeyFor = (userId) => `${BACKUP_META_PREFIX}:${String(userId)}`

const normalizeState = (value, fallback) => ({
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
  lastSavedAt: value?.lastSavedAt ?? null,
})

export function loadState(fallback, userId) {
  if (!userId) return normalizeState({}, fallback)
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw
      ? normalizeState(JSON.parse(raw), fallback)
      : normalizeState({}, fallback)
  } catch {
    return normalizeState({}, fallback)
  }
}

export function saveState(value, userId) {
  if (!userId) return
  localStorage.setItem(
    keyFor(userId),
    JSON.stringify({
      ...value,
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
    state: value,
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
  const normalized = normalizeState(parsed?.state ?? parsed, fallback)
  localStorage.setItem(keyFor(userId), JSON.stringify(normalized))
  return normalized
}

export function lastBackupAt(userId) {
  return userId ? localStorage.getItem(backupKeyFor(userId)) : null
}

export function clearState(userId) {
  if (userId) localStorage.removeItem(keyFor(userId))
}

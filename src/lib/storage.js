const STORAGE_KEY = 'avaren-foundry-react-v1'
const BACKUP_META_KEY = 'avaren-foundry-last-backup'
const SCHEMA_VERSION = 2

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
  weeklySchedule: value?.weeklySchedule ?? {
    0: 'Rest',
    1: 'Chest + Back',
    2: 'Arms',
    3: 'Legs + Core',
    4: 'Chest + Back',
    5: 'Arms',
    6: 'Legs + Core',
  },
  lastSavedAt: value?.lastSavedAt ?? null,
})

export function loadState(fallback) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return normalizeState({}, fallback)
    return normalizeState(JSON.parse(raw), fallback)
  } catch {
    return normalizeState({}, fallback)
  }
}

export function saveState(value) {
  const saved = {
    ...value,
    schemaVersion: SCHEMA_VERSION,
    lastSavedAt: new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
}

export function exportState(value) {
  const payload = {
    app: 'AVAREN — The Foundry',
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
  localStorage.setItem(BACKUP_META_KEY, new Date().toISOString())
}

export async function importState(file, fallback) {
  const text = await file.text()
  const parsed = JSON.parse(text)
  const incoming = parsed?.state ?? parsed
  const normalized = normalizeState(incoming, fallback)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function lastBackupAt() {
  return localStorage.getItem(BACKUP_META_KEY)
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Pure helpers mirroring migration backfill rules for unit tests.
 */

export const isBackfillableLegacyHistoryEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, reason: 'not_object' }
  }

  const sessionId = String(entry.id ?? '').trim()
  if (!sessionId) return { ok: false, reason: 'missing_session_id' }

  const finishedAt = entry.finishedAt ?? entry.date ?? null
  const completedMs = finishedAt ? new Date(finishedAt).getTime() : Number.NaN
  if (!Number.isFinite(completedMs)) {
    return { ok: false, reason: 'missing_completed_at' }
  }

  return {
    ok: true,
    sessionId,
    completedAt: new Date(completedMs).toISOString(),
  }
}

export const backfillLegacyHistoryEntries = (
  legacyEntries = [],
  existingSessionIds = new Set(),
) => {
  const inserted = []
  let skipped = 0

  for (const entry of legacyEntries) {
    const check = isBackfillableLegacyHistoryEntry(entry)
    if (!check.ok) {
      skipped += 1
      continue
    }
    if (existingSessionIds.has(check.sessionId)) {
      skipped += 1
      continue
    }
    existingSessionIds.add(check.sessionId)
    inserted.push({
      session_id: check.sessionId,
      completed_at: check.completedAt,
      session_payload: entry,
      source: 'foundry_state_backfill',
    })
  }

  return { inserted, skipped, existingSessionIds }
}

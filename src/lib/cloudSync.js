import { supabase } from './supabase'
import { STATE_SCHEMA_VERSION } from './stateSchema'
import {
  isEmptyTrainingShell,
  mergeWorkoutHistory,
} from './athleteWorkoutHistory'

const stateTime = (state) => {
  const value = state?.lastSavedAt
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const startedAtTime = (workout) => {
  const time = workout?.startedAt ? new Date(workout.startedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export function chooseActiveWorkout(
  localActive,
  cloudActive,
  {
    localTime = 0,
    cloudTime = 0,
    localHistory = [],
  } = {},
) {
  if (!localActive && !cloudActive) return null

  if (!localActive) {
    if (
      cloudActive &&
      (localHistory ?? []).some((session) => session?.id === cloudActive.id)
    ) {
      return null
    }
    if (cloudActive && localTime > cloudTime) return null
    return cloudActive ?? null
  }

  if (!cloudActive) return localActive

  if (localActive.id === cloudActive.id) {
    return localTime >= cloudTime ? localActive : cloudActive
  }

  return startedAtTime(localActive) >= startedAtTime(cloudActive)
    ? localActive
    : cloudActive
}

export function mergeFoundryStates(localState, cloudState) {
  const local = localState && typeof localState === 'object' ? localState : {}
  const cloud = cloudState && typeof cloudState === 'object' ? cloudState : {}

  const localTime = stateTime(local)
  const cloudTime = stateTime(cloud)
  const base = localTime >= cloudTime ? local : cloud
  const other = localTime >= cloudTime ? cloud : local

  const history = mergeWorkoutHistory(cloud.history, local.history)
  const activeWorkout = chooseActiveWorkout(local.activeWorkout, cloud.activeWorkout, {
    localTime,
    cloudTime,
    localHistory: history,
  })

  return {
    ...other,
    ...base,
    history,
    activeWorkout,
    lastSavedAt:
      localTime >= cloudTime
        ? local.lastSavedAt ?? cloud.lastSavedAt ?? null
        : cloud.lastSavedAt ?? local.lastSavedAt ?? null,
  }
}

export async function loadCloudState(userId) {
  const { data, error } = await supabase
    .from('foundry_state')
    .select('state, schema_version, updated_at, state_revision')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    // Older schemas may lack state_revision until 9.1 migration.
    if (/state_revision/i.test(error.message ?? '')) {
      const fallback = await supabase
        .from('foundry_state')
        .select('state, schema_version, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (fallback.error) throw fallback.error
      if (fallback.data?.state?.ownerUserId && fallback.data.state.ownerUserId !== userId) {
        console.warn('Ignored cloud state owned by another AVAREN user.')
        return null
      }
      return fallback.data ? { ...fallback.data, state_revision: 0 } : null
    }
    throw error
  }
  if (data?.state?.ownerUserId && data.state.ownerUserId !== userId) {
    console.warn('Ignored cloud state owned by another AVAREN user.')
    return null
  }
  return data
}

export async function saveCloudState(userId, state) {
  const existing = await loadCloudState(userId)
  const mergedState = mergeFoundryStates(state, existing?.state)

  // Never let an empty/stale shell erase richer cloud history.
  if (
    isEmptyTrainingShell(state) &&
    !isEmptyTrainingShell(existing?.state ?? {})
  ) {
    return existing?.updated_at ?? null
  }

  const payload = {
    user_id: userId,
    state: { ...mergedState, ownerUserId: userId },
    schema_version: STATE_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
    state_revision: Number(existing?.state_revision ?? 0) + 1,
  }

  const { error } = await supabase
    .from('foundry_state')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    if (/state_revision/i.test(error.message ?? '')) {
      const legacyPayload = {
        user_id: userId,
        state: payload.state,
        schema_version: payload.schema_version,
        updated_at: payload.updated_at,
      }
      const legacy = await supabase
        .from('foundry_state')
        .upsert(legacyPayload, { onConflict: 'user_id' })
      if (legacy.error) throw legacy.error
      return legacyPayload.updated_at
    }
    throw error
  }
  return payload.updated_at
}

export function chooseNewestState(localState, cloudRecord) {
  const cloudState = cloudRecord?.state
  const cloudIsEmpty =
    !cloudState ||
    (typeof cloudState === 'object' &&
      !Array.isArray(cloudState) &&
      Object.keys(cloudState).length === 0)

  if (cloudIsEmpty) {
    return {
      state: localState,
      source: 'local',
      uploadLocal: !isEmptyTrainingShell(localState),
    }
  }

  const localTime = stateTime(localState)
  const cloudTime = Math.max(
    stateTime(cloudState),
    cloudRecord?.updated_at
      ? new Date(cloudRecord.updated_at).getTime()
      : 0,
  )

  const merged = mergeFoundryStates(localState, cloudState)
  const localIsEmptyShell = isEmptyTrainingShell(localState)
  const cloudHasHistory = (cloudState?.history?.length ?? 0) > 0

  // Fresh/stale empty device must adopt cloud, never upload a wipe.
  if (localIsEmptyShell && cloudHasHistory) {
    return { state: merged, source: 'cloud', uploadLocal: false }
  }

  if (localTime > cloudTime && !localIsEmptyShell) {
    return { state: merged, source: 'local', uploadLocal: true }
  }

  const localOnlySessions = (localState?.history ?? []).some(
    (session) =>
      session?.id &&
      !(cloudState?.history ?? []).some((item) => item?.id === session.id),
  )

  return {
    state: merged,
    source: localTime > cloudTime ? 'local' : 'cloud',
    uploadLocal: localOnlySessions,
  }
}

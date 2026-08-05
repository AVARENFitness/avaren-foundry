import { supabase } from './supabase'

const CLOUD_SCHEMA_VERSION = 2

const stateTime = (state) => {
  const value = state?.lastSavedAt
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export async function loadCloudState(userId) {
  const { data, error } = await supabase
    .from('foundry_state')
    .select('state, schema_version, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (data?.state?.ownerUserId && data.state.ownerUserId !== userId) {
    console.warn('Ignored cloud state owned by another AVAREN user.')
    return null
  }
  return data
}

export async function saveCloudState(userId, state) {
  const payload = {
    user_id: userId,
    state: { ...state, ownerUserId: userId },
    schema_version: CLOUD_SCHEMA_VERSION,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('foundry_state')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) throw error
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
    return { state: localState, source: 'local', uploadLocal: true }
  }

  const localTime = stateTime(localState)
  const cloudTime = Math.max(
    stateTime(cloudState),
    cloudRecord?.updated_at
      ? new Date(cloudRecord.updated_at).getTime()
      : 0,
  )

  if (localTime > cloudTime) {
    return { state: localState, source: 'local', uploadLocal: true }
  }

  return { state: cloudState, source: 'cloud', uploadLocal: false }
}

import { supabase } from './supabase'

export const isMissingIdentityTable = (error) =>
  error?.code === '42P01' ||
  error?.code === '42883' ||
  /does not exist|relation .* does not exist/i.test(error?.message ?? '')

const emptyCapabilities = () => ({
  userProfiles: false,
  coachClientLabels: false,
  probedAt: null,
})

let cachedCapabilities = emptyCapabilities()

export const getIdentityCapabilities = () => ({ ...cachedCapabilities })

export const resetIdentityCapabilitiesCache = () => {
  cachedCapabilities = emptyCapabilities()
}

export const probeIdentityCapabilities = async ({ force = false } = {}) => {
  if (cachedCapabilities.probedAt && !force) {
    return getIdentityCapabilities()
  }

  if (!supabase) {
    cachedCapabilities = emptyCapabilities()
    return getIdentityCapabilities()
  }

  const next = emptyCapabilities()

  const profileProbe = await supabase.from('user_profiles').select('user_id').limit(1)
  if (!profileProbe.error || !isMissingIdentityTable(profileProbe.error)) {
    next.userProfiles = !profileProbe.error
  }

  const labelProbe = await supabase
    .from('coach_client_labels')
    .select('coach_id')
    .limit(1)
  if (!labelProbe.error || !isMissingIdentityTable(labelProbe.error)) {
    next.coachClientLabels = !labelProbe.error
  }

  next.probedAt = Date.now()
  cachedCapabilities = next
  return getIdentityCapabilities()
}

/**
 * Internal readiness check after migration — no private field logging.
 */
export const checkPostMigrationIdentityReadiness = async ({
  coachMode = false,
} = {}) => {
  const capabilities = await probeIdentityCapabilities({ force: true })
  const result = {
    capabilities,
    ownProfileReadable: false,
    ownProfileUpsertable: false,
    coachClientProfilesReadable: false,
    coachLabelsReachable: false,
    athleteCoachLabelsBlocked: true,
  }

  if (!capabilities.userProfiles) {
    return result
  }

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return result
  }

  const ownRead = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()

  result.ownProfileReadable = !ownRead.error

  if (coachMode && capabilities.coachClientLabels) {
    const labelRead = await supabase
      .from('coach_client_labels')
      .select('coach_id')
      .limit(1)

    result.coachLabelsReachable = !labelRead.error

    const athleteLabelRead = await supabase
      .from('coach_client_labels')
      .select('coach_id')
      .eq('athlete_id', authData.user.id)
      .limit(1)

    result.athleteCoachLabelsBlocked =
      Boolean(athleteLabelRead.error) ||
      (athleteLabelRead.data ?? []).length === 0
  }

  if (coachMode) {
    const rosterProbe = await supabase
      .from('user_profiles')
      .select('user_id')
      .limit(1)

    result.coachClientProfilesReadable = !rosterProbe.error
  }

  result.ownProfileUpsertable = result.ownProfileReadable

  return result
}

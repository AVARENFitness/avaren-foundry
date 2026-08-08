import { supabase } from './supabase'
import { isMissingIdentityTable } from './identityCapabilities'
import { normalizeWhitespace } from './clientDisplayName'

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

export const normalizeUserProfile = (row = {}) => ({
  user_id: row.user_id ?? row.userId ?? null,
  first_name: normalizeWhitespace(row.first_name ?? ''),
  last_name: normalizeWhitespace(row.last_name ?? ''),
  preferred_name: normalizeWhitespace(row.preferred_name ?? ''),
  display_name: normalizeWhitespace(row.display_name ?? ''),
  updated_at: row.updated_at ?? null,
})

export const profileSeedFromAuthUser = (user = {}) => {
  const meta = user.user_metadata ?? {}

  return {
    first_name: normalizeWhitespace(meta.first_name ?? meta.firstName ?? ''),
    last_name: normalizeWhitespace(meta.last_name ?? meta.lastName ?? ''),
    preferred_name: normalizeWhitespace(
      meta.preferred_name ?? meta.preferredName ?? '',
    ),
    display_name: normalizeWhitespace(
      meta.display_name ?? meta.full_name ?? meta.name ?? '',
    ),
  }
}

export const mergeProfileWithoutBlankOverwrite = (existing = null, patch = {}) => {
  const base = normalizeUserProfile(existing ?? {})
  const next = normalizeUserProfile(patch)

  return {
    first_name: next.first_name || base.first_name,
    last_name: next.last_name || base.last_name,
    preferred_name: next.preferred_name || base.preferred_name,
    display_name: next.display_name || base.display_name,
  }
}

export const sanitizeOwnProfileDraft = (draft = {}) =>
  normalizeUserProfile({
    first_name: draft.first_name ?? draft.firstName ?? '',
    last_name: draft.last_name ?? draft.lastName ?? '',
    preferred_name: draft.preferred_name ?? draft.preferredName ?? '',
    display_name: draft.display_name ?? draft.displayName ?? '',
  })

export const userProfileBackend = {
  async getUserProfile(userId) {
    if (!supabase || !userId) return null

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      if (isMissingIdentityTable(error)) return null
      throw error
    }

    return data ? normalizeUserProfile(data) : null
  },

  async listProfilesForAthletes(athleteIds = []) {
    if (!supabase || !athleteIds.length) return {}

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', athleteIds)

    if (error) {
      if (isMissingIdentityTable(error)) return {}
      throw error
    }

    return Object.fromEntries(
      (data ?? []).map((row) => [row.user_id, normalizeUserProfile(row)]),
    )
  },

  async upsertOwnUserProfile(patch = {}, { user: providedUser } = {}) {
    if (!supabase) return null

    const user = providedUser ?? (await currentUser())
    const existing = await this.getUserProfile(user.id)

    if (existing === null && !providedUser) {
      const probe = await supabase.from('user_profiles').select('user_id').limit(1)
      if (probe.error && isMissingIdentityTable(probe.error)) {
        return null
      }
    }

    const merged = mergeProfileWithoutBlankOverwrite(existing, patch)
    const payload = {
      user_id: user.id,
      first_name: merged.first_name,
      last_name: merged.last_name,
      preferred_name: merged.preferred_name,
      display_name: merged.display_name,
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      if (isMissingIdentityTable(error)) return null
      throw error
    }

    return normalizeUserProfile(data)
  },

  async updateOwnUserProfile(patch = {}) {
    return this.upsertOwnUserProfile(patch)
  },

  async ensureOwnUserProfileFromSession(user) {
    if (!supabase || !user?.id) return null

    const existing = await this.getUserProfile(user.id)
    if (existing) return existing

    const seed = profileSeedFromAuthUser(user)
    const hasSeed =
      seed.first_name ||
      seed.last_name ||
      seed.preferred_name ||
      seed.display_name

    if (!hasSeed) return null

    return this.upsertOwnUserProfile(seed, { user })
  },
}

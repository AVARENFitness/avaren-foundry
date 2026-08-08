import { supabase } from './supabase'
import { isMissingIdentityTable } from './identityCapabilities'

const normalizeWhitespace = (value = '') =>
  String(value ?? '').trim().replace(/\s+/g, ' ')

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

export const normalizeCoachClientLabel = (row = {}) => ({
  coach_id: row.coach_id ?? null,
  athlete_id: row.athlete_id ?? null,
  coach_label: normalizeWhitespace(row.coach_label ?? ''),
  updated_at: row.updated_at ?? null,
})

export const coachClientLabelsBackend = {
  async listOwnCoachLabels() {
    if (!supabase) return {}

    const user = await currentUser()
    const { data, error } = await supabase
      .from('coach_client_labels')
      .select('*')
      .eq('coach_id', user.id)

    if (error) {
      if (isMissingIdentityTable(error)) return {}
      throw error
    }

    return Object.fromEntries(
      (data ?? []).map((row) => [
        row.athlete_id,
        normalizeCoachClientLabel(row),
      ]),
    )
  },

  async getCoachLabel(athleteId) {
    const labels = await this.listOwnCoachLabels()
    return labels[athleteId]?.coach_label ?? ''
  },

  async upsertCoachLabel(athleteId, coachLabel = '') {
    if (!supabase || !athleteId) return null

    const user = await currentUser()
    const label = normalizeWhitespace(coachLabel)

    const { data, error } = await supabase
      .from('coach_client_labels')
      .upsert(
        {
          coach_id: user.id,
          athlete_id: athleteId,
          coach_label: label,
        },
        { onConflict: 'coach_id,athlete_id' },
      )
      .select()
      .single()

    if (error) {
      if (isMissingIdentityTable(error)) return null
      throw error
    }

    return normalizeCoachClientLabel(data)
  },

  async deleteCoachLabel(athleteId) {
    if (!supabase || !athleteId) return null

    const user = await currentUser()
    const { error } = await supabase
      .from('coach_client_labels')
      .delete()
      .eq('coach_id', user.id)
      .eq('athlete_id', athleteId)

    if (error) {
      if (isMissingIdentityTable(error)) return null
      throw error
    }

    return true
  },
}

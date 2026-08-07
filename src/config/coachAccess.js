import { isSupabaseConfigured, supabase } from '../lib/supabase'

const normalizeEmail = (value = '') =>
  String(value).trim().toLowerCase()

const OWNER_COACH_EMAIL =
  normalizeEmail('hello@avarenfitness.com')

export const isCoachAccount = (session) =>
  Boolean(
    OWNER_COACH_EMAIL &&
    normalizeEmail(
      session?.user?.email,
    ) === OWNER_COACH_EMAIL,
  )

export const coachOwnerEmail =
  OWNER_COACH_EMAIL

export async function fetchCoachAuthorization(session) {
  if (!session?.user) return false
  if (isCoachAccount(session)) return true

  try {
    if (!isSupabaseConfigured) return false

    const { data, error } = await supabase.rpc('is_avaren_coach')
    if (error) return false
    return Boolean(data)
  } catch {
    return false
  }
}

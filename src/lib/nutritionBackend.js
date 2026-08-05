import { supabase } from './supabase'

const unwrap = async (promise) => {
  const { data, error } = await promise
  if (error) throw error
  return data
}

export const nutritionBackend = {
  async syncProfile(userId, nutrition) {
    if (!supabase || !userId) return
    return unwrap(
      supabase.from('nutrition_profiles').upsert({
        user_id: userId,
        goals: nutrition.goals ?? {},
        coach_access: Boolean(nutrition.goals?.coachAccess),
        updated_at: new Date().toISOString(),
      }),
    )
  },

  async syncDay(userId, day) {
    if (!supabase || !userId || !day?.date) return
    return unwrap(
      supabase.from('nutrition_days').upsert({
        user_id: userId,
        log_date: day.date,
        snapshot: day,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,log_date' }),
    )
  },
}

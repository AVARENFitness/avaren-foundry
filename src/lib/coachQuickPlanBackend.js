import { supabase } from './supabase'

const emptyPlan = () => ({ title: 'Training plan', focus: '', coach_notes: '', exercises: [] })

export const coachQuickPlanBackend = {
  async get(businessClientId) {
    const { data, error } = await supabase.from('coach_client_quick_plans')
      .select('id,title,focus,coach_notes,exercises,updated_at')
      .eq('business_client_id', businessClientId).maybeSingle()
    if (error) throw error
    return data ?? emptyPlan()
  },
  async getForAthlete() {
    const { data, error } = await supabase.from('coach_client_quick_plans')
      .select('id,title,focus,coach_notes,exercises,updated_at')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return data
  },
  async save({ businessClientId, plan }) {
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user?.id) throw new Error('Sign in to save the plan.')
    const title = String(plan.title ?? '').trim().slice(0,120)
    if (!title) throw new Error('Give this plan a title.')
    const exercises = (plan.exercises ?? []).slice(0,80).map((row) => ({
      id: String(row.id ?? '').slice(0,100),
      name: String(row.name ?? '').slice(0,160),
      sets: String(row.sets ?? '').slice(0,24),
      reps: String(row.reps ?? '').slice(0,30),
      load: String(row.load ?? '').slice(0,50),
      notes: String(row.notes ?? '').slice(0,320),
    }))
    const { data, error } = await supabase.from('coach_client_quick_plans')
      .upsert({
        coach_id: auth.user.id, business_client_id: businessClientId,
        title, focus: String(plan.focus ?? '').slice(0,120),
        coach_notes: String(plan.coach_notes ?? '').slice(0,4000),
        exercises, updated_at: new Date().toISOString(),
      }, { onConflict: 'coach_id,business_client_id' })
      .select('id,title,focus,coach_notes,exercises,updated_at').single()
    if (error) throw error
    return data
  },
}

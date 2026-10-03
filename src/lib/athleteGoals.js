import { supabase } from './supabase'

export const ATHLETE_GOAL_TYPES = [
  { value: 'lose_fat', label: 'Fat loss' },
  { value: 'build_muscle', label: 'Build muscle' },
  { value: 'performance', label: 'Performance' },
  { value: 'consistency', label: 'Training consistency' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'general_fitness', label: 'General fitness' },
]

export const ATHLETE_GOAL_LABELS = Object.fromEntries(
  ATHLETE_GOAL_TYPES.map((item) => [item.value, item.label]),
)

export const GOAL_PRIORITY_AREAS = [
  'Strength',
  'Muscle',
  'Body composition',
  'Conditioning',
  'Consistency',
  'Recovery',
  'Mobility',
  'Nutrition',
]

export const normalizeAthleteGoal = (row = null) => {
  if (!row) return null

  return {
    athleteId: row.athlete_id ?? row.athleteId ?? null,
    primaryGoal: row.primary_goal ?? row.primaryGoal ?? '',
    targetLabel: row.target_label ?? row.targetLabel ?? '',
    targetValue:
      row.target_value == null || row.targetValue == null
        ? row.target_value ?? row.targetValue ?? null
        : Number(row.target_value ?? row.targetValue),
    targetUnit: row.target_unit ?? row.targetUnit ?? '',
    targetDate: row.target_date ?? row.targetDate ?? '',
    priorityAreas: Array.isArray(row.priority_areas ?? row.priorityAreas)
      ? row.priority_areas ?? row.priorityAreas
      : [],
    note: row.note ?? '',
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export const sanitizeAthleteGoalDraft = (draft = {}) => {
  const rawValue = String(draft.targetValue ?? '').trim()
  const targetValue =
    rawValue === ''
      ? null
      : Number.isFinite(Number(rawValue))
        ? Number(rawValue)
        : null

  return {
    primaryGoal: String(draft.primaryGoal ?? '').trim(),
    targetLabel: String(draft.targetLabel ?? '').trim().slice(0, 80),
    targetValue,
    targetUnit: String(draft.targetUnit ?? '').trim().slice(0, 24),
    targetDate: String(draft.targetDate ?? '').trim(),
    priorityAreas: [...new Set(
      (draft.priorityAreas ?? [])
        .map((value) => String(value).trim())
        .filter(Boolean),
    )].slice(0, 5),
    note: String(draft.note ?? '').trim().slice(0, 280),
  }
}

export const athleteGoalBackend = {
  async getAthleteGoal(athleteId) {
    if (!supabase || !athleteId) return null

    const { data, error } = await supabase
      .from('athlete_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .maybeSingle()

    if (error) throw error
    return normalizeAthleteGoal(data)
  },

  async upsertOwnGoal(draft = {}) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user) throw new Error('You must be signed in.')

    const clean = sanitizeAthleteGoalDraft(draft)
    if (!ATHLETE_GOAL_LABELS[clean.primaryGoal]) {
      throw new Error('Choose a primary goal.')
    }

    const { data, error } = await supabase
      .from('athlete_goals')
      .upsert(
        {
          athlete_id: user.id,
          primary_goal: clean.primaryGoal,
          target_label: clean.targetLabel,
          target_value: clean.targetValue,
          target_unit: clean.targetUnit,
          target_date: clean.targetDate || null,
          priority_areas: clean.priorityAreas,
          note: clean.note,
        },
        { onConflict: 'athlete_id' },
      )
      .select('*')
      .single()

    if (error) throw error
    return normalizeAthleteGoal(data)
  },
}

export const formatGoalTarget = (goal = null) => {
  if (!goal) return ''

  const hasValue =
    goal.targetValue !== null &&
    goal.targetValue !== undefined &&
    Number.isFinite(Number(goal.targetValue))
  const value = hasValue ? Number(goal.targetValue) : null
  const numeric = value == null ? '' : String(value)
  const unit = String(goal.targetUnit ?? '').trim()
  const label = String(goal.targetLabel ?? '').trim()

  if (label && numeric) {
    return [label, numeric, unit].filter(Boolean).join(' · ')
  }

  if (label) return label
  if (numeric) return [numeric, unit].filter(Boolean).join(' ')
  return ''
}

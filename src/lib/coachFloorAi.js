import { supabase } from './supabase'

export const COACH_FLOOR_AI_MODE = {
  PRE_SESSION: 'pre_session',
  ORGANIZE_NOTE: 'organize_note',
  RECAP: 'recap',
}

export async function requestCoachFloorAssist({
  scheduledSessionId,
  mode,
  workout,
  coachNote = '',
  previousSession = null,
  clientName = '',
}) {
  const { data, error } = await supabase.functions.invoke('coach-floor-assist', {
    body: {
      scheduledSessionId,
      mode,
      workout,
      coachNote,
      previousSession,
      clientName,
    },
  })

  if (error) throw error
  if (!data?.ok) {
    throw new Error(data?.reason ?? 'AVA could not prepare this coaching assist.')
  }
  return data
}

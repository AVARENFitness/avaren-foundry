import { appUi } from './appUi'

/** Visible duration for successful important writes (assignments, saves, schedules). */
export const WRITE_SUCCESS_TOAST_DURATION_MS = 4500

export function toastWorkoutAssigned(clientDisplayName) {
  const name = String(clientDisplayName ?? '').trim() || 'client'
  appUi.toast(`Workout assigned to ${name}`, 'success', {
    durationMs: WRITE_SUCCESS_TOAST_DURATION_MS,
  })
}

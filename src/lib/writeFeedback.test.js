import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  WRITE_SUCCESS_TOAST_DURATION_MS,
  toastWorkoutAssigned,
} from './writeFeedback'
import { appUi } from './appUi'

vi.mock('./appUi', () => ({
  appUi: {
    toast: vi.fn(),
  },
}))

describe('writeFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows assignment success toast with client display name', () => {
    toastWorkoutAssigned('Jake')

    expect(appUi.toast).toHaveBeenCalledWith(
      'Workout assigned to Jake',
      'success',
      { durationMs: WRITE_SUCCESS_TOAST_DURATION_MS },
    )
  })

  it('uses standard write-success duration (~4.5s)', () => {
    expect(WRITE_SUCCESS_TOAST_DURATION_MS).toBeGreaterThanOrEqual(3000)
    expect(WRITE_SUCCESS_TOAST_DURATION_MS).toBeLessThanOrEqual(5000)
  })
})

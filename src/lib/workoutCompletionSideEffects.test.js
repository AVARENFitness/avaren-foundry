import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPLETION_SIDE_EFFECT,
  enqueueWorkoutCompletionSideEffects,
  flushWorkoutCompletionSideEffects,
  listQueuedWorkoutCompletionSideEffects,
} from './workoutCompletionSideEffects'

describe('workoutCompletionSideEffects', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('queues assignment completion and appointment linkage once per workout', () => {
    const payload = {
      assignmentId: 'assign-1',
      scheduledSessionId: 'appt-1',
      workoutSessionId: 'session-1',
      completionSummary: { sets: 12, volume: 8450 },
      completedAt: '2026-10-03T15:20:00.000Z',
    }

    enqueueWorkoutCompletionSideEffects('athlete-1', payload)
    enqueueWorkoutCompletionSideEffects('athlete-1', payload)

    const queue = listQueuedWorkoutCompletionSideEffects('athlete-1')
    expect(queue).toHaveLength(2)
    expect(queue.map((item) => item.type)).toEqual([
      COMPLETION_SIDE_EFFECT.ASSIGNMENT_COMPLETE,
      COMPLETION_SIDE_EFFECT.APPOINTMENT_LINK,
    ])
  })

  it('flushes both coach-side effects and clears the queue', async () => {
    enqueueWorkoutCompletionSideEffects('athlete-1', {
      assignmentId: 'assign-1',
      scheduledSessionId: 'appt-1',
      workoutSessionId: 'session-1',
      completionSummary: { sets: 12 },
      completedAt: '2026-10-03T15:20:00.000Z',
    })

    const markAssignmentCompleted = vi.fn().mockResolvedValue({})
    const linkAppointmentWorkout = vi.fn().mockResolvedValue({})

    const result = await flushWorkoutCompletionSideEffects('athlete-1', {
      markAssignmentCompleted,
      linkAppointmentWorkout,
    })

    expect(markAssignmentCompleted).toHaveBeenCalledWith(
      'assign-1',
      'session-1',
      expect.objectContaining({
        sets: 12,
        completedAt: '2026-10-03T15:20:00.000Z',
      }),
    )
    expect(linkAppointmentWorkout).toHaveBeenCalledWith(
      'appt-1',
      'session-1',
    )
    expect(result).toEqual({ flushed: 2, remaining: 0 })
    expect(listQueuedWorkoutCompletionSideEffects('athlete-1')).toEqual([])
  })

  it('keeps a failed side effect queued for reconnect replay', async () => {
    enqueueWorkoutCompletionSideEffects('athlete-1', {
      assignmentId: 'assign-1',
      workoutSessionId: 'session-1',
      completionSummary: { sets: 8 },
      completedAt: '2026-10-03T15:20:00.000Z',
    })

    const markAssignmentCompleted = vi
      .fn()
      .mockRejectedValue(new Error('network_failed'))

    const result = await flushWorkoutCompletionSideEffects('athlete-1', {
      markAssignmentCompleted,
      linkAppointmentWorkout: vi.fn(),
    })

    expect(result).toEqual({ flushed: 0, remaining: 1 })
    expect(listQueuedWorkoutCompletionSideEffects('athlete-1')).toHaveLength(1)
  })

  it('clears successful work but keeps the remaining failed operation', async () => {
    enqueueWorkoutCompletionSideEffects('athlete-1', {
      assignmentId: 'assign-1',
      scheduledSessionId: 'appt-1',
      workoutSessionId: 'session-1',
      completionSummary: { sets: 10 },
    })

    const result = await flushWorkoutCompletionSideEffects('athlete-1', {
      markAssignmentCompleted: vi.fn().mockResolvedValue({}),
      linkAppointmentWorkout: vi
        .fn()
        .mockRejectedValue(new Error('offline')),
    })

    expect(result).toEqual({ flushed: 1, remaining: 1 })
    expect(listQueuedWorkoutCompletionSideEffects('athlete-1')).toEqual([
      expect.objectContaining({
        type: COMPLETION_SIDE_EFFECT.APPOINTMENT_LINK,
        scheduledSessionId: 'appt-1',
        workoutSessionId: 'session-1',
      }),
    ])
  })
})

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useWorkoutSession } from './useWorkoutSession'
import { makeActiveSet } from '../lib/materializeWorkoutExercise'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    markAssignmentStarted: vi.fn(async () => {}),
    markAssignmentCompleted: vi.fn(async () => {}),
    listAthleteScheduledSessions: vi.fn(async () => []),
    updateScheduledSession: vi.fn(async () => {}),
  },
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
    confirm: vi.fn(async () => true),
  },
}))

function buildState(overrides = {}) {
  return {
    profile: { weight: 180 },
    bodyweight: 180,
    selectedWorkout: 'Arms',
    activeWorkout: null,
    program: {
      rotation: ['Arms'],
      nextWorkout: 'Arms',
      workouts: {
        Arms: [
          { name: 'Exercise 1', sets: 1, muscle: 'Shoulders' },
          { name: 'Lateral Raise', sets: 1, muscle: 'Shoulders', supersetGroup: 'A' },
          { name: 'Incline Curl', sets: 1, muscle: 'Biceps', supersetGroup: 'A' },
          { name: 'Exercise 4', sets: 1, muscle: 'Triceps' },
        ],
      },
    },
    history: [],
    achievements: [],
    weeklySchedule: {},
    sessionExecutionPlan: null,
    ...overrides,
  }
}

describe('useWorkoutSession reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses existing active session on double start', () => {
    const navigate = vi.fn()
    const setState = vi.fn()
    const activeWorkout = {
      id: 'session-1',
      name: 'Arms',
      exercises: [],
      activeExerciseIndex: 1,
    }

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: buildState({ activeWorkout }),
        setState,
        navigate,
      }),
    )

    act(() => {
      result.current.startWorkout()
    })

    expect(navigate).toHaveBeenCalledWith('gym')
    expect(setState).not.toHaveBeenCalled()
  })

  it('persists superset round on active workout', () => {
    const setState = vi.fn((updater) => {
      if (typeof updater === 'function') {
        updater(buildState({
          activeWorkout: {
            id: 'session-1',
            name: 'Arms',
            exercises: [],
            activeExerciseIndex: 2,
          },
        }))
      }
    })

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: buildState({
          activeWorkout: {
            id: 'session-1',
            name: 'Arms',
            exercises: [],
            activeExerciseIndex: 2,
          },
        }),
        setState,
        navigate: vi.fn(),
      }),
    )

    act(() => {
      result.current.updateSupersetRound('A', 2)
    })

    expect(setState).toHaveBeenCalled()
    const nextState = setState.mock.calls.at(-1)[0](
      buildState({
        activeWorkout: {
          id: 'session-1',
          name: 'Arms',
          exercises: [],
          activeExerciseIndex: 2,
        },
      }),
    )

    expect(nextState.activeWorkout.supersetRoundByGroup).toEqual({ A: 2 })
  })

  it('does not duplicate history when finishing an already saved session', async () => {
    const navigate = vi.fn()
    const setState = vi.fn()
    const workout = {
      id: 'session-1',
      name: 'Arms',
      date: '2026-08-17',
      startedAt: '2026-08-17T20:00:00.000Z',
      exercises: [
        {
          id: 'ex-1',
          name: 'Exercise 1',
          muscle: 'Shoulders',
          loadType: 'external',
          sets: [{ ...makeActiveSet(1, 'Working'), weight: 25, reps: 8, done: true }],
        },
      ],
    }

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: buildState({
          activeWorkout: workout,
          history: [{ id: 'session-1', name: 'Arms', sets: [] }],
        }),
        setState,
        navigate,
      }),
    )

    await act(async () => {
      await result.current.finishWorkout()
    })

    expect(navigate).toHaveBeenCalledWith('home')
  })

  it('reuses active coach assignment session instead of creating another', async () => {
    const navigate = vi.fn()
    const setState = vi.fn()
    const activeWorkout = {
      id: 'session-1',
      assignmentId: 'assign-1',
      name: 'Arms',
      exercises: [],
      activeExerciseIndex: 0,
    }

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: buildState({ activeWorkout }),
        setState,
        navigate,
      }),
    )

    await act(async () => {
      await result.current.startCoachAssignment({
        id: 'assign-1',
        workout_payload: {
          name: 'Arms',
          exercises: [{ name: 'Bench', sets: 3, muscle: 'Chest' }],
        },
      })
    })

    expect(navigate).toHaveBeenCalledWith('gym')
    expect(setState).not.toHaveBeenCalled()
  })

  it('inserts quick-add exercise after the current active exercise', () => {
    const programSnapshot = structuredClone(
      buildState().program.workouts.Arms,
    )
    let latestState = buildState({
      activeWorkout: {
        id: 'session-1',
        name: 'Arms',
        activeExerciseIndex: 2,
        exercises: [
          {
            id: 'ex-1',
            name: 'Bench Press',
            sets: [{ number: 1, done: true, weight: 135, reps: 8 }],
          },
          {
            id: 'ex-2',
            name: 'Incline Press',
            sets: [{ number: 1, done: true, weight: 95, reps: 8 }],
          },
          {
            id: 'ex-3',
            name: 'Cable Fly',
            sets: [{ number: 1, done: false, weight: 40, reps: 12 }],
          },
          {
            id: 'ex-4',
            name: 'Triceps Pushdown',
            sets: [{ number: 1, done: false, weight: 50, reps: 10 }],
          },
          {
            id: 'ex-5',
            name: 'Lateral Raise',
            sets: [{ number: 1, done: false, weight: 20, reps: 12 }],
          },
        ],
      },
    })

    const setState = vi.fn((updater) => {
      latestState =
        typeof updater === 'function' ? updater(latestState) : updater
    })

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: latestState,
        setState,
        navigate: vi.fn(),
      }),
    )

    act(() => {
      result.current.quickAddExercise({
        name: 'Pec Deck',
        sets: 3,
        muscle: 'Chest',
      })
    })

    const session = latestState.activeWorkout
    expect(session.activeExerciseIndex).toBe(2)
    expect(session.exercises.map((item) => item.name)).toEqual([
      'Bench Press',
      'Incline Press',
      'Cable Fly',
      'Pec Deck',
      'Triceps Pushdown',
      'Lateral Raise',
    ])
    expect(session.exercises[0].sets[0]).toMatchObject({
      done: true,
      weight: 135,
    })
    expect(session.exercises[3]).toMatchObject({
      name: 'Pec Deck',
      oneTime: true,
    })
    expect(session.exercises[4].id).toBe('ex-4')
    expect(latestState.program.workouts.Arms).toEqual(programSnapshot)
  })

  it('persists inserted order on the active session for resume/rehydration', () => {
    let latestState = buildState({
      activeWorkout: {
        id: 'session-1',
        name: 'Arms',
        activeExerciseIndex: 0,
        exercises: [
          { id: 'ex-1', name: 'A', sets: [] },
          { id: 'ex-2', name: 'B', sets: [] },
        ],
      },
    })

    const setState = vi.fn((updater) => {
      latestState =
        typeof updater === 'function' ? updater(latestState) : updater
    })

    const { result } = renderHook(() =>
      useWorkoutSession({
        state: latestState,
        setState,
        navigate: vi.fn(),
      }),
    )

    act(() => {
      result.current.quickAddExercise({
        name: 'Inserted',
        sets: 2,
        muscle: 'Chest',
      })
    })

    const persisted = structuredClone(latestState.activeWorkout)
    expect(persisted.activeExerciseIndex).toBe(0)
    expect(persisted.exercises.map((item) => item.name)).toEqual([
      'A',
      'Inserted',
      'B',
    ])

    // Rehydration reads the same activeWorkout blob — order must still be session order.
    expect(persisted.exercises[1].oneTime).toBe(true)
    expect(latestState.program.workouts.Arms.map((item) => item.name)).toEqual([
      'Exercise 1',
      'Lateral Raise',
      'Incline Curl',
      'Exercise 4',
    ])
  })
})

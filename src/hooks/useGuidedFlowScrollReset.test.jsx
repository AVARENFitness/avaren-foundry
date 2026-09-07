import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { useGuidedFlowScrollReset } from './useGuidedFlowScrollReset'
import * as guidedFlowScroll from '../lib/guidedFlowScroll'

describe('useGuidedFlowScrollReset', () => {
  beforeEach(() => {
    vi.spyOn(guidedFlowScroll, 'scheduleGuidedFlowScrollToTop').mockImplementation(
      () => {},
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scrolls when active key changes after Next/Previous mark', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useGuidedFlowScrollReset(key),
      { initialProps: { key: '0' } },
    )

    act(() => {
      result.current()
    })
    rerender({ key: '1' })

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when active key changes without navigation mark', () => {
    const { rerender } = renderHook(
      ({ key }) => useGuidedFlowScrollReset(key),
      { initialProps: { key: '0' } },
    )

    rerender({ key: '1' })

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).not.toHaveBeenCalled()
  })

  it('does not scroll when only non-key state would update (same key)', () => {
    const { result, rerender } = renderHook(
      ({ key }) => useGuidedFlowScrollReset(key),
      { initialProps: { key: 'exercise-1' } },
    )

    act(() => {
      result.current()
    })
    rerender({ key: 'exercise-1' })

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).not.toHaveBeenCalled()
  })
})

describe('guided flow screen wiring', () => {
  beforeEach(() => {
    vi.spyOn(guidedFlowScroll, 'scheduleGuidedFlowScrollToTop').mockImplementation(
      () => {},
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Gym Next and Previous exercise navigation schedules scroll reset', async () => {
    const FocusExercise = (await import('../components/FocusExercise')).default
    const { fireEvent, screen } = await import('@testing-library/react')
    const GymScreen = (await import('../screens/GymScreen')).default

    const setActiveExercise = vi.fn()
    const workout = {
      name: 'Arms',
      startedAt: new Date().toISOString(),
      exercises: [
        {
          id: 'a',
          name: 'Curl',
          muscle: 'Biceps',
          sets: [{ id: '1', number: 1, type: 'Working', weight: '', reps: '', done: false }],
        },
        {
          id: 'b',
          name: 'Extension',
          muscle: 'Triceps',
          sets: [{ id: '2', number: 1, type: 'Working', weight: '', reps: '', done: false }],
        },
      ],
    }

    const { rerender } = render(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={0}
        setActiveExercise={setActiveExercise}
        onSetChange={vi.fn()}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Arms']}
        onRestTimerChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /next exercise/i }))
    expect(setActiveExercise).toHaveBeenCalledWith(1)

    rerender(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={1}
        setActiveExercise={setActiveExercise}
        onSetChange={vi.fn()}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Arms']}
        onRestTimerChange={vi.fn()}
      />,
    )

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).toHaveBeenCalled()

    expect(screen.getByTestId('guided-flow-active-item')).toHaveAttribute(
      'data-guided-flow-active-item',
      'exercise',
    )
    expect(screen.getByTestId('gym-session-overview')).not.toHaveAttribute(
      'data-guided-flow-active-item',
    )

    guidedFlowScroll.scheduleGuidedFlowScrollToTop.mockClear()
    fireEvent.click(document.querySelector('.previous-exercise-button'))
    expect(setActiveExercise).toHaveBeenCalledWith(0)

    rerender(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={0}
        setActiveExercise={setActiveExercise}
        onSetChange={vi.fn()}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Arms']}
        onRestTimerChange={vi.fn()}
      />,
    )

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).toHaveBeenCalled()
    expect(screen.getByTestId('guided-flow-active-item').className).toContain(
      'focus-exercise',
    )

    // Keep FocusExercise import used for stability of button labels.
    expect(FocusExercise).toBeTypeOf('function')
  })

  it('Gym set edits and rest timer updates do not schedule scroll reset', async () => {
    const { fireEvent, screen } = await import('@testing-library/react')
    const GymScreen = (await import('../screens/GymScreen')).default

    const onSetChange = vi.fn()
    const onRestTimerChange = vi.fn()
    const workout = {
      name: 'Arms',
      startedAt: new Date().toISOString(),
      restTimer: {
        endsAt: new Date(Date.now() + 60000).toISOString(),
        duration: 90,
        paused: false,
      },
      exercises: [
        {
          id: 'a',
          name: 'Curl',
          muscle: 'Biceps',
          sets: [{ id: '1', number: 1, type: 'Working', weight: '', reps: '', done: false }],
        },
      ],
    }

    const { rerender } = render(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={0}
        setActiveExercise={vi.fn()}
        onSetChange={onSetChange}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Arms']}
        onRestTimerChange={onRestTimerChange}
      />,
    )

    const weightInput = screen.getAllByDisplayValue('')[0]
    fireEvent.change(weightInput, { target: { value: '25' } })
    expect(onSetChange).toHaveBeenCalled()

    rerender(
      <GymScreen
        state={{
          activeWorkout: {
            ...workout,
            restTimer: {
              ...workout.restTimer,
              endsAt: new Date(Date.now() + 30000).toISOString(),
            },
          },
          history: [],
        }}
        activeExercise={0}
        setActiveExercise={vi.fn()}
        onSetChange={onSetChange}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Arms']}
        onRestTimerChange={onRestTimerChange}
      />,
    )

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).not.toHaveBeenCalled()
  })

  it('superset Next Exercise schedules scroll reset when active key changes', async () => {
    const { cleanup, fireEvent, screen } = await import('@testing-library/react')
    cleanup()
    const GymScreen = (await import('../screens/GymScreen')).default

    const setActiveExercise = vi.fn()
    const workout = {
      name: 'Superset Day',
      startedAt: new Date().toISOString(),
      supersetRoundByGroup: { A: 0 },
      exercises: [
        {
          id: 'a',
          name: 'Curl',
          muscle: 'Biceps',
          supersetGroup: 'A',
          sets: [{ id: '1', number: 1, type: 'Working', weight: '20', reps: '10', done: true }],
        },
        {
          id: 'b',
          name: 'Extension',
          muscle: 'Triceps',
          supersetGroup: 'A',
          sets: [{ id: '2', number: 1, type: 'Working', weight: '20', reps: '10', done: true }],
        },
        {
          id: 'c',
          name: 'Squat',
          muscle: 'Quads',
          sets: [{ id: '3', number: 1, type: 'Working', weight: '', reps: '', done: false }],
        },
      ],
    }

    const { rerender } = render(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={0}
        setActiveExercise={setActiveExercise}
        onSetChange={vi.fn()}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Superset Day']}
        onRestTimerChange={vi.fn()}
        onSupersetRoundChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('guided-flow-active-item')).toHaveAttribute(
      'data-guided-flow-active-item',
      'superset',
    )

    fireEvent.click(document.querySelector('.superset-exercise-pager .next-exercise-button'))
    expect(setActiveExercise).toHaveBeenCalled()

    rerender(
      <GymScreen
        state={{ activeWorkout: workout, history: [] }}
        activeExercise={2}
        setActiveExercise={setActiveExercise}
        onSetChange={vi.fn()}
        onFinish={vi.fn()}
        onAddSet={vi.fn()}
        onRemoveSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onUndoSkip={vi.fn()}
        onChangeWorkout={vi.fn()}
        workoutOptions={['Superset Day']}
        onRestTimerChange={vi.fn()}
        onSupersetRoundChange={vi.fn()}
      />,
    )

    expect(
      guidedFlowScroll.scheduleGuidedFlowScrollToTop,
    ).toHaveBeenCalled()
    expect(screen.getByTestId('guided-flow-active-item')).toHaveAttribute(
      'data-guided-flow-active-item',
      'exercise',
    )
    expect(screen.getByTestId('gym-session-overview')).not.toHaveAttribute(
      'data-guided-flow-active-item',
    )
  })

  it('Morning Movement / Recovery / Full-Body Stretch Next resets scroll', async () => {
    const { cleanup, fireEvent, screen } = await import('@testing-library/react')
    const MobilityScreen = (await import('../screens/MobilityScreen')).default

    const cases = [
      {
        title: 'Morning Movement',
        id: 'daily-reset-2026-08-07',
        kind: 'morning_movement',
      },
      {
        title: 'Recovery Flow',
        id: 'recovery-session',
        kind: 'recovery',
      },
      {
        title: 'Full-Body Stretch',
        id: 'full-body-stretch-2026-08-07',
        kind: 'full_body_stretch',
      },
    ]

    for (const flowMeta of cases) {
      cleanup()
      guidedFlowScroll.scheduleGuidedFlowScrollToTop.mockClear()

      const flow = {
        ...flowMeta,
        movements: [
          {
            id: `${flowMeta.id}-m1`,
            name: 'First',
            type: 'reps',
            target: 8,
            instruction: 'Move slowly.',
          },
          {
            id: `${flowMeta.id}-m2`,
            name: 'Second',
            type: 'reps',
            target: 8,
            instruction: 'Stay controlled.',
          },
        ],
      }

      render(
        <MobilityScreen
          flow={flow}
          onComplete={vi.fn()}
          onClose={vi.fn()}
        />,
      )

      fireEvent.click(
        screen.getByRole('button', { name: /complete movement/i }),
      )

      expect(
        guidedFlowScroll.scheduleGuidedFlowScrollToTop,
      ).toHaveBeenCalled()
      expect(screen.getByRole('heading', { name: 'Second' })).toBeTruthy()
      expect(screen.getByTestId('guided-flow-active-item')).toHaveAttribute(
        'data-guided-flow-active-item',
        'movement',
      )
      expect(document.querySelector('.mobility-flow-heading')).not.toHaveAttribute(
        'data-guided-flow-active-item',
      )
    }
  })
})

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import GymScreen from './GymScreen'
import { LOAD_TYPES } from '../lib/exerciseLoad'

vi.mock('../components/FocusExercise', () => ({
  default: () => <div data-testid="focus-exercise" />,
}))

vi.mock('../components/SupersetFocus', () => ({
  default: () => <div data-testid="superset-focus" />,
}))

vi.mock('../components/QuickAddModal', () => ({
  default: () => null,
}))

const baseWorkout = {
  name: 'Chest + Back',
  startedAt: '2026-09-06T16:00:00.000Z',
  intent: '',
  notes: '',
  exercises: [
    {
      id: 'ex-1',
      name: 'Bench Press',
      muscle: 'Chest',
      loadType: LOAD_TYPES.EXTERNAL,
      sets: [
        { done: true, weight: 135, reps: 8 },
        { done: true, weight: 135, reps: 8 },
      ],
    },
    {
      id: 'ex-2',
      name: 'Row',
      muscle: 'Back',
      loadType: LOAD_TYPES.EXTERNAL,
      sets: [
        { done: false, weight: 95, reps: 8 },
        { done: false, weight: 95, reps: 8 },
      ],
    },
  ],
}

const renderGym = (workout = baseWorkout) =>
  render(
    <GymScreen
      state={{ activeWorkout: workout, history: [] }}
      activeExercise={0}
      setActiveExercise={vi.fn()}
      onSetChange={vi.fn()}
      onFinish={vi.fn()}
      onAddSet={vi.fn()}
      onRemoveSet={vi.fn()}
      onSkipExercise={vi.fn()}
      onUndoSkip={vi.fn()}
      onChangeWorkout={vi.fn()}
      workoutOptions={['Chest + Back', 'Arms']}
      onRestTimerChange={vi.fn()}
    />,
  )

describe('GymScreen active workout overview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-06T16:12:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders workout name, progress, completed count, elapsed time, and Change', () => {
    renderGym()

    expect(screen.getByTestId('gym-session-overview')).toBeInTheDocument()
    expect(screen.getByTestId('gym-workout-name')).toHaveTextContent(
      'Chest + Back',
    )
    expect(screen.getByTestId('gym-change-workout')).toBeInTheDocument()
    expect(screen.getByTestId('gym-completed-count')).toHaveTextContent(
      '1 of 2 complete',
    )
    expect(screen.getByTestId('gym-elapsed-time')).toHaveTextContent('12:00')
    expect(
      screen.getByLabelText('50% workout complete'),
    ).toBeInTheDocument()
  })

  it('keeps overview markup present for portrait layout (not display-gated in DOM)', () => {
    const { container } = renderGym()

    const overview = container.querySelector(
      '.focus-mode-bar.lift-session-overview',
    )
    expect(overview).not.toBeNull()
    expect(overview.querySelector('.progress-ring')).not.toBeNull()
  })
})

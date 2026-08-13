import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FocusExercise from './FocusExercise'

const baseExercise = {
  name: 'Bench Press',
  muscle: 'Chest',
  skipped: false,
  sets: [
    {
      id: 'set-1',
      number: 1,
      type: 'Working',
      weight: '',
      reps: '',
      done: false,
    },
  ],
}

const renderFocusExercise = (overrides = {}) =>
  render(
    <FocusExercise
      exercise={baseExercise}
      exerciseIndex={0}
      totalExercises={3}
      previousSets={[]}
      onSetChange={vi.fn()}
      onAddSet={vi.fn()}
      onPrevious={overrides.onPrevious ?? vi.fn()}
      onNext={overrides.onNext ?? vi.fn()}
      onRepeatSet={vi.fn()}
      onSkipExercise={vi.fn()}
      onQuickAdd={vi.fn()}
      onRemoveSet={vi.fn()}
      onUndoSkip={vi.fn()}
      onSetCompleted={vi.fn()}
      navigationDirection="next"
      {...overrides}
    />,
  )

describe('FocusExercise gesture safety', () => {
  it('does not switch exercises on horizontal swipe', () => {
    const onNext = vi.fn()
    const onPrevious = vi.fn()
    const { container } = renderFocusExercise({ onNext, onPrevious })
    const card = container.querySelector('.focus-exercise')

    fireEvent.touchStart(card, {
      touches: [{ clientX: 200 }],
    })
    fireEvent.touchEnd(card, {
      changedTouches: [{ clientX: 80 }],
    })

    expect(onNext).not.toHaveBeenCalled()
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('explicit Next button navigates exercises', () => {
    const onNext = vi.fn()
    renderFocusExercise({ onNext })

    fireEvent.click(screen.getByRole('button', { name: /next exercise/i }))

    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('explicit Previous button navigates exercises', () => {
    const onPrevious = vi.fn()
    const { container } = renderFocusExercise({ onPrevious, exerciseIndex: 1 })

    fireEvent.click(container.querySelector('.previous-exercise-button'))

    expect(onPrevious).toHaveBeenCalledTimes(1)
  })
})

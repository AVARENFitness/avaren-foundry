import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FocusExercise from '../components/FocusExercise'
import SupersetFocus from '../components/SupersetFocus'
import { historySessionFromDurableRow } from './athleteWorkoutHistory'
import { LOAD_TYPES } from './exerciseLoad'
import {
  buildExerciseHistoryGlance,
  formatBestSetDisplay,
  formatPreviousPerformanceDisplay,
  selectHeaviestHistoricalSet,
} from './exercisePreviousContext'
import { makeActiveSet } from './materializeWorkoutExercise'

const history = [
  {
    id: 'older',
    date: '2026-08-01',
    name: 'Push',
    sets: [
      {
        exercise: 'Bench Press',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 185,
        reps: 5,
        type: 'Working',
      },
      {
        exercise: 'Pull-up',
        loadType: LOAD_TYPES.BODYWEIGHT,
        weight: 0,
        reps: 12,
        type: 'Working',
      },
      {
        exercise: 'Assisted Dip',
        loadType: LOAD_TYPES.ASSISTED,
        assistance: 60,
        weight: 0,
        reps: 8,
        type: 'Working',
      },
    ],
  },
  {
    id: 'recent',
    date: '2026-09-01',
    name: 'Push',
    sets: [
      {
        exercise: 'Bench Press',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 135,
        reps: 10,
        type: 'Working',
      },
      {
        exercise: 'Bench Press',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 135,
        reps: 10,
        type: 'Working',
      },
      {
        exercise: 'Bench Press',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 135,
        reps: 10,
        type: 'Working',
      },
      {
        exercise: 'Lateral Raise',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 25,
        reps: 12,
        type: 'Working',
      },
      {
        exercise: 'Incline Curl',
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 40,
        reps: 10,
        type: 'Working',
      },
      {
        exercise: 'Pull-up',
        loadType: LOAD_TYPES.BODYWEIGHT,
        weight: 0,
        reps: 8,
        type: 'Working',
      },
      {
        exercise: 'Assisted Dip',
        loadType: LOAD_TYPES.ASSISTED,
        assistance: 40,
        weight: 0,
        reps: 10,
        type: 'Working',
      },
    ],
  },
]

describe('active exercise Previous + Best glance', () => {
  it('formats standalone external-weight Previous from last session', () => {
    const glance = buildExerciseHistoryGlance(
      history,
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )

    expect(glance.previousDisplay).toBe('3 × 10 @ 135 lb')
    expect(formatPreviousPerformanceDisplay(glance.previousSets)).toBe(
      '3 × 10 @ 135 lb',
    )
  })

  it('formats standalone external-weight Best from all-time heaviest', () => {
    const glance = buildExerciseHistoryGlance(
      history,
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )

    expect(glance.bestDisplay).toBe('185 lb × 5')
    expect(formatBestSetDisplay(glance.bestSet)).toBe('185 lb × 5')
    expect(selectHeaviestHistoricalSet(glance.historicalSets).weight).toBe(185)
  })

  it('renders Previous and Best on FocusExercise', () => {
    render(
      <FocusExercise
        exercise={{
          name: 'Bench Press',
          muscle: 'Chest',
          loadType: LOAD_TYPES.EXTERNAL,
          sets: [makeActiveSet(1, 'Working')],
        }}
        exerciseIndex={0}
        totalExercises={1}
        history={history}
        onSetChange={vi.fn()}
        onAddSet={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRepeatSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onQuickAdd={vi.fn()}
        onRemoveSet={vi.fn()}
        onUndoSkip={vi.fn()}
      />,
    )

    const glance = screen.getByTestId('exercise-history-glance')
    expect(glance).toHaveTextContent('Previous')
    expect(glance).toHaveTextContent('3 × 10 @ 135 lb')
    expect(glance).toHaveTextContent('Best')
    expect(glance).toHaveTextContent('185 lb × 5')
  })

  it('gives linked superset A/B independent Previous and Best values', () => {
    render(
      <SupersetFocus
        exercises={[
          {
            id: 'a1',
            name: 'Lateral Raise',
            muscle: 'Shoulders',
            loadType: LOAD_TYPES.EXTERNAL,
            sets: [makeActiveSet(1, 'Working')],
            prescription: { sets: 1 },
          },
          {
            id: 'a2',
            name: 'Incline Curl',
            muscle: 'Biceps',
            loadType: LOAD_TYPES.EXTERNAL,
            sets: [makeActiveSet(1, 'Working')],
            prescription: { sets: 1 },
          },
        ]}
        group="A"
        round={0}
        totalRounds={1}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    const glances = screen.getAllByTestId('exercise-history-glance')
    expect(glances).toHaveLength(2)
    expect(glances[0]).toHaveTextContent('25')
    expect(glances[0]).not.toHaveTextContent('40')
    expect(glances[1]).toHaveTextContent('40')
    expect(glances[1]).not.toHaveTextContent('25')
  })

  it('renders bodyweight Previous/Best without fake 0 lb', () => {
    const glance = buildExerciseHistoryGlance(
      history,
      { name: 'Pull-up' },
      LOAD_TYPES.BODYWEIGHT,
    )

    expect(glance.previousDisplay).toMatch(/BW/)
    expect(glance.previousDisplay).not.toMatch(/0 lb/)
    expect(glance.bestDisplay).toBe('BW × 12')
    expect(glance.bestDisplay).not.toMatch(/0 lb/)
  })

  it('renders assisted Best preferring lower assistance', () => {
    const glance = buildExerciseHistoryGlance(
      history,
      { name: 'Assisted Dip' },
      LOAD_TYPES.ASSISTED,
    )

    expect(glance.bestDisplay).toMatch(/40 lb assist/)
    expect(glance.bestDisplay).not.toMatch(/60 lb assist/)
    expect(glance.previousDisplay).toMatch(/assist|40/i)
  })

  it('shows empty state with no fake zeros', () => {
    render(
      <FocusExercise
        exercise={{
          name: 'Brand New Lift',
          muscle: 'Other',
          loadType: LOAD_TYPES.EXTERNAL,
          sets: [makeActiveSet(1, 'Working')],
        }}
        exerciseIndex={0}
        totalExercises={1}
        history={history}
        onSetChange={vi.fn()}
        onAddSet={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onRepeatSet={vi.fn()}
        onSkipExercise={vi.fn()}
        onQuickAdd={vi.fn()}
        onRemoveSet={vi.fn()}
        onUndoSkip={vi.fn()}
      />,
    )

    expect(screen.getByTestId('exercise-history-glance-empty')).toHaveTextContent(
      'No previous performance',
    )
    expect(screen.queryByText(/0 lb/i)).not.toBeInTheDocument()
  })

  it('uses durable 9.1 history as the glance source', () => {
    const durable = historySessionFromDurableRow({
      session_id: 'durable-1',
      workout_name: 'Push',
      completed_at: '2026-09-03T18:00:00.000Z',
      session_payload: {
        name: 'Push',
        finishedAt: '2026-09-03T18:00:00.000Z',
        sets: [
          {
            exercise: 'Bench Press',
            loadType: LOAD_TYPES.EXTERNAL,
            weight: 155,
            reps: 8,
            type: 'Working',
          },
        ],
      },
    })

    const glance = buildExerciseHistoryGlance(
      [durable],
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )

    expect(glance.previousDisplay).toMatch(/155/)
    expect(glance.bestDisplay).toBe('155 lb × 8')
  })

  it('does not let the current unfinished workout replace previous-history truth', () => {
    const unfinished = {
      id: 'active-now',
      name: 'Push',
      sets: [
        {
          exercise: 'Bench Press',
          loadType: LOAD_TYPES.EXTERNAL,
          weight: 225,
          reps: 3,
          type: 'Working',
        },
      ],
    }

    const withOnlyHistory = buildExerciseHistoryGlance(
      history,
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )
    const wronglyIncludingActive = buildExerciseHistoryGlance(
      [...history, unfinished],
      { name: 'Bench Press' },
      LOAD_TYPES.EXTERNAL,
    )

    // Gym Mode passes completed history only; previous stays on last completed session.
    expect(withOnlyHistory.previousDisplay).toBe('3 × 10 @ 135 lb')
    expect(withOnlyHistory.bestDisplay).toBe('185 lb × 5')

    // If unfinished were incorrectly mixed in, Best would jump — callers must not do that.
    expect(wronglyIncludingActive.bestDisplay).toBe('225 lb × 3')
    expect(withOnlyHistory.bestDisplay).not.toBe(
      wronglyIncludingActive.bestDisplay,
    )
  })
})

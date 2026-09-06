import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SupersetFocus from '../components/SupersetFocus'
import { historySessionFromDurableRow } from './athleteWorkoutHistory'
import { LOAD_TYPES } from './exerciseLoad'
import {
  buildExercisePreviousContext,
  previousSetsForExercise,
} from './exercisePreviousContext'
import { makeActiveSet } from './materializeWorkoutExercise'
import {
  getNextExerciseIndex,
  getSupersetRoundCount,
  isSupersetComplete,
  isSupersetRoundComplete,
} from './workoutProgression'

const makeSupersetExercise = (id, name, overrides = {}) => ({
  id,
  name,
  muscle: 'Other',
  loadType: LOAD_TYPES.EXTERNAL,
  prescription: { sets: 3, reps: { min: 8, max: 12 } },
  sets: [
    makeActiveSet(1, 'Working'),
    makeActiveSet(2, 'Working'),
    makeActiveSet(3, 'Working'),
  ],
  supersetGroup: 'A',
  ...overrides,
})

const history = [
  {
    id: 'session-1',
    date: '2026-09-01',
    name: 'Arms',
    sets: [
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
        weight: 0,
        assistance: 50,
        reps: 10,
        type: 'Working',
      },
    ],
  },
]

describe('linked superset previous workout + PR context', () => {
  it('shows exercise A previous workout without contaminating exercise B', () => {
    const exercises = [
      makeSupersetExercise('a1', 'Lateral Raise'),
      makeSupersetExercise('a2', 'Incline Curl'),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={3}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    const glances = screen.getAllByTestId('exercise-history-glance')
    expect(glances[0]).toHaveTextContent('25 lb × 12')
    expect(glances[0]).not.toHaveTextContent('40')
    expect(glances[1]).toHaveTextContent('40 lb × 10')
    expect(glances[1]).not.toHaveTextContent('25')
  })

  it('uses the same Previous/Best structure for both linked exercises', () => {
    const exercises = [
      makeSupersetExercise('a1', 'Lateral Raise'),
      makeSupersetExercise('a2', 'Incline Curl'),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={3}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    const glances = screen.getAllByTestId('exercise-history-glance')
    expect(glances).toHaveLength(2)
    for (const glance of glances) {
      expect(glance).toHaveTextContent('Previous')
      expect(glance).toHaveTextContent('Best')
      expect(glance.textContent).toMatch(/\d+(\.\d+)? lb × \d+/)
    }
    expect(
      screen.queryByLabelText(/Previous workout for/i),
    ).not.toBeInTheDocument()
  })

  it('shows empty history state consistently when one side has no history', () => {
    render(
      <SupersetFocus
        exercises={[
          makeSupersetExercise('a1', 'Lateral Raise'),
          makeSupersetExercise('a2', 'Brand New Curl'),
        ]}
        group="A"
        round={0}
        totalRounds={1}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('exercise-history-glance')).toHaveTextContent(
      '25 lb × 12',
    )
    expect(screen.getByTestId('exercise-history-glance-empty')).toHaveTextContent(
      'No previous performance',
    )
  })

  it('shows PR preview for external-load linked superset exercise', () => {
    const exercises = [
      makeSupersetExercise('a1', 'Lateral Raise', {
        sets: [
          {
            ...makeActiveSet(1, 'Working'),
            weight: 30,
            reps: 12,
          },
        ],
      }),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={1}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('pr-preview-a1')).toHaveTextContent(
      /Potential weight PR/i,
    )
  })

  it('shows bodyweight previous context without inventing a weight PR', () => {
    const exercises = [
      makeSupersetExercise('bw1', 'Pull-up', {
        loadType: LOAD_TYPES.BODYWEIGHT,
        sets: [{ ...makeActiveSet(1, 'Working'), weight: '', reps: 9 }],
      }),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={1}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('exercise-history-glance')).toHaveTextContent(
      /BW × 8/,
    )
    expect(screen.getByTestId('pr-preview-bw1')).toHaveTextContent(
      /Potential rep PR/i,
    )
    expect(screen.getByTestId('pr-preview-bw1')).not.toHaveTextContent(
      /weight PR/i,
    )
  })

  it('shows assisted previous context without inventing a weight PR', () => {
    const exercises = [
      makeSupersetExercise('as1', 'Assisted Dip', {
        loadType: LOAD_TYPES.ASSISTED,
        sets: [{ ...makeActiveSet(1, 'Working'), weight: 40, reps: 10 }],
      }),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={1}
        history={history}
        onSetChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('exercise-history-glance')).toHaveTextContent(
      /50 lb assist × 10/,
    )
    expect(screen.queryByTestId('pr-preview-as1')).not.toBeInTheDocument()
  })

  it('feeds durable 9.1 history into linked-superset context', () => {
    const durable = historySessionFromDurableRow({
      session_id: 'durable-1',
      workout_name: 'Arms',
      completed_at: '2026-09-02T18:00:00.000Z',
      session_payload: {
        name: 'Arms',
        finishedAt: '2026-09-02T18:00:00.000Z',
        sets: [
          {
            exercise: 'Lateral Raise',
            loadType: LOAD_TYPES.EXTERNAL,
            weight: 27.5,
            reps: 11,
            type: 'Working',
          },
          {
            exercise: 'Incline Curl',
            loadType: LOAD_TYPES.EXTERNAL,
            weight: 45,
            reps: 9,
            type: 'Working',
          },
        ],
      },
    })

    expect(previousSetsForExercise([durable], 'Lateral Raise')[0].weight).toBe(
      27.5,
    )
    expect(previousSetsForExercise([durable], 'Incline Curl')[0].weight).toBe(
      45,
    )

    const exercises = [
      makeSupersetExercise('a1', 'Lateral Raise'),
      makeSupersetExercise('a2', 'Incline Curl'),
    ]

    render(
      <SupersetFocus
        exercises={exercises}
        group="A"
        round={0}
        totalRounds={3}
        history={[durable]}
        onSetChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('History for Lateral Raise')).toHaveTextContent(
      '27.5 lb × 11',
    )
    expect(screen.getByLabelText('History for Incline Curl')).toHaveTextContent(
      '45 lb × 9',
    )
  })

  it('keeps A/B history isolated in shared helper', () => {
    const a = previousSetsForExercise(history, 'Lateral Raise')
    const b = previousSetsForExercise(history, 'Incline Curl')
    expect(a.every((set) => set.exercise === 'Lateral Raise')).toBe(true)
    expect(b.every((set) => set.exercise === 'Incline Curl')).toBe(true)
    expect(a[0].weight).not.toBe(b[0].weight)
  })

  it('reuses FocusExercise PR semantics for external load', () => {
    const previous = previousSetsForExercise(history, 'Lateral Raise')
    const context = buildExercisePreviousContext(
      previous,
      LOAD_TYPES.EXTERNAL,
    )
    const { potentialPr, potentialWeightPr } = context.potentialPrForSet({
      weight: 30,
      reps: 12,
    })
    expect(potentialPr).toBe(true)
    expect(potentialWeightPr).toBe(true)
  })

  it('preserves linked-superset round and progression behavior', () => {
    const exercises = [
      makeSupersetExercise('a1', 'Lateral Raise'),
      makeSupersetExercise('a2', 'Incline Curl'),
      makeSupersetExercise('solo', 'Tricep Pushdown', {
        id: 'solo',
        name: 'Tricep Pushdown',
        sets: [makeActiveSet(1, 'Working')],
        prescription: { sets: 1 },
        supersetGroup: '',
      }),
    ]

    expect(getSupersetRoundCount(exercises, 'A')).toBe(3)
    expect(isSupersetRoundComplete(exercises, 'A', 0)).toBe(false)

    exercises[0].sets[0].done = true
    exercises[0].sets[0].weight = 25
    exercises[0].sets[0].reps = 12
    exercises[1].sets[0].done = true
    exercises[1].sets[0].weight = 40
    exercises[1].sets[0].reps = 10

    expect(isSupersetRoundComplete(exercises, 'A', 0)).toBe(true)
    expect(isSupersetComplete(exercises, 'A')).toBe(false)
    expect(getNextExerciseIndex(exercises, 0)).toBe(2)
  })
})

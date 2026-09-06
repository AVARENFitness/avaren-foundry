import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProgressScreen from '../screens/ProgressScreen'
import HistoryScreen from '../screens/HistoryScreen'
import { historySessionFromDurableRow } from '../lib/athleteWorkoutHistory'

const richSession = (id, overrides = {}) => ({
  id,
  name: 'Push',
  date: '2026-09-05',
  startedAt: '2026-09-05T15:00:00.000Z',
  finishedAt: '2026-09-05T16:00:00.000Z',
  sets: [
    {
      exercise: 'Bench Press',
      muscle: 'Chest',
      loadType: 'external_load',
      reps: 5,
      weight: 185,
      type: 'Working',
    },
  ],
  ...overrides,
})

const baseState = {
  history: [
    richSession('session-sep-5'),
    richSession('session-aug-1', {
      name: 'Pull',
      date: '2026-08-12',
      startedAt: '2026-08-12T15:00:00.000Z',
      finishedAt: '2026-08-12T16:00:00.000Z',
      sets: [
        {
          exercise: 'Bench Press',
          muscle: 'Chest',
          loadType: 'external_load',
          reps: 5,
          weight: 175,
          type: 'Working',
        },
      ],
    }),
  ],
  program: {
    workouts: {
      Push: [{ name: 'Bench Press' }],
    },
  },
}

describe('Progress workout history detail opening', () => {
  it('opens SessionDetail when a Progress exercise-profile row is clicked', () => {
    render(
      <ProgressScreen
        state={baseState}
        onOpenReadinessTrends={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateSession={vi.fn()}
      />,
    )

    // Expand exercise profile disclosure if needed — details may be closed
    const profileSummary = screen.getByText('Exercise profile')
    fireEvent.click(profileSummary)

    fireEvent.click(screen.getByRole('button', { name: /2026-09-05/i }))

    expect(screen.getByText('COMPLETED SESSION')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Push' })).toBeInTheDocument()
    const detail = screen.getByText('COMPLETED SESSION').closest('.session-detail-screen')
    expect(detail).toHaveTextContent('Bench Press')
    expect(detail).toHaveTextContent('185')
  })

  it('opens durable/backfilled session detail with derived date and sets', () => {
    const durable = historySessionFromDurableRow({
      session_id: 'legacy-backfill-1',
      workout_name: 'Legs',
      completed_at: '2026-08-20T18:30:00.000Z',
      started_at: '2026-08-20T17:30:00.000Z',
      session_payload: {
        name: 'Legs',
        finishedAt: '2026-08-20T18:30:00.000Z',
        startedAt: '2026-08-20T17:30:00.000Z',
        sets: [
          {
            exercise: 'Squat',
            muscle: 'Quads',
            loadType: 'external_load',
            reps: 5,
            weight: 275,
          },
        ],
      },
    })

    expect(durable.id).toBe('legacy-backfill-1')
    expect(durable.date).toBe('2026-08-20')

    render(
      <ProgressScreen
        state={{
          ...baseState,
          history: [durable],
          program: { workouts: { Legs: [{ name: 'Squat' }] } },
        }}
        onOpenReadinessTrends={vi.fn()}
        onDeleteSession={vi.fn()}
        onUpdateSession={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Exercise profile'))
    fireEvent.click(screen.getByRole('button', { name: /2026-08-20/i }))

    expect(screen.getByText('COMPLETED SESSION')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Legs' })).toBeInTheDocument()
    const detail = screen.getByText('COMPLETED SESSION').closest('.session-detail-screen')
    expect(detail).toHaveTextContent('Squat')
    expect(detail).toHaveTextContent('275')
  })
})

describe('History journey workout detail opening', () => {
  it('opens detail from journey workout row with correct session id', () => {
    render(
      <HistoryScreen
        state={baseState}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onUpdateSession={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /Push/i })[0])

    expect(screen.getByText('COMPLETED SESSION')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Push' })).toBeInTheDocument()
  })
})

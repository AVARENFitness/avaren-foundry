import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachPrograms from './CoachPrograms'
import { coachBackend } from '../lib/coachBackend'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listPrograms: vi.fn(),
    saveProgram: vi.fn(),
    deleteProgram: vi.fn(),
    assignProgram: vi.fn(),
  },
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    confirm: vi.fn().mockResolvedValue(true),
  },
}))

const clientContext = {
  mode: 'assign',
  athleteId: 'athlete-jake',
  clientName: 'Jake',
  onClose: vi.fn(),
  onRequestBuild: vi.fn(),
}

describe('CoachPrograms client assignment flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listPrograms.mockResolvedValue([
      {
        id: 'program-1',
        name: 'Hypertrophy Block',
        description: '12 weeks',
        duration_weeks: 12,
        program_payload: { days: [] },
      },
    ])
    coachBackend.assignProgram.mockResolvedValue([])
  })

  it('3. client training can open Assign Program picker', async () => {
    render(
      <CoachPrograms
        clients={[{ id: 'bc-jake', athlete_id: 'athlete-jake', athlete_email: 'jake@example.com' }]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        clientContext={clientContext}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-client-program-assign')).toBeInTheDocument()
    })

    expect(screen.getByText('Jake')).toBeInTheDocument()
    expect(screen.getByText('Hypertrophy Block')).toBeInTheDocument()
  })

  it('4. Assign Program preserves client context through publish', async () => {
    render(
      <CoachPrograms
        clients={[{ id: 'bc-jake', athlete_id: 'athlete-jake', athlete_email: 'jake@example.com' }]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        clientContext={clientContext}
        onAssigned={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Choose/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Choose/i }))

    await waitFor(() => {
      expect(screen.getByText('Jake')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Assign to Jake/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Assign to Jake/i }))

    await waitFor(() => {
      expect(coachBackend.assignProgram).toHaveBeenCalledWith({
        programId: 'program-1',
        athleteId: 'athlete-jake',
        startDate: expect.any(String),
      })
    })
  })

  it('5. no-program empty state links to Build Program', async () => {
    coachBackend.listPrograms.mockResolvedValue([])

    render(
      <CoachPrograms
        clients={[]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        clientContext={clientContext}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/No programs yet/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('coach-client-build-program'))
    expect(clientContext.onRequestBuild).toHaveBeenCalled()
  })

  it('6. build mode opens program builder for client target', async () => {
    render(
      <CoachPrograms
        clients={[]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        clientContext={{
          ...clientContext,
          mode: 'build',
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })
  })
})

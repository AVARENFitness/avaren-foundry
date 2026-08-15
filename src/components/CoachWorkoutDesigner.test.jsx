import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachWorkoutDesigner from './CoachWorkoutDesigner'
import { toastWorkoutAssigned } from '../lib/writeFeedback'

vi.mock('../lib/writeFeedback', () => ({
  toastWorkoutAssigned: vi.fn(),
}))

const jake = {
  id: 'bc-jake',
  athlete_id: 'athlete-jake',
  athlete_email: 'jake@example.com',
  coach_label: 'Jake',
}

const baseProps = {
  clients: [jake],
  program: { workouts: {} },
  templates: [],
  initialClientId: 'athlete-jake',
  onClose: vi.fn(),
  onSaveTemplate: vi.fn(),
}

describe('CoachWorkoutDesigner assignment confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successful assignment calls app-level toast with client name', async () => {
    const onAssign = vi.fn().mockResolvedValue({ id: 'assignment-1' })

    render(
      <CoachWorkoutDesigner
        {...baseProps}
        onAssign={onAssign}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Workout name/i), {
      target: { value: 'Upper Body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Custom exercise/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Assign Workout$/i }))

    await waitFor(() => {
      expect(toastWorkoutAssigned).toHaveBeenCalledWith('Jake')
    })
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('closes designer after successful assignment', async () => {
    const onAssign = vi.fn().mockResolvedValue({ id: 'assignment-1' })
    const onClose = vi.fn()

    render(
      <CoachWorkoutDesigner
        {...baseProps}
        onClose={onClose}
        onAssign={onAssign}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Workout name/i), {
      target: { value: 'Upper Body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Custom exercise/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Assign Workout$/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('failed assignment does not show success toast', async () => {
    const onAssign = vi.fn().mockRejectedValue(new Error('Network failed'))

    render(
      <CoachWorkoutDesigner
        {...baseProps}
        onAssign={onAssign}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Workout name/i), {
      target: { value: 'Upper Body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Custom exercise/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Assign Workout$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Network failed/i)
    })

    expect(toastWorkoutAssigned).not.toHaveBeenCalled()
    expect(baseProps.onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('coach-workout-designer')).toBeInTheDocument()
  })

  it('failed assignment keeps builder open', async () => {
    const onAssign = vi.fn().mockRejectedValue(new Error('Network failed'))

    render(
      <CoachWorkoutDesigner
        {...baseProps}
        onAssign={onAssign}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Workout name/i), {
      target: { value: 'Upper Body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Custom exercise/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Assign Workout$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-workout-designer')).toBeInTheDocument()
    })
  })

  it('repeated tap while pending does not duplicate assignment', async () => {
    let resolveAssign
    const onAssign = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveAssign = resolve
        }),
    )

    render(
      <CoachWorkoutDesigner
        {...baseProps}
        onAssign={onAssign}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Workout name/i), {
      target: { value: 'Upper Body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Custom exercise/i }))

    const assignButton = screen.getByRole('button', { name: /^Assign Workout$/i })
    fireEvent.click(assignButton)
    fireEvent.click(assignButton)

    expect(onAssign).toHaveBeenCalledTimes(1)

    resolveAssign?.({ id: 'assignment-1' })

    await waitFor(() => {
      expect(toastWorkoutAssigned).toHaveBeenCalledWith('Jake')
    })
  })
})

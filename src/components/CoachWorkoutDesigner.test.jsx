import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachWorkoutDesigner from './CoachWorkoutDesigner'
import { appUi } from '../lib/appUi'

vi.mock('../lib/appUi', () => ({
  appUi: {
    toast: vi.fn(),
  },
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

  it('13. successful assignment shows confirmation toast with client name', async () => {
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
      expect(appUi.toast).toHaveBeenCalledWith(
        'Workout assigned to Jake',
        'success',
      )
    })
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('15. failed assignment shows error and keeps designer open', async () => {
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

    expect(appUi.toast).not.toHaveBeenCalled()
    expect(baseProps.onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('coach-workout-designer')).toBeInTheDocument()
  })

  it('16. repeated tap while pending does not duplicate assignment', async () => {
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
      expect(appUi.toast).toHaveBeenCalled()
    })
  })
})

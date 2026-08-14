import { act, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNutritionState } from '../lib/nutrition'
import { AvaProvider } from './AvaContext'
import { AvaUiProvider } from './AvaUiProvider'

const { mockUseAthleteAppointmentsContext } = vi.hoisted(() => ({
  mockUseAthleteAppointmentsContext: vi.fn(),
}))

vi.mock('../context/athleteAppointmentsContext', () => ({
  useAthleteAppointmentsContext: mockUseAthleteAppointmentsContext,
}))

describe('AvaUiProvider render stability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (!document.getElementById('root')) {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
    }
  })

  it('refreshes appointments once when AVA opens even if context identity changes', async () => {
    const user = userEvent.setup()
    const refreshAppointments = vi.fn()
    let version = 0

    mockUseAthleteAppointmentsContext.mockImplementation(() => {
      version += 1
      return {
        refreshAppointments,
        appointments: [],
        ready: version > 1,
        loading: version <= 1,
        userId: 'athlete-1',
        version,
      }
    })

    render(
      <AvaProvider>
        <AvaUiProvider nutrition={createNutritionState()} onNutritionChange={vi.fn()}>
          <main>Screen content</main>
        </AvaUiProvider>
      </AvaProvider>,
    )

    await user.click(document.querySelector('.ava-entry-button'))

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(refreshAppointments).toHaveBeenCalledTimes(1)
    expect(version).toBeLessThan(10)
  })
})

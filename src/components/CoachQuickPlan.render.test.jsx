import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachQuickPlan from './CoachQuickPlan'
import { coachQuickPlanBackend } from '../lib/coachQuickPlanBackend'
vi.mock('../lib/coachQuickPlanBackend', () => ({
  coachQuickPlanBackend: { get: vi.fn(), save: vi.fn(), getForAthlete: vi.fn() },
}))
describe('Quick Plan opens safely for offline and connected clients', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('renders a brand new client plan and supports adding an exercise', async () => {
    coachQuickPlanBackend.get.mockResolvedValue({ title: 'Training plan', focus: '', coach_notes: '', exercises: [] })
    render(<CoachQuickPlan businessClientId="bc-test" clientName="Mary Lou" />)
    expect(await screen.findByRole('heading', { name: 'Mary Lou' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add exercise/i }))
    expect(screen.getByRole('textbox', { name: 'Exercise 1 name' })).toBeInTheDocument()
  })
  it('does not crash on an incomplete plan from the backend', async () => {
    coachQuickPlanBackend.get.mockResolvedValue({ title: null, exercises: null })
    render(<CoachQuickPlan businessClientId="bc-test" clientName="Mary Lou" />)
    expect(await screen.findByRole('textbox', { name: 'Plan name' })).toHaveValue('Training plan')
    expect(screen.getByRole('button', { name: /add exercise/i })).toBeInTheDocument()
  })
  it('shows an inline backend error rather than crashing the profile', async () => {
    coachQuickPlanBackend.get.mockRejectedValue(new Error('connection failure'))
    render(<CoachQuickPlan businessClientId="bc-test" clientName="Mary Lou" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('connection failure')
  })
})

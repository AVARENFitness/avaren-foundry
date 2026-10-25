import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachQuickPlan from './CoachQuickPlan'
import { coachQuickPlanBackend } from '../lib/coachQuickPlanBackend'
vi.mock('../lib/coachQuickPlanBackend', () => ({
  coachQuickPlanBackend: { get: vi.fn(), save: vi.fn(), getForAthlete: vi.fn() },
}))
describe('Quick Plan unsaved-edit safety', () => {
  it('reports dirty after changes and clean after saving', async () => {
    const onDirtyChange = vi.fn()
    coachQuickPlanBackend.get.mockResolvedValue({ title:'Training plan', focus:'', coach_notes:'', exercises:[] })
    coachQuickPlanBackend.save.mockResolvedValue({ id:'1', title:'New training plan', focus:'', coach_notes:'', exercises:[] })
    render(<CoachQuickPlan businessClientId="client1" clientName="Client" onDirtyChange={onDirtyChange} />)
    const input = await screen.findByRole('textbox', { name:'Plan name' })
    await userEvent.clear(input)
    await userEvent.type(input,'New training plan')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    await userEvent.click(screen.getByRole('button', {name:'Save changes'}))
    expect(await screen.findByText(/Plan saved/)).toBeInTheDocument()
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})

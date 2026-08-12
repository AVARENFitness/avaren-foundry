import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CoachPassSelectionModal from './CoachPassSelectionModal'

describe('CoachPassSelectionModal', () => {
  it('passes candidate.pass_id to onSelect when a pass is tapped', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CoachPassSelectionModal
        open
        candidates={[
          {
            pass_id: 'pass-abc',
            name: 'Training pass',
            balance: 3,
          },
        ]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Training pass/i }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('pass-abc')
  })

  it('resolves passId alias before calling onSelect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CoachPassSelectionModal
        open
        candidates={[{ passId: 'pass-alias', name: 'Alias pass', balance: 2 }]}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Alias pass/i }))

    expect(onSelect).toHaveBeenCalledWith('pass-alias')
  })
})

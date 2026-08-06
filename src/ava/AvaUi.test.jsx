import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createNutritionState } from '../lib/nutrition'
import { AvaProvider } from './AvaContext'
import { AvaUiProvider } from './AvaUiProvider'

function renderAvaUi({ enabled = true, nutrition = createNutritionState() } = {}) {
  const onNutritionChange = vi.fn()

  render(
    <AvaProvider>
      <AvaUiProvider
        enabled={enabled}
        nutrition={nutrition}
        onNutritionChange={onNutritionChange}
      >
        <main>Screen content</main>
      </AvaUiProvider>
    </AvaProvider>,
  )

  return { onNutritionChange }
}

describe('AVA UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('never opens AVA automatically', () => {
    renderAvaUi()

    expect(screen.queryByRole('dialog', { name: 'Ask AVA' })).not.toBeInTheDocument()
  })

  it('opens and closes AVA only from the explicit entry action', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    expect(screen.getByRole('button', { name: 'Ask AVA' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    expect(screen.getByRole('dialog', { name: 'Ask AVA' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close AVA' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Ask AVA' })).not.toBeInTheDocument()
    })
  })

  it('hides the entry point when disabled', () => {
    renderAvaUi({ enabled: false })

    expect(screen.queryByRole('button', { name: 'Ask AVA' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ask AVA' })).not.toBeInTheDocument()
  })

  it('submits a nutrition message and shows confirmation preview', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.click(
      screen.getByRole('button', { name: 'I had two eggs and toast' }),
    )
    await user.click(screen.getByRole('button', { name: 'Send to AVA' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Log this meal?' })).toBeInTheDocument()
    })
  })

  it('does not save nutrition before confirm', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I drank one water bottle',
    )
    await user.click(screen.getByRole('button', { name: 'Send to AVA' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Log hydration?' })).toBeInTheDocument()
    })

    expect(onNutritionChange).not.toHaveBeenCalled()
  })
})

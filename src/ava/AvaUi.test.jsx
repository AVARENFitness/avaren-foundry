import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvaProvider } from './AvaContext'
import { AvaUiProvider } from './AvaUiProvider'

function renderAvaUi({ enabled = true } = {}) {
  return render(
    <AvaProvider>
      <AvaUiProvider enabled={enabled}>
        <main>Screen content</main>
      </AvaUiProvider>
    </AvaProvider>,
  )
}

describe('AVA UI', () => {
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

  it('submits a message and renders the placeholder analysis', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.click(
      screen.getByRole('button', { name: 'I had two eggs and toast' }),
    )
    await user.click(screen.getByRole('button', { name: 'Send to AVA' }))

    await waitFor(() => {
      expect(
        screen.getByText(/intelligence providers are connected|Food analysis placeholder/i),
      ).toBeInTheDocument()
    })
  })

  it('shows confirmation preview for food-style routed responses', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I ate two eggs and toast',
    )
    await user.click(screen.getByRole('button', { name: 'Send to AVA' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Log this meal?' })).toBeInTheDocument()
    })

    expect(screen.getByText('420')).toBeInTheDocument()
  })
})

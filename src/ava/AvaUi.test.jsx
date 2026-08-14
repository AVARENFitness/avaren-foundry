import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createNutritionState } from '../lib/nutrition'
import { nutritionDateKey } from '../lib/nutrition'
import { AvaProvider } from './AvaContext'
import { AvaUiProvider } from './AvaUiProvider'
import { clearNutritionTransactionFingerprints } from './avaNutritionExecutor'

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
    clearNutritionTransactionFingerprints()
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

  it('hides the floating entry when showFloatingEntry is false', () => {
    render(
      <AvaProvider>
        <AvaUiProvider
          enabled
          showFloatingEntry={false}
          nutrition={createNutritionState()}
          onNutritionChange={vi.fn()}
        >
          <main>Screen content</main>
        </AvaUiProvider>
      </AvaProvider>,
    )

    expect(screen.queryByRole('button', { name: 'Ask AVA' })).not.toBeInTheDocument()
  })

  it('submits a confident past-tense food log and saves immediately', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a chocolate chip Clif Bar',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(onNutritionChange).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText(/logged/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Log this meal?' })).not.toBeInTheDocument()
  })

  it('shows confirmation preview for medium-confidence food logging', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'One Fairlife shake',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Log this meal?' })).toBeInTheDocument()
    })
  })

  it('auto-logs hydration for explicit past-tense water statements', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I drank one water bottle',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(onNutritionChange).toHaveBeenCalledTimes(1)
    })
  })

  it('LIVE CASE 1: milk clarification renders AVA response and candidate choices', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a cup of milk',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: /milk/i }).length).toBeGreaterThan(0)
  })

  it('LIVE CASE 2: Nature Valley bar never ends in user-only silence', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a Nature Valley bar',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      const avaMessages = screen.getAllByText(/./).filter((node) =>
        node.closest('.ava-chat-message--ava'),
      )
      expect(avaMessages.length).toBeGreaterThan(1)
    })

    const hasCandidates = Boolean(screen.queryByRole('region', { name: 'Choose a match' }))
    const hasPreview = Boolean(screen.queryByRole('heading', { name: 'Log this meal?' }))
    const hasConfirmation = Boolean(screen.queryByText(/logged/i))

    expect(hasCandidates || hasPreview || hasConfirmation).toBe(true)
  })

  it('LIVE CASE 3: later messages still work after a clarification flow starts', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a cup of milk',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    await user.type(
      screen.getByLabelText('Your message'),
      'what workout do I have today?',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Choose a match' })).not.toBeInTheDocument()
    })

    await user.type(
      screen.getByLabelText('Your message'),
      'I had a chocolate chip Clif Bar',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText(/logged/i)).toBeInTheDocument()
    })
  })

  it('7.7.9: yes confirms pending Fairlife log through live pipeline', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'One Fairlife shake')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText(/Log .* for today/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Your message'), 'yes')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(onNutritionChange).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText(/logged/i)).toBeInTheDocument()
  })

  it('7.7.9: no declines pending confirmation without logging', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'One Fairlife shake')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText(/Log .* for today/i)).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Your message'), 'no')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText(/won't log|cancelled/i)).toBeInTheDocument()
    })

    expect(onNutritionChange).not.toHaveBeenCalled()
  })

  it('7.7.9: Nature Valley renders real candidate choices', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a Nature Valley bar',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    expect(screen.getAllByRole('button', { name: /Nature Valley/i }).length).toBeGreaterThan(0)
  })

  it('7.7.10: Nature Valley bar today renders tappable candidate controls', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a Nature Valley bar today',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    const candidateButtons = screen.getAllByRole('button', { name: /Nature Valley/i })
    expect(candidateButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('7.7.10: tapping Nature Valley protein candidate logs through live pipeline', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a Nature Valley bar today',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    const proteinButton = screen.getByRole('button', {
      name: /Nature Valley Protein Bar Peanut Butter Dark Chocolate/i,
    })
    await user.click(proteinButton)

    await waitFor(() => {
      expect(onNutritionChange).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole('region', { name: 'Choose a match' })).not.toBeInTheDocument()
    expect(screen.getByText(/logged/i)).toBeInTheDocument()
  })

  it('7.7.10: new milk log replaces pending Nature Valley clarification', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'I had a Nature Valley bar',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    await user.type(
      screen.getByLabelText('Your message'),
      'I had a cup of milk today',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.queryByText(/still need to know which nature valley/i)).not.toBeInTheDocument()
    })

    expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /milk/i }).length).toBeGreaterThan(0)
  })

  it('7.7.10: protein query uses live canonical total wording', async () => {
    const user = userEvent.setup()
    const today = nutritionDateKey()
    const nutrition = createNutritionState()
    nutrition.days[today] = {
      foods: [
        {
          id: 'food-1',
          name: 'Chicken',
          servings: 1,
          calories: 400,
          protein: 48,
          carbs: 0,
          fat: 10,
          fiber: 0,
          source: 'manual',
        },
      ],
      waterOz: 0,
    }

    renderAvaUi({ nutrition })

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(
      screen.getByLabelText('Your message'),
      'how much protein have i had today',
    )
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText(/You're at 48g/i)).toBeInTheDocument()
    })
  })

  it('7.7.11: yogurt clarification renders tappable candidate controls', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had yogurt')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    const region = screen.getByRole('region', { name: 'Choose a match' })
    expect(Number(region.dataset.avaCandidateCount ?? 0)).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: /yogurt/i }).length).toBeGreaterThanOrEqual(2)
  })

  it('7.7.11: chobani refines pending yogurt and renders narrowed candidates', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had yogurt')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Your message'), 'chobani')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.queryByText(/still need to know/i)).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Chobani/i }).length).toBeGreaterThanOrEqual(2)
    })
  })

  it('7.7.11: tap narrowed Chobani candidate logs once', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had yogurt')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Your message'), 'chobani')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Chobani/i }).length).toBeGreaterThanOrEqual(1)
    })

    await user.click(
      screen.getByRole('button', {
        name: /Chobani Non-Fat Greek Yogurt, Plain/i,
      }),
    )

    await waitFor(() => {
      expect(onNutritionChange).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole('region', { name: 'Choose a match' })).not.toBeInTheDocument()
    expect(screen.getByText(/logged/i)).toBeInTheDocument()
  })

  it('7.7.12: yogurt does not auto-log and renders candidate controls', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had yogurt')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    expect(onNutritionChange).not.toHaveBeenCalled()
    expect(screen.getAllByText(/Which one was it/i).length).toBeGreaterThan(0)
  })

  it('7.7.12: protein bar does not auto-log Nature Valley', async () => {
    const user = userEvent.setup()
    const { onNutritionChange } = renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had a protein bar')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    expect(onNutritionChange).not.toHaveBeenCalled()
    expect(screen.queryByText(/logged/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /bar|CLIF|Nature Valley|Protein/i }).length).toBeGreaterThanOrEqual(2)
  })

  it('7.7.13: protein bar candidates show readable diverse choices', async () => {
    const user = userEvent.setup()
    renderAvaUi()

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))
    await user.type(screen.getByLabelText('Your message'), 'I had a protein bar')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Choose a match' })).toBeInTheDocument()
    })

    const region = screen.getByRole('region', { name: 'Choose a match' })
    expect(Number(region.dataset.avaCandidateCount ?? 0)).toBeLessThanOrEqual(4)
    expect(screen.getByRole('button', { name: /Other/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /CLIF|Nature Valley|Generic/i }).length).toBeGreaterThanOrEqual(2)
  })
})

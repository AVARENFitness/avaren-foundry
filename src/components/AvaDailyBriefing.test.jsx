import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvaDailyBriefing from './AvaDailyBriefing'
import { AVA_ACTION_TYPES } from '../lib/avaActions'
import { AVA_DAILY_STATES } from '../lib/avaIntelligence'

const sampleBriefing = {
  dailyState: AVA_DAILY_STATES.READY,
  greeting: 'Good evening, Jacob.',
  headline: 'Chest & Back is up.',
  summary: "Start when you're ready.",
  primaryAction: {
    type: AVA_ACTION_TYPES.START_WORKOUT,
    label: 'Start Chest & Back',
    detail: null,
    eyebrow: null,
  },
  secondaryAction: null,
  watchItem: null,
  evidence: [],
}

describe('AvaDailyBriefing', () => {
  it('renders primary, Why, and Ask AVA without overlapping entry points', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const onAskAva = vi.fn()

    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={onAction}
        onAskAva={onAskAva}
      />,
    )

    const primary = screen.getByRole('button', { name: /Start Chest & Back/i })
    const why = screen.getByRole('button', { name: 'Why?' })
    const askAva = screen.getByRole('button', { name: 'Ask AVA' })

    expect(primary).toBeInTheDocument()
    expect(why).toBeInTheDocument()
    expect(askAva).toBeInTheDocument()

    await user.click(primary)
    await user.click(why)
    await user.click(askAva)

    expect(onAction).toHaveBeenCalledWith(sampleBriefing.primaryAction)
    expect(onAskAva).toHaveBeenCalledTimes(1)
  })

  it('omits Ask AVA when no handler is provided', () => {
    render(
      <AvaDailyBriefing briefing={sampleBriefing} onAction={vi.fn()} />,
    )

    expect(screen.getByRole('button', { name: 'Why?' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ask AVA' }),
    ).not.toBeInTheDocument()
  })
  it('acts as context only on athlete Home and does not duplicate the primary CTA', () => {
    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={vi.fn()}
        onAskAva={vi.fn()}
        contextOnly
      />,
    )

    expect(
      screen.queryByRole('button', { name: /Start Chest & Back/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(sampleBriefing.headline)).toBeInTheDocument()
    expect(screen.getByText(sampleBriefing.summary)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Why?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask AVA' })).toBeInTheDocument()
    expect(screen.queryByText(sampleBriefing.greeting)).not.toBeInTheDocument()
  })

  it('persists a collapsed Home AVA preference', async () => {
    window.localStorage.removeItem('avaren:home:ava-collapsed')
    const user = userEvent.setup()

    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={vi.fn()}
        onAskAva={vi.fn()}
        contextOnly
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Collapse AVA guidance' }),
    )

    expect(
      window.localStorage.getItem('avaren:home:ava-collapsed'),
    ).toBe('1')
    expect(screen.queryByText(sampleBriefing.summary)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand AVA guidance' }),
    ).toBeInTheDocument()
  })

  it('shows a direct warm-up action when AVA recommends pre-workout prep', async () => {
    window.localStorage.removeItem('avaren:home:ava-collapsed')
    const user = userEvent.setup()
    const onAction = vi.fn()
    const warmup = {
      ...sampleBriefing,
      primaryAction: {
        type: AVA_ACTION_TYPES.PRE_WORKOUT_WARMUP,
        label: 'Start Warm-Up',
        detail: 'Prepare for today’s workout.',
      },
    }

    render(
      <AvaDailyBriefing
        briefing={warmup}
        onAction={onAction}
        contextOnly
      />,
    )

    await user.click(screen.getByRole('button', { name: /Start Warm-Up/i }))
    expect(onAction).toHaveBeenCalledWith(warmup.primaryAction)
  })

})

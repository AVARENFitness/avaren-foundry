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
})

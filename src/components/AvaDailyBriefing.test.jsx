import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  beforeEach(() => {
    window.localStorage.clear()
  })

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

  it('shows a mobility support action in context-only mode without duplicating workout CTA', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const warmUp = {
      ...sampleBriefing,
      secondaryAction: {
        type: AVA_ACTION_TYPES.MORNING_MOVEMENT,
        label: 'Warm-Up',
      },
    }

    render(
      <AvaDailyBriefing
        briefing={warmUp}
        onAction={onAction}
        onAskAva={vi.fn()}
        contextOnly
      />,
    )

    expect(screen.queryByRole('button', { name: /Start Chest & Back/i })).not.toBeInTheDocument()
    const support = screen.getByRole('button', { name: /Warm-Up/i })
    await user.click(support)
    expect(onAction).toHaveBeenCalledWith(warmUp.secondaryAction)
  })

  it('uses a canonical Home support override for pre-workout Warm-Up', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    const supportAction = {
      type: AVA_ACTION_TYPES.MORNING_MOVEMENT,
      eyebrow: 'PRE-WORKOUT',
      label: 'Warm-Up',
      detail: 'Prepare your body for today’s training',
      meta: { flowId: 'daily-reset' },
    }

    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={onAction}
        onAskAva={vi.fn()}
        contextOnly
        contextActionOverride={supportAction}
      />,
    )

    expect(screen.getByText('PRE-WORKOUT')).toBeInTheDocument()
    expect(screen.getByText('Prepare your body for today’s training')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /Warm-Up/i })
    await user.click(button)
    expect(onAction).toHaveBeenCalledWith(supportAction)
  })

  it('uses a canonical Home support override for post-workout recovery', () => {
    const supportAction = {
      type: AVA_ACTION_TYPES.RECOVERY_FLOW,
      eyebrow: 'POST-WORKOUT',
      label: 'Cooldown + Recovery',
      detail: 'Downshift and restore after today’s session',
      meta: { flowId: 'recovery-flow' },
    }

    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={vi.fn()}
        onAskAva={vi.fn()}
        contextOnly
        contextActionOverride={supportAction}
      />,
    )

    expect(screen.getByText('POST-WORKOUT')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Cooldown + Recovery/i }),
    ).toBeInTheDocument()
  })

  it('persists the collapsed Home state for the athlete/device key', async () => {
    const user = userEvent.setup()
    const key = 'avaren:test:ava-collapse'
    const { unmount } = render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={vi.fn()}
        onAskAva={vi.fn()}
        contextOnly
        collapsible
        collapseStorageKey={key}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Collapse AVA insight' }))
    expect(window.localStorage.getItem(key)).toBe('1')
    expect(screen.getByRole('button', { name: 'Expand AVA insight' })).toBeInTheDocument()

    unmount()
    render(
      <AvaDailyBriefing
        briefing={sampleBriefing}
        onAction={vi.fn()}
        onAskAva={vi.fn()}
        contextOnly
        collapsible
        collapseStorageKey={key}
      />,
    )

    expect(screen.getByRole('button', { name: 'Expand AVA insight' })).toBeInTheDocument()
  })

})

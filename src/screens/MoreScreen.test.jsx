import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MoreScreen from './MoreScreen'
import { createNutritionState } from '../lib/nutrition'

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}))

vi.mock('../lib/identityCapabilities', () => ({
  probeIdentityCapabilities: vi.fn().mockResolvedValue({ userProfiles: false }),
}))

vi.mock('../components/AthleteSessionPackageCard', () => ({
  default: () => <div data-testid="session-package-card">Session package</div>,
}))

vi.mock('../components/AthleteScheduledSessions', () => ({
  default: () => <div data-testid="scheduled-sessions">Scheduled sessions</div>,
}))

vi.mock('../components/AthleteCoachPanel', () => ({
  default: () => <div data-testid="athlete-coach-panel">Coach panel</div>,
}))

vi.mock('../components/ImportBackupButton', () => ({
  default: () => null,
}))

const baseProps = {
  state: {
    lastBackupAt: null,
    nutrition: createNutritionState(),
  },
  setState: vi.fn(),
  fallbackState: {},
  onOpenBuilder: vi.fn(),
  onOpenPlanner: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenForge: vi.fn(),
  onOpenCoach: vi.fn(),
  onOpenNotifications: vi.fn(),
  onOpenReadinessTrends: vi.fn(),
  onOpenMobility: vi.fn(),
  onOpenReset: vi.fn(),
  onReplayTour: vi.fn(),
  session: { user: { email: 'athlete@example.com', user_metadata: {} } },
}

const getSectionNav = () =>
  screen.getByRole('navigation', { name: 'Profile sections' })

describe('MoreScreen account navigation', () => {
  it('does not render an Overview tab', () => {
    render(<MoreScreen {...baseProps} />)

    const nav = getSectionNav()
    expect(
      within(nav).queryByRole('button', { name: /^Overview/ }),
    ).not.toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Training/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Recovery/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Account/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Support/ })).toBeInTheDocument()
  })

  it('opens on Account profile content by default', () => {
    render(<MoreScreen {...baseProps} />)

    expect(
      screen.getByText('Profile, notifications, and data'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Workout History' })).not.toBeInTheDocument()
  })

  it('shows Workout History under Training', async () => {
    const user = userEvent.setup()
    render(<MoreScreen {...baseProps} />)

    await user.click(
      within(getSectionNav()).getByRole('button', { name: /^Training/ }),
    )

    expect(screen.getByRole('heading', { name: 'Workout History' })).toBeInTheDocument()
    expect(
      screen.getByText('Review every session, set, reflection, and personal record.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open History/i })).toBeInTheDocument()
    expect(screen.getByTestId('session-package-card')).toBeInTheDocument()
    expect(screen.getByTestId('scheduled-sessions')).toBeInTheDocument()
    expect(screen.getByTestId('athlete-coach-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Weekly Program/i })).toBeInTheDocument()
  })

  it('opens Workout History from Training without blank state', async () => {
    const user = userEvent.setup()
    const onOpenHistory = vi.fn()
    render(<MoreScreen {...baseProps} onOpenHistory={onOpenHistory} />)

    await user.click(
      within(getSectionNav()).getByRole('button', { name: /^Training/ }),
    )
    await user.click(screen.getByRole('button', { name: /Open History/i }))

    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('renders Recovery and Support without blank panels', async () => {
    const user = userEvent.setup()
    render(<MoreScreen {...baseProps} />)

    await user.click(
      within(getSectionNav()).getByRole('button', { name: /^Recovery/ }),
    )
    expect(screen.getByRole('button', { name: /Morning Movement/i })).toBeInTheDocument()

    await user.click(
      within(getSectionNav()).getByRole('button', { name: /^Support/ }),
    )
    expect(screen.getByRole('button', { name: /Replay App Tour/i })).toBeInTheDocument()
  })
})

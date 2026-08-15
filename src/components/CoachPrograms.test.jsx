import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoachPrograms from './CoachPrograms'
import CoachShell from './CoachShell'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import {
  emptyProgram,
  isProgramDraftDirty,
  scrollCoachShellToTop,
} from '../lib/coachProgramDraft'

vi.mock('../lib/coachBackend', () => ({
  coachBackend: {
    listPrograms: vi.fn(),
    saveProgram: vi.fn(),
    deleteProgram: vi.fn(),
    assignProgram: vi.fn(),
  },
}))

vi.mock('../lib/appUi', () => ({
  appUi: {
    confirm: vi.fn(),
  },
}))

const renderPrograms = (props = {}) =>
  render(
    <CoachShell
      screen="build"
      setScreen={vi.fn()}
      coachName="Coach Jake"
      onExit={vi.fn()}
    >
      <CoachPrograms
        clients={[]}
        templates={[]}
        program={{ workouts: {} }}
        onRefresh={vi.fn()}
        {...props}
      />
    </CoachShell>,
  )

describe('coachProgramDraft', () => {
  it('detects unsaved program changes', () => {
    const baseline = emptyProgram()
    const edited = { ...baseline, name: 'Strength Block' }
    expect(isProgramDraftDirty(baseline, edited)).toBe(true)
    expect(isProgramDraftDirty(baseline, baseline)).toBe(false)
  })
})

describe('CoachPrograms builder entry UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coachBackend.listPrograms.mockResolvedValue([])
    coachBackend.saveProgram.mockResolvedValue({ id: 'program-1' })
    appUi.confirm.mockResolvedValue(true)
  })

  it('1. tap New Program makes builder active', async () => {
    renderPrograms()

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })
  })

  it('2. builder is the primary visible coach content', async () => {
    renderPrograms()

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder-title')).toHaveTextContent(
        'New Program',
      )
    })

    expect(screen.queryByTestId('coach-programs-list')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /New Program/i }),
    ).not.toBeInTheDocument()
  })

  it('3. programs empty-state does not remain dominant while building', async () => {
    renderPrograms()

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    expect(screen.queryByText(/No programs yet/i)).not.toBeInTheDocument()
  })

  it('4. builder starts at top with focus target', async () => {
    const { container } = renderPrograms()
    const main = container.querySelector('.coach-shell-main')
    main.scrollTop = 240

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder-title')).toHaveFocus()
    })

    expect(main.scrollTop).toBe(0)
  })

  it('5. Back returns to Programs list', async () => {
    renderPrograms()

    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))
    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-programs-list')).toBeInTheDocument()
    })
  })

  it('6. existing program edit uses same builder shell', async () => {
    coachBackend.listPrograms.mockResolvedValue([
      {
        id: 'program-1',
        name: 'Hypertrophy Block',
        description: '8 week build',
        duration_weeks: 8,
        program_payload: {
          days: [{ weekday: 1, kind: 'workout', title: 'Upper', templateId: '' }],
        },
      },
    ])

    renderPrograms()

    await waitFor(() => {
      expect(screen.getByText('Hypertrophy Block')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder-title')).toHaveTextContent(
        'Edit Program',
      )
    })
  })

  it('7. unsaved draft requires discard confirmation', async () => {
    appUi.confirm.mockResolvedValueOnce(false)

    renderPrograms()
    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Draft Program' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Back/i }))

    expect(appUi.confirm).toHaveBeenCalled()
    expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
  })

  it('8. CoachShell athlete switch remains reachable while building', async () => {
    renderPrograms()
    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', { name: /Athlete App/i }),
    ).toBeVisible()
  })

  it('9. save program still calls backend and returns to list', async () => {
    renderPrograms()
    fireEvent.click(screen.getByRole('button', { name: /New Program/i }))

    await waitFor(() => {
      expect(screen.getByTestId('coach-program-builder')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Foundation Block' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save Program/i }))

    await waitFor(() => {
      expect(coachBackend.saveProgram).toHaveBeenCalled()
      expect(screen.getByTestId('coach-programs-list')).toBeInTheDocument()
    })
  })

  it('10. scrollCoachShellToTop resets coach main scroll', () => {
    const { container } = renderPrograms()
    const main = container.querySelector('.coach-shell-main')
    main.scrollTop = 180
    scrollCoachShellToTop()
    expect(main.scrollTop).toBe(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachShell from '../components/CoachShell'

describe('CoachShell mobile layout', () => {
  it('locks body scroll and exposes athlete mode switch immediately', () => {
    const { unmount } = render(
      <CoachShell
        screen="clients"
        setScreen={vi.fn()}
        coachName="Coach Jake"
        onExit={vi.fn()}
      >
        <div>Coach hub content</div>
      </CoachShell>,
    )

    expect(document.body.classList.contains('coach-mode-active')).toBe(true)
    expect(
      screen.getByRole('button', { name: /Athlete App/i }),
    ).toBeVisible()

    unmount()

    expect(document.body.classList.contains('coach-mode-active')).toBe(false)
  })
})

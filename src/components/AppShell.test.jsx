import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AppShell from '../components/AppShell'

describe('AppShell navigation', () => {
  it('7. includes Home as a primary athlete destination', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('8. includes Train as a primary athlete destination', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Train' })).toBeInTheDocument()
  })

  it('9. Food replaces Account in bottom nav', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()
    const bottomNav = screen.getByRole('navigation', { name: 'Primary' })
    expect(
      within(bottomNav).queryByRole('button', { name: 'Account' }),
    ).not.toBeInTheDocument()
  })

  it('10. Food tab uses the nutrition route id', () => {
    const setScreen = vi.fn()
    render(
      <AppShell screen="home" setScreen={setScreen}>
        <div>Home</div>
      </AppShell>,
    )

    screen.getByRole('button', { name: 'Food' }).click()
    expect(setScreen).toHaveBeenCalledWith('nutrition')
  })

  it('11. includes Schedule as a primary athlete destination', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
  })

  it('12. includes Progress as a primary athlete destination', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Progress' })).toBeInTheDocument()
  })

  it('renders an injected one-tap messaging shortcut in the header', () => {
    render(
      <AppShell
        screen="home"
        setScreen={() => {}}
        messageShortcut={
          <button type="button" aria-label="Messages">
            Messages
          </button>
        }
      >
        <div>Home</div>
      </AppShell>,
    )

    expect(
      screen.getByRole('button', { name: 'Messages' }),
    ).toBeInTheDocument()
  })

  it('13. Account is reachable from the profile button', () => {
    const onOpenAccount = vi.fn()
    render(
      <AppShell
        screen="home"
        setScreen={() => {}}
        onOpenAccount={onOpenAccount}
        accountInitial="J"
      >
        <div>Home</div>
      </AppShell>,
    )

    screen.getByTestId('app-profile-button').click()
    expect(onOpenAccount).toHaveBeenCalled()
  })

  it('highlights Schedule when viewing legacy in-person route id', () => {
    render(
      <AppShell screen="in-person-schedule" setScreen={() => {}}>
        <div>Schedule</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Schedule' }).className).toContain(
      'active',
    )
  })

  it('highlights Food when viewing nutrition', () => {
    render(
      <AppShell screen="nutrition" setScreen={() => {}}>
        <div>Food</div>
      </AppShell>,
    )

    const food = screen.getByRole('button', { name: 'Food' })
    expect(food.className).toContain('active')
    expect(food).toHaveAttribute('aria-current', 'page')
  })

  it('marks the screen stage busy during route transition', () => {
    const { container } = render(
      <AppShell screen="home" setScreen={() => {}} transitioning>
        <div>Home</div>
      </AppShell>,
    )

    expect(container.querySelector('.screen-stage')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})

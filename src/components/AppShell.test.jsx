import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppShell from '../components/AppShell'

describe('AppShell navigation', () => {
  it('includes Schedule as a primary athlete destination', () => {
    render(
      <AppShell screen="home" setScreen={() => {}}>
        <div>Home</div>
      </AppShell>,
    )

    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nutrition' })).not.toBeInTheDocument()
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
})

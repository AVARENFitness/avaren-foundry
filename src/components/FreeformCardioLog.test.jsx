import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import FreeformCardioLog from './FreeformCardioLog'

describe('FreeformCardioLog editing', () => {
  it('updates an existing walk without duplicating its identity', () => {
    const entries = [
      { id: 'walk-1', kind: 'walk', durationMinutes: 30, distance: 2, distanceUnit: 'mi' },
      { id: 'stretch-1', kind: 'mobility', durationMinutes: 15, distance: null, distanceUnit: 'mi' },
    ]
    const onChange = vi.fn()
    render(<FreeformCardioLog entries={entries} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit walk entry' }))
    const duration = screen.getByRole('spinbutton', { name: 'Duration (min)' })
    fireEvent.change(duration, { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'walk-1', kind: 'walk', durationMinutes: 40, distance: 2 }),
      entries[1],
    ])
  })

  it('cancels an edit without modifying the entries', () => {
    const onChange = vi.fn()
    render(<FreeformCardioLog entries={[{ id: 'stretch-1', kind: 'mobility', durationMinutes: 10, distance: null, distanceUnit: 'mi' }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit mobility entry' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Duration (min)' }), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add movement' })).toBeInTheDocument()
  })
})

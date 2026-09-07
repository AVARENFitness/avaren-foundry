import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  __resetBodyScrollLockForTests,
  getBodyScrollLockCount,
  useBodyScrollLock,
} from './useBodyScrollLock'

function LockProbe({ active }) {
  useBodyScrollLock(active)
  return <span data-testid="lock-probe" />
}

describe('useBodyScrollLock', () => {
  let host
  let scrollY

  beforeEach(() => {
    __resetBodyScrollLockForTests()
    document.body.innerHTML = ''
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    host = document.createElement('div')
    document.body.appendChild(host)
    scrollY = 120
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => scrollY,
    })
    vi.spyOn(window, 'scrollTo').mockImplementation((_x, y) => {
      scrollY = y
    })
  })

  afterEach(() => {
    cleanup()
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('locks #root and restores scroll position on close', async () => {
    const root = document.getElementById('root')
    const { rerender } = render(<LockProbe active />, { container: host })

    await waitFor(() => {
      expect(getBodyScrollLockCount()).toBe(1)
    })
    expect(root.style.position).toBe('fixed')
    expect(root.style.top).toBe('-120px')
    expect(document.documentElement.style.overflow).toBe('hidden')

    rerender(<LockProbe active={false} />)

    await waitFor(() => {
      expect(getBodyScrollLockCount()).toBe(0)
    })
    expect(root.style.position).toBe('')
    expect(window.scrollY).toBe(120)
  })

  it('keeps lock active across nested overlays via refcount', async () => {
    const root = document.getElementById('root')
    const { rerender } = render(
      <>
        <LockProbe active />
        <LockProbe active />
      </>,
      { container: host },
    )

    await waitFor(() => {
      expect(getBodyScrollLockCount()).toBe(2)
    })
    expect(root.style.position).toBe('fixed')

    rerender(
      <>
        <LockProbe active />
        <LockProbe active={false} />
      </>,
    )

    await waitFor(() => {
      expect(getBodyScrollLockCount()).toBe(1)
    })
    expect(root.style.position).toBe('fixed')

    rerender(
      <>
        <LockProbe active={false} />
        <LockProbe active={false} />
      </>,
    )

    await waitFor(() => {
      expect(getBodyScrollLockCount()).toBe(0)
    })
    expect(root.style.position).toBe('')
  })
})

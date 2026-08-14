import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createAvaSession } from '../lib/avaConversation'
import { createNutritionState } from '../lib/nutrition'
import { resetDocumentModalLayer } from '../hooks/useAppModalLayer'
import { AvaProvider } from './AvaContext'
import { AvaUiProvider } from './AvaUiProvider'
import AvaSheet from './AvaSheet'

import { MOBILE_SHEET_QUERY } from './useAvaSheetViewport'

function mockMobileViewport({
  offsetTop = 0,
  height = 640,
  innerHeight = 800,
} = {}) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
    writable: true,
  })

  const listeners = new Map()
  const viewport = {
    height,
    offsetTop,
    width: 390,
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(handler)
    },
    removeEventListener: (type, handler) => {
      listeners.get(type)?.delete(handler)
    },
    dispatch: (type) => {
      listeners.get(type)?.forEach((handler) => handler())
    },
  }

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
    writable: true,
  })

  window.matchMedia = vi.fn((query) => ({
    matches: query === MOBILE_SHEET_QUERY,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))

  return viewport
}

function ensureAppRoot() {
  if (!document.getElementById('root')) {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
  }
  return document.getElementById('root')
}

function resetScrollLockStyles() {
  resetDocumentModalLayer()
  document.body.style.overflow = ''
  document.body.style.position = ''
  const root = document.getElementById('root')
  if (root) {
    root.style.overflow = ''
    root.style.position = ''
    root.style.top = ''
  }
}
const renderOpenAvaSheet = (props = {}) =>
  render(
    <AvaProvider>
      <AvaSheet
        open
        onClose={vi.fn()}
        nutrition={createNutritionState()}
        session={createAvaSession()}
        packet={null}
        role="athlete"
        {...props}
      />
    </AvaProvider>,
  )

describe('AVA mobile sheet lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ensureAppRoot()
    resetScrollLockStyles()
    mockMobileViewport()
  })

  it('opens with canonical backdrop marker on mobile width', () => {
    renderOpenAvaSheet()

    const backdrop = document.querySelector('[data-app-ui-backdrop="open"]')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.classList.contains('ava-sheet-backdrop')).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Ask AVA' })).toBeInTheDocument()
  })

  it('keeps backdrop full-screen on mobile (does not offset backdrop off-screen)', async () => {
    mockMobileViewport({ offsetTop: 120, height: 520, innerHeight: 800 })

    renderOpenAvaSheet()

    await waitFor(() => {
      const backdrop = document.querySelector('[data-app-ui-backdrop="open"]')
      expect(backdrop).not.toBeNull()
      expect(backdrop.style.getPropertyValue('--ava-vv-offset-top')).toBe('')
      expect(backdrop.style.getPropertyValue('--ava-vv-height')).toBe('')
      expect(
        screen.getByRole('dialog', { name: 'Ask AVA' }).style.getPropertyValue(
          '--ava-sheet-max-height',
        ),
      ).not.toBe('')
    })
  })

  it('locks #root (not body) while open so portaled sheet stays interactive', async () => {
    const onClose = vi.fn()
    const root = ensureAppRoot()
    const { rerender } = renderOpenAvaSheet({ onClose })

    expect(root.style.position).toBe('fixed')
    expect(document.body.style.position).not.toBe('fixed')

    rerender(
      <AvaProvider>
        <AvaSheet
          open={false}
          onClose={onClose}
          nutrition={createNutritionState()}
          session={createAvaSession()}
          packet={null}
          role="athlete"
        />
      </AvaProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
      expect(root.style.position).not.toBe('fixed')
      expect(document.documentElement.style.overflow).not.toBe('hidden')
    })
  })

  it('ignores ghost backdrop taps immediately after open', async () => {
    const onClose = vi.fn()
    renderOpenAvaSheet({ onClose })

    const backdrop = document.querySelector('[data-app-ui-backdrop="open"]')
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from backdrop tap after open settle window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onClose = vi.fn()
    renderOpenAvaSheet({ onClose })

    vi.advanceTimersByTime(450)
    fireEvent.click(document.querySelector('[data-app-ui-backdrop="open"]'))
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('survives rapid open/close x5 without stale backdrop or body lock', async () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AvaProvider>
        <AvaSheet
          open={false}
          onClose={onClose}
          nutrition={createNutritionState()}
          session={createAvaSession()}
          packet={null}
          role="athlete"
        />
      </AvaProvider>,
    )

    for (let index = 0; index < 5; index += 1) {
      rerender(
        <AvaProvider>
          <AvaSheet
            open
            onClose={onClose}
            nutrition={createNutritionState()}
            session={createAvaSession()}
            packet={null}
            role="athlete"
          />
        </AvaProvider>,
      )
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()

      rerender(
        <AvaProvider>
          <AvaSheet
            open={false}
            onClose={onClose}
            nutrition={createNutritionState()}
            session={createAvaSession()}
            packet={null}
            role="athlete"
          />
        </AvaProvider>,
      )
    }

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
      expect(ensureAppRoot().style.position).not.toBe('fixed')
    })
  })

  it('does not clear scroll lock while backdrop is still open', () => {
    renderOpenAvaSheet()
    const root = ensureAppRoot()
    root.style.position = 'fixed'

    resetDocumentModalLayer()

    expect(root.style.position).toBe('fixed')
    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
  })

  it('clears root lock when the sheet unmounts after an open cycle', async () => {
    const root = ensureAppRoot()
    const { unmount } = renderOpenAvaSheet()

    expect(root.style.position).toBe('fixed')
    unmount()

    await waitFor(() => {
      expect(root.style.position).not.toBe('fixed')
      expect(document.documentElement.style.overflow).not.toBe('hidden')
    })
  })

  it('does not leave a pointer-blocking backdrop after close', async () => {
    const onClose = vi.fn()
    const { rerender } = renderOpenAvaSheet({ onClose })

    rerender(
      <AvaProvider>
        <AvaSheet
          open={false}
          onClose={onClose}
          nutrition={createNutritionState()}
          session={createAvaSession()}
          packet={null}
          role="athlete"
        />
      </AvaProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).toBeNull()
    })
  })

  it('does not loop viewport resize state updates', async () => {
    const viewport = mockMobileViewport()
    renderOpenAvaSheet()

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: 'Ask AVA' }).style.getPropertyValue(
          '--ava-sheet-max-height',
        ),
      ).not.toBe('')
    })

    const dialog = screen.getByRole('dialog', { name: 'Ask AVA' })
    const initialHeight = dialog.style.getPropertyValue('--ava-sheet-max-height')

    for (let index = 0; index < 8; index += 1) {
      viewport.dispatch('resize')
    }

    expect(dialog.style.getPropertyValue('--ava-sheet-max-height')).toBe(initialHeight)
  })
})

describe('AVA mobile entry via AvaUiProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ensureAppRoot()
    resetScrollLockStyles()
    mockMobileViewport()
  })

  it('opens once from Ask AVA without immediately closing on mobile', async () => {
    const user = userEvent.setup()
    render(
      <AvaProvider>
        <AvaUiProvider nutrition={createNutritionState()} onNutritionChange={vi.fn()}>
          <main>Screen content</main>
        </AvaUiProvider>
      </AvaProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Ask AVA' }))

    expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Ask AVA' })).toBeVisible()
    })
  })
})

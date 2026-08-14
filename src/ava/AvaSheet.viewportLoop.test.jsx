import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAvaSession } from '../lib/avaConversation'
import { createNutritionState } from '../lib/nutrition'
import { AvaProvider } from './AvaContext'
import AvaSheet from './AvaSheet'
import { MOBILE_SHEET_QUERY } from './useAvaSheetViewport'

function mockMobileViewport({ height = 640, innerHeight = 800 } = {}) {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
    writable: true,
  })

  let resizeHandler = null
  const viewport = {
    height,
    offsetTop: 0,
    width: 390,
    addEventListener: (type, handler) => {
      if (type === 'resize') resizeHandler = handler
    },
    removeEventListener: (type, handler) => {
      if (type === 'resize' && resizeHandler === handler) resizeHandler = null
    },
    dispatchResize: () => resizeHandler?.(),
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

describe('AvaSheet viewport stability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (!document.getElementById('root')) {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
    }
  })

  it('does not exceed a bounded render count when visualViewport resizes repeatedly', async () => {
    const viewport = mockMobileViewport()
    let renderCount = 0

    function Probe() {
      renderCount += 1
      return (
        <AvaProvider>
          <AvaSheet
            open
            onClose={() => {}}
            nutrition={createNutritionState()}
            session={createAvaSession()}
            packet={null}
            role="athlete"
          />
        </AvaProvider>
      )
    }

    render(<Probe />)

    await waitFor(() => {
      expect(document.querySelector('[data-app-ui-backdrop="open"]')).not.toBeNull()
    })

    const initialRenderCount = renderCount

    for (let index = 0; index < 12; index += 1) {
      viewport.dispatchResize()
    }

    expect(renderCount - initialRenderCount).toBeLessThan(5)
  })
})

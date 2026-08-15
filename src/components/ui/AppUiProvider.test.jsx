import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import AppUiProvider from './AppUiProvider'
import { appUi } from '../../lib/appUi'

function ToastHarness({ showChild = true }) {
  return (
    <AppUiProvider>
      {showChild ? <div data-testid="toast-child">child</div> : null}
    </AppUiProvider>
  )
}

describe('AppUiProvider toast host', () => {
  afterEach(() => {
    document.getElementById('app-ui-portal-root')?.remove()
    document.body.classList.remove('coach-mode-active')
  })

  it('renders toast stack in app-level portal outside #root', () => {
    render(
      <div id="root">
        <ToastHarness />
      </div>,
    )

    act(() => {
      appUi.toast('Workout assigned to Jake', 'success')
    })

    const stack = document.body.querySelector('[data-testid="app-toast-stack"]')
    expect(stack).toBeTruthy()
    expect(stack?.closest('#root')).toBeNull()
    expect(stack?.closest('#app-ui-portal-root')).toBeTruthy()
  })

  it('keeps toast mounted after transient child unmounts', () => {
    const { rerender } = render(<ToastHarness showChild />)

    act(() => {
      appUi.toast('Workout assigned to Jake', 'success')
    })

    expect(screen.getByText('Workout assigned to Jake')).toBeInTheDocument()

    rerender(<ToastHarness showChild={false} />)

    expect(screen.queryByTestId('toast-child')).not.toBeInTheDocument()
    expect(screen.getByText('Workout assigned to Jake')).toBeInTheDocument()
  })

  it('stacks toast above coach overlays in coach mode', () => {
    const appUiCss = readFileSync(
      resolve(process.cwd(), 'src/styles/components/app-ui.css'),
      'utf8',
    )
    expect(appUiCss).toMatch(/--app-layer-toast:\s*2000/)
    expect(appUiCss).toMatch(
      /body\.coach-mode-active #app-ui-portal-root \.app-toast-stack/,
    )

    document.body.classList.add('coach-mode-active')
    render(<ToastHarness />)

    act(() => {
      appUi.toast('Workout assigned to Jake', 'success')
    })

    const portal = document.getElementById('app-ui-portal-root')
    const stack = document.body.querySelector('[data-testid="app-toast-stack"]')
    expect(portal).toBeTruthy()
    expect(stack).toBeTruthy()
    expect(stack?.closest('#app-ui-portal-root')).toBe(portal)
  })
})

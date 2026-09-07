import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GUIDED_FLOW_ACTIVE_ITEM_GAP_PX,
  measureGuidedFlowStickyOffset,
  resolveGuidedFlowActiveItem,
  resolveGuidedFlowScrollContainer,
  scheduleGuidedFlowScrollToTop,
  scrollGuidedFlowToTop,
} from './guidedFlowScroll'

const mockRect = (element, rect) => {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    width: rect.width ?? 100,
    height: rect.height ?? 40,
    top: rect.top,
    left: rect.left,
    bottom: rect.top + (rect.height ?? 40),
    right: rect.left + (rect.width ?? 100),
    toJSON: () => ({}),
  })
}

describe('guidedFlowScroll', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.stubGlobal(
      'requestAnimationFrame',
      (cb) => {
        cb(0)
        return 1
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('resolves the active guided item card, not overview headers', () => {
    document.body.innerHTML = `
      <header class="app-header">AVAREN</header>
      <section data-testid="overview">Workout summary</section>
      <article data-guided-flow-active-item="exercise" id="active-card">Curl</article>
    `

    const item = resolveGuidedFlowActiveItem()
    expect(item?.id).toBe('active-card')
    expect(item?.closest('[data-testid="overview"]')).toBeNull()
  })

  it('scrolls the active card into the usable viewport instead of page top', () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => 400,
    })

    const header = document.createElement('header')
    header.className = 'app-header'
    header.style.position = 'sticky'
    mockRect(header, { top: 0, left: 0, height: 80, width: 390 })
    document.body.appendChild(header)

    const overview = document.createElement('section')
    overview.textContent = 'progress'
    document.body.appendChild(overview)

    const card = document.createElement('article')
    card.setAttribute('data-guided-flow-active-item', 'exercise')
    mockRect(card, { top: 220, left: 0, height: 500, width: 390 })
    document.body.appendChild(card)

    const result = scrollGuidedFlowToTop()
    expect(result.item).toBe(card)
    expect(result.type).toBe('window')

    const expectedTop = 400 + 220 - 80 - GUIDED_FLOW_ACTIVE_ITEM_GAP_PX
    expect(scrollTo).toHaveBeenCalledWith({
      top: expectedTop,
      left: 0,
      behavior: 'auto',
    })
    expect(scrollTo.mock.calls[0][0].top).not.toBe(0)
  })

  it('scrolls an internal container to the active card, not container top', () => {
    const container = document.createElement('div')
    container.setAttribute('data-guided-flow-scroll', 'true')
    Object.defineProperty(container, 'scrollHeight', { value: 1200 })
    Object.defineProperty(container, 'clientHeight', { value: 400 })
    container.style.overflowY = 'auto'
    container.scrollTop = 360
    container.scrollTo = vi.fn(function scrollToMock(options) {
      this.scrollTop = options.top
    })
    mockRect(container, { top: 100, left: 0, height: 400, width: 390 })

    const overview = document.createElement('div')
    overview.textContent = '10-15 minute session'
    container.appendChild(overview)

    const card = document.createElement('article')
    card.setAttribute('data-guided-flow-active-item', 'movement')
    mockRect(card, { top: 260, left: 0, height: 420, width: 390 })
    container.appendChild(card)
    document.body.appendChild(container)

    const result = scrollGuidedFlowToTop()
    expect(result.type).toBe('element')
    expect(result.element).toBe(container)
    expect(result.item).toBe(card)

    const expectedTop = 360 + (260 - 100) - GUIDED_FLOW_ACTIVE_ITEM_GAP_PX
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: expectedTop,
      left: 0,
      behavior: 'auto',
    })
    expect(container.scrollTop).not.toBe(0)
  })

  it('does not scroll to overview when no active item card exists', () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    document.body.innerHTML = `<section class="mobility-flow-heading">10–15 min</section>`

    const result = scrollGuidedFlowToTop()
    expect(result.type).toBe('none')
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('measureGuidedFlowStickyOffset uses sticky app header height', () => {
    const header = document.createElement('header')
    header.className = 'app-header'
    header.style.position = 'sticky'
    mockRect(header, { top: 0, left: 0, height: 92, width: 390 })
    document.body.appendChild(header)

    expect(measureGuidedFlowStickyOffset()).toBe(92)
  })

  it('scheduleGuidedFlowScrollToTop runs after animation frames', () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => 0,
    })

    const card = document.createElement('article')
    card.setAttribute('data-guided-flow-active-item', 'exercise')
    mockRect(card, { top: 180, left: 0, height: 400, width: 390 })
    document.body.appendChild(card)

    const frames = []
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      frames.push(cb)
      return frames.length
    })

    scheduleGuidedFlowScrollToTop()
    expect(scrollTo).not.toHaveBeenCalled()
    frames[0](0)
    expect(scrollTo).not.toHaveBeenCalled()
    frames[1](0)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(resolveGuidedFlowScrollContainer(card).type).toBe('window')
  })
})

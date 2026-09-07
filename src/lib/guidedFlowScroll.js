const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/i

export const GUIDED_FLOW_SCROLL_BEHAVIOR = 'auto'
export const GUIDED_FLOW_ACTIVE_ITEM_SELECTOR = '[data-guided-flow-active-item]'
export const GUIDED_FLOW_ACTIVE_ITEM_GAP_PX = 8

export const isGuidedFlowScrollableElement = (element) => {
  if (!element || typeof element !== 'object') return false
  if (element === document.body || element === document.documentElement) {
    return false
  }

  const style =
    typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(element)
      : null
  const overflowY = style?.overflowY ?? element.style?.overflowY ?? ''
  if (!SCROLLABLE_OVERFLOW.test(String(overflowY))) return false

  const scrollHeight = Number(element.scrollHeight ?? 0)
  const clientHeight = Number(element.clientHeight ?? 0)
  return scrollHeight > clientHeight + 1
}

const preferredGuidedFlowContainers = () => {
  if (typeof document === 'undefined') return []
  return [
    document.querySelector('[data-guided-flow-scroll]'),
    document.querySelector('.coach-shell-main'),
    document.querySelector('.app-sheet-body'),
    document.querySelector('.app-overlay-body'),
  ].filter(Boolean)
}

/**
 * Resolve the newly active exercise / movement / stretch card.
 */
export const resolveGuidedFlowActiveItem = (fromElement = null) => {
  if (typeof document === 'undefined') return null

  if (fromElement?.matches?.(GUIDED_FLOW_ACTIVE_ITEM_SELECTOR)) {
    return fromElement
  }

  const scoped = fromElement?.querySelector?.(GUIDED_FLOW_ACTIVE_ITEM_SELECTOR)
  if (scoped) return scoped

  const nearest = fromElement?.closest?.(GUIDED_FLOW_ACTIVE_ITEM_SELECTOR)
  if (nearest) return nearest

  return document.querySelector(GUIDED_FLOW_ACTIVE_ITEM_SELECTOR)
}

/**
 * Resolve the scroll owner that should move for guided Next/Previous.
 * Prefers nested scroll containers over window when they own the overflow.
 */
export const resolveGuidedFlowScrollContainer = (fromElement = null) => {
  for (const candidate of preferredGuidedFlowContainers()) {
    if (isGuidedFlowScrollableElement(candidate)) {
      return { type: 'element', element: candidate }
    }
  }

  let node = fromElement?.parentElement ?? fromElement
  while (node && node !== document.body && node !== document.documentElement) {
    if (isGuidedFlowScrollableElement(node)) {
      return { type: 'element', element: node }
    }
    node = node.parentElement
  }

  const root =
    typeof document !== 'undefined' ? document.getElementById('root') : null
  if (isGuidedFlowScrollableElement(root)) {
    return { type: 'element', element: root }
  }

  return { type: 'window', element: null }
}

/** @deprecated Prefer resolveGuidedFlowScrollContainer */
export const resolveGuidedFlowScrollTarget = resolveGuidedFlowScrollContainer

/**
 * Sticky/fixed app header height so the active card title is not hidden underneath.
 */
export const measureGuidedFlowStickyOffset = (scrollContainer = null) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return 0

  const header = document.querySelector('.app-header')
  if (!header) return 0

  const style =
    typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(header)
      : null
  const position = style?.position ?? ''
  if (position !== 'sticky' && position !== 'fixed') return 0

  const headerRect = header.getBoundingClientRect()
  if (!Number.isFinite(headerRect.height) || headerRect.height <= 0) return 0

  if (scrollContainer && scrollContainer !== document.body) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const overlap = Math.min(headerRect.bottom, containerRect.top + headerRect.height)
    const covered = Math.max(0, overlap - containerRect.top)
    return Math.ceil(covered)
  }

  return Math.ceil(headerRect.height)
}

const scrollElementToActiveItem = ({
  container,
  item,
  behavior = GUIDED_FLOW_SCROLL_BEHAVIOR,
}) => {
  const itemRect = item.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const stickyOffset = measureGuidedFlowStickyOffset(container)
  const nextTop =
    container.scrollTop +
    (itemRect.top - containerRect.top) -
    stickyOffset -
    GUIDED_FLOW_ACTIVE_ITEM_GAP_PX

  container.scrollTop = Math.max(0, nextTop)
  if (typeof container.scrollTo === 'function') {
    container.scrollTo({
      top: Math.max(0, nextTop),
      left: 0,
      behavior,
    })
  }
}

const scrollWindowToActiveItem = ({
  item,
  behavior = GUIDED_FLOW_SCROLL_BEHAVIOR,
}) => {
  const stickyOffset = measureGuidedFlowStickyOffset(null)
  const nextTop =
    (window.scrollY || window.pageYOffset || 0) +
    item.getBoundingClientRect().top -
    stickyOffset -
    GUIDED_FLOW_ACTIVE_ITEM_GAP_PX

  if (typeof window.scrollTo === 'function') {
    window.scrollTo({
      top: Math.max(0, nextTop),
      left: 0,
      behavior,
    })
  }
  if (typeof document !== 'undefined') {
    document.documentElement.scrollTop = Math.max(0, nextTop)
    document.body.scrollTop = Math.max(0, nextTop)
  }
}

/**
 * Scroll so the newly active guided item card sits at the top of the usable viewport.
 * Does not scroll to workout/flow overview headers.
 */
export const scrollGuidedFlowToTop = ({
  fromElement = null,
  behavior = GUIDED_FLOW_SCROLL_BEHAVIOR,
  activeItem = null,
} = {}) => {
  const item =
    activeItem ?? resolveGuidedFlowActiveItem(fromElement)

  if (!item) {
    return { type: 'none', element: null, item: null }
  }

  const container = resolveGuidedFlowScrollContainer(item)

  if (container.type === 'element' && container.element) {
    scrollElementToActiveItem({
      container: container.element,
      item,
      behavior,
    })
    return { ...container, item }
  }

  scrollWindowToActiveItem({ item, behavior })
  return { type: 'window', element: null, item }
}

/**
 * Run after the newly active item has committed to the DOM.
 * Double rAF waits for layout/paint without arbitrary timeouts.
 */
export const scheduleGuidedFlowScrollToTop = (options = {}) => {
  const run = () => scrollGuidedFlowToTop(options)

  if (typeof requestAnimationFrame !== 'function') {
    run()
    return
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

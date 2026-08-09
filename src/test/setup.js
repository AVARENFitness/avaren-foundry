import '@testing-library/jest-dom/vitest'

window.scrollTo = () => {}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

if (typeof window.scrollTo !== 'function') {
  window.scrollTo = () => {}
}

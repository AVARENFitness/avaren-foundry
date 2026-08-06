let handlers = null

const normalizeOptions = (value) =>
  typeof value === 'string' ? { message: value } : value ?? {}

export const appUi = {
  register(nextHandlers) {
    handlers = nextHandlers
  },

  confirm(options) {
    if (!handlers?.confirm) {
      console.warn('AppUiProvider is not mounted.')
      return Promise.resolve(false)
    }
    return handlers.confirm(normalizeOptions(options))
  },

  alert(options) {
    if (!handlers?.alert) {
      console.warn('AppUiProvider is not mounted.')
      return Promise.resolve()
    }
    return handlers.alert(normalizeOptions(options))
  },

  toast(message, tone = 'info', options = null) {
    if (!handlers?.toast) {
      console.warn('AppUiProvider is not mounted.')
      return
    }
    handlers.toast(message, tone, options)
  },
}

import { AVA_INTENTS, detectIntent } from './intents'

const ROUTE_BY_INTENT = {
  [AVA_INTENTS.MESSAGE]: 'analyzeMessage',
  [AVA_INTENTS.FOOD]: 'analyzeFood',
  [AVA_INTENTS.WORKOUT]: 'analyzeWorkout',
  [AVA_INTENTS.WEIGHT]: 'analyzeWeight',
  [AVA_INTENTS.WATER]: 'analyzeWater',
  [AVA_INTENTS.SUGGESTIONS]: 'getSuggestions',
}

export default class AvaIntentRouter {
  constructor(service) {
    this.service = service
  }

  detectIntent(message = '') {
    return detectIntent(message)
  }

  async route(input = '', context = {}) {
    const message = String(input ?? '').trim()
    const intent = this.detectIntent(message)
    const methodName = ROUTE_BY_INTENT[intent] ?? 'analyzeMessage'
    const handler = this.service?.[methodName]

    if (typeof handler !== 'function') {
      return this.service.analyzeMessage(message, context)
    }

    const payload =
      intent === AVA_INTENTS.MESSAGE || intent === AVA_INTENTS.UNKNOWN
        ? message
        : { query: message, description: message }

    const response = await handler.call(this.service, payload, context)

    return {
      ...response,
      routedIntent: intent,
    }
  }

  async routeIntent(intent, input = {}, context = {}) {
    const methodName = ROUTE_BY_INTENT[intent]

    if (!methodName || typeof this.service?.[methodName] !== 'function') {
      return this.service.analyzeMessage(
        typeof input === 'string' ? input : input?.query ?? '',
        context,
      )
    }

    return this.service[methodName].call(this.service, input, context)
  }
}

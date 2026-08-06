import { createContext, useMemo } from 'react'
import AvaIntentRouter from './AvaIntentRouter'
import AvaService from './AvaService'

export const AvaContext = createContext(null)

export function AvaProvider({ children, service: serviceOverride = null }) {
  const value = useMemo(() => {
    const service = serviceOverride ?? new AvaService()
    const router = new AvaIntentRouter(service)

    return {
      service,
      router,
      analyzeMessage: (input, context) =>
        service.analyzeMessage(input, context),
      analyzeFood: (input, context) => service.analyzeFood(input, context),
      analyzeWorkout: (input, context) =>
        service.analyzeWorkout(input, context),
      analyzeWeight: (input, context) =>
        service.analyzeWeight(input, context),
      analyzeWater: (input, context) => service.analyzeWater(input, context),
      getSuggestions: (context) => service.getSuggestions(context),
      routeMessage: (input, context) => router.route(input, context),
      routeIntent: (intent, input, context) =>
        router.routeIntent(intent, input, context),
      detectIntent: (message) => router.detectIntent(message),
    }
  }, [serviceOverride])

  return (
    <AvaContext.Provider value={value}>{children}</AvaContext.Provider>
  )
}

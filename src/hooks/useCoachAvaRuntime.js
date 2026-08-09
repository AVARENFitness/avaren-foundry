import { useCallback, useEffect, useRef, useState } from 'react'
import { buildBaseCoachAvaContext } from '../ava/coach/avaCoachRole'
import { useCoachPortfolioSession } from './useCoachPortfolio'

/**
 * Coach AVA context lifecycle — app/session state, not chat-sheet state.
 * Portfolio hydration status flows here and into AvaSheet via coachContext.
 */
export function useCoachAvaRuntime({
  session = null,
  coachAuthorized = false,
} = {}) {
  const coachAvaContextRef = useRef(
    buildBaseCoachAvaContext({
      session: null,
      coachAuthorized: false,
      isCoachMode: false,
    }),
  )
  const [coachAvaContext, setCoachAvaContext] = useState(() =>
    buildBaseCoachAvaContext({
      session: null,
      coachAuthorized: false,
      isCoachMode: false,
    }),
  )

  const coachPortfolioSession = useCoachPortfolioSession(coachAuthorized)

  const hydrateCoachAvaContext = useCallback(
    (hydratedContext = {}) => {
      setCoachAvaContext((current) => {
        const merged = buildBaseCoachAvaContext({
          session,
          coachAuthorized,
          isCoachMode: Boolean(coachAuthorized),
          rosterContext: {
            ...current,
            ...hydratedContext,
            ensureCoachPortfolio: coachPortfolioSession.ensurePortfolio,
          },
        })
        coachAvaContextRef.current = merged
        return merged
      })
    },
    [session, coachAuthorized, coachPortfolioSession.ensurePortfolio],
  )

  useEffect(() => {
    if (!coachAuthorized) return
    hydrateCoachAvaContext(coachPortfolioSession.coachContextOverlay)
  }, [
    coachAuthorized,
    coachPortfolioSession.coachContextOverlay,
    hydrateCoachAvaContext,
  ])

  useEffect(() => {
    setCoachAvaContext((current) => {
      const merged = buildBaseCoachAvaContext({
        session,
        coachAuthorized,
        isCoachMode: Boolean(coachAuthorized),
        rosterContext: {
          ...current,
          ensureCoachPortfolio: coachPortfolioSession.ensurePortfolio,
          onCoachContextHydrated: hydrateCoachAvaContext,
        },
      })
      coachAvaContextRef.current = merged
      return merged
    })
  }, [
    session,
    coachAuthorized,
    coachPortfolioSession.ensurePortfolio,
    hydrateCoachAvaContext,
  ])

  return {
    coachAvaContext,
    coachAvaContextRef,
    hydrateCoachAvaContext,
    coachPortfolioSession,
  }
}

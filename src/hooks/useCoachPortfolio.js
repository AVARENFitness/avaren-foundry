import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  COACH_PORTFOLIO_STATUS,
  buildCoachPortfolioBundle,
  ensureCoachPortfolio,
  invalidateCoachPortfolioCache,
  loadCoachPortfolio,
  loadCoachPortfolioIntelligence,
  mergeCoachPortfolioBundle,
  publishCoachPortfolioBundle,
} from '../lib/coachPortfolioService'

export function useCoachPortfolio(clients = [], assignments = []) {
  const [athleteStatesById, setAthleteStatesById] = useState({})
  const [nutritionByAthleteId, setNutritionByAthleteId] = useState({})
  const [weeklyReviewsByAthleteId, setWeeklyReviewsByAthleteId] = useState({})
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)

  const athleteIds = useMemo(
    () => clients.map((client) => client.athlete_id).filter(Boolean),
    [clients],
  )

  const refreshPortfolio = useCallback(() => {
    invalidateCoachPortfolioCache()
    setRefreshToken((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!athleteIds.length) {
      setAthleteStatesById({})
      setNutritionByAthleteId({})
      setWeeklyReviewsByAthleteId({})
      setPortfolioLoading(false)
      setPortfolioError('')
      return
    }

    let active = true
    setPortfolioLoading(true)
    setPortfolioError('')

    loadCoachPortfolioIntelligence({ clients, assignments, force: refreshToken > 0 })
      .then(({ athleteStatesById: states, nutritionByAthleteId: nutrition, weeklyReviewsByAthleteId: reviews }) => {
        if (!active) return
        setAthleteStatesById(states)
        setNutritionByAthleteId(nutrition)
        setWeeklyReviewsByAthleteId(reviews)
      })
      .catch((error) => {
        if (!active) return
        setPortfolioError(error?.message ?? 'Could not load portfolio intelligence.')
      })
      .finally(() => {
        if (active) setPortfolioLoading(false)
      })

    return () => {
      active = false
    }
  }, [athleteIds.join('|'), assignments, refreshToken, clients])

  const portfolio = useMemo(
    () =>
      buildCoachPortfolioBundle({
        clients,
        assignments,
        athleteStatesById,
        nutritionByAthleteId,
        weeklyReviewsByAthleteId,
        status: portfolioLoading
          ? COACH_PORTFOLIO_STATUS.LOADING
          : portfolioError
          ? COACH_PORTFOLIO_STATUS.ERROR
          : COACH_PORTFOLIO_STATUS.READY,
        error: portfolioError,
        source: 'hook',
      }).portfolio,
    [
      clients,
      assignments,
      athleteStatesById,
      nutritionByAthleteId,
      weeklyReviewsByAthleteId,
      portfolioLoading,
      portfolioError,
    ],
  )

  useEffect(() => {
    if (!clients.length || portfolioLoading) return
    publishCoachPortfolioBundle(
      buildCoachPortfolioBundle({
        clients,
        assignments,
        athleteStatesById,
        nutritionByAthleteId,
        weeklyReviewsByAthleteId,
        status: portfolioError ? COACH_PORTFOLIO_STATUS.ERROR : COACH_PORTFOLIO_STATUS.READY,
        error: portfolioError,
        source: 'coach-hub',
      }),
    )
  }, [
    clients,
    assignments,
    athleteStatesById,
    nutritionByAthleteId,
    weeklyReviewsByAthleteId,
    portfolioLoading,
    portfolioError,
  ])

  return {
    portfolio,
    portfolioLoading,
    portfolioError,
    refreshPortfolio,
    athleteStatesById,
    weeklyReviewsByAthleteId,
    nutritionByAthleteId,
  }
}

export function useCoachPortfolioSession(coachAuthorized = false) {
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(false)

  const refreshPortfolio = useCallback(async ({ force = true } = {}) => {
    if (!coachAuthorized) return null
    setLoading(true)
    try {
      const next = await loadCoachPortfolio({ force })
      setBundle(next)
      return next
    } finally {
      setLoading(false)
    }
  }, [coachAuthorized])

  useEffect(() => {
    if (!coachAuthorized) {
      setBundle(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    loadCoachPortfolio()
      .then((next) => {
        if (active) setBundle(next)
      })
      .catch(() => {
        if (active) setBundle(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [coachAuthorized])

  const ensurePortfolio = useCallback(
    async ({ requiredDomains = [], force = false } = {}) => {
      if (!coachAuthorized) return null
      setLoading(true)
      try {
        const next = await ensureCoachPortfolio({ requiredDomains, force })
        setBundle(next)
        return next
      } finally {
        setLoading(false)
      }
    },
    [coachAuthorized],
  )

  const coachContextOverlay = useMemo(() => {
    if (!coachAuthorized || !bundle) {
      return {
        portfolioStatus: coachAuthorized
          ? loading
            ? COACH_PORTFOLIO_STATUS.LOADING
            : COACH_PORTFOLIO_STATUS.IDLE
          : COACH_PORTFOLIO_STATUS.IDLE,
      }
    }
    return mergeCoachPortfolioBundle({}, bundle)
  }, [coachAuthorized, bundle, loading])

  return {
    bundle,
    loading,
    refreshPortfolio,
    ensurePortfolio,
    coachContextOverlay,
  }
}

export { ensureCoachPortfolio, mergeCoachPortfolioBundle }

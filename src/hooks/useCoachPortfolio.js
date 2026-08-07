import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildCoachPortfolioIntelligence } from '../lib/clientIntelligence'
import { coachBackend } from '../lib/coachBackend'
import { normalizeWeeklyReview } from '../lib/weeklyReview'

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

    Promise.all([
      coachBackend.listAthleteFoundryStates(athleteIds),
      coachBackend.listAthleteNutritionSnapshots(athleteIds),
      coachBackend.listCoachWeeklyReviews(),
    ])
      .then(([states, nutrition, reviews]) => {
        if (!active) return
        setAthleteStatesById(states)
        setNutritionByAthleteId(nutrition)
        setWeeklyReviewsByAthleteId(
          Object.fromEntries(
            (reviews ?? [])
              .map((row) => normalizeWeeklyReview(row))
              .filter(Boolean)
              .map((review) => [review.athleteId, review]),
          ),
        )
      })
      .catch((error) => {
        if (!active) return
        setPortfolioError(
          error?.message ?? 'Could not load portfolio intelligence.',
        )
      })
      .finally(() => {
        if (active) setPortfolioLoading(false)
      })

    return () => {
      active = false
    }
  }, [athleteIds.join('|'), refreshToken])

  const portfolio = useMemo(
    () =>
      buildCoachPortfolioIntelligence({
        clients,
        assignments,
        athleteStatesById,
        nutritionByAthleteId,
        weeklyReviewsByAthleteId,
      }),
    [clients, assignments, athleteStatesById, nutritionByAthleteId, weeklyReviewsByAthleteId],
  )

  return {
    portfolio,
    portfolioLoading,
    portfolioError,
    refreshPortfolio,
  }
}

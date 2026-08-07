import { useEffect, useMemo, useState } from 'react'
import { buildCoachPortfolioIntelligence } from '../lib/clientIntelligence'
import { coachBackend } from '../lib/coachBackend'

export function useCoachPortfolio(clients = [], assignments = []) {
  const [athleteStatesById, setAthleteStatesById] = useState({})
  const [nutritionByAthleteId, setNutritionByAthleteId] = useState({})
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState('')

  const athleteIds = useMemo(
    () => clients.map((client) => client.athlete_id).filter(Boolean),
    [clients],
  )

  useEffect(() => {
    if (!athleteIds.length) {
      setAthleteStatesById({})
      setNutritionByAthleteId({})
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
    ])
      .then(([states, nutrition]) => {
        if (!active) return
        setAthleteStatesById(states)
        setNutritionByAthleteId(nutrition)
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
  }, [athleteIds.join('|')])

  const portfolio = useMemo(
    () =>
      buildCoachPortfolioIntelligence({
        clients,
        assignments,
        athleteStatesById,
        nutritionByAthleteId,
      }),
    [clients, assignments, athleteStatesById, nutritionByAthleteId],
  )

  return {
    portfolio,
    portfolioLoading,
    portfolioError,
  }
}

import { useCallback, useEffect, useState } from 'react'
import { buildAthletePassStatus } from '../lib/athletePassStatus'
import { coachBackend } from '../lib/coachBackend'

/**
 * Loads athlete pass status from canonical SECURITY DEFINER RPCs
 * (same ledger truth coaches use — no separate athlete counter).
 */
export const useAthletePassStatus = () => {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRows, historyRows] = await Promise.all([
        coachBackend.getAthleteTrainingPassSummary(),
        coachBackend.listAthletePassUsageHistory(100),
      ])
      setStatus(
        buildAthletePassStatus({
          summaryRows,
          historyRows,
        }),
      )
    } catch {
      setStatus({
        visible: false,
        groups: [],
        primary: null,
        multipleRelationships: false,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    status,
    loading,
    refresh,
  }
}

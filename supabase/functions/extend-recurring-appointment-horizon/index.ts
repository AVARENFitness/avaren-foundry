import { json } from '../_shared/appointmentPush.ts'
import { authorizeCronWorkerRequest } from '../_shared/cronWorkerAuth.ts'

export default {
  async fetch(req: Request) {
    const auth = await authorizeCronWorkerRequest(req)
    if (!auth.authorized) {
      return auth.response
    }

    const admin = auth.admin

    try {
      const { data, error } = await admin.rpc('extend_recurring_appointment_horizons', {
        p_horizon_weeks: 12,
        p_extension_threshold_days: 14,
      })

      if (error) throw error

      return json(data ?? {
        seriesExtended: 0,
        occurrencesCreated: 0,
        conflictsResolved: 0,
        conflictsRemaining: 0,
      })
    } catch (error) {
      console.error(error)
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown recurring horizon extension error',
        },
        500,
      )
    }
  },
}

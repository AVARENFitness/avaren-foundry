import { useAthleteAppointmentsContext } from '../context/athleteAppointmentsContext'
import { AthleteAppointmentsProvider } from '../context/AthleteAppointmentsProvider'

export { AthleteAppointmentsProvider }

export function useAthleteAppointments(_userId = null) {
  const context = useAthleteAppointmentsContext()

  if (!context) {
    throw new Error(
      'useAthleteAppointments must be used within AthleteAppointmentsProvider',
    )
  }

  return context
}

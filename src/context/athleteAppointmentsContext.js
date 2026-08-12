import { createContext, useContext } from 'react'

export const AthleteAppointmentsContext = createContext(null)

export function useAthleteAppointmentsContext() {
  return useContext(AthleteAppointmentsContext)
}

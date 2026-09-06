import { createContext, useContext } from 'react'

export const AthleteCoachInvitationsContext = createContext(null)

export const useAthleteCoachInvitationsContext = () =>
  useContext(AthleteCoachInvitationsContext)

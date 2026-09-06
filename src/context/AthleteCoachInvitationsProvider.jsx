import { AthleteCoachInvitationsContext } from './athleteCoachInvitationsContext'

export function AthleteCoachInvitationsProvider({ value, children }) {
  return (
    <AthleteCoachInvitationsContext.Provider value={value}>
      {children}
    </AthleteCoachInvitationsContext.Provider>
  )
}

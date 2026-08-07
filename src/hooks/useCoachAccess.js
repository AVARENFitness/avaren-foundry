import { useEffect, useState } from 'react'
import {
  fetchCoachAuthorization,
  isCoachAccount,
} from '../config/coachAccess'

export function useCoachAccess(session) {
  const [authorized, setAuthorized] = useState(() =>
    isCoachAccount(session),
  )
  const [loading, setLoading] = useState(Boolean(session?.user))

  useEffect(() => {
    if (!session?.user) {
      setAuthorized(false)
      setLoading(false)
      return undefined
    }

    if (isCoachAccount(session)) {
      setAuthorized(true)
      setLoading(false)
      return undefined
    }

    let active = true
    setLoading(true)

    fetchCoachAuthorization(session)
      .then((value) => {
        if (active) setAuthorized(Boolean(value))
      })
      .catch(() => {
        if (active) setAuthorized(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [session?.user?.id, session?.user?.email])

  return {
    authorized,
    loading,
    canAccessCoachHub: authorized,
  }
}

export function canAccessCoachHub(session, authorized = false) {
  return Boolean(session?.user) && (isCoachAccount(session) || authorized)
}

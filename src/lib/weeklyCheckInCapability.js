import { supabase } from './supabase'

export const WEEKLY_CHECKIN_CAPABILITY_STATUS = {
  UNKNOWN: 'unknown',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
}

export const isMissingWeeklyCheckInTable = (error) =>
  error?.code === '42P01' ||
  error?.code === '42883' ||
  error?.code === 'PGRST205' ||
  /does not exist|could not find the table|schema cache/i.test(
    error?.message ?? '',
  )

const emptyCapability = () => ({
  status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNKNOWN,
  schemaAvailable: false,
  probedAt: null,
  source: null,
})

let cachedCapability = emptyCapability()
let inflightProbe = null

export const getWeeklyCheckInCapability = () => ({ ...cachedCapability })

export const resetWeeklyCheckInCapabilityCache = () => {
  cachedCapability = emptyCapability()
  inflightProbe = null
}

export const logWeeklyCheckInCapabilityDiagnostic = ({
  status = WEEKLY_CHECKIN_CAPABILITY_STATUS.UNKNOWN,
  schemaAvailable = false,
  source = 'cache',
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[weekly-checkin-capability]',
    JSON.stringify({
      status,
      schemaAvailable,
      source,
    }),
  )
}

export const logWeeklyCheckInRuntimeDiagnostic = ({
  stage = 'idle',
  status = WEEKLY_CHECKIN_CAPABILITY_STATUS.UNKNOWN,
} = {}) => {
  if (!import.meta.env?.DEV) return

  console.debug(
    '[weekly-checkin-runtime]',
    JSON.stringify({
      stage,
      status,
    }),
  )
}

export const probeWeeklyCheckInCapability = async ({
  force = false,
  source = 'probe',
} = {}) => {
  if (cachedCapability.probedAt && !force) {
    logWeeklyCheckInCapabilityDiagnostic({
      status: cachedCapability.status,
      schemaAvailable: cachedCapability.schemaAvailable,
      source: 'cache',
    })
    return getWeeklyCheckInCapability()
  }

  if (inflightProbe && !force) {
    return inflightProbe
  }

  if (!supabase) {
    cachedCapability = {
      status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNAVAILABLE,
      schemaAvailable: false,
      probedAt: Date.now(),
      source,
    }
    logWeeklyCheckInCapabilityDiagnostic({
      ...cachedCapability,
      source,
    })
    return getWeeklyCheckInCapability()
  }

  cachedCapability = {
    status: WEEKLY_CHECKIN_CAPABILITY_STATUS.CHECKING,
    schemaAvailable: false,
    probedAt: null,
    source,
  }

  inflightProbe = (async () => {
    try {
      const probe = await supabase
        .from('athlete_weekly_check_ins')
        .select('id')
        .limit(1)

      if (probe.error && isMissingWeeklyCheckInTable(probe.error)) {
        cachedCapability = {
          status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNAVAILABLE,
          schemaAvailable: false,
          probedAt: Date.now(),
          source,
        }
      } else if (probe.error) {
        cachedCapability = {
          status: WEEKLY_CHECKIN_CAPABILITY_STATUS.ERROR,
          schemaAvailable: false,
          probedAt: Date.now(),
          source,
        }
      } else {
        cachedCapability = {
          status: WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE,
          schemaAvailable: true,
          probedAt: Date.now(),
          source,
        }
      }
    } catch {
      cachedCapability = {
        status: WEEKLY_CHECKIN_CAPABILITY_STATUS.UNAVAILABLE,
        schemaAvailable: false,
        probedAt: Date.now(),
        source,
      }
    } finally {
      inflightProbe = null
    }

    logWeeklyCheckInCapabilityDiagnostic({
      ...cachedCapability,
      source,
    })
    return getWeeklyCheckInCapability()
  })()

  return inflightProbe
}

export const isWeeklyCheckInFeatureEnabled = (
  capability = getWeeklyCheckInCapability(),
) =>
  capability.status === WEEKLY_CHECKIN_CAPABILITY_STATUS.AVAILABLE &&
  capability.schemaAvailable === true

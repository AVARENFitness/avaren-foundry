import { supabase } from './supabase'
import { getCoachWeekRange } from './weeklyReview'
import { isQuerySafeAthleteId } from './coachBusinessClient'
import {
  COACHING_REQUIREMENT_KEYS,
  isDuplicateActiveLinkedRelationshipsError,
  normalizeCoachingRequirements,
  WEEKLY_CHECK_IN_REQUIREMENT,
} from './coachClientRequirements'
import {
  isMissingWeeklyCheckInTable,
  isWeeklyCheckInFeatureEnabled,
  probeWeeklyCheckInCapability,
} from './weeklyCheckInCapability'
import {
  normalizeWeeklyCheckIn,
  validateWeeklyCheckInDraft,
} from './weeklyCheckIn'

const missingCoachBackend = (error) =>
  error?.code === '42P01' ||
  error?.code === '42883' ||
  /does not exist/i.test(error?.message ?? '')

const missingDevResetRpc = (error) =>
  error?.code === '42883' ||
  /dev_reset_current_weekly_check_in/i.test(error?.message ?? '')

export const DEV_WEEKLY_CHECKIN_RESET_RPC = 'dev_reset_current_weekly_check_in'

export const DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE =
  'DEV weekly check-in reset is unavailable until AVAREN_DEV_WEEKLY_CHECKIN_RESET_7_9_19.sql is applied in Supabase.'

const currentWeekCache = {
  key: null,
  record: null,
}

const currentWeekCacheKey = (athleteId, weekStart) =>
  `${athleteId}:${weekStart}`

const readCurrentWeekCache = (athleteId, weekStart) => {
  if (!athleteId || !weekStart) return null
  const key = currentWeekCacheKey(athleteId, weekStart)
  if (currentWeekCache.key === key && currentWeekCache.record) {
    const normalized = normalizeWeeklyCheckIn(currentWeekCache.record)
    if (normalized?.athleteId === athleteId && normalized?.weekStart === weekStart) {
      return normalized
    }
  }
  return null
}

const writeCurrentWeekCache = (record) => {
  const normalized = normalizeWeeklyCheckIn(record)
  if (!normalized?.athleteId || !normalized?.weekStart) return normalized
  currentWeekCache.key = currentWeekCacheKey(
    normalized.athleteId,
    normalized.weekStart,
  )
  currentWeekCache.record = normalized
  return normalized
}

export const resetWeeklyCheckInBackendCache = () => {
  currentWeekCache.key = null
  currentWeekCache.record = null
}

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

const ensureSchemaReady = async () => {
  const capability = await probeWeeklyCheckInCapability()
  return isWeeklyCheckInFeatureEnabled(capability)
}

export const weeklyCheckInBackend = {
  async getAthleteCoachingRequirements() {
    const safeDefault = normalizeCoachingRequirements({
      [COACHING_REQUIREMENT_KEYS.WEEKLY_CHECK_IN]:
        WEEKLY_CHECK_IN_REQUIREMENT.NOT_REQUIRED,
    })

    try {
      await currentUser()
      const { data, error } = await supabase.rpc(
        'get_athlete_coaching_requirements',
      )

      if (!error && data) {
        return normalizeCoachingRequirements(data)
      }

      if (error && isDuplicateActiveLinkedRelationshipsError(error)) {
        console.error(
          '[coaching-requirements] duplicate active linked relationships for athlete',
        )
      } else if (error && !missingCoachBackend(error)) {
        console.warn('Could not load athlete coaching requirements:', error)
      }
    } catch (error) {
      console.warn('Could not load athlete coaching requirements:', error)
    }

    return safeDefault
  },

  async hasCoachRelationship() {
    try {
      const user = await currentUser()
      const { data, error } = await supabase
        .from('coach_clients')
        .select('coach_id')
        .eq('athlete_id', user.id)
        .limit(1)

      if (error) {
        if (missingCoachBackend(error)) return false
        throw error
      }

      return (data?.length ?? 0) > 0
    } catch {
      return false
    }
  },

  async getCurrentWeeklyCheckIn(now = new Date()) {
    if (!(await ensureSchemaReady())) {
      return null
    }

    const user = await currentUser()
    const weekRange = getCoachWeekRange(now)
    const cached = readCurrentWeekCache(user.id, weekRange.weekStart)
    if (cached) {
      return cached
    }

    try {
      const { data, error } = await supabase
        .from('athlete_weekly_check_ins')
        .select('*')
        .eq('athlete_id', user.id)
        .eq('week_start', weekRange.weekStart)
        .maybeSingle()

      if (error) {
        if (isMissingWeeklyCheckInTable(error)) {
          return readCurrentWeekCache(user.id, weekRange.weekStart)
        }
        throw error
      }

      if (!data) {
        return readCurrentWeekCache(user.id, weekRange.weekStart)
      }

      return writeCurrentWeekCache(data)
    } catch {
      return readCurrentWeekCache(user.id, weekRange.weekStart)
    }
  },

  async submitWeeklyCheckIn(draft = {}, now = new Date()) {
    const validation = validateWeeklyCheckInDraft(draft)
    if (!validation.ok) {
      throw new Error(validation.message)
    }

    if (!(await ensureSchemaReady())) {
      throw new Error(
        'Weekly check-ins are not available yet. Try again after your coach updates AVAREN.',
      )
    }

    const user = await currentUser()
    const weekRange = getCoachWeekRange(now)
    const sanitized = validation.draft
    const timestamp = new Date().toISOString()
    const payload = {
      athlete_id: user.id,
      week_start: weekRange.weekStart,
      week_end: weekRange.weekEnd,
      training_rating: sanitized.training_rating,
      recovery_rating: sanitized.recovery_rating,
      nutrition_rating: sanitized.nutrition_rating,
      pain_or_issue: sanitized.pain_or_issue,
      pain_note: sanitized.pain_note,
      weekly_win: sanitized.weekly_win,
      coach_note: sanitized.coach_note,
      status: 'submitted',
      submitted_at: timestamp,
      updated_at: timestamp,
    }

    try {
      const { data, error } = await supabase
        .from('athlete_weekly_check_ins')
        .upsert(payload, { onConflict: 'athlete_id,week_start' })
        .select('*')
        .single()

      if (error) {
        if (isMissingWeeklyCheckInTable(error)) {
          throw new Error(
            'Weekly check-ins are not available yet. Try again after your coach updates AVAREN.',
          )
        }
        throw error
      }

      return writeCurrentWeekCache(data)
    } catch (error) {
      if (isMissingWeeklyCheckInTable(error)) {
        throw new Error(
          'Weekly check-ins are not available yet. Try again after your coach updates AVAREN.',
        )
      }
      throw error
    }
  },

  async listCoachWeeklyCheckIns(athleteIds = [], weekStart = null) {
    if (!athleteIds.length) return {}

    if (!(await ensureSchemaReady())) {
      return {}
    }

    const week = weekStart ?? getCoachWeekRange().weekStart

    try {
      const { data, error } = await supabase
        .from('athlete_weekly_check_ins')
        .select('*')
        .in('athlete_id', athleteIds)
        .eq('week_start', week)

      if (error) {
        if (isMissingWeeklyCheckInTable(error)) {
          return {}
        }
        throw error
      }

      return Object.fromEntries(
        (data ?? [])
          .map((row) => normalizeWeeklyCheckIn(row))
          .filter(Boolean)
          .map((record) => [record.athleteId, record]),
      )
    } catch (error) {
      if (isMissingWeeklyCheckInTable(error)) {
        return {}
      }
      return {}
    }
  },

  async getClientWeeklyCheckIn(athleteId, weekStart = null) {
    if (!isQuerySafeAthleteId(athleteId)) {
      return null
    }

    if (!(await ensureSchemaReady())) {
      return null
    }

    const week = weekStart ?? getCoachWeekRange().weekStart

    try {
      const { data, error } = await supabase
        .from('athlete_weekly_check_ins')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('week_start', week)
        .maybeSingle()

      if (error) {
        if (isMissingWeeklyCheckInTable(error)) {
          return null
        }
        throw error
      }

      return normalizeWeeklyCheckIn(data)
    } catch {
      return null
    }
  },

  async resetCurrentWeekWeeklyCheckIn(now = new Date()) {
    if (!import.meta.env?.DEV) {
      throw new Error(
        'This action is only available in development builds.',
      )
    }

    const weekRange = getCoachWeekRange(now)

    if (!(await ensureSchemaReady())) {
      return {
        deleted: false,
        weekStart: weekRange.weekStart,
        rowExistedBefore: false,
        rowExistsAfter: false,
      }
    }

    const user = await currentUser()
    resetWeeklyCheckInBackendCache()

    const readCurrentWeekRow = async () => {
      const { data, error } = await supabase
        .from('athlete_weekly_check_ins')
        .select('id')
        .eq('athlete_id', user.id)
        .eq('week_start', weekRange.weekStart)
        .maybeSingle()

      if (error) {
        if (isMissingWeeklyCheckInTable(error)) return null
        throw error
      }

      return data ?? null
    }

    try {
      const beforeRow = await readCurrentWeekRow()
      const rowExistedBefore = Boolean(beforeRow)

      const { data, error } = await supabase.rpc(
        DEV_WEEKLY_CHECKIN_RESET_RPC,
      )

      if (error) {
        if (missingDevResetRpc(error)) {
          const errorMessage = DEV_WEEKLY_CHECKIN_RESET_RPC_MISSING_MESSAGE
          return {
            deleted: false,
            weekStart: weekRange.weekStart,
            rowExistedBefore,
            rowExistsAfter: rowExistedBefore,
            rowsAffected: 0,
            deleteBlockedByRls: false,
            rpcAvailable: false,
            errorMessage,
          }
        }
        if (isMissingWeeklyCheckInTable(error)) {
          return {
            deleted: false,
            weekStart: weekRange.weekStart,
            rowExistedBefore,
            rowExistsAfter: rowExistedBefore,
            rowsAffected: 0,
            deleteBlockedByRls: false,
            rpcAvailable: true,
          }
        }
        throw error
      }

      resetWeeklyCheckInBackendCache()

      const payload = data ?? {}
      const rpcWeekStart = payload.week_start ?? weekRange.weekStart
      const rpcRowExistedBefore = Boolean(
        payload.row_existed_before ?? rowExistedBefore,
      )
      const rpcRowExistsAfter = Boolean(payload.row_exists_after)
      const rowsAffected = Number(payload.rows_affected ?? 0)
      const rowExistsAfter =
        typeof payload.row_exists_after === 'boolean'
          ? payload.row_exists_after
          : Boolean(await readCurrentWeekRow())
      const deleted = Boolean(
        payload.deleted ?? (rpcRowExistedBefore && !rowExistsAfter),
      )

      return {
        deleted,
        weekStart: rpcWeekStart,
        rowExistedBefore: rpcRowExistedBefore,
        rowExistsAfter,
        rowsAffected,
        deleteBlockedByRls:
          rpcRowExistedBefore && rowsAffected === 0 && rowExistsAfter,
        rpcAvailable: true,
      }
    } catch (error) {
      if (isMissingWeeklyCheckInTable(error)) {
        return {
          deleted: false,
          weekStart: weekRange.weekStart,
          rowExistedBefore: false,
          rowExistsAfter: false,
          rowsAffected: 0,
          deleteBlockedByRls: false,
          rpcAvailable: true,
        }
      }
      throw error
    }
  },
}

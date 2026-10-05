type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  timezone?: string | null
  last_seen_at?: string | null
}

type FoundryStateRow = {
  user_id: string
  state: Record<string, unknown> | null
}

type ReminderLedgerRow = {
  id: string
  delivery_status: string
  updated_at: string
}

const localParts = (timeZone: string, date = new Date()) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date)

    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    )

    const localDate = `${value.year}-${value.month}-${value.day}`
    const hour = Number(value.hour)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !Number.isFinite(hour)) {
      return null
    }

    return { localDate, hour }
  } catch {
    return null
  }
}

const hasReadinessForDate = (
  state: Record<string, unknown> | null,
  localDate: string,
) => {
  const readiness = (state?.readiness ?? {}) as {
    entries?: Array<{ date?: string }>
  }

  return (readiness.entries ?? []).some(
    (entry) => String(entry?.date ?? '') === localDate,
  )
}

const groupSubscriptionsByUser = (rows: SubscriptionRow[] = []) => {
  const byUser = new Map<
    string,
    { subscriptions: SubscriptionRow[]; timeZone: string | null }
  >()

  for (const row of rows) {
    const current = byUser.get(row.user_id) ?? {
      subscriptions: [],
      timeZone: null,
    }
    current.subscriptions.push(row)

    if (row.timezone?.trim()) {
      if (!current.timeZone) {
        current.timeZone = row.timezone.trim()
      } else {
        const currentRow = current.subscriptions.find(
          (item) => item.timezone === current.timeZone,
        )
        const currentSeen = new Date(currentRow?.last_seen_at ?? 0).getTime()
        const nextSeen = new Date(row.last_seen_at ?? 0).getTime()
        if (nextSeen > currentSeen) current.timeZone = row.timezone.trim()
      }
    }

    byUser.set(row.user_id, current)
  }

  return byUser
}

const existingReminder = async (
  admin: any,
  userId: string,
  localDate: string,
) => {
  const { data, error } = await admin
    .from('smart_reminder_deliveries')
    .select('id, delivery_status, updated_at')
    .eq('user_id', userId)
    .eq('reminder_type', 'daily_readiness')
    .eq('local_date', localDate)
    .maybeSingle()

  if (error) throw error
  return data as ReminderLedgerRow | null
}

const claimReminder = async (
  admin: any,
  userId: string,
  localDate: string,
  timeZone: string,
) => {
  const existing = await existingReminder(admin, userId, localDate)

  if (existing?.delivery_status === 'sent' || existing?.delivery_status === 'skipped') {
    return null
  }

  if (existing?.delivery_status === 'pending') {
    const ageMs = Date.now() - new Date(existing.updated_at).getTime()
    if (Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000) {
      return null
    }
  }

  if (existing) {
    const { data, error } = await admin
      .from('smart_reminder_deliveries')
      .update({
        delivery_status: 'pending',
        timezone: timeZone,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await admin
    .from('smart_reminder_deliveries')
    .insert({
      user_id: userId,
      reminder_type: 'daily_readiness',
      local_date: localDate,
      timezone: timeZone,
      delivery_status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return null
    throw error
  }

  return data
}

const completeReminder = async (
  admin: any,
  reminderId: string,
  {
    status,
    subscriptionCount,
    deliveredCount,
    error = null,
  }: {
    status: 'sent' | 'failed' | 'skipped'
    subscriptionCount: number
    deliveredCount: number
    error?: string | null
  },
) => {
  const { error: updateError } = await admin
    .from('smart_reminder_deliveries')
    .update({
      delivery_status: status,
      subscription_count: subscriptionCount,
      delivered_count: deliveredCount,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      last_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)

  if (updateError) throw updateError
}

export const dispatchDailyReadinessReminders = async ({
  admin,
  sendPushToSubscriptions,
}: {
  admin: any
  sendPushToSubscriptions: (args: {
    admin: any
    subscriptions: SubscriptionRow[]
    payload: Record<string, unknown>
  }) => Promise<
    Array<{
      success: boolean
      invalidSubscription: boolean
    }>
  >
}) => {
  const { data: subscriptionRows, error: subscriptionError } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, timezone, last_seen_at')
    .eq('active', true)
    .limit(500)

  if (subscriptionError) throw subscriptionError

  const byUser = groupSubscriptionsByUser(
    (subscriptionRows ?? []) as SubscriptionRow[],
  )

  const eligibleUsers = [...byUser.entries()]
    .map(([userId, value]) => {
      if (!value.timeZone) return null
      const local = localParts(value.timeZone)
      if (!local || local.hour < 8 || local.hour >= 10) return null
      return {
        userId,
        timeZone: value.timeZone,
        localDate: local.localDate,
        subscriptions: value.subscriptions,
      }
    })
    .filter(Boolean) as Array<{
    userId: string
    timeZone: string
    localDate: string
    subscriptions: SubscriptionRow[]
  }>

  if (!eligibleUsers.length) {
    return { checked: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const userIds = eligibleUsers.map((item) => item.userId)
  const { data: states, error: stateError } = await admin
    .from('foundry_state')
    .select('user_id, state')
    .in('user_id', userIds)

  if (stateError) throw stateError

  const stateByUser = new Map(
    ((states ?? []) as FoundryStateRow[]).map((row) => [row.user_id, row.state]),
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const candidate of eligibleUsers) {
    const state = stateByUser.get(candidate.userId) ?? null

    if (hasReadinessForDate(state, candidate.localDate)) {
      skipped += 1
      continue
    }

    const claim = await claimReminder(
      admin,
      candidate.userId,
      candidate.localDate,
      candidate.timeZone,
    )
    if (!claim) continue

    const payload = {
      title: 'Daily readiness',
      body: 'How are sleep, energy, soreness, and stress today?',
      tag: `daily-readiness:${candidate.localDate}`,
      url: '/?open=notifications',
      notificationType: 'daily-readiness',
    }

    try {
      const results = await sendPushToSubscriptions({
        admin,
        subscriptions: candidate.subscriptions,
        payload,
      })
      const deliveredCount = results.filter((result) => result.success).length
      const transientFailure = results.some(
        (result) => !result.success && !result.invalidSubscription,
      )

      if (deliveredCount > 0) {
        await completeReminder(admin, claim.id, {
          status: 'sent',
          subscriptionCount: candidate.subscriptions.length,
          deliveredCount,
        })
        sent += 1
      } else if (transientFailure) {
        await completeReminder(admin, claim.id, {
          status: 'failed',
          subscriptionCount: candidate.subscriptions.length,
          deliveredCount: 0,
          error: 'push_delivery_failed',
        })
        failed += 1
      } else {
        await completeReminder(admin, claim.id, {
          status: 'skipped',
          subscriptionCount: candidate.subscriptions.length,
          deliveredCount: 0,
          error: 'no_deliverable_push_subscription',
        })
        skipped += 1
      }
    } catch (error) {
      await completeReminder(admin, claim.id, {
        status: 'failed',
        subscriptionCount: candidate.subscriptions.length,
        deliveredCount: 0,
        error:
          error instanceof Error ? error.message.slice(0, 500) : 'unknown_error',
      })
      failed += 1
    }
  }

  return {
    checked: eligibleUsers.length,
    sent,
    skipped,
    failed,
  }
}

export const smartReminderInternals = {
  localParts,
  hasReadinessForDate,
}

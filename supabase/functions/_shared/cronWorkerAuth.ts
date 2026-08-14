import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { corsHeaders, json } from './appointmentPush.ts'

export type CronWorkerAuthResult =
  | { authorized: true; admin: SupabaseClient; request: Request }
  | { authorized: false; response: Response }

export const CRON_WORKER_AUTH_HEADER = 'apikey'

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return mismatch === 0
}

export const parseConfiguredSecretKeys = (
  raw: string | undefined | null,
): Record<string, string> | null => {
  if (raw == null || raw.trim() === '') return null

  try {
    const parsed = JSON.parse(raw) as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const entries = Object.entries(parsed).filter(
      ([, value]) => typeof value === 'string' && value.length > 0,
    ) as Array<[string, string]>

    return entries.length ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

export const isValidCronWorkerSecretKey = (
  providedKey: string | null | undefined,
  configuredKeys: Record<string, string> | null,
) => {
  if (!providedKey || !configuredKeys) return false

  const normalized = providedKey.trim()
  if (!normalized.startsWith('sb_secret_')) return false

  return Object.values(configuredKeys).some((candidate) =>
    timingSafeEqual(normalized, candidate),
  )
}

export const createCronWorkerAdminClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

export const authorizeCronWorkerRequest = async (
  req: Request,
): Promise<CronWorkerAuthResult> => {
  if (req.method === 'OPTIONS') {
    return {
      authorized: false,
      response: new Response('ok', { headers: corsHeaders }),
    }
  }

  const configuredKeys = parseConfiguredSecretKeys(
    Deno.env.get('SUPABASE_SECRET_KEYS'),
  )

  if (!configuredKeys) {
    return {
      authorized: false,
      response: json({ error: 'Unauthorized' }, 401),
    }
  }

  const providedKey = req.headers.get(CRON_WORKER_AUTH_HEADER)

  if (!isValidCronWorkerSecretKey(providedKey, configuredKeys)) {
    return {
      authorized: false,
      response: json({ error: 'Unauthorized' }, 401),
    }
  }

  const admin = createCronWorkerAdminClient()

  if (!admin) {
    return {
      authorized: false,
      response: json({ error: 'Unauthorized' }, 401),
    }
  }

  return {
    authorized: true,
    admin,
    request: req,
  }
}

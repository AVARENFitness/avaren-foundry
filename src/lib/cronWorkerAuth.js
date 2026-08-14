export const CRON_WORKER_AUTH_MODE = 'secret'

export const CRON_WORKER_AUTH_HEADER = 'apikey'

export const CRON_WORKER_FUNCTIONS = [
  'dispatch-appointment-notifications',
  'process-appointment-reminders',
]

export const isCronWorkerPreflightRequest = (method) =>
  String(method ?? '').toUpperCase() === 'OPTIONS'

const timingSafeEqual = (left, right) => {
  if (left.length !== right.length) return false

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return mismatch === 0
}

export const parseConfiguredSecretKeys = (raw) => {
  if (raw == null || String(raw).trim() === '') return null

  try {
    const parsed = JSON.parse(String(raw))

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const entries = Object.entries(parsed).filter(
      ([, value]) => typeof value === 'string' && value.length > 0,
    )

    return entries.length ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

export const isValidCronWorkerSecretKey = (providedKey, configuredKeys) => {
  if (!providedKey || !configuredKeys) return false

  const normalized = String(providedKey).trim()
  if (!normalized.startsWith('sb_secret_')) return false

  return Object.values(configuredKeys).some((candidate) =>
    timingSafeEqual(normalized, candidate),
  )
}

export const shouldRejectCronWorkerRequest = ({
  method = 'POST',
  hasApiKeyHeader = false,
  secretKeyValid = false,
  configuredKeysValid = true,
} = {}) => {
  if (isCronWorkerPreflightRequest(method)) {
    return false
  }

  if (!configuredKeysValid) return true
  if (!hasApiKeyHeader) return true
  return !secretKeyValid
}

export const cronWorkerUnauthorizedResponse = () => ({
  status: 401,
  body: { error: 'Unauthorized' },
})

export const authorizeCronWorkerRequest = ({
  method = 'POST',
  apiKey = null,
  configuredSecretKeysRaw = null,
  createAdminClient = null,
} = {}) => {
  if (isCronWorkerPreflightRequest(method)) {
    return {
      authorized: false,
      preflight: true,
      response: { status: 200, body: 'ok' },
    }
  }

  const configuredKeys = parseConfiguredSecretKeys(configuredSecretKeysRaw)

  if (!configuredKeys) {
    return {
      authorized: false,
      response: cronWorkerUnauthorizedResponse(),
      adminClientCreated: false,
    }
  }

  if (!isValidCronWorkerSecretKey(apiKey, configuredKeys)) {
    return {
      authorized: false,
      response: cronWorkerUnauthorizedResponse(),
      adminClientCreated: false,
    }
  }

  const admin = typeof createAdminClient === 'function' ? createAdminClient() : null

  if (!admin) {
    return {
      authorized: false,
      response: cronWorkerUnauthorizedResponse(),
      adminClientCreated: false,
    }
  }

  return {
    authorized: true,
    admin,
    adminClientCreated: true,
  }
}

import { describe, expect, it, vi } from 'vitest'
import {
  CRON_WORKER_AUTH_HEADER,
  CRON_WORKER_AUTH_MODE,
  CRON_WORKER_FUNCTIONS,
  authorizeCronWorkerRequest,
  cronWorkerUnauthorizedResponse,
  isCronWorkerPreflightRequest,
  isValidCronWorkerSecretKey,
  parseConfiguredSecretKeys,
  shouldRejectCronWorkerRequest,
} from './cronWorkerAuth'

const configuredSecretKeysRaw = JSON.stringify({
  default: 'sb_secret_default_key_value',
  automations: 'sb_secret_automations_key_value',
})

describe('cronWorkerAuth contract', () => {
  it('documents secret-key auth for appointment and recurrence workers', () => {
    expect(CRON_WORKER_AUTH_MODE).toBe('secret')
    expect(CRON_WORKER_AUTH_HEADER).toBe('apikey')
    expect(CRON_WORKER_FUNCTIONS).toEqual([
      'dispatch-appointment-notifications',
      'process-appointment-reminders',
      'extend-recurring-appointment-horizon',
    ])
  })

  it('parses SUPABASE_SECRET_KEYS JSON map', () => {
    expect(parseConfiguredSecretKeys(configuredSecretKeysRaw)).toEqual({
      default: 'sb_secret_default_key_value',
      automations: 'sb_secret_automations_key_value',
    })
  })

  it('rejects malformed SUPABASE_SECRET_KEYS', () => {
    expect(parseConfiguredSecretKeys('{not-json')).toBeNull()
    expect(parseConfiguredSecretKeys('[]')).toBeNull()
    expect(parseConfiguredSecretKeys('')).toBeNull()
    expect(parseConfiguredSecretKeys(null)).toBeNull()
  })

  it('validates any configured secret key value', () => {
    const configured = parseConfiguredSecretKeys(configuredSecretKeysRaw)

    expect(isValidCronWorkerSecretKey('sb_secret_default_key_value', configured)).toBe(
      true,
    )
    expect(
      isValidCronWorkerSecretKey('sb_secret_automations_key_value', configured),
    ).toBe(true)
    expect(isValidCronWorkerSecretKey('sb_secret_wrong', configured)).toBe(false)
    expect(isValidCronWorkerSecretKey('sb_publishable_wrong', configured)).toBe(false)
  })

  it('allows OPTIONS preflight without credentials', () => {
    expect(isCronWorkerPreflightRequest('OPTIONS')).toBe(true)
    expect(isCronWorkerPreflightRequest('POST')).toBe(false)
  })

  it('rejects missing apikey header before privileged work', () => {
    expect(
      shouldRejectCronWorkerRequest({
        hasApiKeyHeader: false,
        secretKeyValid: false,
      }),
    ).toBe(true)
  })

  it('rejects invalid apikey header', () => {
    expect(
      shouldRejectCronWorkerRequest({
        hasApiKeyHeader: true,
        secretKeyValid: false,
      }),
    ).toBe(true)
  })

  it('accepts valid secret apikey header', () => {
    expect(
      shouldRejectCronWorkerRequest({
        hasApiKeyHeader: true,
        secretKeyValid: true,
      }),
    ).toBe(false)
  })

  it('returns generic unauthorized response metadata', () => {
    expect(cronWorkerUnauthorizedResponse()).toEqual({
      status: 401,
      body: { error: 'Unauthorized' },
    })
  })
})

describe('authorizeCronWorkerRequest', () => {
  it('returns preflight for OPTIONS without creating admin client', () => {
    const createAdminClient = vi.fn()

    const result = authorizeCronWorkerRequest({
      method: 'OPTIONS',
      createAdminClient,
    })

    expect(result.preflight).toBe(true)
    expect(result.authorized).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects missing apikey before admin client creation', () => {
    const createAdminClient = vi.fn()

    const result = authorizeCronWorkerRequest({
      configuredSecretKeysRaw,
      createAdminClient,
    })

    expect(result.authorized).toBe(false)
    expect(result.adminClientCreated).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects invalid apikey before admin client creation', () => {
    const createAdminClient = vi.fn()

    const result = authorizeCronWorkerRequest({
      apiKey: 'sb_secret_invalid',
      configuredSecretKeysRaw,
      createAdminClient,
    })

    expect(result.authorized).toBe(false)
    expect(result.adminClientCreated).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects malformed configured keys before admin client creation', () => {
    const createAdminClient = vi.fn()

    const result = authorizeCronWorkerRequest({
      apiKey: 'sb_secret_default_key_value',
      configuredSecretKeysRaw: '{bad-json',
      createAdminClient,
    })

    expect(result.authorized).toBe(false)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('creates admin client only after valid secret apikey', () => {
    const admin = { kind: 'admin-client' }
    const createAdminClient = vi.fn(() => admin)

    const result = authorizeCronWorkerRequest({
      apiKey: 'sb_secret_default_key_value',
      configuredSecretKeysRaw,
      createAdminClient,
    })

    expect(result.authorized).toBe(true)
    expect(result.admin).toBe(admin)
    expect(result.adminClientCreated).toBe(true)
    expect(createAdminClient).toHaveBeenCalledTimes(1)
  })
})

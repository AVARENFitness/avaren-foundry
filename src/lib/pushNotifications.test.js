import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deactivatePushSubscriptionForDevice,
  enablePushNotifications,
  registerPushSubscriptionRpcArgs,
  registerPushWorker,
  sendTestPushNotification,
  serviceWorkerSupported,
  syncPushSubscription,
} from './pushNotifications'

// pushNotifications captures its VAPID configuration at module initialization.
// Stub the test environment before static imports are evaluated.
vi.hoisted(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')
})

const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockGetUser = vi.fn()
const mockInvoke = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
    functions: {
      invoke: (...args) => mockInvoke(...args),
    },
  },
}))

const subscription = {
  endpoint: 'https://push.example/device-e',
  toJSON: () => ({
    keys: { p256dh: 'p256', auth: 'auth-token' },
  }),
}

describe('pushNotifications ownership RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U')

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-coach' } },
      error: null,
    })
    mockRpc.mockResolvedValue({ error: null })
    mockInvoke.mockResolvedValue({
      data: { delivered: 1, deviceScoped: true },
      error: null,
    })
    mockFrom.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })

    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      writable: true,
      value: function PushManager() {},
    })

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: {
        permission: 'granted',
        requestPermission: vi.fn(async () => 'granted'),
      },
    })

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: {
        register: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => subscription),
            subscribe: vi.fn(async () => subscription),
          },
        })),
      },
    })
  })

  it('registers the shared app worker even when push APIs are unavailable', async () => {
    delete window.PushManager
    delete window.Notification

    expect(serviceWorkerSupported()).toBe(true)

    await registerPushWorker()

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      '/push-sw.js',
      { scope: '/' },
    )
  })

  it('registers via register_push_subscription RPC instead of direct upsert', async () => {
    await syncPushSubscription()

    expect(mockRpc).toHaveBeenCalledWith(
      'register_push_subscription_v2',
      expect.objectContaining({
        p_endpoint: subscription.endpoint,
        p_p256dh: 'p256',
        p_auth: 'auth-token',
      }),
    )
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('10. unauthenticated registration fails safely', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    })

    await expect(syncPushSubscription()).rejects.toThrow(/signed in/i)
  })

  it('deactivate uses RPC for current device endpoint', async () => {
    await deactivatePushSubscriptionForDevice()

    expect(mockRpc).toHaveBeenCalledWith('deactivate_push_subscription', {
      p_endpoint: subscription.endpoint,
    })
  })

  it('enablePushNotifications uses ownership RPC after subscribe', async () => {
    await enablePushNotifications()

    expect(mockRpc).toHaveBeenCalledWith(
      'register_push_subscription_v2',
      registerPushSubscriptionRpcArgs(subscription),
    )
  })

  it('sends an authenticated real-device push diagnostic after ensuring ownership', async () => {
    const result = await sendTestPushNotification()

    expect(mockRpc).toHaveBeenCalledWith(
      'register_push_subscription_v2',
      expect.objectContaining({
        p_endpoint: subscription.endpoint,
      }),
    )
    expect(mockInvoke).toHaveBeenCalledWith('send-test-push', {
      body: {
        endpoint: subscription.endpoint,
      },
    })
    expect(result).toEqual({ delivered: 1, deviceScoped: true })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deactivatePushSubscriptionForDevice,
  enablePushNotifications,
  registerPushSubscriptionRpcArgs,
  syncPushSubscription,
} from './pushNotifications'

const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
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

  it('registers via register_push_subscription RPC instead of direct upsert', async () => {
    await syncPushSubscription()

    expect(mockRpc).toHaveBeenCalledWith(
      'register_push_subscription',
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
      'register_push_subscription',
      registerPushSubscriptionRpcArgs(subscription),
    )
  })
})

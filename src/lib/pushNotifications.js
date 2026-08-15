import { supabase } from './supabase'

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

const RPC_REGISTER = 'register_push_subscription'
const RPC_DEACTIVATE = 'deactivate_push_subscription'

const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(
    [...raw].map((character) => character.charCodeAt(0)),
  )
}

const currentUser = async () => {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('You must be signed in.')
  return data.user
}

export const subscriptionKeys = (subscription) => {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  }
}

export const registerPushSubscriptionRpcArgs = (subscription) => ({
  p_endpoint: subscription.endpoint,
  p_p256dh: subscriptionKeys(subscription).p256dh,
  p_auth: subscriptionKeys(subscription).auth,
  p_user_agent: navigator.userAgent,
  p_platform:
    navigator.userAgentData?.platform ??
    navigator.platform ??
    'Unknown',
})

const registerSubscriptionWithOwnership = async (subscription) => {
  await currentUser()
  const { error } = await supabase.rpc(
    RPC_REGISTER,
    registerPushSubscriptionRpcArgs(subscription),
  )
  if (error) throw error
}

export const pushSupported = () =>
  Boolean(
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window,
  )

export const isStandaloneApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

export const registerPushWorker = async () => {
  if (!pushSupported()) return null
  return navigator.serviceWorker.register('/push-sw.js', {
    scope: '/',
  })
}

export const getPushState = async () => {
  if (!pushSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      standalone: isStandaloneApp(),
      configured: Boolean(VAPID_PUBLIC_KEY),
    }
  }

  const registration = await registerPushWorker()
  const subscription =
    await registration.pushManager.getSubscription()

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
    standalone: isStandaloneApp(),
    configured: Boolean(VAPID_PUBLIC_KEY),
  }
}

export const enablePushNotifications = async () => {
  if (!pushSupported()) {
    throw new Error(
      'This browser does not support web push notifications.',
    )
  }

  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      'Push is not configured yet. Add VITE_VAPID_PUBLIC_KEY to the app environment.',
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked in this browser’s settings.'
        : 'Notification permission was not granted.',
    )
  }

  const registration = await registerPushWorker()
  let subscription =
    await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  await registerSubscriptionWithOwnership(subscription)
  return getPushState()
}

export const deactivatePushSubscriptionForDevice = async () => {
  if (!pushSupported()) return

  const registration = await registerPushWorker()
  const subscription =
    await registration?.pushManager?.getSubscription()

  if (!subscription) return

  const { error } = await supabase.rpc(RPC_DEACTIVATE, {
    p_endpoint: subscription.endpoint,
  })

  if (error) {
    await supabase
      .from('push_subscriptions')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', subscription.endpoint)
  }
}

export const disablePushNotifications = async () => {
  if (!pushSupported()) return getPushState()

  const registration = await registerPushWorker()
  const subscription =
    await registration.pushManager.getSubscription()

  if (subscription) {
    await deactivatePushSubscriptionForDevice()
    await subscription.unsubscribe()
  }

  return getPushState()
}

export const syncPushSubscription = async () => {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return
  if (Notification.permission !== 'granted') return

  const registration = await registerPushWorker()
  const subscription =
    await registration.pushManager.getSubscription()

  if (!subscription) return

  await registerSubscriptionWithOwnership(subscription)
}

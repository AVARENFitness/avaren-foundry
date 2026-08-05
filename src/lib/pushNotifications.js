import { supabase } from './supabase'

const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

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

const subscriptionPayload = (subscription, user) => {
  const json = subscription.toJSON()

  return {
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    user_agent: navigator.userAgent,
    platform:
      navigator.userAgentData?.platform ??
      navigator.platform ??
      'Unknown',
    active: true,
    last_seen_at: new Date().toISOString(),
  }
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

  const user = await currentUser()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(subscriptionPayload(subscription, user), {
      onConflict: 'endpoint',
    })

  if (error) throw error
  return getPushState()
}

export const disablePushNotifications = async () => {
  if (!pushSupported()) return getPushState()

  const registration = await registerPushWorker()
  const subscription =
    await registration.pushManager.getSubscription()

  if (subscription) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)

    if (error) throw error
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

  const user = await currentUser()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(subscriptionPayload(subscription, user), {
      onConflict: 'endpoint',
    })

  if (error) throw error
}

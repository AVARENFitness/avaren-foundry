const DEFAULT_URL = '/?open=notifications'
const CACHE_PREFIX = 'avaren-app-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const APP_SHELL_KEY = '/__avaren_app_shell__'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/brand/foundation/icon-192.png',
  '/brand/foundation/icon-512.png',
]

const cacheAppShellResponse = async (response) => {
  if (!response?.ok) return
  const cache = await caches.open(CACHE_NAME)
  await cache.put(APP_SHELL_KEY, response.clone())
}

const networkFirstNavigation = async (request) => {
  try {
    const response = await fetch(request)
    await cacheAppShellResponse(response)
    return response
  } catch {
    const cache = await caches.open(CACHE_NAME)
    return (
      (await cache.match(APP_SHELL_KEY)) ||
      (await cache.match('/')) ||
      Response.error()
    )
  }
}

const cacheFirstStatic = async (request) => {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const refresh = fetch(request)
    .then(async (response) => {
      if (response?.ok) {
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  return cached || (await refresh) || Response.error()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(CACHE_PREFIX) &&
                  key !== CACHE_NAME,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (
    ['script', 'style', 'font', 'image', 'manifest'].includes(
      request.destination,
    )
  ) {
    event.respondWith(cacheFirstStatic(request))
  }
})

self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = {
      title: 'AVAREN',
      body: event.data?.text() ?? 'You have a new update.',
    }
  }

  const title = payload.title ?? 'AVAREN'
  const options = {
    body: payload.body ?? 'You have a new update.',
    icon: '/brand/foundation/icon-192.png',
    badge: '/brand/foundation/icon-96.png',
    tag: payload.tag ?? payload.assignmentId ?? payload.sessionId ?? 'avaren-update',
    renotify: true,
    data: {
      url:
        payload.url ??
        (payload.assignmentId
          ? `/?assignment=${encodeURIComponent(payload.assignmentId)}`
          : payload.sessionId
          ? `/?session=${encodeURIComponent(payload.sessionId)}&open=appointment-detail`
          : DEFAULT_URL),
      assignmentId: payload.assignmentId ?? null,
      sessionId: payload.sessionId ?? null,
    },
  }

  if (Array.isArray(payload.actions) && payload.actions.length) {
    options.actions = payload.actions
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.registration.setAppBadge?.(1),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const sessionId = event.notification.data?.sessionId
  const action = event.action
  let url = event.notification.data?.url ?? DEFAULT_URL

  if (sessionId && action === 'confirm') {
    url = `/?session=${encodeURIComponent(sessionId)}&rsvp=confirmed`
  } else if (sessionId && action === 'decline') {
    url = `/?session=${encodeURIComponent(sessionId)}&rsvp=cannot_attend`
  } else if (sessionId && !action) {
    url = event.notification.data?.url ??
      `/?session=${encodeURIComponent(sessionId)}&open=appointment-detail`
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (windows) => {
        for (const client of windows) {
          if ('focus' in client) {
            await client.focus()
            client.postMessage({
              type: 'AVAREN_PUSH_OPEN',
              url,
            })
            return
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      }),
  )
})

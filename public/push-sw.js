const DEFAULT_URL = '/?open=notifications'

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
          ? `/?session=${encodeURIComponent(payload.sessionId)}&open=session-rsvp`
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
    url = `/?session=${encodeURIComponent(sessionId)}&open=session-rsvp`
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

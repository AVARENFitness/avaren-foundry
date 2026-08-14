import {
  Bell,
  BellOff,
  Check,
  Smartphone,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushState,
} from '../lib/pushNotifications'

const initialState = {
  supported: true,
  permission: 'default',
  subscribed: false,
  standalone: false,
  configured: true,
}

export default function PushNotificationSettings() {
  const [status, setStatus] = useState(initialState)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      setStatus(await getPushState())
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const toggle = async () => {
    setLoading(true)
    setMessage('')

    try {
      const next = status.subscribed
        ? await disablePushNotifications()
        : await enablePushNotifications()
      setStatus(next)
      setMessage(
        next.subscribed
          ? 'Phone notifications are enabled on this device.'
          : 'Phone notifications are disabled on this device.',
      )
    } catch (error) {
      setMessage(error.message)
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const needsHomeScreen =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !status.standalone

  return (
    <section className="push-settings-card">
      <header>
        <span className="push-settings-icon">
          <Smartphone size={20} />
        </span>
        <div>
          <span className="eyebrow">PHONE ALERTS</span>
          <h2>Training reminders</h2>
          <p>
            Get training reminders when sessions are scheduled, updated,
            or approaching.
          </p>
        </div>
      </header>

      {!status.supported ? (
        <div className="push-settings-state warning">
          <BellOff size={17} />
          This browser does not support web push.
        </div>
      ) : !status.configured ? (
        <div className="push-settings-state warning">
          <BellOff size={17} />
          Push setup is not complete yet.
        </div>
      ) : needsHomeScreen ? (
        <div className="push-settings-state warning">
          <Smartphone size={17} />
          Add AVAREN to your Home Screen to receive training reminders.
        </div>
      ) : (
        <button
          className={`push-settings-toggle ${
            status.subscribed ? 'enabled' : ''
          }`}
          onClick={toggle}
          disabled={loading || status.permission === 'denied'}
        >
          {status.subscribed ? (
            <Check size={18} />
          ) : (
            <Bell size={18} />
          )}
          {loading
            ? 'Checking device…'
            : status.permission === 'denied'
            ? 'Blocked in browser settings'
            : status.subscribed
            ? 'Disable on this device'
            : 'Enable notifications'}
        </button>
      )}

      {!needsHomeScreen && status.supported && status.configured && (
        <p className="push-settings-message subtle">
          Get training reminders
        </p>
      )}

      {message && (
        <div className="push-settings-message">{message}</div>
      )}
    </section>
  )
}

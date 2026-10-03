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
  sendTestPushNotification,
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
  const [testing, setTesting] = useState(false)

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

  const sendTest = async () => {
    if (testing || loading) return

    setTesting(true)
    setMessage('')

    try {
      const result = await sendTestPushNotification()
      setMessage(
        result.delivered > 1
          ? `Test sent to ${result.delivered} registered devices.`
          : 'Test sent. Check your lock screen or notification center.',
      )
    } catch (error) {
      setMessage(error.message ?? 'Could not send a test notification.')
      await refresh()
    } finally {
      setTesting(false)
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
        <div className="push-settings-diagnostics">
          <p className="push-settings-message subtle">
            {status.subscribed && status.permission === 'granted'
              ? 'Phone alerts are active on this device.'
              : status.permission === 'denied'
                ? 'Phone alerts are blocked in device/browser settings.'
                : 'Enable phone alerts to receive lock-screen and banner notifications.'}
          </p>
          {status.subscribed && status.permission === 'granted' ? (
            <button
              type="button"
              className="ui-btn-tertiary push-settings-test"
              onClick={sendTest}
              disabled={testing || loading}
            >
              <Bell size={16} />
              {testing ? 'Sending test…' : 'Send test notification'}
            </button>
          ) : null}
        </div>
      )}

      {message && (
        <div className="push-settings-message">{message}</div>
      )}
    </section>
  )
}

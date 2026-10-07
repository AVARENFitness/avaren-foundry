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
        result.deviceScoped
          ? 'Test sent to this device. Lock your phone and check Notification Center.'
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
      <div className="push-settings-compact-row">
        <span className="push-settings-icon">
          <Smartphone size={18} />
        </span>

        <div className="push-settings-compact-copy">
          <span className="eyebrow">PHONE ALERTS</span>
          <strong>Training reminders</strong>
          <small>
            {status.subscribed && status.permission === 'granted'
              ? 'Active on this device'
              : needsHomeScreen
                ? 'Add AVAREN to your Home Screen first'
                : status.permission === 'denied'
                  ? 'Blocked in device settings'
                  : 'Off on this device'}
          </small>
        </div>

        {!status.supported || !status.configured || needsHomeScreen ? null : (
          <button
            className={`push-settings-toggle ${status.subscribed ? 'enabled' : ''}`}
            onClick={toggle}
            disabled={loading || status.permission === 'denied'}
          >
            {status.subscribed ? <Check size={16} /> : <Bell size={16} />}
            {loading
              ? 'Checking…'
              : status.permission === 'denied'
                ? 'Blocked'
                : status.subscribed
                  ? 'On'
                  : 'Turn on'}
          </button>
        )}
      </div>

      {!status.supported ? (
        <div className="push-settings-state warning">
          <BellOff size={16} />
          This browser does not support web push.
        </div>
      ) : !status.configured ? (
        <div className="push-settings-state warning">
          <BellOff size={16} />
          Push setup is not complete yet.
        </div>
      ) : needsHomeScreen ? (
        <div className="push-settings-state warning">
          <Smartphone size={16} />
          Add AVAREN to your Home Screen to receive lock-screen reminders.
        </div>
      ) : null}

      <div className="push-settings-compact-actions">
        {status.subscribed && status.permission === 'granted' ? (
          <button
            type="button"
            className="ui-btn-tertiary push-settings-test"
            onClick={sendTest}
            disabled={testing || loading}
          >
            <Bell size={15} />
            {testing ? 'Sending…' : 'Test'}
          </button>
        ) : null}

        {status.subscribed && status.permission === 'granted' ? (
          <button
            type="button"
            className="ui-btn-tertiary push-settings-disable"
            onClick={toggle}
            disabled={loading}
          >
            Disable
          </button>
        ) : null}
      </div>

      {message ? (
        <div className="push-settings-message">{message}</div>
      ) : null}
    </section>
  )
}

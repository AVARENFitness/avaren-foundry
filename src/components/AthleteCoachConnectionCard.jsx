import { Check, Link2, LoaderCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { isPendingConnectionRequest } from '../lib/coachConnectionRequests'

export default function AthleteCoachConnectionCard({
  invitations = [],
} = {}) {
  const [requests, setRequests] = useState([])
  const [relationships, setRelationships] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const [nextRequests, nextRelationships] = await Promise.all([
        coachBackend.listOwnCoachConnectionRequests(),
        coachBackend.listAthleteCoachRelationships(),
      ])
      setRequests(nextRequests)
      setRelationships(nextRelationships)
      setNotice('')
    } catch (error) {
      setNotice(error?.message ?? 'Unable to check coaching connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const pendingRequest = useMemo(
    () => requests.find(isPendingConnectionRequest) ?? null,
    [requests],
  )

  const hasRelationship = relationships.length > 0
  const hasPendingInvitation = (invitations ?? []).some(
    (invitation) => invitation?.status === 'pending',
  )

  if (loading || hasRelationship || hasPendingInvitation) return null

  const requestConnection = async () => {
    setWorking(true)
    setNotice('')
    try {
      await coachBackend.requestAvarenCoachConnection()
      await refresh()
    } catch (error) {
      const raw = String(error?.message ?? error ?? '')
      setNotice(
        /already_connected/i.test(raw)
          ? 'Your AVAREN coaching connection is already active.'
          : /coach_not_available|coach_account_not_found/i.test(raw)
            ? 'AVAREN Coaching is not available for connection yet.'
            : error?.message ?? 'Unable to request connection.',
      )
    } finally {
      setWorking(false)
    }
  }

  const cancelRequest = async () => {
    if (!pendingRequest?.id) return
    setWorking(true)
    setNotice('')
    try {
      await coachBackend.cancelOwnCoachConnectionRequest(pendingRequest.id)
      await refresh()
    } catch (error) {
      setNotice(error?.message ?? 'Unable to cancel request.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="athlete-coach-connection-card">
      <div className="athlete-coach-connection-icon">
        {pendingRequest ? <Check size={18} /> : <Link2 size={18} />}
      </div>

      <div className="athlete-coach-connection-copy">
        <span className="eyebrow">
          {pendingRequest ? 'CONNECTION REQUESTED' : 'TRAIN WITH AVAREN'}
        </span>
        <strong>
          {pendingRequest
            ? 'AVAREN is reviewing your coaching profile.'
            : 'Already an AVAREN coaching client?'}
        </strong>
        <p>
          {pendingRequest
            ? 'Your account stays usable while the connection is reviewed. Existing appointments and coaching history will be preserved when linked.'
            : 'Request a connection to your existing coaching record. AVAREN will review the match before anything is linked.'}
        </p>

        {notice ? <small className="athlete-coach-connection-notice">{notice}</small> : null}

        <div className="athlete-coach-connection-actions">
          {pendingRequest ? (
            <button
              type="button"
              className="athlete-coach-connection-secondary"
              disabled={working}
              onClick={cancelRequest}
            >
              {working ? <LoaderCircle size={16} className="spin" /> : <X size={16} />}
              Cancel request
            </button>
          ) : (
            <button
              type="button"
              className="gold-button machined"
              disabled={working}
              onClick={requestConnection}
            >
              {working ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}
              Request coach connection
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

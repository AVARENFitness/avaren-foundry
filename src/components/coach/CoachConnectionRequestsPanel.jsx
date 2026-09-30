import { Check, Link2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  availableBusinessClientsForConnection,
  findExactBusinessClientMatches,
  findSuggestedBusinessClient,
} from '../../lib/coachConnectionRequests'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'

export default function CoachConnectionRequestsPanel({
  requests = [],
  clients = [],
  workingId = null,
  onApprove,
  onDecline,
  onCreateNewClient,
} = {}) {
  const pending = useMemo(
    () => (requests ?? []).filter((request) => request?.status === 'pending'),
    [requests],
  )
  const availableClients = useMemo(
    () => availableBusinessClientsForConnection(clients),
    [clients],
  )
  const [selections, setSelections] = useState({})

  useEffect(() => {
    setSelections((current) => {
      const next = { ...current }
      pending.forEach((request) => {
        if (next[request.id]) return
        const suggested = findSuggestedBusinessClient(availableClients, request)
        if (suggested) {
          next[request.id] = resolveRecordBusinessClientId(suggested)
        }
      })
      return next
    })
  }, [pending, availableClients])

  if (!pending.length) return null

  return (
    <section className="coach-connection-requests-panel">
      <header>
        <div>
          <span className="eyebrow">ACCOUNT CONNECTIONS</span>
          <h2>Review connection requests</h2>
          <p>
            Match each AVAREN account to the correct business client. Nothing is linked until you approve it.
          </p>
        </div>
        <span className="coach-connection-count">{pending.length}</span>
      </header>

      <div className="coach-connection-request-list">
        {pending.map((request) => {
          const selectedId = selections[request.id] ?? ''
          const exactMatches = findExactBusinessClientMatches(availableClients, request)
          const suggested = exactMatches.length === 1 ? exactMatches[0] : null
          const busy = workingId === request.id

          return (
            <article key={request.id} className="coach-connection-request-row">
              <div className="coach-connection-request-heading">
                <span className="coach-connection-request-icon">
                  <Link2 size={17} />
                </span>
                <div>
                  <strong>{request.athlete_email || 'AVAREN athlete'}</strong>
                  <small>
                    {suggested
                      ? `Exact email match: ${getClientDisplayName(suggested)}`
                      : exactMatches.length > 1
                        ? 'Multiple exact matches found. Resolve duplicate client emails before linking.'
                        : 'No exact email match. Create a client record to connect this account.'}
                  </small>
                </div>
              </div>

              <label>
                <span>Link to business client</span>
                <select
                  value={selectedId}
                  className="coach-connection-client-select"
                  aria-label="Link to business client"
                  disabled={busy || exactMatches.length !== 1}
                  onChange={(event) =>
                    setSelections((current) => ({
                      ...current,
                      [request.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {suggested ? 'Select matched client…' : 'No exact email match'}
                  </option>
                  {suggested ? (
                    <option value={resolveRecordBusinessClientId(suggested)}>
                      {getClientDisplayName(suggested)}
                      {suggested.email ? ` — ${suggested.email}` : ''}
                    </option>
                  ) : null}
                </select>
              </label>

              <div className="coach-connection-request-actions">
                <button
                  type="button"
                  className="coach-secondary-button"
                  disabled={busy}
                  onClick={() => onDecline?.(request)}
                >
                  <X size={16} />
                  Decline
                </button>
                {suggested ? (
                  <button
                    type="button"
                    className="coach-primary-action gold-button machined"
                    disabled={busy || !selectedId}
                    onClick={() => onApprove?.(request, selectedId)}
                  >
                    <Check size={16} />
                    Link existing client
                  </button>
                ) : exactMatches.length === 0 ? (
                  <button
                    type="button"
                    className="coach-primary-action gold-button machined"
                    disabled={busy}
                    onClick={() => onCreateNewClient?.(request)}
                  >
                    <Check size={16} />
                    Create & connect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="coach-primary-action"
                    disabled
                  >
                    <Check size={16} />
                    Resolve duplicate
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

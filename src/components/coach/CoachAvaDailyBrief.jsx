import {
  ArrowUpRight,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  buildCoachDailyBriefFallback,
  clearCoachDailyBriefCache,
  coachDailyBriefSignature,
  findBriefClient,
  readCoachDailyBriefCache,
  requestCoachDailyBrief,
  writeCoachDailyBriefCache,
} from '../../lib/coachDailyBrief'

const sectionForAction = (actionType) => {
  if (actionType === 'open_training') return 'training'
  if (actionType === 'open_sessions') return 'sessions'
  return 'overview'
}

export default function CoachAvaDailyBrief({
  packet,
  clients = [],
  onOpenClient,
}) {
  const signature = useMemo(
    () => coachDailyBriefSignature(packet),
    [packet],
  )
  const fallback = useMemo(
    () => buildCoachDailyBriefFallback(packet),
    [packet],
  )
  const [brief, setBrief] = useState(
    () => readCoachDailyBriefCache(signature) ?? fallback,
  )
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState(
    () => (readCoachDailyBriefCache(signature) ? 'cached' : 'fallback'),
  )
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let active = true
    const cached = readCoachDailyBriefCache(signature)

    if (cached && refreshNonce === 0) {
      setBrief(cached)
      setSource('cached')
      return () => {
        active = false
      }
    }

    setBrief(fallback)

    const hasFacts =
      (packet.attention?.length ?? 0) > 0 ||
      (packet.today?.length ?? 0) > 0 ||
      (packet.wins?.length ?? 0) > 0

    if (!hasFacts) {
      setSource('fallback')
      return () => {
        active = false
      }
    }

    setLoading(true)
    requestCoachDailyBrief(packet)
      .then((next) => {
        if (!active) return
        const resolved =
          next?.headline || next?.summary
            ? next
            : fallback
        setBrief(resolved)
        writeCoachDailyBriefCache(signature, resolved)
        setSource('ava')
      })
      .catch(() => {
        if (!active) return
        setBrief(fallback)
        setSource('fallback')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [signature, packet, fallback, refreshNonce])

  const openItem = (item) => {
    const client = findBriefClient(clients, item.businessClientId)
    if (!client) return
    onOpenClient?.(client, sectionForAction(item.actionType))
  }

  const handleRefresh = () => {
    clearCoachDailyBriefCache()
    setRefreshNonce((current) => current + 1)
  }

  const attention = brief?.attention ?? []
  const todayPrep = brief?.todayPrep ?? []
  const wins = brief?.wins ?? []

  return (
    <section
      className="coach-ava-daily-brief"
      data-testid="coach-ava-daily-brief"
      data-source={source}
    >
      <header className="coach-ava-daily-brief-header">
        <div className="coach-ava-daily-brief-title">
          <span className="coach-ava-mark" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <div>
            <span className="eyebrow">AVA COACH BRIEF</span>
            <h2>What matters today</h2>
          </div>
        </div>
        <button
          type="button"
          className="coach-ava-refresh"
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Refresh AVA coach brief"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </header>

      <div className="coach-ava-daily-brief-lead">
        <strong>{brief?.headline || 'Coach brief ready'}</strong>
        {brief?.summary ? <p>{brief.summary}</p> : null}
      </div>

      {attention.length ? (
        <section className="coach-ava-brief-section">
          <div className="coach-ava-brief-section-label">
            <span>NEEDS ATTENTION</span>
            <small>{attention.length}</small>
          </div>
          <div className="coach-ava-brief-list">
            {attention.map((item) => (
              <article
                className="coach-ava-brief-item coach-ava-brief-item--attention"
                key={`${item.businessClientId}-${item.title}`}
              >
                <div>
                  <strong>{item.clientName}</strong>
                  <p>{item.why || item.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                >
                  {item.actionLabel || 'Open client'}
                  <ArrowUpRight size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {todayPrep.length ? (
        <section className="coach-ava-brief-section">
          <div className="coach-ava-brief-section-label">
            <span>BEFORE YOU TRAIN</span>
            <small>{todayPrep.length}</small>
          </div>
          <div className="coach-ava-prep-strip">
            {todayPrep.map((item) => (
              <button
                type="button"
                className="coach-ava-prep-card"
                key={`${item.businessClientId}-${item.sessionId ?? 'today'}`}
                onClick={() => openItem(item)}
              >
                <strong>{item.clientName}</strong>
                <span>{item.cue}</span>
                <small>
                  {item.actionLabel || 'Open client'}
                  <ArrowUpRight size={14} />
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {wins.length ? (
        <details className="coach-ava-wins">
          <summary>
            <span>
              <Trophy size={15} />
              Going well
            </span>
            <small>{wins.length}</small>
          </summary>
          <div>
            {wins.map((item) => (
              <article key={`${item.businessClientId}-${item.line}`}>
                <strong>{item.clientName}</strong>
                <span>{item.line}</span>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {loading ? (
        <div className="coach-ava-brief-loading">
          <Sparkles size={14} />
          AVA is refining the brief…
        </div>
      ) : null}
    </section>
  )
}

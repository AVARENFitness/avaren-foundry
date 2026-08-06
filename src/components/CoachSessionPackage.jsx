import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Package,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { appUi } from '../lib/appUi'
import { coachBackend } from '../lib/coachBackend'
import {
  addSessionsToPackage,
  canRecordSession,
  emptySessionPackage,
  formatPackageDate,
  normalizeSessionHistoryEntry,
  normalizeSessionPackage,
  packageIsComplete,
  recordSessionOnPackage,
  undoSessionRecord,
} from '../lib/sessionPackages'
import SectionHeader from './ui/SectionHeader'

const PRESET_COUNTS = [1, 5, 10, 20]

export default function CoachSessionPackage({
  athleteId,
  coachLabel = 'Coach',
}) {
  const [pkg, setPkg] = useState(emptySessionPackage())
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [customCount, setCustomCount] = useState('')
  const [sessionNote, setSessionNote] = useState('')
  const [undoSnapshot, setUndoSnapshot] = useState(null)

  const load = useCallback(async () => {
    if (!athleteId) return
    setLoading(true)
    try {
      const [packageRow, historyRows] = await Promise.all([
        coachBackend.getSessionPackage(athleteId),
        coachBackend.listSessionHistory(athleteId),
      ])
      setPkg(normalizeSessionPackage(packageRow))
      setHistory(
        (historyRows ?? []).map(normalizeSessionHistoryEntry).filter(Boolean),
      )
    } catch (error) {
      if (!/coach_session|migration|does not exist/i.test(error.message ?? '')) {
        appUi.toast(error.message ?? 'Could not load session package.', 'error')
      }
      setPkg(emptySessionPackage())
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [athleteId])

  useEffect(() => {
    load()
  }, [load])

  const hasPackage = pkg.totalSessions > 0
  const isComplete = packageIsComplete(pkg)
  const canRecord = canRecordSession(pkg)

  const persistPackage = async (nextPackage) => {
    const saved = await coachBackend.saveSessionPackage(athleteId, nextPackage)
    const normalized = normalizeSessionPackage(saved)
    setPkg(normalized)
    return normalized
  }

  const handleAddSessions = async (count) => {
    const result = addSessionsToPackage(pkg, count)
    if (!result.ok) {
      appUi.toast('Enter a valid session count.', 'error')
      return
    }

    setBusy(true)
    try {
      await persistPackage(result.package)
      setShowAddPanel(false)
      setCustomCount('')
      appUi.toast(
        `${result.added} session${result.added === 1 ? '' : 's'} added.`,
        'success',
      )
    } catch (error) {
      appUi.toast(error.message ?? 'Could not add sessions.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRecordSession = async () => {
    if (!canRecord) return

    const result = recordSessionOnPackage(pkg, {
      coachLabel,
      note: sessionNote.trim(),
    })

    if (!result.ok) return

    setBusy(true)
    try {
      let packageId = pkg.id
      let savedPackage = result.package

      if (!packageId) {
        const created = await persistPackage(result.package)
        packageId = created.id
        savedPackage = created
      } else {
        savedPackage = await persistPackage(result.package)
      }

      const savedEntry = await coachBackend.insertSessionHistoryEntry({
        packageId,
        athleteId,
        sessionDate: result.historyEntry.sessionDate,
        coachLabel: result.historyEntry.coachLabel,
        note: result.historyEntry.note,
      })

      const normalizedEntry = normalizeSessionHistoryEntry(savedEntry)
      setHistory((current) => [normalizedEntry, ...current])
      setSessionNote('')
      setUndoSnapshot({
        ...result.undoSnapshot,
        package: savedPackage,
        historyEntryId: normalizedEntry.id,
      })

      appUi.toast('Session recorded.', 'success', {
        actionLabel: 'Undo',
        durationMs: 10000,
        onAction: () => handleUndo(result.undoSnapshot, normalizedEntry.id),
      })
    } catch (error) {
      appUi.toast(error.message ?? 'Could not record session.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleUndo = async (snapshot, historyEntryId) => {
    const entryId = historyEntryId ?? snapshot?.historyEntryId
    if (!entryId || !snapshot?.package) return

    const undone = undoSessionRecord(pkg, history, {
      ...snapshot,
      historyEntryId: entryId,
    })

    if (!undone.ok) {
      appUi.toast('Undo is no longer available.', 'error')
      return
    }

    setBusy(true)
    try {
      await persistPackage(undone.package)
      await coachBackend.deleteSessionHistoryEntry(entryId)
      setHistory(undone.history)
      setUndoSnapshot(null)
      appUi.toast('Session record undone.', 'success')
    } catch (error) {
      appUi.toast(error.message ?? 'Could not undo session.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const historyPreview = useMemo(
    () => history.slice(0, 8),
    [history],
  )

  if (loading) {
    return (
      <section className="coach-profile-panel coach-business-panel">
        <SectionHeader
          eyebrow="BUSINESS"
          title="Session Package"
          description="Loading package details…"
        />
      </section>
    )
  }

  return (
    <section className="coach-profile-panel coach-business-panel">
      <SectionHeader
        eyebrow="BUSINESS"
        title="Session Package"
        description="Track purchased sessions separately from workout logs."
      />

      <article className="coach-session-package-card">
        {!hasPackage ? (
          <div className="coach-session-package-empty">
            <Package size={22} />
            <div>
              <strong>No sessions on file</strong>
              <span>Add a package when this client purchases coaching sessions.</span>
            </div>
          </div>
        ) : (
          <>
            {isComplete && (
              <p className="coach-session-package-status">Package complete.</p>
            )}

            <div className="coach-session-package-stats">
              <div>
                <small>Total purchased</small>
                <strong>{pkg.totalSessions}</strong>
              </div>
              <div>
                <small>Remaining</small>
                <strong>{pkg.sessionsRemaining}</strong>
              </div>
              <div>
                <small>Used</small>
                <strong>{pkg.sessionsUsed}</strong>
              </div>
            </div>

            <div className="coach-session-package-meta">
              <span>
                <CalendarDays size={14} />
                Purchased {formatPackageDate(pkg.purchasedAt)}
              </span>
              {pkg.expiresAt && (
                <span>
                  <Clock3 size={14} />
                  Expires {formatPackageDate(pkg.expiresAt)}
                </span>
              )}
            </div>
          </>
        )}

        <div className="coach-session-package-actions">
          {canRecord ? (
            <>
              <label className="coach-session-note-field">
                <span>Optional note</span>
                <input
                  value={sessionNote}
                  onChange={(event) => setSessionNote(event.target.value)}
                  placeholder="Session focus, location, context…"
                  maxLength={160}
                />
              </label>
              <button
                type="button"
                className="gold-button machined"
                disabled={busy}
                onClick={handleRecordSession}
              >
                Record Session
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gold-button machined"
              disabled={busy}
              onClick={() => setShowAddPanel((open) => !open)}
            >
              <Plus size={17} />
              Add Sessions
              <ChevronDown
                size={16}
                className={showAddPanel ? 'is-open' : ''}
              />
            </button>
          )}

          {hasPackage && canRecord && (
            <button
              type="button"
              className="coach-secondary-button coach-session-add-toggle"
              disabled={busy}
              onClick={() => setShowAddPanel((open) => !open)}
            >
              Add Sessions
            </button>
          )}
        </div>

        {showAddPanel && (
          <div className="coach-session-add-panel">
            <p>Add sessions to this client&apos;s package.</p>
            <div className="coach-session-add-presets">
              {PRESET_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  className="coach-session-add-preset"
                  disabled={busy}
                  onClick={() => handleAddSessions(count)}
                >
                  +{count}
                </button>
              ))}
            </div>
            <div className="coach-session-add-custom">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={customCount}
                onChange={(event) => setCustomCount(event.target.value)}
                placeholder="Custom"
              />
              <button
                type="button"
                className="coach-secondary-button"
                disabled={busy || !customCount}
                onClick={() => handleAddSessions(customCount)}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {undoSnapshot && (
          <button
            type="button"
            className="coach-session-inline-undo"
            disabled={busy}
            onClick={() =>
              handleUndo(undoSnapshot, undoSnapshot.historyEntryId)
            }
          >
            <RotateCcw size={14} />
            Undo last record
          </button>
        )}
      </article>

      {historyPreview.length > 0 && (
        <div className="coach-session-history">
          <header>
            <span className="eyebrow">SESSION HISTORY</span>
            <h3>Recent records</h3>
          </header>
          <div className="coach-session-history-list">
            {historyPreview.map((entry) => (
              <article key={entry.id} className="coach-session-history-row">
                <div>
                  <strong>{formatPackageDate(entry.sessionDate)}</strong>
                  <span>{entry.coachLabel}</span>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

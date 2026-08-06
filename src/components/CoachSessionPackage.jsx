import {
  CalendarDays,
  ChevronDown,
  Package,
  Plus,
  RotateCcw,
  X,
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
  todayKey,
  undoSessionRecord,
} from '../lib/sessionPackages'
import SectionHeader from './ui/SectionHeader'

const PRESET_COUNTS = [1, 5, 10, 20]
const ICON = { size: 18, strokeWidth: 1.75 }

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

  const updatePackageDates = async (patch) => {
    const nextPackage = { ...pkg, ...patch }
    setPkg(nextPackage)

    if (!nextPackage.id && nextPackage.totalSessions <= 0) {
      return nextPackage
    }

    setBusy(true)
    try {
      return await persistPackage(nextPackage)
    } catch (error) {
      appUi.toast(error.message ?? 'Could not update package dates.', 'error')
      return pkg
    } finally {
      setBusy(false)
    }
  }

  const handlePurchasedDateChange = (value) => {
    updatePackageDates({ purchasedAt: value || todayKey() })
  }

  const handleExpirationDateChange = (value) => {
    updatePackageDates({ expiresAt: value || null })
  }

  const clearExpirationDate = () => {
    updatePackageDates({ expiresAt: null })
  }

  const handleAddSessions = async (count) => {
    const withDates = {
      ...pkg,
      purchasedAt: pkg.purchasedAt ?? todayKey(),
    }
    const result = addSessionsToPackage(withDates, count, {
      expiresAt: withDates.expiresAt,
    })
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
            <Package {...ICON} />
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
              <div className="coach-session-stat">
                <strong>{pkg.totalSessions}</strong>
                <span>Sessions purchased</span>
              </div>
              <div className="coach-session-stat">
                <strong>{pkg.sessionsRemaining}</strong>
                <span>Remaining</span>
              </div>
              <div className="coach-session-stat">
                <strong>{pkg.sessionsUsed}</strong>
                <span>Used</span>
              </div>
            </div>
          </>
        )}

        <div className="coach-session-date-grid">
          <label className="coach-date-field">
            <span>Purchased date</span>
            <input
              type="date"
              className="coach-field-input"
              value={pkg.purchasedAt ?? todayKey()}
              disabled={busy}
              onChange={(event) =>
                handlePurchasedDateChange(event.target.value)
              }
            />
          </label>

          <label className="coach-date-field">
            <span>Expiration date</span>
            <div className="coach-date-input-row">
              <input
                type="date"
                className="coach-field-input"
                value={pkg.expiresAt ?? ''}
                disabled={busy}
                onChange={(event) =>
                  handleExpirationDateChange(event.target.value)
                }
              />
              {pkg.expiresAt && (
                <button
                  type="button"
                  className="coach-date-clear"
                  disabled={busy}
                  onClick={clearExpirationDate}
                  aria-label="Clear expiration date"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="coach-session-package-actions">
          {canRecord ? (
            <>
              <label className="coach-session-note-field">
                <span>Optional note</span>
                <input
                  className="coach-field-input"
                  value={sessionNote}
                  onChange={(event) => setSessionNote(event.target.value)}
                  placeholder="Session focus, location, context…"
                  maxLength={160}
                />
              </label>
              <button
                type="button"
                className="gold-button machined coach-primary-action"
                disabled={busy}
                onClick={handleRecordSession}
              >
                Record Session
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gold-button machined coach-primary-action"
              disabled={busy}
              onClick={() => setShowAddPanel((open) => !open)}
            >
              <Plus {...ICON} />
              Add Sessions
              <ChevronDown
                {...ICON}
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
                className="coach-field-input"
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
            <RotateCcw size={16} strokeWidth={1.75} />
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

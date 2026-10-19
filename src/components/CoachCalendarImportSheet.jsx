import { useState } from 'react'
import AppUiBackdrop from './ui/AppUiBackdrop'
import { analyzeCalendarScreenshot } from '../lib/calendarScreenshotAnalyze'
import { prepareCalendarImportReview } from '../lib/calendarScreenshotImport'
import { getClientDisplayName } from '../lib/clientDisplayName'
import { resolveRecordBusinessClientId } from '../lib/coachBusinessClient'

export default function CoachCalendarImportSheet({ open, clients = [], existingItems = [], onClose, onSave }) {
  const [items, setItems] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  if (!open) return null
  const update = (id, patch) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
  const importPhoto = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setAnalyzing(true); setError(''); setItems([]); setExpandedId(null)
    try {
      const extracted = await analyzeCalendarScreenshot(file)
      const seen = new Set()
      const reviewed = prepareCalendarImportReview(extracted, clients).map(item => {
        const key = [item.date, item.startTime, item.title.toLowerCase()].join('|')
        const existingMatch = existingItems.some(existing => {
          if (String(existing.sessionDate ?? existing.eventDate ?? '') !== item.date ||
              String(existing.startTime ?? '').slice(0,5) !== item.startTime) return false
          if (item.businessClientId && String(existing.businessClientId ?? '') === String(item.businessClientId)) return true
          return String(existing.title ?? '').toLowerCase() === item.title.toLowerCase()
        })
        const duplicate = existingMatch || seen.has(key)
        seen.add(key)
        return { ...item, duplicate, selected: false }
      })
      setItems(reviewed)
      if (!reviewed.length) setError('No events found. Try a screenshot with visible event titles and times.')
    } catch (failure) { setError(failure.message || 'Could not analyze screenshot.') }
    finally { setAnalyzing(false) }
  }
  const ready = items.filter(item => item.selected && item.title && item.date && item.startTime && Number(item.durationMinutes) > 0 && !item.duplicate && !item.dateConflict && !item.geometryConflict &&
    (item.suggestedType !== 'training_candidate' || item.businessClientId))
  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const { failedIds = [], savedCount = 0 } = await onSave(ready)
      if (failedIds.length) {
        const failed = new Set(failedIds)
        setItems(current => current.filter(item => !item.selected || failed.has(item.id)))
        setError(failedIds.length + ' event(s) could not be saved. Only those entries remain selected for retry.')
      } else {
        setItems([])
        onClose()
      }
    } catch (failure) { setError(failure.message || 'Could not save events.') }
    finally { setSaving(false) }
  }
  return <AppUiBackdrop open onClose={saving ? undefined : onClose} className="coach-schedule-session-backdrop">
    <section className="coach-calendar-import-sheet" role="dialog" aria-modal="true" aria-label="Import calendar screenshot" onClick={e => e.stopPropagation()}>
      <header><div><span className="eyebrow">AVA CALENDAR</span><h2>Import a screenshot</h2><p>Review everything before it reaches your calendar.</p></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close import">✕</button></header>
      <label className="coach-calendar-import-upload"><span>{analyzing ? 'AVA is reading your screenshot…' : 'Choose Google Calendar screenshot'}</span>
        <input type="file" accept="image/*" disabled={analyzing || saving} onChange={importPhoto} /></label>
      {error ? <p role="alert">{error}</p> : null}
      {items.length ? <>
        <p className="coach-calendar-import-hint">{items.length} events found · Check the details, then select the ones to add.</p>
        <div className="coach-calendar-import-items">{items.map(item => {
          const client = clients.find(c => String(resolveRecordBusinessClientId(c)) === String(item.businessClientId))
          const summaryDate = item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Date unclear'
          const valid = Boolean(item.title.trim() && item.date && item.startTime && Number(item.durationMinutes) > 0 && !item.dateConflict && !item.geometryConflict &&
            (item.suggestedType !== 'training_candidate' || item.businessClientId))
          const expanded = expandedId === item.id
          return <article key={item.id} className={'coach-calendar-import-item coach-calendar-import-compact ' + (item.duplicate ? 'is-duplicate' : '')}>
            <div className="coach-calendar-import-summary">
              <input type="checkbox" aria-label={'Include ' + item.title} checked={item.selected} disabled={item.duplicate || saving || !valid}
                onChange={e => update(item.id, { selected: e.target.checked })} />
              <div className="coach-calendar-import-summary-copy">
                <strong>{client ? getClientDisplayName(client) : item.title || 'Unclear event'}</strong>
                <span>{summaryDate} · {item.startTime || 'Time unclear'} · {item.durationMinutes || '?'} min</span>
                <small>{item.suggestedType === 'training_candidate' ? (client ? 'Training session' : 'Choose training client') : 'Everyday event'}{item.duplicate ? ' · Already on calendar' : ''}</small>
              </div>
              <button type="button" className="coach-calendar-import-edit-trigger" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : item.id)}>{expanded ? 'Done' : 'Edit'}</button>
            </div>
            {item.geometryConflict ? <p className="coach-calendar-import-warning">AVA could not verify this appointment against the hour grid. Open Edit, check its day, start and duration, then confirm them.</p> : null}
            {item.dateConflict ? <p className="coach-calendar-import-warning">The extracted date does not match the weekday column. Check the date before adding.</p> : null}
            {item.matchStatus === 'ambiguous' && !item.businessClientId ? <div className="coach-calendar-import-suggestions">
              <small>Could this be a client?</small>
              <div>{item.candidates.map(candidate => <button type="button" key={candidate.id} onClick={() => update(item.id, { suggestedType: 'training_candidate', businessClientId: candidate.id, needsReview: false })}>
                {getClientDisplayName(clients.find(c => String(resolveRecordBusinessClientId(c)) === String(candidate.id)) || {}) || candidate.name}
              </button>)}</div>
            </div> : null}
            {expanded ? <div className="coach-calendar-import-editor">
              <label>Event name<input aria-label="Event title" value={item.title} onChange={e => update(item.id, { title: e.target.value })} /></label>
              <div className="coach-calendar-import-fields">
                <label>Date<input type="date" aria-label="Event date" value={item.date} onChange={e => update(item.id, { date: e.target.value, dateConflict: false })} /></label>
                <label>Starts<input type="time" aria-label="Start time" value={item.startTime} onChange={e => update(item.id, { startTime: e.target.value })} /></label>
                <label>Minutes<input type="number" min="1" max="1440" aria-label="Duration in minutes" value={item.durationMinutes} onChange={e => update(item.id, { durationMinutes: Number(e.target.value) })} /></label>
              </div>
              <label>Event type<select aria-label="Event type" value={item.suggestedType} onChange={e => update(item.id, { suggestedType: e.target.value, businessClientId: e.target.value === 'private' ? null : item.businessClientId })}>
                <option value="private">Everyday event</option><option value="training_candidate">Training session</option>
              </select></label>
              {item.suggestedType === 'training_candidate' ? <label>Client<select aria-label="Training client" value={item.businessClientId || ''} onChange={e => update(item.id, { businessClientId: e.target.value })}>
                <option value="">Choose client</option>{clients.map(c => { const id = resolveRecordBusinessClientId(c); return id ? <option key={id} value={id}>{getClientDisplayName(c)}</option> : null })}
              </select></label> : null}
              {item.geometryConflict ? <button type="button" className="coach-calendar-import-verify" onClick={() => update(item.id, { geometryConflict: false })}>I've checked this time against the screenshot</button> : null}
            </div> : null}
          </article>
        })}</div>
      </> : null}
      <footer><button type="button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="gold-button machined coach-primary-action" disabled={!ready.length || saving || analyzing} onClick={handleSave}>{saving ? 'Saving…' : 'Save ' + ready.length + ' selected'}</button></footer>
    </section>
  </AppUiBackdrop>
}

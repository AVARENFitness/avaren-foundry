import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronDown } from 'lucide-react'
import AppUiCloseButton from './ui/AppUiCloseButton'
import { getClientDisplayName } from '../lib/clientDisplayName'
import {
  DURATION_PRESETS,
  LOCATION_PRESETS,
  addDaysKey,
  buildQuarterHourTimeOptions,
  dateKey,
  filterAvailableTimeOptions,
  formatScheduleDateLong,
  formatScheduleTimeRange,
  formatTime12Hour,
  isScheduleTimeInPast,
} from '../lib/appointmentScheduling'

const ICON = { size: 18, strokeWidth: 1.75 }

const locationDisplayLabel = (locationType = 'default', locationName = '') => {
  if (locationType === 'other' && String(locationName).trim()) {
    return locationName.trim()
  }

  return (
    LOCATION_PRESETS.find((option) => option.value === locationType)?.label ??
    (locationType === 'default' ? 'AVAREN Gym' : 'Select location')
  )
}

export default function CoachScheduleSessionSheet({
  open,
  clients = [],
  draft,
  onDraftChange,
  onClose,
  onSubmit,
  submitting = false,
  scheduleTimezone,
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const dateInputRef = useRef(null)
  const [timeError, setTimeError] = useState('')
  const [openMenu, setOpenMenu] = useState(null)

  const todayKey = dateKey(new Date(), scheduleTimezone)
  const tomorrowKey = addDaysKey(todayKey, 1)

  const timeOptions = useMemo(
    () => buildQuarterHourTimeOptions({ startHour: 6, endHour: 21 }),
    [],
  )

  const availableTimeOptions = useMemo(
    () =>
      filterAvailableTimeOptions(timeOptions, {
        sessionDate: draft.sessionDate,
        scheduleTimezone,
      }),
    [draft.sessionDate, scheduleTimezone, timeOptions],
  )

  const selectedClient = clients.find(
    (client) => String(client.athlete_id) === String(draft.athleteId),
  )

  const selectedAssignment = draft.assignments?.find(
    (assignment) => String(assignment.id) === String(draft.assignmentId),
  )

  const selectedTimeLabel =
    formatTime12Hour(draft.startTime) || 'Select time'

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenMenu(null)
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.scrollTo?.(0, 0)
    setTimeError('')
    setOpenMenu(null)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!openMenu) return undefined

    const closeMenu = () => setOpenMenu(null)
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openMenu])

  useEffect(() => {
    if (!open || !draft.sessionDate || !draft.startTime) return

    if (
      isScheduleTimeInPast({
        sessionDate: draft.sessionDate,
        startTime: draft.startTime,
        scheduleTimezone,
      })
    ) {
      const nextTime = availableTimeOptions[0]?.value ?? ''
      if (nextTime && nextTime !== draft.startTime) {
        onDraftChange?.({ ...draft, startTime: nextTime })
      }
    }
  }, [
    availableTimeOptions,
    draft,
    onDraftChange,
    open,
    scheduleTimezone,
  ])

  const handleDateQuickPick = (sessionDate) => {
    setTimeError('')
    onDraftChange?.({ ...draft, sessionDate })
  }

  const handleSubmit = () => {
    if (
      isScheduleTimeInPast({
        sessionDate: draft.sessionDate,
        startTime: draft.startTime,
        scheduleTimezone,
      })
    ) {
      setTimeError('That time has already passed.')
      return
    }

    setTimeError('')
    onSubmit?.()
  }

  const toggleMenu = (menuId) => (event) => {
    event.stopPropagation()
    setOpenMenu((current) => (current === menuId ? null : menuId))
  }

  if (!open) return null

  return createPortal(
    <div
      className="app-ui-backdrop coach-schedule-session-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="coach-schedule-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-schedule-session-sheet-header">
          <div>
            <span className="eyebrow">SCHEDULE SESSION</span>
            <h2 id={titleId}>In-person training</h2>
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        <div className="coach-schedule-session-sheet-body">
          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Client</span>
            <div className="coach-schedule-picker">
              <button
                type="button"
                className="coach-schedule-control"
                aria-expanded={openMenu === 'client'}
                aria-haspopup="listbox"
                onClick={toggleMenu('client')}
              >
                <span>
                  {selectedClient
                    ? getClientDisplayName(selectedClient) || selectedClient.athlete_email
                    : 'Select client'}
                </span>
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {openMenu === 'client' ? (
                <div
                  className="coach-schedule-menu"
                  role="listbox"
                  onClick={(event) => event.stopPropagation()}
                >
                  {clients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={String(client.athlete_id) === String(draft.athleteId)}
                      className={`coach-schedule-menu-option ${
                        String(client.athlete_id) === String(draft.athleteId)
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => {
                        onDraftChange?.({
                          ...draft,
                          athleteId: client.athlete_id,
                          assignmentId: null,
                        })
                        setOpenMenu(null)
                      }}
                    >
                      {getClientDisplayName(client) || client.athlete_email}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Date</span>
            <div
              className="coach-schedule-segmented"
              role="group"
              aria-label="Quick date"
            >
              <button
                type="button"
                className={`coach-schedule-segment ${
                  draft.sessionDate === todayKey ? 'active' : ''
                }`}
                onClick={() => handleDateQuickPick(todayKey)}
              >
                Today
              </button>
              <button
                type="button"
                className={`coach-schedule-segment ${
                  draft.sessionDate === tomorrowKey ? 'active' : ''
                }`}
                onClick={() => handleDateQuickPick(tomorrowKey)}
              >
                Tomorrow
              </button>
            </div>
            <button
              type="button"
              className="coach-schedule-control coach-schedule-control--date"
              onClick={() =>
                dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()
              }
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{formatScheduleDateLong(draft.sessionDate) || 'Select date'}</span>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="coach-schedule-hidden-date"
              value={draft.sessionDate}
              min={todayKey}
              onChange={(event) => handleDateQuickPick(event.target.value)}
            />
          </div>

          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Time</span>
            <div className="coach-schedule-picker">
              <button
                type="button"
                className="coach-schedule-control"
                aria-expanded={openMenu === 'time'}
                aria-haspopup="listbox"
                onClick={toggleMenu('time')}
              >
                <span>{selectedTimeLabel}</span>
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {openMenu === 'time' ? (
                <div
                  className="coach-schedule-menu"
                  role="listbox"
                  onClick={(event) => event.stopPropagation()}
                >
                  {timeOptions.map((option) => {
                    const disabled =
                      draft.sessionDate === todayKey &&
                      !availableTimeOptions.some(
                        (entry) => entry.value === option.value,
                      )

                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={draft.startTime === option.value}
                        disabled={disabled}
                        className={`coach-schedule-menu-option ${
                          draft.startTime === option.value ? 'active' : ''
                        }`}
                        onClick={() => {
                          if (disabled) return
                          setTimeError('')
                          onDraftChange?.({ ...draft, startTime: option.value })
                          setOpenMenu(null)
                        }}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
            {timeError ? (
              <small className="coach-schedule-time-error">{timeError}</small>
            ) : null}
          </div>

          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Duration</span>
            <div
              className="coach-schedule-segmented coach-schedule-segmented--duration"
              role="group"
              aria-label="Duration"
            >
              {DURATION_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={`coach-schedule-segment ${
                    Number(draft.durationMinutes) === minutes ? 'active' : ''
                  }`}
                  onClick={() =>
                    onDraftChange?.({ ...draft, durationMinutes: String(minutes) })
                  }
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Location</span>
            <div className="coach-schedule-picker">
              <button
                type="button"
                className="coach-schedule-control"
                aria-expanded={openMenu === 'location'}
                aria-haspopup="listbox"
                onClick={toggleMenu('location')}
              >
                <span>
                  {locationDisplayLabel(draft.locationType, draft.locationName)}
                </span>
                <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {openMenu === 'location' ? (
                <div
                  className="coach-schedule-menu"
                  role="listbox"
                  onClick={(event) => event.stopPropagation()}
                >
                  {LOCATION_PRESETS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={draft.locationType === option.value}
                      className={`coach-schedule-menu-option ${
                        draft.locationType === option.value ? 'active' : ''
                      }`}
                      onClick={() => {
                        onDraftChange?.({
                          ...draft,
                          locationType: option.value,
                          locationName:
                            option.value === 'other' ? draft.locationName : '',
                        })
                        setOpenMenu(null)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {draft.locationType === 'other' ? (
            <label className="coach-schedule-field-group coach-schedule-field-group--secondary">
              <span className="coach-schedule-field-label">Location name</span>
              <div className="coach-schedule-control coach-schedule-control--input">
                <input
                  type="text"
                  className="coach-schedule-inline-input"
                  value={draft.locationName ?? ''}
                  placeholder="Enter location"
                  onChange={(event) =>
                    onDraftChange?.({
                      ...draft,
                      locationName: event.target.value,
                    })
                  }
                />
              </div>
            </label>
          ) : null}

          {draft.assignments?.length > 0 ? (
            <div className="coach-schedule-field-group coach-schedule-field-group--secondary">
              <span className="coach-schedule-field-label">
                Workout <span className="coach-schedule-optional">Optional</span>
              </span>
              <div className="coach-schedule-picker">
                <button
                  type="button"
                  className="coach-schedule-control coach-schedule-control--secondary"
                  aria-expanded={openMenu === 'workout'}
                  aria-haspopup="listbox"
                  onClick={toggleMenu('workout')}
                >
                  <span>
                    {selectedAssignment?.title ?? 'Optional workout'}
                  </span>
                  <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
                {openMenu === 'workout' ? (
                  <div
                    className="coach-schedule-menu"
                    role="listbox"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={!draft.assignmentId}
                      className={`coach-schedule-menu-option ${
                        !draft.assignmentId ? 'active' : ''
                      }`}
                      onClick={() => {
                        onDraftChange?.({ ...draft, assignmentId: null })
                        setOpenMenu(null)
                      }}
                    >
                      No linked workout
                    </button>
                    {draft.assignments.map((assignment) => (
                      <button
                        key={assignment.id}
                        type="button"
                        role="option"
                        aria-selected={
                          String(assignment.id) === String(draft.assignmentId)
                        }
                        className={`coach-schedule-menu-option ${
                          String(assignment.id) === String(draft.assignmentId)
                            ? 'active'
                            : ''
                        }`}
                        onClick={() => {
                          onDraftChange?.({
                            ...draft,
                            assignmentId: assignment.id,
                          })
                          setOpenMenu(null)
                        }}
                      >
                        {assignment.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="coach-schedule-field-group coach-schedule-field-group--secondary">
            <span className="coach-schedule-field-label">
              Note <span className="coach-schedule-optional">Optional</span>
            </span>
            <div className="coach-schedule-control coach-schedule-control--textarea">
              <textarea
                className="coach-schedule-inline-textarea"
                rows={2}
                value={draft.coachNote}
                placeholder="Add a note for yourself"
                onChange={(event) =>
                  onDraftChange?.({
                    ...draft,
                    coachNote: event.target.value,
                  })
                }
              />
            </div>
          </label>

          {draft.athleteId && draft.sessionDate && draft.startTime ? (
            <section className="coach-schedule-preview" aria-label="Session preview">
              <span className="eyebrow">IN-PERSON TRAINING</span>
              <strong>{getClientDisplayName(selectedClient ?? {}) || 'Client'}</strong>
              <span>{formatScheduleDateLong(draft.sessionDate)}</span>
              <span>
                {formatScheduleTimeRange({
                  startTime: draft.startTime,
                  durationMinutes: Number(draft.durationMinutes) || 60,
                })}
              </span>
              {selectedAssignment?.title ? <span>{selectedAssignment.title}</span> : null}
            </section>
          ) : null}
        </div>

        <footer className="coach-schedule-session-sheet-footer">
          <button
            type="button"
            className="coach-schedule-cancel-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            disabled={submitting || !draft.athleteId}
            onClick={handleSubmit}
          >
            {submitting ? 'Scheduling…' : 'Schedule Session'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

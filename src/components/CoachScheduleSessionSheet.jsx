import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import AppUiBackdrop from './ui/AppUiBackdrop'
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
  formatTime12Hour,
  isScheduleTimeInPast,
} from '../lib/appointmentScheduling'
import {
  RECURRENCE_END,
  RECURRENCE_MODE,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT_LABELS,
  emptyRecurrenceDraft,
  weekdayFromDateKey,
} from '../lib/recurringAppointments'

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
  const [showMoreOptions, setShowMoreOptions] = useState(false)

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

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpenMenu(null)
        onClose?.()
      }
    }

    const closeMenuOnScroll = () => setOpenMenu(null)

    window.addEventListener('keydown', onKeyDown)
    panelRef.current?.addEventListener('scroll', closeMenuOnScroll)
    panelRef.current?.scrollTo?.(0, 0)
    setTimeError('')
    setOpenMenu(null)
    setShowMoreOptions(false)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      panelRef.current?.removeEventListener('scroll', closeMenuOnScroll)
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
    setOpenMenu(null)
    setTimeError('')
    onDraftChange?.({ ...draft, sessionDate })
  }

  const toggleMenu = (menuId) => (event) => {
    event.stopPropagation()
    setOpenMenu((current) => (current === menuId ? null : menuId))
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

  return (
    <AppUiBackdrop
      open={open}
      onClose={submitting ? undefined : onClose}
      className="coach-schedule-session-backdrop"
      onEscape={() => {
        setOpenMenu(null)
        onClose?.()
      }}
    >
      <section
        ref={panelRef}
        className="coach-schedule-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="coach-schedule-session-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="coach-schedule-session-sheet-header">
          <div>
            <h2 id={titleId}>Schedule appointment</h2>
          </div>
          <AppUiCloseButton onClick={onClose} />
        </header>

        <div className="coach-schedule-session-sheet-body">
          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Client</span>
            <div className="coach-schedule-picker">
              <button
                type="button"
                className="coach-schedule-control coach-schedule-control--client"
                aria-expanded={openMenu === 'client'}
                aria-haspopup="listbox"
                onClick={toggleMenu('client')}
              >
                <span className="coach-schedule-control-value">
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

          <button
            type="button"
            className="coach-schedule-more-toggle"
            aria-expanded={showMoreOptions}
            onClick={() => setShowMoreOptions((current) => !current)}
          >
            More options
            {showMoreOptions ? (
              <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>

          {showMoreOptions ? (
            <>
          <div className="coach-schedule-field-group coach-schedule-field-group--secondary">
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
            </>
          ) : null}

          <div className="coach-schedule-field-group">
            <span className="coach-schedule-field-label">Repeat</span>
            <div
              className="coach-schedule-segmented"
              role="group"
              aria-label="Repeat"
            >
              {[
                { value: RECURRENCE_MODE.NONE, label: 'Does not repeat' },
                { value: RECURRENCE_MODE.WEEKLY, label: 'Weekly' },
                { value: RECURRENCE_MODE.CUSTOM, label: 'Custom' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`coach-schedule-segment ${
                    (draft.recurrence?.enabled
                      ? draft.recurrence.mode
                      : RECURRENCE_MODE.NONE) === option.value ||
                    (!draft.recurrence?.enabled && option.value === RECURRENCE_MODE.NONE)
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => {
                    if (option.value === RECURRENCE_MODE.NONE) {
                      onDraftChange?.({
                        ...draft,
                        recurrence: emptyRecurrenceDraft(),
                      })
                      return
                    }

                    const nextRecurrence = {
                      ...(draft.recurrence ?? emptyRecurrenceDraft()),
                      enabled: true,
                      mode: option.value,
                      weekdays:
                        option.value === RECURRENCE_MODE.WEEKLY
                          ? [weekdayFromDateKey(draft.sessionDate)]
                          : draft.recurrence?.weekdays?.length
                            ? draft.recurrence.weekdays
                            : [weekdayFromDateKey(draft.sessionDate)],
                    }

                    onDraftChange?.({ ...draft, recurrence: nextRecurrence })
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {draft.recurrence?.enabled ? (
            <>
              {draft.recurrence.mode === RECURRENCE_MODE.CUSTOM ? (
                <div className="coach-schedule-field-group">
                  <span className="coach-schedule-field-label">Days</span>
                  <div
                    className="coach-schedule-weekday-grid"
                    role="group"
                    aria-label="Repeat days"
                  >
                    {WEEKDAY_ORDER.map((day) => {
                      const selected = draft.recurrence.weekdays?.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`coach-schedule-weekday-chip${selected ? ' active' : ''}`}
                          aria-pressed={selected}
                          onClick={() => {
                            const current = draft.recurrence.weekdays ?? []
                            const weekdays = selected
                              ? current.filter((entry) => entry !== day)
                              : [...current, day]
                            onDraftChange?.({
                              ...draft,
                              recurrence: {
                                ...draft.recurrence,
                                weekdays,
                              },
                            })
                          }}
                        >
                          {WEEKDAY_SHORT_LABELS[day]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <div className="coach-schedule-field-group">
                <span className="coach-schedule-field-label">Ends</span>
                <div
                  className="coach-schedule-segmented"
                  role="group"
                  aria-label="Recurrence end"
                >
                  <button
                    type="button"
                    className={`coach-schedule-segment ${
                      draft.recurrence.endType === RECURRENCE_END.ON_DATE
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      onDraftChange?.({
                        ...draft,
                        recurrence: {
                          ...draft.recurrence,
                          endType: RECURRENCE_END.ON_DATE,
                        },
                      })
                    }
                  >
                    On date
                  </button>
                  <button
                    type="button"
                    className={`coach-schedule-segment ${
                      draft.recurrence.endType === RECURRENCE_END.AFTER_COUNT
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      onDraftChange?.({
                        ...draft,
                        recurrence: {
                          ...draft.recurrence,
                          endType: RECURRENCE_END.AFTER_COUNT,
                        },
                      })
                    }
                  >
                    After count
                  </button>
                </div>
              </div>

              {draft.recurrence.endType === RECURRENCE_END.ON_DATE ? (
                <label className="coach-schedule-field-group">
                  <span className="coach-schedule-field-label">End date</span>
                  <div className="coach-schedule-control coach-schedule-control--input">
                    <input
                      type="date"
                      className="coach-schedule-inline-input"
                      min={draft.sessionDate}
                      value={draft.recurrence.endsOn ?? ''}
                      onChange={(event) =>
                        onDraftChange?.({
                          ...draft,
                          recurrence: {
                            ...draft.recurrence,
                            endsOn: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </label>
              ) : (
                <label className="coach-schedule-field-group">
                  <span className="coach-schedule-field-label">Occurrences</span>
                  <div className="coach-schedule-control coach-schedule-control--input">
                    <input
                      type="number"
                      min="1"
                      className="coach-schedule-inline-input"
                      value={draft.recurrence.occurrenceLimit ?? ''}
                      onChange={(event) =>
                        onDraftChange?.({
                          ...draft,
                          recurrence: {
                            ...draft.recurrence,
                            occurrenceLimit: event.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </label>
              )}
            </>
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
            {submitting ? 'Saving…' : 'Save appointment'}
          </button>
        </footer>
      </section>
    </AppUiBackdrop>
  )
}

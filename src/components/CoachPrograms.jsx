import {
  ArrowLeft,
  CalendarRange,
  Copy,
  Plus,
  Send,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import {
  emptyProgram,
  isProgramDraftDirty,
  programFromRecord,
  scrollCoachShellToTop,
} from '../lib/coachProgramDraft'
import SectionHeader from './ui/SectionHeader'
import EmptyState from './ui/EmptyState'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CoachPrograms({
  clients,
  templates,
  program,
  onRefresh,
  embedded = false,
  onBack,
  onCreateWorkout,
  clientContext = null,
  onAssigned,
}) {
  const [programs, setPrograms] = useState([])
  const [editing, setEditing] = useState(null)
  const [assigning, setAssigning] = useState(null)
  const [notice, setNotice] = useState('')
  const [assignment, setAssignment] = useState({
    athleteId: '',
    startDate: new Date().toISOString().slice(0, 10),
  })

  const editingBaselineRef = useRef(null)
  const builderFocusRef = useRef(null)

  const library = [
    ...templates.map((template) => ({
      id: `template:${template.id}`,
      name: template.name,
      workout: template.workout_payload,
    })),
    ...Object.entries(program?.workouts ?? {}).map(([name, exercises]) => ({
      id: `program:${name}`,
      name,
      workout: { name, exercises },
    })),
  ]

  const load = async () => {
    try {
      setPrograms(await coachBackend.listPrograms())
    } catch (error) {
      setNotice(error.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!clientContext || clientContext.mode !== 'build' || editing) return
    openEditor(emptyProgram())
  }, [clientContext, editing])

  useEffect(() => {
    if (!clientContext?.athleteId) return
    setAssignment((current) => ({
      ...current,
      athleteId: clientContext.athleteId,
    }))
  }, [clientContext?.athleteId])

  useEffect(() => {
    if (!editing && !assigning) return undefined

    const frame = requestAnimationFrame(() => {
      scrollCoachShellToTop()
      builderFocusRef.current?.focus?.()
    })

    return () => cancelAnimationFrame(frame)
  }, [editing, assigning])

  const openEditor = (draft) => {
    const nextDraft = structuredClone(draft)
    editingBaselineRef.current = structuredClone(draft)
    setEditing(nextDraft)
    setAssigning(null)
  }

  const closeEditor = async () => {
    if (
      editing &&
      isProgramDraftDirty(editingBaselineRef.current, editing) &&
      !(await appUi.confirm({
        message: 'Discard unsaved program changes?',
        tone: 'danger',
        confirmLabel: 'Discard',
      }))
    ) {
      return
    }

    editingBaselineRef.current = null
    setEditing(null)
    if (clientContext?.mode === 'build' && !assigning) {
      clientContext.onClose?.()
      return
    }
    scrollCoachShellToTop()
  }

  const save = async () => {
    const hydrated = {
      ...editing,
      days: editing.days.map((day) =>
        day.kind === 'workout'
          ? {
              ...day,
              workoutPayload:
                library.find((item) => item.id === day.templateId)?.workout ??
                day.workoutPayload,
            }
          : day,
      ),
    }

    const saved = await coachBackend.saveProgram(hydrated)
    editingBaselineRef.current = null
    setEditing(null)
    setNotice('Program saved.')
    await load()
    await onRefresh?.()

    if (clientContext && saved) {
      setAssigning(saved)
      setAssignment({
        athleteId: clientContext.athleteId,
        startDate: new Date().toISOString().slice(0, 10),
      })
      setNotice(`Program saved. Assign to ${clientContext.clientName}?`)
      scrollCoachShellToTop()
      return
    }

    scrollCoachShellToTop()
  }

  const publish = async () => {
    await coachBackend.assignProgram({
      programId: assigning.id,
      athleteId: assignment.athleteId,
      startDate: assignment.startDate,
    })
    setAssigning(null)
    setNotice('Program published to client calendar.')
    await onRefresh?.()
    if (clientContext) {
      onAssigned?.()
      clientContext.onClose?.()
    }
    scrollCoachShellToTop()
  }

  const updateDay = (index, patch) => {
    setEditing((current) => ({
      ...current,
      days: current.days.map((item, dayIndex) =>
        dayIndex === index ? { ...item, ...patch } : item,
      ),
    }))
  }

  const wrapClientOverlay = (content) =>
    clientContext ? (
      <div className="coach-client-program-overlay" data-testid="coach-client-program-flow">
        {content}
      </div>
    ) : (
      content
    )

  if (clientContext?.mode === 'assign' && !editing && !assigning) {
    return wrapClientOverlay(
      <section
        className="coach-client-program-assign"
        data-testid="coach-client-program-assign"
      >
        <header className="coach-program-builder-header">
          <button
            type="button"
            className="coach-program-builder-back"
            onClick={clientContext.onClose}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="coach-program-builder-heading">
            <span className="eyebrow">ASSIGN PROGRAM</span>
            <h1 ref={builderFocusRef} tabIndex={-1}>
              {clientContext.clientName}
            </h1>
          </div>
        </header>

        {notice ? <p className="coach-hub-notice">{notice}</p> : null}

        {programs.length ? (
          <div className="coach-program-grid coach-client-program-grid">
            {programs.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.duration_weeks} weeks ·{' '}
                    {item.program_payload?.days?.length ?? 0} scheduled days
                  </span>
                  {item.description ? <p>{item.description}</p> : null}
                </div>
                <div>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => {
                      setAssigning(item)
                      setEditing(null)
                      setAssignment({
                        athleteId: clientContext.athleteId,
                        startDate: new Date().toISOString().slice(0, 10),
                      })
                    }}
                  >
                    <Send size={15} />
                    Choose
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarRange}
            title="No programs yet"
            description="Build a program once, then assign it directly from here."
            action={
              <button
                type="button"
                className="coach-secondary-button"
                data-testid="coach-client-build-program"
                onClick={() => clientContext.onRequestBuild?.()}
              >
                Build a program
              </button>
            }
          />
        )}
      </section>,
    )
  }

  if (editing) {
    return wrapClientOverlay(
      <section
        className="coach-program-builder-screen"
        data-testid="coach-program-builder"
      >
        <header className="coach-program-builder-header">
          <button
            type="button"
            className="coach-program-builder-back"
            onClick={closeEditor}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="coach-program-builder-heading">
            <span className="eyebrow">PROGRAM BUILDER</span>
            <h1
              ref={builderFocusRef}
              tabIndex={-1}
              data-testid="coach-program-builder-title"
            >
              {editing.id ? 'Edit Program' : 'New Program'}
            </h1>
          </div>

          <button
            type="button"
            className="gold-button machined coach-program-builder-save"
            onClick={save}
          >
            Save Program
          </button>
        </header>

        {notice ? <p className="coach-hub-notice">{notice}</p> : null}

        <div className="coach-program-editor coach-program-editor--focused">
          <label>
            <span>Name</span>
            <input
              value={editing.name}
              onChange={(event) =>
                setEditing({ ...editing, name: event.target.value })
              }
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              rows={3}
              value={editing.description}
              onChange={(event) =>
                setEditing({ ...editing, description: event.target.value })
              }
            />
          </label>

          <label>
            <span>Duration</span>
            <select
              value={editing.durationWeeks}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  durationWeeks: Number(event.target.value),
                })
              }
            >
              {[4, 8, 12, 16].map((value) => (
                <option key={value} value={value}>
                  {value} weeks
                </option>
              ))}
            </select>
          </label>

          <div className="coach-program-days">
            <span className="eyebrow">SCHEDULE</span>
            {editing.days.map((day, index) => (
              <article
                key={`${day.weekday}-${day.kind}-${index}`}
                className="coach-program-day-row"
              >
                <select
                  aria-label={`Day ${index + 1} weekday`}
                  value={day.weekday}
                  onChange={(event) =>
                    updateDay(index, { weekday: Number(event.target.value) })
                  }
                >
                  {WEEKDAYS.map((name, weekday) => (
                    <option key={name} value={weekday}>
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={`Day ${index + 1} type`}
                  value={day.kind}
                  onChange={(event) =>
                    updateDay(index, { kind: event.target.value })
                  }
                >
                  <option value="workout">Workout</option>
                  <option value="rest">Rest</option>
                  <option value="deload">Deload</option>
                </select>

                {day.kind === 'workout' ? (
                  <div className="coach-program-day-workout">
                    <select
                      aria-label={`Day ${index + 1} workout`}
                      value={day.templateId}
                      onChange={(event) => {
                        const templateId = event.target.value
                        updateDay(index, {
                          templateId,
                          title:
                            library.find((item) => item.id === templateId)?.name ??
                            '',
                        })
                      }}
                    >
                      <option value="">Choose workout</option>
                      {library.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="coach-secondary-button coach-program-create-workout"
                      onClick={() => onCreateWorkout?.()}
                    >
                      Create workout
                    </button>
                  </div>
                ) : (
                  <input
                    aria-label={`Day ${index + 1} title`}
                    value={day.title}
                    onChange={(event) =>
                      updateDay(index, { title: event.target.value })
                    }
                    placeholder={
                      day.kind === 'rest' ? 'Rest Day' : 'Deload Day'
                    }
                  />
                )}

                <button
                  type="button"
                  className="coach-icon-button coach-icon-button--destructive"
                  aria-label={`Remove day ${index + 1}`}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      days: editing.days.filter((_, dayIndex) => dayIndex !== index),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>

          <button
            type="button"
            className="coach-secondary-button"
            onClick={() =>
              setEditing({
                ...editing,
                days: [
                  ...editing.days,
                  { weekday: 1, kind: 'workout', title: '', templateId: '' },
                ],
              })
            }
          >
            <Plus size={15} />
            Add Day
          </button>
        </div>
      </section>,
    )
  }

  if (assigning) {
    return wrapClientOverlay(
      <section
        className="coach-program-builder-screen"
        data-testid="coach-program-assign"
      >
        <header className="coach-program-builder-header">
          <button
            type="button"
            className="coach-program-builder-back"
            onClick={() => {
              setAssigning(null)
              scrollCoachShellToTop()
            }}
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="coach-program-builder-heading">
            <span className="eyebrow">ASSIGN PROGRAM</span>
            <h1 ref={builderFocusRef} tabIndex={-1}>
              {assigning.name}
            </h1>
          </div>
        </header>

        <div className="coach-program-editor coach-program-editor--focused">
          {clientContext ? (
            <div className="coach-client-program-target">
              <span className="eyebrow">CLIENT</span>
              <strong>{clientContext.clientName}</strong>
            </div>
          ) : (
            <label>
              <span>Client</span>
              <select
                value={assignment.athleteId}
                onChange={(event) =>
                  setAssignment({ ...assignment, athleteId: event.target.value })
                }
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.athlete_id}>
                    {client.athlete_email}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <span>Start date</span>
            <input
              type="date"
              value={assignment.startDate}
              onChange={(event) =>
                setAssignment({ ...assignment, startDate: event.target.value })
              }
            />
          </label>

          <button
            type="button"
            className="gold-button machined"
            disabled={!assignment.athleteId}
            onClick={publish}
          >
            <Send size={16} />
            {clientContext
              ? `Assign to ${clientContext.clientName}`
              : 'Publish Program'}
          </button>
        </div>
      </section>,
    )
  }

  return (
    <section
      className={`coach-programs-screen${embedded ? ' coach-programs-screen--embedded' : ''}`}
      data-testid="coach-programs-list"
    >
      {embedded ? (
        <header className="coach-build-subheader">
          <button
            type="button"
            className="coach-program-builder-back"
            data-testid="coach-build-back"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div>
            <span className="eyebrow">BUILD</span>
            <h1>Programs</h1>
            <p className="coach-build-subcopy">
              Organize workouts into a training plan.
            </p>
          </div>
        </header>
      ) : null}

      {!embedded ? (
      <SectionHeader
        eyebrow="MULTI-WEEK PROGRAMMING"
        title="Programs"
        description="Build reusable weekly structures and publish them to any client calendar."
        action={
          <button
            type="button"
            className="gold-button machined"
            onClick={() => openEditor(emptyProgram())}
          >
            <Plus size={16} />
            New Program
          </button>
        }
      />
      ) : (
        <div className="coach-build-programs-actions">
          <button
            type="button"
            className="gold-button machined coach-primary-action"
            onClick={() => openEditor(emptyProgram())}
          >
            <Plus size={16} />
            New Program
          </button>
        </div>
      )}

      {notice ? <p className="coach-hub-notice">{notice}</p> : null}

      {programs.length ? (
        <div className="coach-program-grid">
          {programs.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.duration_weeks} weeks ·{' '}
                  {item.program_payload?.days?.length ?? 0} scheduled days
                </span>
                <p>{item.description}</p>
              </div>
              <div>
                <button type="button" onClick={() => openEditor(programFromRecord(item))}>
                  <Copy size={15} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssigning(item)
                    setEditing(null)
                  }}
                >
                  <Send size={15} />
                  Assign
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await appUi.confirm({
                        message: `Delete ${item.name}?`,
                        tone: 'danger',
                        confirmLabel: 'Delete',
                      })
                    ) {
                      await coachBackend.deleteProgram(item.id)
                      await load()
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarRange}
          title="No programs yet"
          description="Build a repeatable 4, 8, 12, or 16-week program."
        />
      )}
    </section>
  )
}

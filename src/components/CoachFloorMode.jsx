import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardPenLine,
  Dumbbell,
  MessageCircle,
  Minus,
  PencilLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { COMMON_EXERCISES } from '../data/commonExercises'
import { appUi } from '../lib/appUi'
import { getClientDisplayName } from '../lib/clientDisplayName'
import {
  buildFloorWorkoutFromAssignment,
  buildFloorWorkoutFromHistory,
  clearLocalFloorDraft,
  coachFloorBackend,
  flattenFloorWorkout,
  formatPreviousSet,
  makeFloorExercise,
  makeFloorSet,
  previousPerformanceByExercise,
  readLocalFloorDraft,
  saveLocalFloorDraft,
} from '../lib/coachFloorSession'
import {
  COACH_FLOOR_AI_MODE,
  requestCoachFloorAssist,
} from '../lib/coachFloorAi'
import {
  listAthleteWorkoutSessions,
} from '../lib/athleteWorkoutSessionsBackend'
import { coachMessagingBackend } from '../lib/coachMessaging'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../lib/coachBusinessClient'

const ICON = { size: 18, strokeWidth: 1.8 }

const cleanNumeric = (value) =>
  String(value ?? '')
    .replace(/[^0-9.\-]/g, '')
    .slice(0, 8)

const sortRecentFirst = (sessions = []) =>
  [...sessions].sort(
    (a, b) =>
      new Date(b.finishedAt ?? b.completedAt ?? b.date ?? 0).getTime() -
      new Date(a.finishedAt ?? a.completedAt ?? a.date ?? 0).getTime(),
  )

const floorHistoryFromRecord = (record) => {
  const payload = record?.workoutPayload ?? {}
  return {
    ...payload,
    id: record.id,
    name: record.workoutName,
    finishedAt: record.completedAt,
    sets: Array.isArray(payload.sets) ? payload.sets : [],
  }
}

const fallbackRecap = (workout, clientName) => {
  const flat = flattenFloorWorkout(workout)
  const exerciseCount = flat.exercisesPerformed.length
  const setCount = flat.sets.length
  const firstName = String(clientName ?? '').trim().split(' ')[0]
  const lead = firstName ? `${firstName} completed` : 'Completed'
  return `${lead} ${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'} and ${setCount} working ${setCount === 1 ? 'set' : 'sets'} in today’s coached session. The full workout is saved in AVAREN for future reference.`
}

export default function CoachFloorMode({
  session,
  client,
  assignments = [],
  passSummary,
  onClose,
  onCompleteAppointment,
}) {
  const clientName = getClientDisplayName(client ?? {})
  const athleteId = resolveAthleteDataId(client) ?? session?.athleteId ?? null
  const businessClientId =
    resolveRecordBusinessClientId(client) ?? session?.businessClientId ?? null

  const assignment = useMemo(
    () => assignments.find((item) => item.id === session?.assignmentId) ?? null,
    [assignments, session?.assignmentId],
  )

  const [workout, setWorkout] = useState(() =>
    buildFloorWorkoutFromAssignment(assignment),
  )
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString())
  const [privateNote, setPrivateNote] = useState('')
  const [athleteRecap, setAthleteRecap] = useState('')
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [history, setHistory] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [cloudState, setCloudState] = useState('idle')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [replaceExerciseIndex, setReplaceExerciseIndex] = useState(null)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [noteAssist, setNoteAssist] = useState(null)
  const [noteAssistLoading, setNoteAssistLoading] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [recapLoading, setRecapLoading] = useState(false)
  const [completing, setCompleting] = useState(false)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      const local = readLocalFloorDraft(session?.id)

      let cloud = null
      try {
        cloud = await coachFloorBackend.getFloorSession(session?.id)
      } catch {
        cloud = null
      }

      if (!active) return

      const source = local ?? (
        cloud
          ? {
              workout: {
                name: cloud.workoutName,
                exercises:
                  cloud.workoutPayload?.floorExercises ??
                  buildFloorWorkoutFromHistory(cloud.workoutPayload)?.exercises ??
                  [],
              },
              startedAt: cloud.startedAt,
              privateNote: cloud.privateCoachNote,
              athleteRecap: cloud.athleteRecap,
            }
          : null
      )

      if (source?.workout) setWorkout(source.workout)
      if (source?.startedAt) setStartedAt(source.startedAt)
      if (source?.privateNote) setPrivateNote(source.privateNote)
      if (source?.athleteRecap) setAthleteRecap(source.athleteRecap)

      try {
        if (athleteId) {
          const rows = await listAthleteWorkoutSessions(athleteId, { limit: 40 })
          if (active) setHistory(sortRecentFirst(rows))
        } else if (businessClientId) {
          const rows = await coachFloorBackend.listFloorSessions({
            businessClientId,
            limit: 20,
          })
          if (active) {
            setHistory(
              sortRecentFirst(
                rows
                  .filter((row) => row.status === 'completed')
                  .map(floorHistoryFromRecord),
              ),
            )
          }
        }
      } catch {
        if (active) setHistory([])
      }

      if (active) setLoaded(true)
    }

    void load()
    return () => {
      active = false
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [session?.id, athleteId, businessClientId])

  useEffect(() => {
    if (!loaded || !session?.id) return

    const draft = {
      workout,
      startedAt,
      privateNote,
      athleteRecap,
      savedAt: new Date().toISOString(),
    }
    saveLocalFloorDraft(session.id, draft)

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    setCloudState('saving')
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await coachFloorBackend.saveDraft({
          scheduledSessionId: session.id,
          workout,
          startedAt,
          privateCoachNote: privateNote,
          athleteRecap,
        })
        setCloudState('saved')
      } catch {
        setCloudState('local')
      }
    }, 1100)

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [loaded, session?.id, workout, startedAt, privateNote, athleteRecap])

  const previousByExercise = useMemo(
    () => previousPerformanceByExercise(history),
    [history],
  )
  const previousSession = history[0] ?? null
  const currentExercise = workout.exercises?.[currentExerciseIndex] ?? null

  const updateExercise = (exerciseIndex, updater) => {
    setWorkout((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? typeof updater === 'function'
            ? updater(exercise)
            : { ...exercise, ...updater }
          : exercise,
      ),
    }))
  }

  const updateSet = (exerciseIndex, setIndex, patch) => {
    updateExercise(exerciseIndex, (exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set, index) =>
        index === setIndex ? { ...set, ...patch } : set,
      ),
    }))
  }

  const addSet = (exerciseIndex) => {
    updateExercise(exerciseIndex, (exercise) => ({
      ...exercise,
      sets: [...exercise.sets, makeFloorSet()],
    }))
  }

  const removeSet = (exerciseIndex, setIndex) => {
    updateExercise(exerciseIndex, (exercise) => ({
      ...exercise,
      sets: exercise.sets.filter((_, index) => index !== setIndex),
    }))
  }

  const openExerciseLibrary = (index = null) => {
    setReplaceExerciseIndex(index)
    setExerciseQuery('')
    setLibraryOpen(true)
  }

  const chooseExercise = (exercise) => {
    const next = makeFloorExercise(exercise)
    setWorkout((current) => {
      if (replaceExerciseIndex == null) {
        return {
          ...current,
          exercises: [...current.exercises, next],
        }
      }

      return {
        ...current,
        exercises: current.exercises.map((item, index) =>
          index === replaceExerciseIndex
            ? {
                ...next,
                sets: item.sets?.length ? item.sets : next.sets,
              }
            : item,
        ),
      }
    })
    if (replaceExerciseIndex == null) {
      setCurrentExerciseIndex(workout.exercises.length)
    }
    setLibraryOpen(false)
    setReplaceExerciseIndex(null)
  }

  const removeExercise = (index) => {
    setWorkout((current) => ({
      ...current,
      exercises: current.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
    }))
    setCurrentExerciseIndex((current) =>
      Math.max(0, Math.min(current, Math.max(0, workout.exercises.length - 2))),
    )
  }

  const useLastWorkout = () => {
    const last = buildFloorWorkoutFromHistory(previousSession)
    if (!last) return
    setWorkout(last)
    setCurrentExerciseIndex(0)
  }

  const runBrief = async () => {
    setBriefLoading(true)
    try {
      const result = await requestCoachFloorAssist({
        scheduledSessionId: session.id,
        mode: COACH_FLOOR_AI_MODE.PRE_SESSION,
        workout: flattenFloorWorkout(workout),
        coachNote: session.coachNote ?? '',
        previousSession,
        clientName,
      })
      setBrief(result)
    } catch (error) {
      appUi.toast(error.message ?? 'AVA brief unavailable.', 'error')
    } finally {
      setBriefLoading(false)
    }
  }

  const organizeNote = async () => {
    if (!privateNote.trim()) return
    setNoteAssistLoading(true)
    try {
      const result = await requestCoachFloorAssist({
        scheduledSessionId: session.id,
        mode: COACH_FLOOR_AI_MODE.ORGANIZE_NOTE,
        workout: flattenFloorWorkout(workout),
        coachNote: privateNote,
        previousSession,
        clientName,
      })
      setNoteAssist(result)
    } catch (error) {
      appUi.toast(error.message ?? 'AVA could not organize that note.', 'error')
    } finally {
      setNoteAssistLoading(false)
    }
  }

  const prepareCompletion = async () => {
    const flat = flattenFloorWorkout(workout)
    if (!flat.sets.length) {
      appUi.toast('Log at least one set before completing the workout.', 'error')
      return
    }

    setReviewMode(true)
    if (athleteRecap.trim()) return

    setRecapLoading(true)
    try {
      const result = await requestCoachFloorAssist({
        scheduledSessionId: session.id,
        mode: COACH_FLOOR_AI_MODE.RECAP,
        workout: flat,
        coachNote: privateNote,
        previousSession,
        clientName,
      })
      setAthleteRecap(result.recap ?? fallbackRecap(workout, clientName))
    } catch {
      setAthleteRecap(fallbackRecap(workout, clientName))
    } finally {
      setRecapLoading(false)
    }
  }

  const completeSession = async ({ sendRecap = false } = {}) => {
    if (completing) return
    setCompleting(true)

    try {
      const result = await coachFloorBackend.complete({
        scheduledSessionId: session.id,
        workout,
        startedAt,
        privateCoachNote: privateNote,
        athleteRecap,
      })

      if (sendRecap && athleteId && athleteRecap.trim()) {
        try {
          const conversation =
            await coachMessagingBackend.getOrCreateConversation(athleteId)
          await coachMessagingBackend.sendMessage(
            conversation.id,
            `Session recap — ${workout.name}\n\n${athleteRecap.trim()}`,
          )
        } catch {
          appUi.toast(
            'Workout saved, but the recap message could not be sent.',
            'info',
          )
        }
      }

      await onCompleteAppointment?.(session)
      clearLocalFloorDraft(session.id)

      appUi.toast(
        result?.athleteHistoryWritten
          ? 'Session saved to the athlete’s AVAREN history.'
          : 'Session saved to the client’s coaching record.',
        'success',
      )
      onClose?.()
    } catch (error) {
      appUi.toast(error.message ?? 'Could not complete the coached session.', 'error')
    } finally {
      setCompleting(false)
    }
  }

  const filteredExercises = useMemo(() => {
    const query = exerciseQuery.trim().toLowerCase()
    return COMMON_EXERCISES.filter((exercise) =>
      !query
        ? true
        : `${exercise.name} ${exercise.muscle ?? ''} ${exercise.equipment ?? ''}`
            .toLowerCase()
            .includes(query),
    ).slice(0, 80)
  }, [exerciseQuery])

  if (!session) return null

  if (reviewMode) {
    const flat = flattenFloorWorkout(workout)
    return (
      <section className="coach-floor-overlay" data-testid="coach-floor-review">
        <div className="coach-floor-shell coach-floor-review-shell">
          <header className="coach-floor-topbar">
            <button
              type="button"
              className="coach-floor-icon-button"
              onClick={() => setReviewMode(false)}
            >
              <ArrowLeft {...ICON} />
              <span>Back</span>
            </button>
            <div>
              <span className="eyebrow">REVIEW SESSION</span>
              <strong>{clientName}</strong>
            </div>
            <span className="coach-floor-save-state">Ready</span>
          </header>

          <main className="coach-floor-review-main">
            <section className="coach-floor-review-hero">
              <span className="eyebrow">WORKOUT COMPLETE</span>
              <h1>{workout.name}</h1>
              <p>
                {flat.exercisesPerformed.length} exercises · {flat.sets.length} sets
              </p>
            </section>

            <section className="coach-floor-note-card">
              <div className="coach-floor-section-heading">
                <div>
                  <span className="eyebrow">ATHLETE RECAP</span>
                  <strong>What the client will see</strong>
                </div>
                <Sparkles {...ICON} />
              </div>
              {recapLoading ? (
                <p className="coach-floor-ai-loading">AVA is drafting the recap…</p>
              ) : (
                <textarea
                  value={athleteRecap}
                  onChange={(event) => setAthleteRecap(event.target.value)}
                  rows={6}
                  maxLength={1600}
                  placeholder="Write or use Apple Pencil to edit the athlete-facing recap."
                />
              )}
              <small>
                Private coach notes are never included unless you choose to put that
                information in this recap.
              </small>
            </section>

            <section className="coach-floor-completion-effects">
              <article>
                <Check {...ICON} />
                <div>
                  <strong>Workout history</strong>
                  <span>
                    {athleteId
                      ? 'Saved to the athlete’s AVAREN account'
                      : 'Saved to the coach business record'}
                  </span>
                </div>
              </article>
              <article>
                <Check {...ICON} />
                <div>
                  <strong>Attendance + pass</strong>
                  <span>
                    {passSummary?.totalBalance > 0
                      ? 'Complete appointment and apply the eligible pass'
                      : 'Complete appointment; no active pass required'}
                  </span>
                </div>
              </article>
            </section>

            <div className="coach-floor-complete-actions">
              <button
                type="button"
                className="coach-secondary-button"
                disabled={completing || recapLoading}
                onClick={() => void completeSession({ sendRecap: false })}
              >
                Save only
              </button>
              {athleteId ? (
                <button
                  type="button"
                  className="gold-button machined"
                  disabled={completing || recapLoading}
                  onClick={() => void completeSession({ sendRecap: true })}
                >
                  <MessageCircle {...ICON} />
                  {completing ? 'Completing…' : 'Save + send recap'}
                </button>
              ) : (
                <button
                  type="button"
                  className="gold-button machined"
                  disabled={completing || recapLoading}
                  onClick={() => void completeSession({ sendRecap: false })}
                >
                  {completing ? 'Completing…' : 'Complete session'}
                </button>
              )}
            </div>
          </main>
        </div>
      </section>
    )
  }

  return (
    <section className="coach-floor-overlay" data-testid="coach-floor-mode">
      <div className="coach-floor-shell">
        <header className="coach-floor-topbar">
          <button
            type="button"
            className="coach-floor-icon-button"
            onClick={onClose}
            aria-label="Exit floor mode"
          >
            <X {...ICON} />
          </button>
          <div>
            <span className="eyebrow">COACH FLOOR MODE</span>
            <strong>{clientName}</strong>
          </div>
          <span className="coach-floor-save-state" data-state={cloudState}>
            {cloudState === 'saving'
              ? 'Saving…'
              : cloudState === 'local'
                ? 'Saved on iPad'
                : 'Saved'}
          </span>
        </header>

        <div className="coach-floor-status-strip">
          <span>{workout.name}</span>
          <span>
            {passSummary?.totalBalance > 0
              ? `${passSummary.totalBalance} passes left`
              : 'No active pass'}
          </span>
          <span className="coach-floor-pencil-status">
            <PencilLine size={15} />
            Apple Pencil ready
          </span>
        </div>

        <main className="coach-floor-main">
          <aside className="coach-floor-rail">
            <div className="coach-floor-rail-heading">
              <span className="eyebrow">SESSION</span>
              <button
                type="button"
                className="coach-floor-small-action"
                onClick={() => openExerciseLibrary()}
              >
                <Plus size={16} /> Exercise
              </button>
            </div>

            <label className="coach-floor-workout-name">
              <span>Workout name</span>
              <input
                value={workout.name}
                onChange={(event) =>
                  setWorkout((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <div className="coach-floor-exercise-list">
              {(workout.exercises ?? []).map((exercise, index) => (
                <button
                  key={exercise.id}
                  type="button"
                  className={index === currentExerciseIndex ? 'active' : ''}
                  onClick={() => setCurrentExerciseIndex(index)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{exercise.name}</strong>
                    <small>
                      {exercise.sets.filter(
                        (set) => set.completed || set.weight || set.reps,
                      ).length}
                      /{exercise.sets.length} logged
                    </small>
                  </div>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>

            {!workout.exercises?.length ? (
              <div className="coach-floor-empty-plan">
                <Dumbbell size={24} />
                <strong>No workout loaded</strong>
                <span>Add an exercise or reuse the client’s last workout.</span>
                {previousSession ? (
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={useLastWorkout}
                  >
                    Use last workout
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              className="coach-floor-ava-brief"
              onClick={() => void runBrief()}
              disabled={briefLoading}
            >
              <Sparkles size={17} />
              {briefLoading ? 'AVA is reviewing…' : 'AVA pre-session brief'}
            </button>

            {brief ? (
              <section className="coach-floor-brief-card">
                <span className="eyebrow">AVA BRIEF</span>
                <p>{brief.brief}</p>
                {brief.watchFor?.length ? (
                  <ul>
                    {brief.watchFor.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {brief.openingCue ? <strong>{brief.openingCue}</strong> : null}
              </section>
            ) : null}
          </aside>

          <section className="coach-floor-workspace">
            {currentExercise ? (
              <>
                <header className="coach-floor-exercise-header">
                  <div>
                    <span className="eyebrow">
                      EXERCISE {currentExerciseIndex + 1} OF {workout.exercises.length}
                    </span>
                    <h1>{currentExercise.name}</h1>
                    <p>
                      {currentExercise.muscle ?? 'Training'}
                      {currentExercise.targetReps
                        ? ` · target ${currentExercise.targetReps} reps`
                        : ''}
                    </p>
                  </div>
                  <div className="coach-floor-exercise-actions">
                    <button
                      type="button"
                      className="coach-secondary-button"
                      onClick={() => openExerciseLibrary(currentExerciseIndex)}
                    >
                      Swap
                    </button>
                    <button
                      type="button"
                      className="coach-floor-icon-button coach-floor-danger"
                      onClick={() => removeExercise(currentExerciseIndex)}
                      aria-label="Remove exercise"
                    >
                      <Trash2 {...ICON} />
                    </button>
                  </div>
                </header>

                <div className="coach-floor-set-list">
                  {currentExercise.sets.map((set, setIndex) => {
                    const prior =
                      previousByExercise.get(
                        currentExercise.name.toLowerCase(),
                      )?.[setIndex] ?? null

                    return (
                      <article
                        key={set.id}
                        className={`coach-floor-set-row${set.completed ? ' complete' : ''}`}
                      >
                        <div className="coach-floor-set-number">
                          <span>SET</span>
                          <strong>{setIndex + 1}</strong>
                        </div>

                        <div className="coach-floor-previous">
                          <span>LAST</span>
                          <strong>{formatPreviousSet(prior)}</strong>
                          {prior ? (
                            <button
                              type="button"
                              onClick={() =>
                                updateSet(currentExerciseIndex, setIndex, {
                                  weight: prior.weight ? String(prior.weight) : '',
                                  reps: prior.reps ? String(prior.reps) : '',
                                })
                              }
                            >
                              Use
                            </button>
                          ) : null}
                        </div>

                        <label className="coach-floor-number-field">
                          <span>WEIGHT</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={set.weight}
                            onChange={(event) =>
                              updateSet(currentExerciseIndex, setIndex, {
                                weight: cleanNumeric(event.target.value),
                              })
                            }
                            placeholder="0"
                            aria-label={`Set ${setIndex + 1} weight`}
                          />
                          <small>lb</small>
                        </label>

                        <label className="coach-floor-number-field">
                          <span>REPS</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            enterKeyHint="done"
                            value={set.reps}
                            onChange={(event) =>
                              updateSet(currentExerciseIndex, setIndex, {
                                reps: cleanNumeric(event.target.value),
                              })
                            }
                            placeholder="0"
                            aria-label={`Set ${setIndex + 1} reps`}
                          />
                        </label>

                        <div className="coach-floor-set-quick">
                          <button
                            type="button"
                            onClick={() =>
                              updateSet(currentExerciseIndex, setIndex, {
                                weight: String(Number(set.weight || prior?.weight || 0) + 5),
                              })
                            }
                          >
                            +5
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSet(currentExerciseIndex, setIndex, {
                                weight: String(Number(set.weight || prior?.weight || 0) + 10),
                              })
                            }
                          >
                            +10
                          </button>
                        </div>

                        <button
                          type="button"
                          className="coach-floor-set-done"
                          aria-label={set.completed ? 'Mark set incomplete' : 'Complete set'}
                          onClick={() =>
                            updateSet(currentExerciseIndex, setIndex, {
                              completed: !set.completed,
                            })
                          }
                        >
                          <Check size={20} />
                        </button>

                        {currentExercise.sets.length > 1 ? (
                          <button
                            type="button"
                            className="coach-floor-set-remove"
                            aria-label="Remove set"
                            onClick={() =>
                              removeSet(currentExerciseIndex, setIndex)
                            }
                          >
                            <Minus size={16} />
                          </button>
                        ) : null}
                      </article>
                    )
                  })}
                </div>

                <button
                  type="button"
                  className="coach-floor-add-set"
                  onClick={() => addSet(currentExerciseIndex)}
                >
                  <Plus size={17} />
                  Add set
                </button>

                <div className="coach-floor-pager">
                  <button
                    type="button"
                    className="coach-secondary-button"
                    disabled={currentExerciseIndex === 0}
                    onClick={() =>
                      setCurrentExerciseIndex((current) => Math.max(0, current - 1))
                    }
                  >
                    <ArrowLeft {...ICON} />
                    Previous
                  </button>
                  <button
                    type="button"
                    className="gold-button machined"
                    disabled={currentExerciseIndex >= workout.exercises.length - 1}
                    onClick={() =>
                      setCurrentExerciseIndex((current) =>
                        Math.min(workout.exercises.length - 1, current + 1),
                      )
                    }
                  >
                    Next exercise
                    <ArrowRight {...ICON} />
                  </button>
                </div>
              </>
            ) : (
              <section className="coach-floor-workspace-empty">
                <Dumbbell size={34} />
                <h1>Build today’s session.</h1>
                <p>
                  Add an exercise, load the linked assignment, or reuse the most
                  recent workout.
                </p>
                <div>
                  <button
                    type="button"
                    className="gold-button machined"
                    onClick={() => openExerciseLibrary()}
                  >
                    <Plus {...ICON} />
                    Add exercise
                  </button>
                  {previousSession ? (
                    <button
                      type="button"
                      className="coach-secondary-button"
                      onClick={useLastWorkout}
                    >
                      Use last workout
                    </button>
                  ) : null}
                </div>
              </section>
            )}

            <section className="coach-floor-note-card">
              <div className="coach-floor-section-heading">
                <div>
                  <span className="eyebrow">QUICK COACH NOTE</span>
                  <strong>Write naturally while you coach.</strong>
                </div>
                <ClipboardPenLine {...ICON} />
              </div>
              <textarea
                value={privateNote}
                onChange={(event) => {
                  setPrivateNote(event.target.value)
                  setNoteAssist(null)
                }}
                rows={4}
                maxLength={4000}
                placeholder="Write with Apple Pencil… e.g. knee felt better, 225 moved easy, skipped lunges, tired near the end"
              />
              <div className="coach-floor-note-footer">
                <span>
                  <PencilLine size={14} />
                  iPad Scribble converts handwriting into text here.
                </span>
                <button
                  type="button"
                  onClick={() => void organizeNote()}
                  disabled={!privateNote.trim() || noteAssistLoading}
                >
                  <Sparkles size={15} />
                  {noteAssistLoading ? 'Reading note…' : 'Organize with AVA'}
                </button>
              </div>

              {noteAssist ? (
                <div className="coach-floor-note-assist">
                  <div>
                    <span className="eyebrow">AVA READ</span>
                    <p>{noteAssist.cleanedNote}</p>
                  </div>
                  <button
                    type="button"
                    className="coach-secondary-button"
                    onClick={() => {
                      setPrivateNote(noteAssist.cleanedNote)
                      setNoteAssist(null)
                    }}
                  >
                    Use cleaned note
                  </button>
                </div>
              ) : null}
            </section>
          </section>
        </main>

        <footer className="coach-floor-footer">
          <div>
            <span>
              {flattenFloorWorkout(workout).sets.length} sets logged
            </span>
            <span>
              {cloudState === 'local'
                ? 'Cloud unavailable · draft is safe on this iPad'
                : 'Auto-saving session'}
            </span>
          </div>
          <button
            type="button"
            className="gold-button machined"
            onClick={() => void prepareCompletion()}
          >
            Review & complete
            <ChevronDown {...ICON} />
          </button>
        </footer>

        {libraryOpen ? (
          <div className="coach-floor-library-backdrop">
            <section className="coach-floor-library" role="dialog" aria-modal="true">
              <header>
                <div>
                  <span className="eyebrow">
                    {replaceExerciseIndex == null ? 'ADD EXERCISE' : 'SWAP EXERCISE'}
                  </span>
                  <h2>Exercise library</h2>
                </div>
                <button
                  type="button"
                  className="coach-floor-icon-button"
                  onClick={() => {
                    setLibraryOpen(false)
                    setReplaceExerciseIndex(null)
                  }}
                >
                  <X {...ICON} />
                </button>
              </header>

              <label className="coach-floor-library-search">
                <Search size={18} />
                <input
                  autoFocus
                  value={exerciseQuery}
                  onChange={(event) => setExerciseQuery(event.target.value)}
                  placeholder="Search exercises"
                />
              </label>

              <button
                type="button"
                className="coach-floor-custom-exercise"
                onClick={() =>
                  chooseExercise(
                    makeFloorExercise({
                      name: exerciseQuery.trim() || 'Custom Exercise',
                      muscle: 'Other',
                    }),
                  )
                }
              >
                <Plus size={17} />
                Add custom exercise
              </button>

              <div className="coach-floor-library-list">
                {filteredExercises.map((exercise) => (
                  <button
                    type="button"
                    key={`${exercise.name}-${exercise.muscle}`}
                    onClick={() => chooseExercise(exercise)}
                  >
                    <div>
                      <strong>{exercise.name}</strong>
                      <span>
                        {exercise.muscle}
                        {exercise.equipment ? ` · ${exercise.equipment}` : ''}
                      </span>
                    </div>
                    <Plus size={17} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  )
}

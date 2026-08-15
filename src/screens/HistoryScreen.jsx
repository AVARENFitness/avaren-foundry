import {
  Activity,
  ArrowLeft,
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  Dumbbell,
  Flame,
  Hammer,
  Save,
  Search,
  Sunrise,
  Target,
  Trash2,
  Trophy,
  Wind,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  filterJourneyEvents,
  JOURNEY_EVENT_TYPES,
  journeySnapshot,
} from '../lib/journey'
import { appUi } from '../lib/appUi'
import {
  formatLegacyCompletedSetDisplay,
} from '../lib/exerciseLoad'
import {
  recentPRs,
  sessionVolume,
} from '../lib/metrics'
import { resolveSessionVolumeDisplay } from '../lib/sessionVolumeDisplay'

const FILTERS = [
  ['all', 'All'],
  [JOURNEY_EVENT_TYPES.WORKOUT, 'Workouts'],
  [JOURNEY_EVENT_TYPES.PR, 'PRs'],
  [JOURNEY_EVENT_TYPES.DAILY_RESET, 'Daily Reset'],
  [JOURNEY_EVENT_TYPES.RECOVERY_FLOW, 'Recovery'],
  [JOURNEY_EVENT_TYPES.STREAK, 'Streaks'],
  [JOURNEY_EVENT_TYPES.MILESTONE, 'Milestones'],
  [JOURNEY_EVENT_TYPES.FORGE, 'The Forge'],
]

const EVENT_META = {
  [JOURNEY_EVENT_TYPES.WORKOUT]: {
    icon: Dumbbell,
    label: 'Workout',
    className: 'workout',
  },
  [JOURNEY_EVENT_TYPES.PR]: {
    icon: Award,
    label: 'Personal Record',
    className: 'pr',
  },
  [JOURNEY_EVENT_TYPES.DAILY_RESET]: {
    icon: Sunrise,
    label: 'Daily Reset',
    className: 'reset',
  },
  [JOURNEY_EVENT_TYPES.RECOVERY_FLOW]: {
    icon: Wind,
    label: 'Recovery Flow',
    className: 'recovery',
  },
  [JOURNEY_EVENT_TYPES.STREAK]: {
    icon: Flame,
    label: 'Streak',
    className: 'streak',
  },
  [JOURNEY_EVENT_TYPES.MILESTONE]: {
    icon: Target,
    label: 'Milestone',
    className: 'milestone',
  },
  [JOURNEY_EVENT_TYPES.FORGE]: {
    icon: Hammer,
    label: 'Forged Achievement',
    className: 'forge',
  },
}

const formatDate = (value) =>
  new Date(value).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const formatDuration = (session) => {
  if (!session?.startedAt || !session?.finishedAt) return '—'
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(session.finishedAt) - new Date(session.startedAt)) / 1000,
    ),
  )
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)} min`
}

const compactNumber = (value) => {
  const number = Number(value || 0)
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`
  return Math.round(number).toLocaleString()
}

const workoutSetGroups = (session) =>
  (session?.sets ?? []).reduce((groups, set) => {
    groups[set.exercise] ??= []
    groups[set.exercise].push(set)
    return groups
  }, {})

function SessionDetail({ session, history, onClose, onDelete, onUpdate }) {
  const [reflection, setReflection] = useState(session.reflection ?? '')
  const [saved, setSaved] = useState(false)

  const groupedSets = useMemo(() => workoutSetGroups(session), [session])
  const muscles = useMemo(
    () => [...new Set((session.sets ?? []).map((set) => set.muscle).filter(Boolean))],
    [session],
  )
  const prs = useMemo(
    () => recentPRs(history, 1000).filter((pr) => String(pr.id).startsWith(`${session.id}-`)),
    [history, session.id],
  )
  const volumeDisplay = useMemo(
    () => resolveSessionVolumeDisplay(session),
    [session],
  )

  return (
    <section className="session-detail-screen">
      <header className="builder-header session-detail-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <button className="session-detail-close" onClick={onClose} aria-label="Close session detail">
          <X size={18} />
        </button>
      </header>

      <section className="session-detail-hero">
        <span className="eyebrow">COMPLETED SESSION</span>
        <h1>{session.name}</h1>
        <p>{formatDate(session.finishedAt ?? session.date)}</p>

        <div className="session-detail-stats">
          <article><Clock3 size={17} /><strong>{formatDuration(session)}</strong><span>Duration</span></article>
          <article><Dumbbell size={17} /><strong>{session.sets?.length ?? 0}</strong><span>Sets</span></article>
          {volumeDisplay.show ? (
            <article>
              <Target size={17} />
              <strong>{Math.round(volumeDisplay.value).toLocaleString()}</strong>
              <span>{volumeDisplay.label.toLowerCase()} (lb)</span>
            </article>
          ) : null}
          <article><Trophy size={17} /><strong>{prs.length}</strong><span>PRs</span></article>
        </div>
      </section>

      {(session.intent || session.notes) && (
        <section className="session-detail-card">
          <div className="session-detail-title"><BookOpen size={18} /><div><span className="eyebrow">SESSION CONTEXT</span><h2>What guided the work.</h2></div></div>
          {session.intent && <article className="session-note-block"><span>Intention</span><p>{session.intent}</p></article>}
          {session.notes && <article className="session-note-block"><span>Training notes</span><p>{session.notes}</p></article>}
        </section>
      )}

      {prs.length > 0 && (
        <section className="session-detail-card">
          <div className="session-detail-title"><Trophy size={18} /><div><span className="eyebrow">SESSION WINS</span><h2>Records earned here.</h2></div></div>
          <div className="session-pr-grid">
            {prs.map((pr) => <article key={pr.id}><strong>{pr.exercise}</strong><span>{pr.type}</span><small>{pr.value}</small></article>)}
          </div>
        </section>
      )}

      <section className="session-detail-card">
        <div className="session-detail-title"><Dumbbell size={18} /><div><span className="eyebrow">EXERCISES</span><h2>Every set logged.</h2></div></div>
        <div className="session-exercise-list">
          {Object.entries(groupedSets).map(([exercise, sets]) => (
            <article key={exercise}>
              <header><div><strong>{exercise}</strong><span>{sets[0]?.muscle ?? 'Training'}</span></div><small>{sets.length} {sets.length === 1 ? 'set' : 'sets'}</small></header>
              <div className="session-set-table">
                {sets.map((set, index) => (
                  <div key={`${exercise}-${index}`}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{formatLegacyCompletedSetDisplay(set)}</strong>
                    <small>{set.type || 'Working'}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="session-detail-card">
        <div className="session-detail-title"><BookOpen size={18} /><div><span className="eyebrow">REFLECTION</span><h2>Update what you remember.</h2></div></div>
        <textarea value={reflection} onChange={(event) => { setReflection(event.target.value); setSaved(false) }} rows={5} maxLength={600} placeholder="What felt strong? What should change next time?" />
        <button className="session-detail-save" onClick={() => { onUpdate(session.id, { reflection: reflection.trim() }); setSaved(true) }}>
          <Save size={16} /> {saved ? 'Reflection Saved' : 'Save Reflection'}
        </button>
      </section>

      {muscles.length > 0 && <div className="session-detail-muscles">{muscles.map((muscle) => <span key={muscle}>{muscle}</span>)}</div>}

      <button className="session-detail-delete" onClick={async () => {
        if (await appUi.confirm({
          message: 'Delete this completed workout? This cannot be undone.',
          tone: 'danger',
          confirmLabel: 'Delete',
        })) {
          onDelete(session.id)
          onClose()
        }
      }}><Trash2 size={17} /> Delete Workout</button>
    </section>
  )
}

function JourneyEventCard({ event, onOpen }) {
  const meta = EVENT_META[event.type] ?? EVENT_META[JOURNEY_EVENT_TYPES.WORKOUT]
  const Icon = meta.icon
  const isWorkout = event.type === JOURNEY_EVENT_TYPES.WORKOUT

  return (
    <article className={`journey-event ${meta.className}`}>
      <button className="journey-event-head" onClick={() => isWorkout && onOpen(event.source)}>
        <div className="journey-event-icon"><Icon size={18} /></div>
        <div className="journey-event-copy">
          <div><span>{meta.label}</span><small>{formatDate(event.occurredAt)}</small></div>
          <h3>{event.title}</h3>
          <p>{event.subtitle}</p>
          {isWorkout && (
            <div className="journey-inline-stats">
              <span>{event.summary.setCount} sets</span>
              <span>{Math.round(event.summary.volume).toLocaleString()} lb</span>
              {event.summary.durationMinutes > 0 && <span>{event.summary.durationMinutes} min</span>}
            </div>
          )}
          {event.type === JOURNEY_EVENT_TYPES.PR && <div className="journey-inline-stats"><span>{event.summary.weight} × {event.summary.reps}</span><span>e1RM {Math.round(event.summary.estimatedOneRepMax)} lb</span></div>}
          {event.type === JOURNEY_EVENT_TYPES.STREAK && <div className="journey-inline-stats"><span>{event.summary.days} consecutive days</span></div>}
          {event.type === JOURNEY_EVENT_TYPES.FORGE && <div className="journey-inline-stats"><span>{event.summary.category}</span><span>{event.summary.rarity}</span></div>}
        </div>
        {isWorkout && <ChevronRight size={18} />}
      </button>
    </article>
  )
}

export default function HistoryScreen({ state, onClose, onDelete, onUpdateSession }) {
  const [selectedSession, setSelectedSession] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const snapshot = useMemo(() => journeySnapshot(state), [state])
  const visibleEvents = useMemo(() => filterJourneyEvents(snapshot.events, { types: filter === 'all' ? [] : [filter], search }), [snapshot.events, filter, search])
  const visibleMonths = useMemo(() => {
    const visibleIds = new Set(visibleEvents.map((event) => event.id))
    return snapshot.months.map((month) => ({ ...month, events: month.events.filter((event) => visibleIds.has(event.id)) })).filter((month) => month.events.length)
  }, [snapshot.months, visibleEvents])

  if (selectedSession) {
    const current = state.history.find((session) => session.id === selectedSession.id) ?? selectedSession
    return <SessionDetail session={current} history={state.history} onClose={() => setSelectedSession(null)} onDelete={onDelete} onUpdate={onUpdateSession} />
  }

  return (
    <section className="journey-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}><ArrowLeft size={18} /> Back</button>
        <div><span className="eyebrow">YOUR STORY</span><h1>The Journey</h1></div>
      </header>

      <section className="journey-hero">
        <div><span className="eyebrow">BUILT OVER TIME</span><h2>Look how far you’ve come.</h2><p>Workouts, records, consistency, recovery, and movement—kept in one place.</p></div>
        <div className="journey-hero-grid">
          <article><Dumbbell /><span>Workouts</span><strong>{snapshot.totals.workouts}</strong></article>
          <article><Award /><span>PRs</span><strong>{snapshot.totals.prs}</strong></article>
          <article><Flame /><span>Current Streak</span><strong>{snapshot.currentStreak}</strong></article>
          <article><Activity /><span>Mobility</span><strong>{snapshot.totals.dailyResets + snapshot.totals.recoveryFlows}</strong></article>
        </div>
      </section>

      <section className="journey-controls">
        <label className="journey-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workouts, muscles, exercises…" /></label>
        <div className="journey-filters">{FILTERS.map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
      </section>

      {!visibleMonths.length && <section className="empty-state"><h2>No Journey events found.</h2><p>Try another filter or complete your first workout.</p></section>}

      <div className="journey-months">
        {visibleMonths.map((month) => (
          <section className="journey-month" key={month.key}>
            <header className="journey-month-header"><div><span className="eyebrow">MONTH</span><h2>{month.label}</h2></div><div className="journey-month-summary"><span>{month.workoutCount} workouts</span><span>{month.prCount} PRs</span><span>{compactNumber(month.volume)} lb</span></div></header>
            <div className="journey-timeline">{month.events.map((event) => <JourneyEventCard key={event.id} event={event} onOpen={setSelectedSession} />)}</div>
          </section>
        ))}
      </div>
    </section>
  )
}

import {
  Activity,
  ArrowLeft,
  Award,
  ChevronDown,
  Dumbbell,
  Flame,
  Hammer,
  Search,
  Sunrise,
  Target,
  Trash2,
  Wind,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  filterJourneyEvents,
  JOURNEY_EVENT_TYPES,
  journeySnapshot,
} from '../lib/journey'

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
  })

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

function JourneyEventCard({ event, open, onToggle, onDelete }) {
  const meta = EVENT_META[event.type] ?? EVENT_META[JOURNEY_EVENT_TYPES.WORKOUT]
  const Icon = meta.icon
  const isWorkout = event.type === JOURNEY_EVENT_TYPES.WORKOUT
  const groupedSets = isWorkout ? workoutSetGroups(event.source) : {}

  return (
    <article className={`journey-event ${meta.className}`}>
      <button
        className="journey-event-head"
        onClick={() => isWorkout && onToggle()}
      >
        <div className="journey-event-icon">
          <Icon size={18} />
        </div>

        <div className="journey-event-copy">
          <div>
            <span>{meta.label}</span>
            <small>{formatDate(event.occurredAt)}</small>
          </div>
          <h3>{event.title}</h3>
          <p>{event.subtitle}</p>

          {isWorkout && (
            <div className="journey-inline-stats">
              <span>{event.summary.setCount} sets</span>
              <span>{Math.round(event.summary.volume).toLocaleString()} lb</span>
              {event.summary.durationMinutes > 0 && (
                <span>{event.summary.durationMinutes} min</span>
              )}
            </div>
          )}

          {event.type === JOURNEY_EVENT_TYPES.PR && (
            <div className="journey-inline-stats">
              <span>{event.summary.weight} × {event.summary.reps}</span>
              <span>
                e1RM {Math.round(event.summary.estimatedOneRepMax)} lb
              </span>
            </div>
          )}

          {event.type === JOURNEY_EVENT_TYPES.STREAK && (
            <div className="journey-inline-stats">
              <span>{event.summary.days} consecutive days</span>
            </div>
          )}

          {event.type === JOURNEY_EVENT_TYPES.FORGE && (
            <div className="journey-inline-stats">
              <span>{event.summary.category}</span>
              <span>{event.summary.rarity}</span>
            </div>
          )}
        </div>

        {isWorkout && (
          <ChevronDown className={open ? 'open' : ''} />
        )}
      </button>

      {isWorkout && open && (
        <div className="journey-workout-body">
          {Object.entries(groupedSets).map(([exercise, sets]) => (
            <section key={exercise}>
              <strong>{exercise}</strong>
              <div>
                {sets.map((set, index) => (
                  <span key={`${exercise}-${index}`}>
                    {set.weight} × {set.reps}
                    <small>{set.type}</small>
                  </span>
                ))}
              </div>
            </section>
          ))}

          <button
            className="history-delete"
            onClick={() => {
              if (confirm('Delete this completed workout?')) {
                onDelete(event.summary.workoutId)
              }
            }}
          >
            <Trash2 size={16} /> Delete workout
          </button>
        </div>
      )}
    </article>
  )
}

export default function HistoryScreen({
  state,
  onClose,
  onDelete,
}) {
  const [openId, setOpenId] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const snapshot = useMemo(() => journeySnapshot(state), [state])

  const visibleEvents = useMemo(
    () =>
      filterJourneyEvents(snapshot.events, {
        types: filter === 'all' ? [] : [filter],
        search,
      }),
    [snapshot.events, filter, search],
  )

  const visibleMonths = useMemo(() => {
    const visibleIds = new Set(visibleEvents.map((event) => event.id))

    return snapshot.months
      .map((month) => ({
        ...month,
        events: month.events.filter((event) => visibleIds.has(event.id)),
      }))
      .filter((month) => month.events.length)
  }, [snapshot.months, visibleEvents])

  return (
    <section className="journey-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">YOUR STORY</span>
          <h1>The Journey</h1>
        </div>
      </header>

      <section className="journey-hero">
        <div>
          <span className="eyebrow">BUILT OVER TIME</span>
          <h2>Look how far you’ve come.</h2>
          <p>
            Workouts, records, consistency, recovery, and movement—kept in one place.
          </p>
        </div>

        <div className="journey-hero-grid">
          <article>
            <Dumbbell />
            <span>Workouts</span>
            <strong>{snapshot.totals.workouts}</strong>
          </article>
          <article>
            <Award />
            <span>PRs</span>
            <strong>{snapshot.totals.prs}</strong>
          </article>
          <article>
            <Flame />
            <span>Current Streak</span>
            <strong>{snapshot.currentStreak}</strong>
          </article>
          <article>
            <Activity />
            <span>Mobility</span>
            <strong>
              {snapshot.totals.dailyResets + snapshot.totals.recoveryFlows}
            </strong>
          </article>
        </div>
      </section>

      <section className="journey-controls">
        <label className="journey-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workouts, muscles, exercises…"
          />
        </label>

        <div className="journey-filters">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {!visibleMonths.length && (
        <section className="empty-state">
          <h2>No Journey events found.</h2>
          <p>Try another filter or complete your first workout.</p>
        </section>
      )}

      <div className="journey-months">
        {visibleMonths.map((month) => (
          <section className="journey-month" key={month.key}>
            <header className="journey-month-header">
              <div>
                <span className="eyebrow">MONTH</span>
                <h2>{month.label}</h2>
              </div>
              <div className="journey-month-summary">
                <span>{month.workoutCount} workouts</span>
                <span>{month.prCount} PRs</span>
                <span>{compactNumber(month.volume)} lb</span>
              </div>
            </header>

            <div className="journey-timeline">
              {month.events.map((event) => (
                <JourneyEventCard
                  key={event.id}
                  event={event}
                  open={openId === event.id}
                  onToggle={() =>
                    setOpenId(openId === event.id ? null : event.id)
                  }
                  onDelete={onDelete}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

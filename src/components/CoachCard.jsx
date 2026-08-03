import {
  ArrowRight,
  BrainCircuit,
  Dumbbell,
  Flame,
  LineChart,
  Route,
  Sparkles,
  Sunrise,
  Wind,
} from 'lucide-react'
import { useEffect } from 'react'
import {
  COACH_ACTIONS,
  COACH_CATEGORIES,
} from '../lib/coach'

const CATEGORY_META = {
  [COACH_CATEGORIES.RECOVERY]: {
    label: 'Recovery',
    icon: Wind,
    className: 'recovery',
  },
  [COACH_CATEGORIES.CONSISTENCY]: {
    label: 'Consistency',
    icon: Flame,
    className: 'consistency',
  },
  [COACH_CATEGORIES.STRENGTH]: {
    label: 'Strength',
    icon: LineChart,
    className: 'strength',
  },
  [COACH_CATEGORIES.PROGRAMMING]: {
    label: 'Programming',
    icon: Route,
    className: 'programming',
  },
  [COACH_CATEGORIES.MILESTONE]: {
    label: 'Milestone',
    icon: Sparkles,
    className: 'milestone',
  },
  [COACH_CATEGORIES.MOMENTUM]: {
    label: 'Momentum',
    icon: Dumbbell,
    className: 'momentum',
  },
}

const ACTION_ICONS = {
  [COACH_ACTIONS.START_RESET]: Sunrise,
  [COACH_ACTIONS.START_RECOVERY]: Wind,
  [COACH_ACTIONS.START_WORKOUT]: Dumbbell,
  [COACH_ACTIONS.OPEN_PROGRESS]: LineChart,
  [COACH_ACTIONS.OPEN_JOURNEY]: Route,
}

export default function CoachCard({
  insight,
  onAction,
  onSeen,
}) {
  useEffect(() => {
    if (insight) onSeen?.(insight)
  }, [insight?.fingerprint])

  if (!insight) {
    return (
      <section className="coach-card coach-card-empty">
        <div className="coach-card-icon">
          <BrainCircuit size={21} />
        </div>
        <div>
          <span className="eyebrow">AVAREN COACH</span>
          <h2>Your coach is learning.</h2>
          <p>
            Complete more workouts and recovery flows to unlock personalized guidance.
          </p>
        </div>
      </section>
    )
  }

  const meta =
    CATEGORY_META[insight.category] ??
    CATEGORY_META[COACH_CATEGORIES.MOMENTUM]
  const Icon = meta.icon
  const ActionIcon =
    ACTION_ICONS[insight.action] ?? ArrowRight

  return (
    <section className={`coach-card ${meta.className}`}>
      <header className="coach-card-header">
        <div className="coach-card-icon">
          <Icon size={21} />
        </div>
        <div>
          <span className="eyebrow">AVAREN COACH</span>
          <small>{meta.label}</small>
        </div>
        <div className="coach-priority">
          {Math.round(insight.priority)}
        </div>
      </header>

      <div className="coach-card-body">
        <h2>{insight.title}</h2>
        <p>{insight.description}</p>

        {insight.evidence?.length > 0 && (
          <div className="coach-evidence">
            {insight.evidence.slice(0, 3).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
      </div>

      {insight.action !== COACH_ACTIONS.NONE &&
        insight.actionLabel && (
          <button
            className="coach-action"
            onClick={() => onAction?.(insight.action)}
          >
            <ActionIcon size={16} />
            {insight.actionLabel}
            <ArrowRight size={16} />
          </button>
        )}
    </section>
  )
}

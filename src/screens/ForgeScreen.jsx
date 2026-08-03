import {
  ArrowLeft,
  Award,
  Check,
  ChevronRight,
  Dumbbell,
  Flame,
  Hammer,
  LockKeyhole,
  Sparkles,
  Target,
  Trophy,
  Wind,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  FORGE_CATEGORIES,
  FORGE_RARITIES,
} from '../data/forgeAchievements'
import { forgeSnapshot } from '../lib/forge'

const FILTERS = [
  ['all', 'All'],
  [FORGE_CATEGORIES.FOUNDATION, 'Foundation'],
  [FORGE_CATEGORIES.CONSISTENCY, 'Consistency'],
  [FORGE_CATEGORIES.STRENGTH, 'Strength'],
  [FORGE_CATEGORIES.RECOVERY, 'Recovery'],
  [FORGE_CATEGORIES.PROGRESS, 'Progress'],
  [FORGE_CATEGORIES.LEGENDARY, 'Legendary'],
]

const CATEGORY_META = {
  [FORGE_CATEGORIES.FOUNDATION]: {
    label: 'Foundation',
    icon: Hammer,
  },
  [FORGE_CATEGORIES.CONSISTENCY]: {
    label: 'Consistency',
    icon: Flame,
  },
  [FORGE_CATEGORIES.STRENGTH]: {
    label: 'Strength',
    icon: Dumbbell,
  },
  [FORGE_CATEGORIES.RECOVERY]: {
    label: 'Recovery',
    icon: Wind,
  },
  [FORGE_CATEGORIES.PROGRESS]: {
    label: 'Progress',
    icon: Target,
  },
  [FORGE_CATEGORIES.LEGENDARY]: {
    label: 'Legendary',
    icon: Sparkles,
  },
}

const RARITY_LABELS = {
  [FORGE_RARITIES.COMMON]: 'Common',
  [FORGE_RARITIES.RARE]: 'Rare',
  [FORGE_RARITIES.EPIC]: 'Epic',
  [FORGE_RARITIES.LEGENDARY]: 'Legendary',
}

const formatMetric = (achievement, value) => {
  if (achievement.unit === 'lb') {
    return `${Math.round(value).toLocaleString()} lb`
  }

  return `${Math.round(value).toLocaleString()} ${
    achievement.unit
  }`
}

function ForgeAchievementCard({ achievement, featured = false }) {
  const meta =
    CATEGORY_META[achievement.category] ??
    CATEGORY_META[FORGE_CATEGORIES.FOUNDATION]
  const Icon = achievement.unlocked ? Trophy : meta.icon

  return (
    <article
      className={`forge-achievement-card ${
        achievement.unlocked ? 'unlocked' : 'locked'
      } rarity-${achievement.rarity} ${
        featured ? 'featured' : ''
      }`}
    >
      <div className="forge-achievement-top">
        <div className="forge-achievement-icon">
          <Icon size={featured ? 23 : 20} />
        </div>

        <div className="forge-achievement-status">
          <span>{RARITY_LABELS[achievement.rarity]}</span>
          {achievement.unlocked ? (
            <strong><Check size={13} /> Forged</strong>
          ) : (
            <strong><LockKeyhole size={12} /> In progress</strong>
          )}
        </div>
      </div>

      <div className="forge-achievement-copy">
        <span>{meta.label}</span>
        <h3>{achievement.title}</h3>
        <p>{achievement.description}</p>
      </div>

      <div className="forge-progress-copy">
        <span>
          {formatMetric(achievement, achievement.current)}
        </span>
        <strong>
          {formatMetric(achievement, achievement.target)}
        </strong>
      </div>

      <div className="forge-progress-track">
        <div style={{ width: `${achievement.percent}%` }} />
      </div>

      <div className="forge-card-footer">
        <span>{achievement.percent}% forged</span>
        {!achievement.unlocked && (
          <strong>
            {formatMetric(
              achievement,
              achievement.remaining,
            )}{' '}
            remaining
          </strong>
        )}
        {achievement.unlocked && achievement.unlockedAt && (
          <strong>
            {new Date(
              achievement.unlockedAt,
            ).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </strong>
        )}
      </div>
    </article>
  )
}

export default function ForgeScreen({ state, onClose }) {
  const [filter, setFilter] = useState('all')
  const snapshot = useMemo(() => forgeSnapshot(state), [state])

  const visible = useMemo(
    () =>
      filter === 'all'
        ? snapshot.achievements
        : snapshot.achievements.filter(
            (achievement) =>
              achievement.category === filter,
          ),
    [snapshot.achievements, filter],
  )

  return (
    <section className="forge-screen">
      <header className="builder-header">
        <button className="builder-back" onClick={onClose}>
          <ArrowLeft size={18} /> Back
        </button>
        <div>
          <span className="eyebrow">ACHIEVEMENTS</span>
          <h1>The Forge</h1>
        </div>
      </header>

      <section className="forge-hero">
        <div className="forge-hero-mark">
          <Hammer size={29} />
        </div>

        <div>
          <span className="eyebrow">BUILT BY YOUR WORK</span>
          <h2>{snapshot.totals.completion}% forged.</h2>
          <p>
            Every achievement reflects real training,
            consistency, recovery, and progress.
          </p>
        </div>

        <div className="forge-hero-stats">
          <article>
            <Award />
            <span>Forged</span>
            <strong>{snapshot.totals.unlocked}</strong>
          </article>
          <article>
            <LockKeyhole />
            <span>Remaining</span>
            <strong>{snapshot.totals.locked}</strong>
          </article>
          <article>
            <Trophy />
            <span>Total</span>
            <strong>{snapshot.totals.available}</strong>
          </article>
        </div>

        <div className="forge-overall-track">
          <div
            style={{
              width: `${snapshot.totals.completion}%`,
            }}
          />
        </div>
      </section>

      {snapshot.closest.length > 0 && (
        <section className="forge-closest">
          <div className="panel-title">
            <span className="eyebrow">WITHIN REACH</span>
            <h2>Next to be forged.</h2>
          </div>

          <div className="forge-closest-grid">
            {snapshot.closest.map((achievement) => (
              <ForgeAchievementCard
                key={achievement.id}
                achievement={achievement}
                featured
              />
            ))}
          </div>
        </section>
      )}

      <section className="forge-catalog">
        <div className="forge-filter-row">
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

        <div className="forge-achievement-grid">
          {visible.map((achievement) => (
            <ForgeAchievementCard
              key={achievement.id}
              achievement={achievement}
            />
          ))}
        </div>
      </section>

      <button className="forge-journey-note" onClick={onClose}>
        <div>
          <span className="eyebrow">THE JOURNEY</span>
          <strong>
            Forged achievements will also become part of
            your training story.
          </strong>
        </div>
        <ChevronRight size={18} />
      </button>
    </section>
  )
}

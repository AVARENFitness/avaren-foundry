import {
  ArrowRight,
  Award,
  Check,
  Dumbbell,
  Flame,
  Hammer,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { useEffect } from 'react'
import { sessionVolume } from '../lib/metrics'
import { MILESTONE_TYPES } from '../lib/milestones'

const MILESTONE_META = {
  [MILESTONE_TYPES.FIRST_WORKOUT]: {
    icon: Sparkles,
    label: 'Journey Started',
    className: 'first',
  },
  [MILESTONE_TYPES.WORKOUT_COUNT]: {
    icon: Dumbbell,
    label: 'Workout Milestone',
    className: 'workouts',
  },
  [MILESTONE_TYPES.STREAK]: {
    icon: Flame,
    label: 'Consistency Milestone',
    className: 'streak',
  },
  [MILESTONE_TYPES.LIFETIME_VOLUME]: {
    icon: Target,
    label: 'Volume Milestone',
    className: 'volume',
  },
  [MILESTONE_TYPES.DAILY_RESET_COUNT]: {
    icon: Sparkles,
    label: 'Movement Milestone',
    className: 'reset',
  },
  [MILESTONE_TYPES.RECOVERY_FLOW_COUNT]: {
    icon: Award,
    label: 'Recovery Milestone',
    className: 'recovery',
  },
}

export default function CompletionScreen({
  session,
  nextWorkout,
  onDone,
  recentPrs = [],
  milestones = [],
  forgeAchievements = [],
}) {
  useEffect(() => {
    if (!session) return

    if (recentPrs.length || milestones.length || forgeAchievements.length) {
      if (navigator.vibrate) {
        navigator.vibrate([35, 55, 45, 70, 60])
      }
    }
  }, [session?.id])

  if (!session) return null

  const volume = sessionVolume(session)
  const bestSet = session.sets.reduce(
    (best, set) =>
      set.weight > (best?.weight ?? -1) ? set : best,
    null,
  )

  const muscles = [
    ...new Set(
      session.sets
        .map((set) => set.muscle)
        .filter(Boolean),
    ),
  ]

  const duration =
    session.startedAt && session.finishedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(session.finishedAt) -
              new Date(session.startedAt)) /
              60000,
          ),
        )
      : null

  return (
    <section className="completion-screen celebration-completion">
      <div className="completion-seal celebration-seal">
        <div className="completion-ring one" />
        <div className="completion-ring two" />
        <Check size={30} />
      </div>

      <span className="eyebrow">AVAREN · THE FOUNDRY</span>
      <h1>Forged.</h1>
      <p>{session.name} complete.</p>

      {(recentPrs.length > 0 || milestones.length > 0 || forgeAchievements.length > 0) && (
        <section className="celebration-reveal">
          <span className="eyebrow">TODAY’S VICTORIES</span>

          {recentPrs.slice(0, 3).map((pr, index) => (
            <article
              className="celebration-card pr"
              key={pr.id}
              style={{ '--celebration-index': index }}
            >
              <div className="celebration-card-icon">
                <Trophy size={23} />
              </div>

              <div className="celebration-card-copy">
                <span>New Personal Record</span>
                <h2>{pr.exercise}</h2>
                <strong>{pr.value}</strong>
                <small>{pr.type}</small>
              </div>
            </article>
          ))}

          {forgeAchievements.map((achievement, index) => (
            <article
              className={`celebration-card forge rarity-${achievement.rarity}`}
              key={achievement.id}
              style={{
                '--celebration-index':
                  recentPrs.length + forgeAchievements.length + index,
              }}
            >
              <div className="celebration-card-icon">
                <Hammer size={23} />
              </div>

              <div className="celebration-card-copy">
                <span>Achievement Forged · {achievement.rarity}</span>
                <h2>{achievement.title}</h2>
                <small>{achievement.description}</small>
              </div>
            </article>
          ))}

          {milestones.map((milestone, index) => {
            const meta =
              MILESTONE_META[milestone.type] ??
              MILESTONE_META[MILESTONE_TYPES.WORKOUT_COUNT]
            const Icon = meta.icon

            return (
              <article
                className={`celebration-card milestone ${meta.className}`}
                key={milestone.id}
                style={{
                  '--celebration-index':
                    recentPrs.length + index,
                }}
              >
                <div className="celebration-card-icon">
                  <Icon size={23} />
                </div>

                <div className="celebration-card-copy">
                  <span>{meta.label}</span>
                  <h2>{milestone.title}</h2>
                  <small>{milestone.subtitle}</small>
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section className="celebration-summary">
        <span className="eyebrow">SESSION SUMMARY</span>

        <div className="completion-metrics celebration-metrics">
          <div>
            <span>Sets</span>
            <strong>{session.sets.length}</strong>
          </div>
          <div>
            <span>Volume</span>
            <strong>{volume.toLocaleString()} lb</strong>
          </div>
          <div>
            <span>Duration</span>
            <strong>{duration ? `${duration} min` : '—'}</strong>
          </div>
          <div>
            <span>Muscles</span>
            <strong>{muscles.length || '—'}</strong>
          </div>
        </div>

        {bestSet && (
          <div className="completion-highlight">
            <Trophy size={19} />
            <div>
              <span>Strongest set</span>
              <strong>
                {bestSet.exercise} · {bestSet.weight} × {bestSet.reps}
              </strong>
            </div>
          </div>
        )}

        {muscles.length > 0 && (
          <div className="completion-muscles">
            {muscles.map((muscle) => (
              <span key={muscle}>{muscle}</span>
            ))}
          </div>
        )}
      </section>

      <div className="next-workout-card">
        <span>Next workout</span>
        <strong>{nextWorkout}</strong>
      </div>

      <button className="gold-button machined" onClick={onDone}>
        Done <ArrowRight size={18} />
      </button>
    </section>
  )
}

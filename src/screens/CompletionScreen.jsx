import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  Hammer,
  Layers3,
  Save,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MILESTONE_TYPES } from '../lib/milestones'
import { resolveSessionVolumeDisplay } from '../lib/sessionVolumeDisplay'

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

const formatDuration = (seconds) => {
  if (!seconds) return '—'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(
    (seconds % 3600) / 60,
  )

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${Math.max(1, minutes)} min`
}

const setVolume = (set) =>
  Number(set.weight || 0) *
  Number(set.reps || 0)

export default function CompletionScreen({
  session,
  nextWorkout,
  onDone,
  recentPrs = [],
  milestones = [],
  forgeAchievements = [],
  onSaveReflection,
  openCoachFollowUpCount = 0,
}) {
  const [reflection, setReflection] = useState(
    session?.reflection ?? '',
  )
  const [reflectionSaved, setReflectionSaved] =
    useState(false)

  useEffect(() => {
    if (!session) return

    if (
      recentPrs.length ||
      milestones.length ||
      forgeAchievements.length
    ) {
      navigator.vibrate?.([
        35,
        55,
        45,
        70,
        60,
      ])
    }
  }, [
    session?.id,
    recentPrs.length,
    milestones.length,
    forgeAchievements.length,
  ])

  const summary = useMemo(() => {
    if (!session) return null

    const sets = session.sets ?? []
    const volumeDisplay = resolveSessionVolumeDisplay(session)
    const volume = volumeDisplay.show ? volumeDisplay.value : 0
    const exerciseNames = [
      ...new Set(
        sets.map((set) => set.exercise),
      ),
    ]
    const muscles = [
      ...new Set(
        sets
          .map((set) => set.muscle)
          .filter(Boolean),
      ),
    ]

    const durationSeconds =
      session.startedAt &&
      session.finishedAt
        ? Math.max(
            1,
            Math.round(
              (
                new Date(
                  session.finishedAt,
                ) -
                new Date(
                  session.startedAt,
                )
              ) / 1000,
            ),
          )
        : null

    const density =
      durationSeconds
        ? Math.round(
            (
              volume /
              (durationSeconds / 60)
            ) * 10,
          ) / 10
        : null

    const strongestSet =
      sets.reduce(
        (best, set) =>
          Number(set.weight || 0) >
          Number(best?.weight || -1)
            ? set
            : best,
        null,
      )

    const highestVolumeSet =
      sets.reduce(
        (best, set) =>
          setVolume(set) >
          setVolume(best ?? {})
            ? set
            : best,
        null,
      )

    const exerciseBreakdown =
      exerciseNames.map((exercise) => {
        const exerciseSets =
          sets.filter(
            (set) =>
              set.exercise === exercise,
          )

        return {
          name: exercise,
          sets: exerciseSets.length,
          volume: exerciseSets.reduce(
            (total, set) =>
              total + setVolume(set),
            0,
          ),
          best: exerciseSets.reduce(
            (best, set) =>
              Number(set.weight || 0) >
              Number(
                best?.weight || -1,
              )
                ? set
                : best,
            null,
          ),
        }
      })

    return {
      sets,
      volume,
      volumeDisplay,
      exerciseNames,
      muscles,
      durationSeconds,
      density,
      strongestSet,
      highestVolumeSet,
      exerciseBreakdown,
    }
  }, [session])

  if (!session || !summary) return null

  const groupedPrs = Object.values(
    recentPrs.reduce(
      (groups, pr) => {
        groups[pr.exercise] ??= {
          exercise: pr.exercise,
          records: [],
        }

        groups[pr.exercise].records.push(pr)
        return groups
      },
      {},
    ),
  )

  const victoryCount =
    groupedPrs.length +
    milestones.length +
    forgeAchievements.length

  return (
    <section className="completion-screen sprint5-completion">
      <header className="sprint5-completion-hero">
        <div className="completion-seal celebration-seal">
          <div className="completion-ring one" />
          <div className="completion-ring two" />
          <Check size={30} />
        </div>

        <span className="eyebrow">
          AVAREN · THE FOUNDRY
        </span>

        <h1>Session complete</h1>
        <p>{session.name}</p>

        <div className="sprint5-hero-stats">
          <article>
            <Clock3 size={16} />
            <div>
              <strong>
                {formatDuration(
                  summary.durationSeconds,
                )}
              </strong>
              <span>session time</span>
            </div>
          </article>

          <article>
            <Layers3 size={16} />
            <div>
              <strong>
                {summary.sets.length}
              </strong>
              <span>sets logged</span>
            </div>
          </article>

          {summary.volumeDisplay.show ? (
            <article>
              <Gauge size={16} />
              <div>
                <strong>
                  {summary.volumeDisplay.value.toLocaleString()}
                </strong>
                <span>{summary.volumeDisplay.label.toLowerCase()} (lb)</span>
              </div>
            </article>
          ) : null}
        </div>

        <p className="completion-coach-followup-note">
          Coach follow-up:{' '}
          {openCoachFollowUpCount > 0
            ? `${openCoachFollowUpCount} item${openCoachFollowUpCount === 1 ? '' : 's'} flagged for coach`
            : 'None'}
        </p>
      </header>

      {victoryCount > 0 && (
        <section className="celebration-reveal sprint5-victories">
          <div className="sprint5-section-heading">
            <div>
              <span className="eyebrow">
                TODAY’S VICTORIES
              </span>
              <h2>
                {victoryCount}{' '}
                {victoryCount === 1
                  ? 'win'
                  : 'wins'} earned.
              </h2>
            </div>

            <Trophy size={22} />
          </div>

          {groupedPrs
            .slice(0, 4)
            .map((group, index) => (
              <article
                className="celebration-card pr"
                key={group.exercise}
                style={{
                  '--celebration-index':
                    index,
                }}
              >
                <div className="celebration-card-icon">
                  <Trophy size={23} />
                </div>

                <div className="celebration-card-copy">
                  <span>
                    New Personal Record
                  </span>
                  <h2>{group.exercise}</h2>

                  <div className="session-pr-list">
                    {group.records.map(
                      (pr) => (
                        <div key={pr.id}>
                          <Check size={13} />
                          <span>
                            {pr.type}
                          </span>
                          <strong>
                            {pr.value}
                          </strong>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </article>
            ))}

          {forgeAchievements.map(
            (achievement, index) => (
              <article
                className={`celebration-card forge rarity-${achievement.rarity}`}
                key={achievement.id}
                style={{
                  '--celebration-index':
                    groupedPrs.length +
                    index,
                }}
              >
                <div className="celebration-card-icon">
                  <Hammer size={23} />
                </div>

                <div className="celebration-card-copy">
                  <span>
                    Achievement Forged ·{' '}
                    {achievement.rarity}
                  </span>
                  <h2>
                    {achievement.title}
                  </h2>
                  <small>
                    {
                      achievement.description
                    }
                  </small>
                </div>
              </article>
            ),
          )}

          {milestones.map(
            (milestone, index) => {
              const meta =
                MILESTONE_META[
                  milestone.type
                ] ??
                MILESTONE_META[
                  MILESTONE_TYPES
                    .WORKOUT_COUNT
                ]
              const Icon = meta.icon

              return (
                <article
                  className={`celebration-card milestone ${meta.className}`}
                  key={milestone.id}
                  style={{
                    '--celebration-index':
                      groupedPrs.length +
                      forgeAchievements.length +
                      index,
                  }}
                >
                  <div className="celebration-card-icon">
                    <Icon size={23} />
                  </div>

                  <div className="celebration-card-copy">
                    <span>
                      {meta.label}
                    </span>
                    <h2>
                      {milestone.title}
                    </h2>
                    <small>
                      {
                        milestone.subtitle
                      }
                    </small>
                  </div>
                </article>
              )
            },
          )}
        </section>
      )}

      <section className="sprint5-completion-section">
        <div className="sprint5-section-heading">
          <div>
            <span className="eyebrow">
              SESSION BREAKDOWN
            </span>
            <h2>
              What you completed.
            </h2>
          </div>

          <Dumbbell size={22} />
        </div>

        <div className="sprint5-summary-grid">
          <article>
            <span>Exercises</span>
            <strong>
              {
                summary.exerciseNames
                  .length
              }
            </strong>
          </article>

          <article>
            <span>Muscle groups</span>
            <strong>
              {summary.muscles.length}
            </strong>
          </article>

          <article>
            <span>PRs</span>
            <strong>
              {recentPrs.length}
            </strong>
          </article>

          <article>
            <span>Density</span>
            <strong>
              {summary.density
                ? `${summary.density.toLocaleString()} lb/min`
                : '—'}
            </strong>
          </article>
        </div>

        <div className="sprint5-exercise-breakdown">
          {summary.exerciseBreakdown.map(
            (exercise) => (
              <article key={exercise.name}>
                <div>
                  <strong>
                    {exercise.name}
                  </strong>
                  <span>
                    {exercise.sets}{' '}
                    {exercise.sets === 1
                      ? 'set'
                      : 'sets'}
                  </span>
                </div>

                <div>
                  <strong>
                    {exercise.volume.toLocaleString()}{' '}
                    lb
                  </strong>
                  <span>
                    {exercise.best
                      ? `${exercise.best.weight} × ${exercise.best.reps} best`
                      : '—'}
                  </span>
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      {(summary.strongestSet ||
        summary.highestVolumeSet) && (
        <section className="sprint5-completion-section">
          <div className="sprint5-section-heading">
            <div>
              <span className="eyebrow">
                SESSION HIGHLIGHTS
              </span>
              <h2>Your strongest work.</h2>
            </div>

            <Award size={22} />
          </div>

          <div className="sprint5-highlight-grid">
            {summary.strongestSet && (
              <article>
                <Trophy size={18} />
                <span>
                  Heaviest set
                </span>
                <strong>
                  {
                    summary
                      .strongestSet
                      .exercise
                  }
                </strong>
                <small>
                  {
                    summary
                      .strongestSet
                      .weight
                  }{' '}
                  ×{' '}
                  {
                    summary
                      .strongestSet
                      .reps
                  }
                </small>
              </article>
            )}

            {summary.highestVolumeSet && (
              <article>
                <Target size={18} />
                <span>
                  Highest-volume set
                </span>
                <strong>
                  {
                    summary
                      .highestVolumeSet
                      .exercise
                  }
                </strong>
                <small>
                  {setVolume(
                    summary
                      .highestVolumeSet,
                  ).toLocaleString()}{' '}
                  lb
                </small>
              </article>
            )}
          </div>
        </section>
      )}

      {summary.muscles.length > 0 && (
        <div className="completion-muscles sprint5-muscles">
          {summary.muscles.map(
            (muscle) => (
              <span key={muscle}>
                {muscle}
              </span>
            ),
          )}
        </div>
      )}

      {(session.intent || session.notes) && (
        <section className="sprint5-completion-section">
          <div className="sprint5-section-heading">
            <div>
              <span className="eyebrow">
                SESSION CONTEXT
              </span>
              <h2>What guided the work.</h2>
            </div>

            <BookOpen size={22} />
          </div>

          {session.intent && (
            <article className="session-context-card">
              <span>Intention</span>
              <p>{session.intent}</p>
            </article>
          )}

          {session.notes && (
            <article className="session-context-card">
              <span>Training notes</span>
              <p>{session.notes}</p>
            </article>
          )}
        </section>
      )}

      <section className="sprint5-completion-section session-reflection-section">
        <div className="sprint5-section-heading">
          <div>
            <span className="eyebrow">
              SESSION REFLECTION
            </span>
            <h2>What should you remember?</h2>
          </div>

          <BookOpen size={22} />
        </div>

        <textarea
          value={reflection}
          onChange={(event) => {
            setReflection(event.target.value)
            setReflectionSaved(false)
          }}
          placeholder="What felt strong? What needs adjustment next time?"
          rows={4}
          maxLength={600}
        />

        <button
          className="session-reflection-save"
          onClick={() => {
            onSaveReflection?.(
              session.id,
              reflection.trim(),
            )
            setReflectionSaved(true)
          }}
        >
          <Save size={16} />
          {reflectionSaved
            ? 'Reflection Saved'
            : 'Save Reflection'}
        </button>
      </section>

      <div className="next-workout-card sprint5-next-workout">
        <span>Next workout</span>
        <strong>{nextWorkout}</strong>
      </div>

      <button
        className="gold-button machined sprint5-done-button"
        onClick={onDone}
      >
        Done
        <ArrowRight size={18} />
      </button>
    </section>
  )
}

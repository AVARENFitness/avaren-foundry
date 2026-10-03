import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Target, X } from 'lucide-react'
import {
  ATHLETE_GOAL_LABELS,
  ATHLETE_GOAL_TYPES,
  GOAL_PRIORITY_AREAS,
  athleteGoalBackend,
  formatGoalTarget,
} from '../lib/athleteGoals'

const emptyDraft = {
  primaryGoal: '',
  targetLabel: '',
  targetValue: '',
  targetUnit: '',
  targetDate: '',
  priorityAreas: [],
  note: '',
}

const draftFromGoal = (goal) =>
  goal
    ? {
        primaryGoal: goal.primaryGoal ?? '',
        targetLabel: goal.targetLabel ?? '',
        targetValue:
          goal.targetValue === null || goal.targetValue === undefined
            ? ''
            : String(goal.targetValue),
        targetUnit: goal.targetUnit ?? '',
        targetDate: goal.targetDate ?? '',
        priorityAreas: goal.priorityAreas ?? [],
        note: goal.note ?? '',
      }
    : emptyDraft

export default function AthleteGoalPanel({
  athleteId,
  goal,
  onGoalChange,
}) {
  const [editing, setEditing] = useState(!goal)
  const [draft, setDraft] = useState(() => draftFromGoal(goal))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(draftFromGoal(goal))
    if (goal) setEditing(false)
  }, [goal])

  const goalLabel = ATHLETE_GOAL_LABELS[goal?.primaryGoal] ?? 'Set your goal'
  const target = formatGoalTarget(goal)

  const canSave = useMemo(
    () => Boolean(draft.primaryGoal) && !saving,
    [draft.primaryGoal, saving],
  )

  const togglePriority = (value) => {
    setDraft((current) => {
      const exists = current.priorityAreas.includes(value)
      return {
        ...current,
        priorityAreas: exists
          ? current.priorityAreas.filter((item) => item !== value)
          : [...current.priorityAreas, value].slice(0, 5),
      }
    })
  }

  const save = async () => {
    if (!canSave || !athleteId) return

    setSaving(true)
    setError('')
    try {
      const next = await athleteGoalBackend.upsertOwnGoal(draft)
      onGoalChange?.(next)
      setEditing(false)
    } catch (saveError) {
      setError(saveError?.message ?? 'Could not save your goal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="athlete-goal-panel">
      <header className="athlete-goal-panel-header">
        <div className="athlete-goal-panel-title">
          <span className="athlete-goal-panel-icon" aria-hidden="true">
            <Target size={19} />
          </span>
          <div>
            <span className="eyebrow">PRIMARY GOAL</span>
            <h2>{goalLabel}</h2>
          </div>
        </div>

        {!editing && goal ? (
          <button
            type="button"
            className="athlete-goal-edit"
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
            Edit
          </button>
        ) : null}
      </header>

      {!editing && goal ? (
        <div className="athlete-goal-summary">
          {target ? (
            <div>
              <small>Target</small>
              <strong>{target}</strong>
            </div>
          ) : null}

          {goal.targetDate ? (
            <div>
              <small>Timeframe</small>
              <strong>
                {new Date(`${goal.targetDate}T12:00:00`).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </strong>
            </div>
          ) : null}

          {goal.priorityAreas?.length ? (
            <div className="athlete-goal-summary-wide">
              <small>Priority areas</small>
              <div className="athlete-goal-priority-list">
                {goal.priorityAreas.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          ) : null}

          {goal.note ? (
            <p className="athlete-goal-note">{goal.note}</p>
          ) : null}
        </div>
      ) : (
        <div className="athlete-goal-form">
          <label>
            <span>Primary goal</span>
            <select
              value={draft.primaryGoal}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  primaryGoal: event.target.value,
                }))
              }
            >
              <option value="">Choose a goal</option>
              {ATHLETE_GOAL_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="athlete-goal-target-grid">
            <label>
              <span>Target (optional)</span>
              <input
                value={draft.targetLabel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    targetLabel: event.target.value,
                  }))
                }
                placeholder="e.g. Body weight, Bench press"
              />
            </label>
            <label>
              <span>Value</span>
              <input
                inputMode="decimal"
                value={draft.targetValue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    targetValue: event.target.value,
                  }))
                }
                placeholder="175"
              />
            </label>
            <label>
              <span>Unit</span>
              <input
                value={draft.targetUnit}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    targetUnit: event.target.value,
                  }))
                }
                placeholder="lb, reps, sessions/week"
              />
            </label>
          </div>

          <label>
            <span>Target date (optional)</span>
            <input
              type="date"
              value={draft.targetDate}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  targetDate: event.target.value,
                }))
              }
            />
          </label>

          <fieldset className="athlete-goal-priorities">
            <legend>Priority areas</legend>
            <div>
              {GOAL_PRIORITY_AREAS.map((item) => {
                const active = draft.priorityAreas.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    className={active ? 'active' : ''}
                    aria-pressed={active}
                    onClick={() => togglePriority(item)}
                  >
                    {active ? <Check size={13} /> : null}
                    {item}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label>
            <span>What matters most? (optional)</span>
            <textarea
              rows={3}
              maxLength={280}
              value={draft.note}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Keep this short — what would make this goal feel successful?"
            />
          </label>

          {error ? <p className="athlete-goal-error">{error}</p> : null}

          <div className="athlete-goal-actions">
            {goal ? (
              <button
                type="button"
                className="ui-btn-tertiary"
                onClick={() => {
                  setDraft(draftFromGoal(goal))
                  setEditing(false)
                  setError('')
                }}
              >
                <X size={15} />
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className="gold-button machined"
              disabled={!canSave}
              onClick={save}
            >
              {saving ? 'Saving…' : 'Save goal'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

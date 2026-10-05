import { ArrowRight, ChevronDown, Dumbbell, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AVA_ACTION_TYPES } from '../lib/avaActions'
import AvaWhySheet from './AvaWhySheet'

const HOME_AVA_COLLAPSE_KEY = 'avaren:home:ava-collapsed'

const readCollapsedPreference = () => {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(HOME_AVA_COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

const actionIcon = (type) => {
  if (
    type === AVA_ACTION_TYPES.START_WORKOUT ||
    type === AVA_ACTION_TYPES.CONTINUE_WORKOUT
  ) {
    return <Dumbbell size={18} />
  }
  return null
}

export default function AvaDailyBriefing({
  briefing,
  onAction,
  onOpenWhy,
  onAskAva,
  contextOnly = false,
}) {
  const [showWhy, setShowWhy] = useState(false)
  const [collapsed, setCollapsed] = useState(() =>
    contextOnly ? readCollapsedPreference() : false,
  )

  if (!briefing) return null

  const openWhy = () => {
    setShowWhy(true)
    onOpenWhy?.()
  }

  const primary = briefing.primaryAction
  const secondary = briefing.secondaryAction
  const watch = briefing.watchItem
  const contextAction = contextOnly
    ? [primary, secondary].find(
        (action) => action?.type === AVA_ACTION_TYPES.PRE_WORKOUT_WARMUP,
      ) ?? null
    : null

  const toggleCollapsed = () => {
    if (!contextOnly) return
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(HOME_AVA_COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // Preference persistence is best-effort.
      }
      return next
    })
  }

  return (
    <>
      <section
        className={`ava-daily-briefing ava-daily-briefing--${briefing.dailyState}${contextOnly ? ' ava-daily-briefing--context' : ''}${collapsed ? ' is-collapsed' : ''}`}
      >
        <header className="ava-daily-briefing-header">
          <span className="ava-daily-briefing-mark">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div className="ava-daily-briefing-heading-copy">
            <span className="eyebrow">AVA</span>
            {!contextOnly && briefing.greeting && (
              <p className="ava-daily-briefing-greeting">{briefing.greeting}</p>
            )}
            <h2>{briefing.headline}</h2>
          </div>
          {contextOnly ? (
            <button
              type="button"
              className="ava-daily-briefing-collapse"
              onClick={toggleCollapsed}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand AVA guidance' : 'Collapse AVA guidance'}
            >
              <ChevronDown size={18} />
            </button>
          ) : null}
        </header>

        {!collapsed && briefing.summary && (
          <p className="ava-daily-briefing-summary">{briefing.summary}</p>
        )}

        {!collapsed && !contextOnly && primary && (
          <div className="ava-daily-briefing-action">
            {primary.eyebrow && (
              <span className="eyebrow">{primary.eyebrow}</span>
            )}
            {primary.detail && (
              <p className="ava-daily-briefing-action-detail">{primary.detail}</p>
            )}
            {primary.label && primary.type !== AVA_ACTION_TYPES.REST && (
              <button
                type="button"
                className="gold-button machined ava-daily-briefing-primary"
                onClick={() => onAction?.(primary)}
              >
                {actionIcon(primary.type)}
                {primary.label}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        )}

        {!collapsed && !contextOnly && secondary?.label && (
          <button
            type="button"
            className="ava-daily-briefing-secondary"
            onClick={() => onAction?.(secondary)}
          >
            {secondary.label}
            <ArrowRight size={15} />
          </button>
        )}

        {!collapsed && watch && (
          <div className="ava-daily-briefing-watch">
            <span className="eyebrow">WATCH</span>
            <p>
              <strong>{watch.title}</strong>
              {watch.detail && <span>{watch.detail}</span>}
            </p>
          </div>
        )}

        {!collapsed && contextAction?.label ? (
          <button
            type="button"
            className="gold-button machined ava-daily-briefing-context-action"
            onClick={() => onAction?.(contextAction)}
          >
            {contextAction.label}
            <ArrowRight size={16} />
          </button>
        ) : null}

        {!collapsed ? (
          <div className="ava-daily-briefing-footer">
          <button
            type="button"
            className="ava-daily-briefing-why"
            onClick={openWhy}
          >
            Why?
          </button>
          {onAskAva && (
            <button
              type="button"
              className="ava-daily-briefing-ask"
              onClick={onAskAva}
              aria-label="Ask AVA"
            >
              <Sparkles size={14} strokeWidth={1.75} />
              Ask AVA
            </button>
          )}
        </div>
        ) : null}
      </section>

      <AvaWhySheet
        open={showWhy}
        briefing={briefing}
        onClose={() => setShowWhy(false)}
      />
    </>
  )
}

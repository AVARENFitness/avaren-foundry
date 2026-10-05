import { ArrowRight, ChevronDown, ChevronUp, Dumbbell, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { AVA_ACTION_TYPES } from '../lib/avaActions'
import AvaWhySheet from './AvaWhySheet'

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
  collapsible = false,
  collapseStorageKey = null,
}) {
  const [showWhy, setShowWhy] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible || !collapseStorageKey || typeof window === 'undefined') {
      return false
    }
    return window.localStorage.getItem(collapseStorageKey) === '1'
  })

  if (!briefing) return null

  const openWhy = () => {
    setShowWhy(true)
    onOpenWhy?.()
  }

  const primary = briefing.primaryAction
  const secondary = briefing.secondaryAction
  const watch = briefing.watchItem
  const contextAction = contextOnly
    ? [primary, secondary].find((action) =>
        [
          AVA_ACTION_TYPES.MORNING_MOVEMENT,
          AVA_ACTION_TYPES.RECOVERY_FLOW,
        ].includes(action?.type),
      )
    : null

  const setCollapsedPersisted = (nextValue) => {
    setCollapsed(nextValue)
    if (collapseStorageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(collapseStorageKey, nextValue ? '1' : '0')
    }
  }

  if (contextOnly && collapsible && collapsed) {
    return (
      <section className="ava-daily-briefing ava-daily-briefing--context ava-daily-briefing--collapsed">
        <div className="ava-daily-briefing-collapsed-copy">
          <span className="ava-daily-briefing-mark">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div className="ava-daily-briefing-heading-copy">
            <span className="eyebrow">AVA</span>
            <strong>Today&apos;s insight</strong>
          </div>
        </div>
        <button
          type="button"
          className="ava-daily-briefing-collapse-toggle"
          onClick={() => setCollapsedPersisted(false)}
          aria-label="Expand AVA insight"
        >
          <ChevronDown size={17} strokeWidth={1.75} />
        </button>
      </section>
    )
  }

  return (
    <>
      <section
        className={`ava-daily-briefing ava-daily-briefing--${briefing.dailyState}${contextOnly ? ' ava-daily-briefing--context' : ''}`}
      >
        <header className="ava-daily-briefing-header">
          <span className="ava-daily-briefing-mark">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div>
            <span className="eyebrow">AVA</span>
            {!contextOnly && briefing.greeting && (
              <p className="ava-daily-briefing-greeting">{briefing.greeting}</p>
            )}
            <h2>{briefing.headline}</h2>
          </div>
          {contextOnly && collapsible ? (
            <button
              type="button"
              className="ava-daily-briefing-collapse-toggle"
              onClick={() => setCollapsedPersisted(true)}
              aria-label="Collapse AVA insight"
            >
              <ChevronUp size={17} strokeWidth={1.75} />
            </button>
          ) : null}
        </header>

        {briefing.summary && (
          <p className="ava-daily-briefing-summary">{briefing.summary}</p>
        )}

        {!contextOnly && primary && (
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

        {!contextOnly && secondary?.label && (
          <button
            type="button"
            className="ava-daily-briefing-secondary"
            onClick={() => onAction?.(secondary)}
          >
            {secondary.label}
            <ArrowRight size={15} />
          </button>
        )}

        {contextAction?.label ? (
          <button
            type="button"
            className="ava-daily-briefing-context-action"
            onClick={() => onAction?.(contextAction)}
          >
            {contextAction.label}
            <ArrowRight size={15} />
          </button>
        ) : null}

        {watch && (
          <div className="ava-daily-briefing-watch">
            <span className="eyebrow">WATCH</span>
            <p>
              <strong>{watch.title}</strong>
              {watch.detail && <span>{watch.detail}</span>}
            </p>
          </div>
        )}

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
      </section>

      <AvaWhySheet
        open={showWhy}
        briefing={briefing}
        onClose={() => setShowWhy(false)}
      />
    </>
  )
}

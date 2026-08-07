import { ArrowRight, Dumbbell, Sparkles } from 'lucide-react'
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
}) {
  const [showWhy, setShowWhy] = useState(false)

  if (!briefing) return null

  const openWhy = () => {
    setShowWhy(true)
    onOpenWhy?.()
  }

  const primary = briefing.primaryAction
  const secondary = briefing.secondaryAction
  const watch = briefing.watchItem

  return (
    <>
      <section
        className={`ava-daily-briefing ava-daily-briefing--${briefing.dailyState}`}
      >
        <header className="ava-daily-briefing-header">
          <span className="ava-daily-briefing-mark">
            <Sparkles size={16} strokeWidth={1.75} />
          </span>
          <div>
            <span className="eyebrow">AVA</span>
            {briefing.greeting && (
              <p className="ava-daily-briefing-greeting">{briefing.greeting}</p>
            )}
            <h2>{briefing.headline}</h2>
          </div>
        </header>

        {briefing.summary && (
          <p className="ava-daily-briefing-summary">{briefing.summary}</p>
        )}

        {primary && (
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

        {secondary?.label && (
          <button
            type="button"
            className="ava-daily-briefing-secondary"
            onClick={() => onAction?.(secondary)}
          >
            {secondary.label}
            <ArrowRight size={15} />
          </button>
        )}

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

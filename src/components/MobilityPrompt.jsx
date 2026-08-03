import {
  ChevronRight,
  Sparkles,
  Sunrise,
  Wind,
} from 'lucide-react'

export default function MobilityPrompt({
  type,
  title,
  subtitle,
  detail,
  reason,
  focusAreas = [],
  score,
  scoreStatus,
  onOpen,
}) {
  const Icon = type === 'recovery' ? Wind : Sunrise

  return (
    <button
      className={`mobility-prompt ${type}`}
      onClick={onOpen}
    >
      <div className="mobility-prompt-icon">
        <Icon size={20} />
      </div>

      <div className="mobility-prompt-copy">
        <span>{subtitle}</span>
        <strong>{title}</strong>
        <small>{detail}</small>

        {focusAreas.length > 0 && (
          <div className="mobility-focus-list">
            {focusAreas.slice(0, 4).map((area) => (
              <em key={area}>{area}</em>
            ))}
          </div>
        )}

        {reason && (
          <p className="mobility-prompt-reason">
            <Sparkles size={12} />
            {reason}
          </p>
        )}
      </div>

      {Number.isFinite(score) ? (
        <div className="mobility-score-mini">
          <strong>{score}</strong>
          <span>{scoreStatus}</span>
        </div>
      ) : (
        <ChevronRight size={19} />
      )}
    </button>
  )
}

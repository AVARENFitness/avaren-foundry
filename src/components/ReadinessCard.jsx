import {
  ArrowRight,
  BatteryCharging,
  Brain,
  CheckCircle2,
  Moon,
  Zap,
} from 'lucide-react'

const ICONS = {
  sleep: Moon,
  energy: Zap,
  soreness: BatteryCharging,
  stress: Brain,
}

export default function ReadinessCard({
  readiness,
  onOpen,
}) {
  if (!readiness?.completed) {
    return (
      <button
        className="readiness-home-card incomplete"
        onClick={onOpen}
      >
        <div className="readiness-home-icon">
          <CheckCircle2 size={21} />
        </div>
        <div>
          <span className="eyebrow">DAILY READINESS</span>
          <strong>Complete today’s check-in.</strong>
          <small>
            Sleep, energy, soreness, and stress take less than
            ten seconds to rate.
          </small>
        </div>
        <ArrowRight size={18} />
      </button>
    )
  }

  return (
    <button
      className={`readiness-home-card ${readiness.tone}`}
      onClick={onOpen}
    >
      <div className="readiness-score">
        <strong>{readiness.score}</strong>
        <span>Readiness</span>
      </div>

      <div className="readiness-home-copy">
        <span className="eyebrow">TODAY’S READINESS</span>
        <strong>{readiness.status}</strong>
        <small>{readiness.recommendation}</small>

        <div className="readiness-factor-row">
          {readiness.factors.map((factor) => {
            const Icon = ICONS[factor.id]
            return (
              <span
                key={factor.id}
                className={
                  factor.concern
                    ? 'concern'
                    : factor.supportive
                    ? 'supportive'
                    : ''
                }
              >
                <Icon size={11} />
                {factor.value}
              </span>
            )
          })}
        </div>
      </div>

      <ArrowRight size={18} />
    </button>
  )
}

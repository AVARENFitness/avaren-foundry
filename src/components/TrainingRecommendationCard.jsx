import {
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Dumbbell,
  Gauge,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

const ICONS = {
  'train-normal': CheckCircle2,
  'reduce-intensity': Gauge,
  'reduce-volume': BatteryCharging,
  'change-focus': RefreshCw,
  'recovery-day': Sparkles,
  'check-in': Sparkles,
}

export default function TrainingRecommendationCard({
  recommendation,
  onPrimaryAction,
  onTrainAsPlanned,
  onChooseWorkout,
  onRecovery,
}) {
  if (!recommendation) return null

  const Icon =
    ICONS[recommendation.id] ?? Dumbbell

  return (
    <section
      className={`training-recommendation-card ${recommendation.tone}`}
    >
      <header>
        <div className="training-recommendation-icon">
          <Icon size={21} />
        </div>
        <div>
          <span className="eyebrow">
            AVAREN INTELLIGENCE
          </span>
          <h2>{recommendation.title}</h2>
        </div>
        <div className="training-confidence">
          <strong>{recommendation.confidence}%</strong>
          <span>confidence</span>
        </div>
      </header>

      <p>{recommendation.summary}</p>

      <div className="training-recommendation-evidence">
        {recommendation.evidence
          .slice(0, 5)
          .map((item) => (
            <span key={item}>{item}</span>
          ))}
      </div>

      <div className="training-recommendation-plan">
        <span>Suggested plan</span>
        {recommendation.plan.map((item) => (
          <div key={item}>
            <CheckCircle2 size={13} />
            <small>{item}</small>
          </div>
        ))}
      </div>

      <div className="training-recommendation-actions">
        <button
          className="gold-button machined"
          onClick={onPrimaryAction}
        >
          {recommendation.primaryLabel}
          <ArrowRight size={16} />
        </button>

        {recommendation.id !== 'train-normal' &&
          recommendation.id !== 'check-in' && (
            <button onClick={onTrainAsPlanned}>
              <Dumbbell size={15} />
              Train As Planned
            </button>
          )}

        {recommendation.alternateWorkout && (
          <button onClick={onChooseWorkout}>
            <RefreshCw size={15} />
            Choose Workout
          </button>
        )}

        {recommendation.id !== 'recovery-day' &&
          recommendation.id !== 'check-in' && (
            <button onClick={onRecovery}>
              <Sparkles size={15} />
              Recovery Instead
            </button>
          )}
      </div>
    </section>
  )
}

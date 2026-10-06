import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Dumbbell,
  Gauge,
  Home,
  RefreshCcw,
  Sparkles,
  Target,
  UtensilsCrossed,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const STEPS = [
  {
    id: 'welcome',
    eyebrow: 'WELCOME TO AVAREN',
    title: 'Start with today.',
    copy:
      'AVAREN is built to make your next decision obvious—not to make you manage another fitness app.',
    points: [
      {
        icon: Home,
        title: 'Home tells you what matters now',
        copy: 'Your workout, readiness, recovery, nutrition, coaching, or schedule becomes the primary action when it matters.',
      },
      {
        icon: Sparkles,
        title: 'AVA adds context',
        copy: 'Ask about your training, food, recovery, schedule, or progress without digging through screens.',
      },
    ],
  },
  {
    id: 'daily-system',
    eyebrow: 'YOUR DAILY SYSTEM',
    title: 'Train. Recover. Track. Progress.',
    copy:
      'Use each area when you need it. AVAREN keeps the deeper tools out of the way until they become useful.',
    points: [
      {
        icon: Dumbbell,
        title: 'Train',
        copy: 'Start the session, log the current set, and let previous performance stay available without crowding the workout.',
      },
      {
        icon: UtensilsCrossed,
        title: 'Food',
        copy: 'Search, photograph, or scan food and log the amount you actually ate.',
      },
      {
        icon: CalendarDays,
        title: 'Coaching & schedule',
        copy: 'Appointments stay separate from workout assignments, while readiness and check-ins give your coach useful context.',
      },
    ],
  },
  {
    id: 'ready',
    eyebrow: 'YOU ARE READY',
    title: 'You do not need to learn everything now.',
    copy:
      'Open Home and follow the primary action. Progress, goals, deeper history, and settings are there when you want them.',
    points: [
      {
        icon: BarChart3,
        title: 'Progress starts with the big picture',
        copy: 'See overall training progress first, then open an individual lift when you want its trend or goal.',
      },
      {
        icon: RefreshCcw,
        title: 'Replay anytime',
        copy: 'You can replay this introduction later from Profile.',
      },
    ],
  },
]

export default function OnboardingScreen({
  onComplete,
  onClose,
  isReplay = false,
}) {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const finalStep =
    index === STEPS.length - 1

  const progress = useMemo(
    () =>
      ((index + 1) / STEPS.length) *
      100,
    [index],
  )

  const finish = () => {
    onComplete?.()
  }

  return (
    <main className="onboarding-screen">
      <header className="onboarding-topbar">
        <button
          className="onboarding-back"
          onClick={() => {
            if (index > 0) {
              setIndex(
                (current) => current - 1,
              )
              return
            }

            if (isReplay) {
              onClose?.()
            }
          }}
          disabled={
            index === 0 && !isReplay
          }
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <span>
          {index + 1} of {STEPS.length}
        </span>

        {isReplay ? (
          <button
            className="onboarding-skip"
            onClick={onClose}
          >
            Close
          </button>
        ) : (
          <button
            className="onboarding-skip"
            onClick={finish}
          >
            Skip tour
          </button>
        )}
      </header>

      <div className="onboarding-progress">
        <div
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <section
        className="onboarding-card"
        key={step.id}
      >
        <div className="onboarding-mark">
          <img
            src="/brand/foundation/icon-192.png"
            alt=""
            aria-hidden="true"
          />
        </div>

        <span className="eyebrow">
          {step.eyebrow}
        </span>
        <h1>{step.title}</h1>
        <p className="onboarding-copy">
          {step.copy}
        </p>

        <div className="onboarding-points">
          {step.points.map(
            ({
              icon: Icon,
              title,
              copy,
            }) => (
              <article key={title}>
                <span>
                  <Icon size={19} />
                </span>

                <div>
                  <strong>{title}</strong>
                  <p>{copy}</p>
                </div>
              </article>
            ),
          )}
        </div>

        <button
          className="gold-button machined onboarding-primary"
          onClick={() => {
            if (finalStep) {
              finish()
              return
            }

            setIndex(
              (current) => current + 1,
            )
          }}
        >
          {finalStep
            ? 'Enter AVAREN'
            : 'Continue'}
          {finalStep ? (
            <Check size={18} />
          ) : (
            <ArrowRight size={18} />
          )}
        </button>

        {!finalStep && (
          <small className="onboarding-note">
            This tour is brief. You can
            replay it later from Profile.
          </small>
        )}
      </section>
    </main>
  )
}

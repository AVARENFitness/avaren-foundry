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
    title: 'Your day, made clear.',
    copy:
      'AVAREN brings training, nutrition, readiness, coaching, schedule, and progress into one calm daily system.',
    points: [
      {
        icon: Home,
        title: 'Home',
        copy: 'See the one thing that matters most today, plus what is coming next.',
      },
      {
        icon: Sparkles,
        title: 'AVA',
        copy: 'Ask questions across your training, recovery, nutrition, schedule, and progress.',
      },
    ],
  },
  {
    id: 'training',
    eyebrow: 'TRAIN',
    title: 'Open the session. Log the work.',
    copy:
      'Start today’s workout, continue where you left off, or choose another workout when you need flexibility.',
    points: [
      {
        icon: Dumbbell,
        title: 'Train',
        copy: 'Log weight, reps, sets, notes, and previous performance without leaving the session.',
      },
      {
        icon: Target,
        title: 'Stay on plan',
        copy: 'Coach assignments and your own training stay clear without mixing appointments with workouts.',
      },
    ],
  },
  {
    id: 'nutrition',
    eyebrow: 'FOOD',
    title: 'Track without the friction.',
    copy:
      'Search, scan, upload, or use the camera. AVAREN keeps protein visible and learns from your long-term response.',
    points: [
      {
        icon: UtensilsCrossed,
        title: 'Nutrition',
        copy: 'Log food quickly, choose the amount you ate, and review calories, protein, and trends.',
      },
      {
        icon: Sparkles,
        title: 'Adaptive guidance',
        copy: 'Targets can stabilize over time using your goal, adherence, body-weight trend, and training demand.',
      },
    ],
  },
  {
    id: 'schedule',
    eyebrow: 'COACHING',
    title: 'Know what is next.',
    copy:
      'Appointments with your coach stay separate from workout assignments so the day is always easy to understand.',
    points: [
      {
        icon: CalendarDays,
        title: 'Schedule',
        copy: 'See upcoming in-person sessions, details, confirmation status, and past appointments.',
      },
      {
        icon: Gauge,
        title: 'Readiness & check-ins',
        copy: 'Complete the short check-ins that help AVAREN and your coach understand how you are doing.',
      },
    ],
  },
  {
    id: 'ready',
    eyebrow: 'YOU ARE READY',
    title: 'Start with today.',
    copy:
      'You do not need to manage every feature. AVAREN will surface what matters when it matters.',
    points: [
      {
        icon: Home,
        title: 'Begin on Home',
        copy: 'Follow the primary action, then use Train, Food, Schedule, or Progress when you need more.',
      },
      {
        icon: BarChart3,
        title: 'Progress',
        copy: 'Review strength, consistency, recovery patterns, records, and the work you have built over time.',
      },
      {
        icon: RefreshCcw,
        title: 'Replay anytime',
        copy: 'Open Profile and choose Replay App Tour whenever you want a refresher.',
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

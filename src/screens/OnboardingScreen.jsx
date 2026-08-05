import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Dumbbell,
  Gauge,
  Home,
  RefreshCcw,
  Sparkles,
  Target,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const STEPS = [
  {
    id: 'welcome',
    eyebrow: 'WELCOME TO AVAREN',
    title: 'Training, made clear.',
    copy:
      'AVAREN brings workouts, readiness, movement, recovery, and progress into one calm daily system.',
    points: [
      {
        icon: Home,
        title: 'Home',
        copy: 'Your daily plan and the fastest way into training.',
      },
      {
        icon: Dumbbell,
        title: 'Gym',
        copy: 'Log sets, use the rest timer, and finish with a complete session summary.',
      },
      {
        icon: BarChart3,
        title: 'Progress',
        copy: 'Review trends, records, and the work you have built over time.',
      },
    ],
  },
  {
    id: 'readiness',
    eyebrow: 'YOUR MORNING',
    title: 'Check in before you push.',
    copy:
      'Readiness helps AVAREN understand how prepared you feel and shapes the guidance you see that day.',
    points: [
      {
        icon: Gauge,
        title: 'Readiness',
        copy: 'Log sleep, energy, soreness, and stress in under a minute.',
      },
      {
        icon: Sparkles,
        title: 'Morning Movement',
        copy: 'Use an equipment-free flow to prepare your body for the day.',
      },
    ],
  },
  {
    id: 'training',
    eyebrow: 'DURING TRAINING',
    title: 'Log the work. Keep moving.',
    copy:
      'Choose a workout, enter weight and reps, complete each set, and let AVAREN remember your history.',
    points: [
      {
        icon: Dumbbell,
        title: 'Set logging',
        copy: 'Previous performance, quick adjustments, rest timing, and PR awareness stay close.',
      },
      {
        icon: Target,
        title: 'Session intent',
        copy: 'Save the cue or purpose you want to carry through the workout.',
      },
    ],
  },
  {
    id: 'recovery',
    eyebrow: 'AFTER TRAINING',
    title: 'Recover with a reason.',
    copy:
      'Daily Reset uses recent training to choose relevant equipment-free movements instead of giving everyone the same routine.',
    points: [
      {
        icon: RefreshCcw,
        title: 'Daily Reset',
        copy: 'Restore the regions you trained and avoid movements you do not enjoy.',
      },
      {
        icon: Check,
        title: 'Workout completion',
        copy: 'See session time, volume, highlights, notes, and records from that workout only.',
      },
    ],
  },
  {
    id: 'ready',
    eyebrow: 'YOU ARE READY',
    title: 'Start with today.',
    copy:
      'You do not need to learn every feature now. AVAREN will stay simple and reveal more as you use it.',
    points: [
      {
        icon: Home,
        title: 'Begin on Home',
        copy: 'Complete readiness, review the day, or start your next workout.',
      },
      {
        icon: BarChart3,
        title: 'Replay anytime',
        copy: 'Open Profile and choose Replay App Tour whenever you need a refresher.',
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

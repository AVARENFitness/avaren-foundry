import {
  ArrowLeft,
  Check,
  ChevronRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const sentence = (value, fallback) => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const movementGuide = (movement) => {
  const instruction = sentence(
    movement.instruction,
    'Move slowly through a comfortable range.',
  )

  return {
    setup: sentence(
      movement.setupCue,
      movement.setup ??
        'Choose a stable starting position and relax any unnecessary tension.',
    ),
    move: sentence(
      movement.actionCue,
      movement.move ?? instruction,
    ),
    finish: sentence(
      movement.finishCue,
      movement.finish ??
        'Return to the starting position with control, then repeat or switch sides.',
    ),
    tips:
      movement.tips?.length
        ? movement.tips
        : [
            'Move slowly and stay in a comfortable range.',
            'Breathe naturally instead of holding your breath.',
            'Stop if the movement causes sharp pain.',
          ],
    mistakes:
      movement.mistakes?.length
        ? movement.mistakes
        : [
            'Rushing through the movement.',
            'Forcing a larger range than you can control.',
          ],
    purpose: sentence(
      movement.purpose,
      movement.reason ??
        'This movement helps you feel less stiff and move more comfortably.',
    ),
    targets:
      movement.targets ??
      movement.muscles ??
      movement.tags ??
      [],
  }
}

export default function MobilityScreen({
  flow,
  savedDurations = {},
  onSaveDuration,
  onComplete,
  onClose,
}) {
  const [index, setIndex] = useState(0)
  const movement = flow.movements[index]
  const preferred =
    savedDurations[movement?.id] ??
    movement?.seconds ??
    30
  const [duration, setDuration] =
    useState(preferred)
  const [remaining, setRemaining] =
    useState(preferred)
  const [running, setRunning] =
    useState(false)
  const [started, setStarted] =
    useState(false)
  const [finished, setFinished] =
    useState(false)

  const guide = useMemo(
    () => movementGuide(movement ?? {}),
    [movement],
  )

  useEffect(() => {
    if (!movement) return

    const next =
      savedDurations[movement.id] ??
      movement.seconds ??
      30

    setDuration(next)
    setRemaining(next)
    setRunning(false)
    setStarted(false)
    setFinished(false)
  }, [
    movement?.id,
    savedDurations,
  ])

  useEffect(() => {
    if (!running || remaining <= 0) return

    const timer = window.setInterval(() => {
      setRemaining((current) =>
        Math.max(0, current - 1),
      )
    }, 1000)

    return () =>
      window.clearInterval(timer)
  }, [running, remaining])

  useEffect(() => {
    if (remaining !== 0 || !running) return

    setRunning(false)
    setFinished(true)

    if (navigator.vibrate) {
      navigator.vibrate([30, 45, 30])
    }
  }, [remaining, running])

  const progress = useMemo(
    () =>
      ((index + (finished ? 1 : 0)) /
        flow.movements.length) *
      100,
    [
      index,
      finished,
      flow.movements.length,
    ],
  )

  const next = () => {
    if (
      index >=
      flow.movements.length - 1
    ) {
      onComplete()
      return
    }

    setIndex((current) => current + 1)
  }

  const adjustDuration = (change) => {
    const nextDuration = Math.max(
      15,
      duration + change,
    )

    setDuration(nextDuration)

    if (!running) {
      setRemaining(nextDuration)
    }

    onSaveDuration(
      movement.id,
      nextDuration,
    )
  }

  const addTime = () => {
    setRemaining(
      (current) => current + 15,
    )
  }

  if (!movement) return null

  const isMorning =
    flow.id === 'daily-reset' ||
    /morning|daily/i.test(
      `${flow.title} ${flow.subtitle}`,
    )

  return (
    <section className="mobility-screen movement-coach-screen">
      <header className="mobility-topbar">
        <button onClick={onClose}>
          <ArrowLeft size={18} />
          Exit
        </button>

        <span>
          {index + 1} of{' '}
          {flow.movements.length}
        </span>
      </header>

      <div className="mobility-progress">
        <div
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <div className="mobility-flow-heading">
        <span className="eyebrow">
          {isMorning
            ? 'MORNING MOVEMENT'
            : flow.subtitle}
        </span>

        <h1>
          {isMorning
            ? 'Prepare for the day.'
            : flow.title}
        </h1>

        {flow.reason && (
          <p>{flow.reason}</p>
        )}
      </div>

      <article className="movement-stage movement-coach-stage">
        <div className="movement-coach-heading">
          <span className="movement-number">
            {String(index + 1).padStart(
              2,
              '0',
            )}
          </span>

          <div>
            <span className="eyebrow">
              {movement.type === 'timed'
                ? `${duration} SECONDS`
                : `${movement.target} REPS`}
            </span>
            <h2>{movement.name}</h2>
          </div>
        </div>

        {movement.side && (
          <div className="movement-side">
            {movement.side}
          </div>
        )}

        {guide.targets.length > 0 && (
          <div className="movement-targets">
            {guide.targets
              .slice(0, 5)
              .map((target) => (
                <span key={target}>
                  {target}
                </span>
              ))}
          </div>
        )}

        <section className="coach-guide">
          <header>
            <span className="eyebrow">
              COACH’S GUIDE
            </span>
            <h3>Three clear steps.</h3>
          </header>

          <div className="coach-guide-steps">
            <article>
              <span>1</span>
              <div>
                <small>Set Up</small>
                <p>{guide.setup}</p>
              </div>
            </article>

            <article>
              <span>2</span>
              <div>
                <small>Move</small>
                <p>{guide.move}</p>
              </div>
            </article>

            <article>
              <span>3</span>
              <div>
                <small>Finish</small>
                <p>{guide.finish}</p>
              </div>
            </article>
          </div>
        </section>

        <div className="movement-coach-notes">
          <section>
            <span className="eyebrow">
              COACH’S TIPS
            </span>

            <ul>
              {guide.tips
                .slice(0, 4)
                .map((tip) => (
                  <li key={tip}>
                    <Check size={14} />
                    {tip}
                  </li>
                ))}
            </ul>
          </section>

          <section>
            <span className="eyebrow">
              COMMON MISTAKES
            </span>

            <ul>
              {guide.mistakes
                .slice(0, 3)
                .map((mistake) => (
                  <li key={mistake}>
                    <span>×</span>
                    {mistake}
                  </li>
                ))}
            </ul>
          </section>
        </div>

        <section className="movement-purpose">
          <span className="eyebrow">
            WHY THIS MATTERS
          </span>
          <p>{guide.purpose}</p>
        </section>

        {movement.type === 'timed' ? (
          <>
            <div
              className={`mobility-timer ${
                running ? 'running' : ''
              }`}
            >
              <strong>{remaining}</strong>
              <span>seconds</span>
            </div>

            {!started &&
              !running &&
              !finished && (
                <div className="duration-adjuster">
                  <button
                    onClick={() =>
                      adjustDuration(-15)
                    }
                  >
                    −15
                  </button>

                  <span>
                    {duration} sec
                  </span>

                  <button
                    onClick={() =>
                      adjustDuration(15)
                    }
                  >
                    +15
                  </button>
                </div>
              )}

            <div className="mobility-primary-actions">
              {!finished ? (
                <button
                  className="gold-button machined"
                  onClick={() => {
                    if (!started) {
                      setStarted(true)
                    }

                    setRunning(
                      (current) => !current,
                    )
                  }}
                >
                  {running ? (
                    <Pause size={19} />
                  ) : (
                    <Play size={19} />
                  )}

                  {running
                    ? 'Pause'
                    : started
                    ? 'Resume Timer'
                    : 'Start Movement'}
                </button>
              ) : (
                <button
                  className="gold-button machined"
                  onClick={next}
                >
                  <Check size={19} />

                  {index ===
                  flow.movements.length - 1
                    ? 'Finish Flow'
                    : 'Next Movement'}
                </button>
              )}

              {started && !finished && (
                <button
                  className="mobility-secondary-action"
                  onClick={addTime}
                >
                  <Plus size={17} />
                  15 sec
                </button>
              )}
            </div>

            {finished && (
              <div className="mobility-finished-actions">
                <button
                  onClick={() => {
                    setRemaining(duration)
                    setStarted(false)
                    setFinished(false)
                  }}
                >
                  <RotateCcw size={16} />
                  Repeat
                </button>

                <button onClick={next}>
                  <ChevronRight size={16} />
                  Continue
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rep-target">
              <strong>
                {movement.target}
              </strong>

              <span>
                reps
                {movement.side
                  ? ` · ${movement.side}`
                  : ''}
              </span>
            </div>

            <button
              className="gold-button machined"
              onClick={next}
            >
              <Check size={19} />

              {index ===
              flow.movements.length - 1
                ? 'Finish Flow'
                : 'Complete Movement'}
            </button>
          </>
        )}

        {!finished && (
          <button
            className="skip-movement"
            onClick={next}
          >
            <SkipForward size={15} />
            Skip movement
          </button>
        )}
      </article>
    </section>
  )
}

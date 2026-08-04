import {
  ArrowLeft,
  Check,
  ChevronRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  ThumbsDown,
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
  routineLength = 'standard',
  dislikedMovementIds = [],
  onRoutineLengthChange,
  onAvoidMovement,
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
  const [flowComplete, setFlowComplete] =
    useState(false)
  const [showFlowPreferences, setShowFlowPreferences] =
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
      setFlowComplete(true)
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

  const isMorning =
    flow.title === 'Morning Movement' ||
    String(flow.id ?? '').startsWith('daily-reset-')

  if (!movement && !flowComplete) return null

  if (flowComplete) {
    const totalSeconds = flow.movements.reduce(
      (total, item) =>
        total + Number(savedDurations[item.id] ?? item.seconds ?? 30),
      0,
    )
    const minutes = Math.max(1, Math.round(totalSeconds / 60))
    const regions = [
      ...new Set(
        flow.movements.flatMap(
          (item) => item.targets ?? item.muscles ?? item.tags ?? [],
        ),
      ),
    ].slice(0, 4)

    return (
      <section className="movement-flow-complete">
        <img
          src="/brand/foundation/icon-192.png"
          alt=""
          aria-hidden="true"
        />
        <span className="eyebrow">{flow.title?.toUpperCase()}</span>
        <h1>Complete.</h1>
        <p>
          {isMorning
            ? 'Your body is prepared for the day.'
            : 'Your recovery work is complete.'}
        </p>
        <div className="movement-flow-complete-stats">
          <article><strong>{flow.movements.length}</strong><span>movements</span></article>
          <article><strong>{minutes}</strong><span>minutes</span></article>
        </div>
        {regions.length > 0 && (
          <div className="movement-flow-complete-regions">
            {regions.map((region) => <span key={region}>{region}</span>)}
          </div>
        )}
        <button className="gold-button machined" onClick={onComplete}>
          Continue to Home
        </button>
      </section>
    )
  }

  return (
    <section className="mobility-screen movement-coach-screen">
      <header className="mobility-topbar">
        <button onClick={onClose}>
          <ArrowLeft size={18} />
          Exit
        </button>

        <div className="mobility-topbar-actions">
          <span>
            {index + 1} of{' '}
            {flow.movements.length}
          </span>

          <button
            className="mobility-preferences-toggle"
            onClick={() =>
              setShowFlowPreferences(
                (current) => !current,
              )
            }
            aria-label="Movement preferences"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <div className="mobility-progress">
        <div
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      {showFlowPreferences && (
        <section className="mobility-flow-preferences">
          <div>
            <span className="eyebrow">
              ROUTINE LENGTH
            </span>
            <p>
              Applies the next time you open a flow.
            </p>
          </div>

          <div className="mobility-length-options">
            {[
              ['short', 'Short', '4'],
              ['standard', 'Standard', '6'],
              ['extended', 'Extended', '8'],
            ].map(
              ([value, label, count]) => (
                <button
                  key={value}
                  className={
                    routineLength === value
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    onRoutineLengthChange?.(
                      value,
                    )
                  }
                >
                  <strong>{label}</strong>
                  <span>{count} movements</span>
                </button>
              ),
            )}
          </div>

          {dislikedMovementIds.length > 0 && (
            <small>
              {dislikedMovementIds.length}{' '}
              {dislikedMovementIds.length === 1
                ? 'movement is'
                : 'movements are'}{' '}
              currently avoided.
            </small>
          )}
        </section>
      )}

      <div className="mobility-flow-heading">
        <span className="eyebrow">
          {isMorning
            ? 'MORNING MOVEMENT'
            : flow.subtitle}
        </span>

        <h1>{flow.subtitle || flow.title}</h1>

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

            {!finished ? (
              <>
                <div className="mobility-primary-actions">
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

                  {started && (
                    <button
                      className="mobility-secondary-action"
                      onClick={addTime}
                    >
                      <Plus size={17} />
                      15 sec
                    </button>
                  )}
                </div>

                {started && (
                  <button
                    className="finish-early-button"
                    onClick={() => {
                      setRunning(false)
                      setRemaining(0)
                      setFinished(true)
                    }}
                  >
                    <Check size={15} />
                    Finish Early
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="gold-button machined timed-continue-button"
                  onClick={next}
                >
                  <ChevronRight size={19} />

                  {index ===
                  flow.movements.length - 1
                    ? 'Finish Flow'
                    : 'Continue'}
                </button>

                <button
                  className="timed-repeat-button"
                  onClick={() => {
                    setRemaining(duration)
                    setStarted(false)
                    setFinished(false)
                    setRunning(false)
                  }}
                >
                  <RotateCcw size={16} />
                  Repeat Movement
                </button>
              </>
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
            className="avoid-movement-button"
            onClick={() => {
              onAvoidMovement?.(movement.id)
              next()
            }}
          >
            <ThumbsDown size={15} />
            Avoid this movement
          </button>
        )}

        {movement.type !== 'timed' &&
          !finished && (
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

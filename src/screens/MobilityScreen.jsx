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
import MotionIllustration from '../components/MotionIllustration'

export default function MobilityScreen({
  flow,
  savedDurations = {},
  onSaveDuration,
  onComplete,
  onClose,
}) {
  const [index, setIndex] = useState(0)
  const movement = flow.movements[index]
  const preferred = savedDurations[movement?.id] ?? movement?.seconds ?? 30
  const [duration, setDuration] = useState(preferred)
  const [remaining, setRemaining] = useState(preferred)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (!movement) return
    const next = savedDurations[movement.id] ?? movement.seconds ?? 30
    setDuration(next)
    setRemaining(next)
    setRunning(false)
    setStarted(false)
    setFinished(false)
  }, [movement?.id])

  useEffect(() => {
    if (!running || remaining <= 0) return
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, remaining])

  useEffect(() => {
    if (remaining !== 0 || !running) return
    setRunning(false)
    setFinished(true)
    if (navigator.vibrate) navigator.vibrate([30, 45, 30])
  }, [remaining, running])

  const progress = useMemo(
    () => ((index + (finished ? 1 : 0)) / flow.movements.length) * 100,
    [index, finished, flow.movements.length],
  )

  const next = () => {
    if (index >= flow.movements.length - 1) {
      onComplete()
      return
    }
    setIndex((current) => current + 1)
  }

  const adjustDuration = (change) => {
    const nextDuration = Math.max(15, duration + change)
    setDuration(nextDuration)
    if (!running) setRemaining(nextDuration)
    onSaveDuration(movement.id, nextDuration)
  }

  const addTime = () => {
    setRemaining((current) => current + 15)
  }

  if (!movement) return null

  return (
    <section className="mobility-screen">
      <header className="mobility-topbar">
        <button onClick={onClose}><ArrowLeft size={18} /> Exit</button>
        <span>{index + 1} of {flow.movements.length}</span>
      </header>

      <div className="mobility-progress">
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="mobility-flow-heading">
        <span className="eyebrow">{flow.subtitle}</span>
        <h1>{flow.title}</h1>
      </div>

      <article className="movement-stage">
        <span className="movement-number">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2>{movement.name}</h2>
        <p>{movement.instruction}</p>

        <MotionIllustration movement={movement} />

        {movement.side && (
          <div className="movement-side">{movement.side}</div>
        )}

        {movement.type === 'timed' ? (
          <>
            <div className={`mobility-timer ${running ? 'running' : ''}`}>
              <strong>{remaining}</strong>
              <span>seconds</span>
            </div>

            {!started && !running && !finished && (
              <div className="duration-adjuster">
                <button onClick={() => adjustDuration(-15)}>−15</button>
                <span>{duration} sec</span>
                <button onClick={() => adjustDuration(15)}>+15</button>
              </div>
            )}

            <div className="mobility-primary-actions">
              {!finished ? (
                <button
                  className="gold-button machined"
                  onClick={() => {
                    if (!started) setStarted(true)
                    setRunning((current) => !current)
                  }}
                >
                  {running ? <Pause size={19} /> : <Play size={19} />}
                  {running ? 'Pause' : started ? 'Resume Timer' : 'Start Timer'}
                </button>
              ) : (
                <button className="gold-button machined" onClick={next}>
                  <Check size={19} />
                  {index === flow.movements.length - 1 ? 'Finish Flow' : 'Next Movement'}
                </button>
              )}

              {started && !finished && (
                <button className="mobility-secondary-action" onClick={addTime}>
                  <Plus size={17} /> 15 sec
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
                  <RotateCcw size={16} /> Repeat
                </button>
                <button onClick={next}>
                  <ChevronRight size={16} /> Continue
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rep-target">
              <strong>{movement.target}</strong>
              <span>reps {movement.side ? `· ${movement.side}` : ''}</span>
            </div>

            <button className="gold-button machined" onClick={next}>
              <Check size={19} />
              {index === flow.movements.length - 1
                ? 'Finish Flow'
                : 'Complete Movement'}
            </button>
          </>
        )}

        {!finished && (
          <button className="skip-movement" onClick={next}>
            <SkipForward size={15} /> Skip movement
          </button>
        )}
      </article>
    </section>
  )
}

import { ArrowLeft, Check, ChevronRight, Clock3, Pause, Play, Plus, RotateCcw, SkipForward, Sparkles, Target, Wind, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import MotionCardViewer from '../components/MotionCardViewer'

const minutes = (seconds) => Math.max(1, Math.round(seconds / 60))

export default function MobilityScreen({ flow, savedDurations = {}, onSaveDuration, onComplete, onClose }) {
  const [mode, setMode] = useState('intro')
  const [index, setIndex] = useState(0)
  const [transitioningTo, setTransitioningTo] = useState(null)
  const movement = flow.movements[index]
  const preferred = savedDurations[movement?.id] ?? movement?.seconds ?? 30
  const [duration, setDuration] = useState(preferred)
  const [remaining, setRemaining] = useState(preferred)
  const [running, setRunning] = useState(false)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)

  const estimatedSeconds = useMemo(
    () => flow.movements.reduce((total, item) =>
      total + (item.type === 'timed'
        ? (savedDurations[item.id] ?? item.seconds ?? 30)
        : Math.max(30, (item.target ?? 6) * 5)), 0),
    [flow.movements, savedDurations],
  )

  useEffect(() => {
    if (!movement) return
    const next = savedDurations[movement.id] ?? movement.seconds ?? 30
    setDuration(next); setRemaining(next); setRunning(false); setStarted(false); setFinished(false)
  }, [movement?.id, savedDurations])

  useEffect(() => {
    if (!running || remaining <= 0) return
    const timer = window.setInterval(() => setRemaining((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [running, remaining])

  useEffect(() => {
    if (remaining !== 0 || !running) return
    setRunning(false); setFinished(true)
    navigator.vibrate?.([30, 45, 30])
  }, [remaining, running])

  const progress = ((index + (finished ? 1 : 0)) / flow.movements.length) * 100

  const next = () => {
    if (index >= flow.movements.length - 1) {
      setMode('complete'); navigator.vibrate?.([20, 35, 20]); return
    }
    setTransitioningTo(flow.movements[index + 1])
    window.setTimeout(() => {
      setIndex((v) => v + 1); setTransitioningTo(null)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 650)
  }

  const adjustDuration = (change) => {
    const value = Math.max(15, duration + change)
    setDuration(value); if (!running) setRemaining(value)
    onSaveDuration(movement.id, value)
  }

  if (!movement) return null

  if (mode === 'intro') return (
    <section className="morning-mobility-intro">
      <header className="mobility-topbar">
        <button onClick={onClose}><X size={18}/> Close</button><span>Morning mobility</span>
      </header>
      <section className="mobility-intro-hero">
        <span className="eyebrow">AVAREN DAILY RITUAL</span>
        <h1>{flow.title}</h1><p>{flow.reason}</p>
        <div className="mobility-intro-metrics">
          <article><Clock3/><strong>{minutes(estimatedSeconds)} min</strong><span>Estimated</span></article>
          <article><Sparkles/><strong>{flow.movements.length}</strong><span>Movements</span></article>
        </div>
      </section>
      <section className="mobility-focus-panel">
        <span className="eyebrow">TODAY’S FOCUS</span>
        <div>{(flow.focusAreas?.length ? flow.focusAreas : ['Spine','Hips','Shoulders']).map((area) => <span key={area}>{area}</span>)}</div>
      </section>
      <section className="mobility-preview-list">
        {flow.movements.map((item, i) => (
          <article key={item.id}><span>{String(i + 1).padStart(2,'0')}</span>
            <div><strong>{item.name}</strong><small>{item.type === 'timed' ? `${savedDurations[item.id] ?? item.seconds ?? 30} sec` : `${item.target} reps`}{item.side ? ` · ${item.side}` : ''}</small></div>
          </article>
        ))}
      </section>
      <button className="gold-button machined mobility-begin" onClick={() => setMode('active')}>Begin Morning Mobility <ChevronRight size={18}/></button>
    </section>
  )

  if (mode === 'complete') return (
    <section className="mobility-completion-screen">
      <div className="mobility-completion-emblem"><Check size={30}/></div>
      <span className="eyebrow">MORNING MOBILITY COMPLETE</span>
      <h1>Reset complete.</h1>
      <p>You completed {flow.movements.length} movements across {flow.focusAreas?.join(', ') || 'your full body'}.</p>
      <div className="mobility-completion-grid">
        <article><strong>{minutes(estimatedSeconds)}</strong><span>Minutes</span></article>
        <article><strong>{flow.movements.length}</strong><span>Movements</span></article>
        <article><strong>100%</strong><span>Complete</span></article>
      </div>
      <button className="gold-button machined" onClick={onComplete}>Return Home <ChevronRight size={18}/></button>
    </section>
  )

  return (
    <section className="mobility-screen premium-mobility-flow">
      <header className="mobility-topbar"><button onClick={onClose}><ArrowLeft size={18}/> Exit</button><span>{index + 1} of {flow.movements.length}</span></header>
      <div className="mobility-progress-shell">
        <div className="mobility-progress-copy"><span>{flow.title}</span><strong>{Math.round(progress)}% complete</strong></div>
        <div className="mobility-progress"><div style={{ width: `${progress}%` }}/></div>
      </div>
      <div className="mobility-flow-heading"><span className="eyebrow">{flow.subtitle}</span><h1>{movement.name}</h1><p>{movement.purpose ?? movement.instruction}</p></div>

      <article className="movement-stage premium-movement-stage">
        <div className="movement-stage-meta"><span className="movement-number">{String(index + 1).padStart(2,'0')}</span>{movement.side && <div className="movement-side">{movement.side}</div>}</div>
        <MotionCardViewer movement={movement}/>
        <section className="mobility-cue-grid">
          <article><Target/><span>Purpose</span><strong>{movement.purpose ?? movement.targetArea ?? 'Improve comfortable movement quality.'}</strong></article>
          <article><Wind/><span>Breathing</span><strong>{movement.breathingCue ?? 'Use slow, relaxed breathing.'}</strong></article>
        </section>
        <section className="mobility-coaching-note"><span>Setup</span><p>{movement.setupCue ?? movement.instruction}</p></section>
        <section className="mobility-coaching-note warning"><span>Avoid</span><p>{movement.commonMistake ?? 'Do not force the range or move through pain.'}</p></section>

        {movement.type === 'timed' ? (
          <>
            <div className={`mobility-timer ${running ? 'running' : ''}`}><strong>{remaining}</strong><span>seconds</span></div>
            {!started && !finished && <div className="duration-adjuster"><button onClick={() => adjustDuration(-15)}>−15</button><span>{duration} sec</span><button onClick={() => adjustDuration(15)}>+15</button></div>}
            <div className="mobility-primary-actions">
              {!finished ? <button className="gold-button machined" onClick={() => { if (!started) setStarted(true); setRunning((v) => !v) }}>{running ? <Pause/> : <Play/>}{running ? 'Pause' : started ? 'Resume Timer' : 'Start Timer'}</button>
                : <button className="gold-button machined" onClick={next}><Check/>{index === flow.movements.length - 1 ? 'Finish Flow' : 'Next Movement'}</button>}
              {started && !finished && <button className="mobility-secondary-action" onClick={() => setRemaining((v) => v + 15)}><Plus/> 15 sec</button>}
            </div>
            {finished && <div className="mobility-finished-actions"><button onClick={() => { setRemaining(duration); setStarted(false); setFinished(false) }}><RotateCcw/> Repeat</button><button onClick={next}><ChevronRight/> Continue</button></div>}
          </>
        ) : (
          <>
            <div className="rep-target"><strong>{movement.target}</strong><span>reps{movement.side ? ` · ${movement.side}` : ''}</span></div>
            <button className="gold-button machined" onClick={next}><Check/>{index === flow.movements.length - 1 ? 'Finish Flow' : 'Complete Movement'}</button>
          </>
        )}
        {!finished && <button className="skip-movement" onClick={next}><SkipForward/> Skip movement</button>}
      </article>

      {transitioningTo && <div className="mobility-transition-overlay"><div><Check/><span className="eyebrow">MOVEMENT COMPLETE</span><h2>Next: {transitioningTo.name}</h2><p>{transitioningTo.targetArea ?? transitioningTo.tags?.slice(0,2).join(' · ')}</p></div></div>}
    </section>
  )
}

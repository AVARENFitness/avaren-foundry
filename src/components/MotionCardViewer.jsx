import { ChevronLeft, ChevronRight, Expand, Pause, Play, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const pathFor = (movement, index) =>
  `/motion/${movement.assetFolder ?? movement.id}/frame-${String(index + 1).padStart(2,'0')}.webp`

export default function MotionCardViewer({ movement }) {
  const frames = Math.max(0, Number(movement.assetFrames ?? 0))
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [available, setAvailable] = useState(frames > 0)
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  useEffect(() => { setIndex(0); setPlaying(false); setAvailable(frames > 0) }, [movement.id, frames])
  useEffect(() => {
    if (!playing || reduced || frames < 2 || !available) return
    const timer = window.setInterval(() => setIndex((v) => (v + 1) % frames), movement.frameDuration ?? 1200)
    return () => window.clearInterval(timer)
  }, [playing, reduced, frames, available, movement.frameDuration])

  const visual = (
    <section className="asset-motion-card">
      {available && frames > 0 ? (
        <>
          <div className="asset-motion-image-shell">
            <img key={`${movement.id}-${index}`} src={pathFor(movement,index)}
              alt={`${movement.name}, phase ${index + 1} of ${frames}`}
              onError={() => setAvailable(false)}/>
            <div className="asset-motion-phase"><span>Phase {index + 1} of {frames}</span><strong>{movement.phaseLabels?.[index] ?? movement.motionCue ?? 'Move with control'}</strong></div>
          </div>
          <div className="asset-motion-controls">
            <button onClick={() => { setPlaying(false); setIndex((v) => (v - 1 + frames) % frames) }}><ChevronLeft/></button>
            <button className="asset-motion-play" onClick={() => setPlaying((v) => !v)}>{playing ? <Pause/> : <Play/>}{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => { setPlaying(false); setIndex((v) => (v + 1) % frames) }}><ChevronRight/></button>
          </div>
          <div className="asset-motion-dots">{Array.from({length:frames},(_,i)=><button key={i} className={i===index?'active':''} onClick={()=>{setPlaying(false);setIndex(i)}} aria-label={`Show phase ${i+1}`}/>)}</div>
        </>
      ) : (
        <div className="asset-motion-pending">
          <span className="eyebrow">AVAREN MOTION CARD</span>
          <h3>Illustrated guide in production.</h3>
          <p>AVAREN will not show a generic or misleading pose here. Use the clear setup and movement cues while finished master-athlete artwork is added.</p>
          <div className="asset-motion-text-steps">
            {[movement.setupCue ?? 'Set a stable starting position.', movement.actionCue ?? movement.instruction, movement.breathingCue ?? 'Breathe slowly and naturally.'].map((text,i)=>
              <article key={i}><span>{i+1}</span><strong>{text}</strong></article>
            )}
          </div>
        </div>
      )}
    </section>
  )

  return <>
    <div className="motion-card-viewer">
      <header><div><span className="eyebrow">MOVEMENT GUIDE</span><strong>{movement.targetArea ?? movement.tags?.slice(0,2).join(' · ')}</strong></div>
      {available && <button onClick={()=>setExpanded(true)} aria-label="Enlarge movement guide"><Expand/></button>}</header>
      {visual}
    </div>
    {expanded && createPortal(
      <div className="asset-motion-expanded" onClick={()=>setExpanded(false)}>
        <section onClick={(e)=>e.stopPropagation()}><button className="asset-motion-close" onClick={()=>setExpanded(false)}><X/></button><span className="eyebrow">{movement.name}</span>{visual}</section>
      </div>, document.body
    )}
  </>
}

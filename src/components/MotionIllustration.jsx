import {
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const POINTS = {
  head: [100, 35],
  neck: [100, 52],
  shoulderLeft: [76, 65],
  shoulderRight: [124, 65],
  elbowLeft: [62, 94],
  elbowRight: [138, 94],
  handLeft: [54, 124],
  handRight: [146, 124],
  hipLeft: [85, 118],
  hipRight: [115, 118],
  kneeLeft: [82, 158],
  kneeRight: [118, 158],
  footLeft: [74, 194],
  footRight: [126, 194],
}

const line = (from, to, className = '') => (
  <line
    x1={from[0]}
    y1={from[1]}
    x2={to[0]}
    y2={to[1]}
    className={className}
  />
)

function StandingFigure({ pose = 'neutral' }) {
  const p = { ...POINTS }

  if (pose === 'arms-up') {
    p.elbowLeft = [72, 36]
    p.elbowRight = [128, 36]
    p.handLeft = [86, 14]
    p.handRight = [114, 14]
  }

  if (pose === 'cross-body') {
    p.elbowLeft = [104, 78]
    p.handLeft = [132, 70]
    p.elbowRight = [120, 90]
    p.handRight = [92, 84]
  }

  if (pose === 'quad') {
    p.kneeRight = [128, 158]
    p.footRight = [116, 132]
  }

  if (pose === 'hinge') {
    p.head = [133, 72]
    p.neck = [124, 78]
    p.shoulderLeft = [110, 86]
    p.shoulderRight = [132, 90]
    p.elbowLeft = [92, 110]
    p.elbowRight = [119, 118]
    p.handLeft = [77, 138]
    p.handRight = [105, 143]
  }

  return (
    <g className="motion-figure">
      <circle cx={p.head[0]} cy={p.head[1]} r="12" />
      {line(p.neck, [100, 112], 'motion-torso')}
      {line(p.shoulderLeft, p.shoulderRight)}
      {line(p.shoulderLeft, p.elbowLeft)}
      {line(p.elbowLeft, p.handLeft)}
      {line(p.shoulderRight, p.elbowRight)}
      {line(p.elbowRight, p.handRight)}
      {line(p.hipLeft, p.hipRight)}
      {line(p.hipLeft, p.kneeLeft)}
      {line(p.kneeLeft, p.footLeft)}
      {line(p.hipRight, p.kneeRight)}
      {line(p.kneeRight, p.footRight)}
    </g>
  )
}

function GroundFigure({ pose }) {
  if (pose === 'child') {
    return (
      <g className="motion-figure">
        <circle cx="62" cy="95" r="12" />
        {line([72, 98], [110, 112])}
        {line([110, 112], [138, 146])}
        {line([138, 146], [105, 166])}
        {line([105, 166], [70, 164])}
        {line([79, 102], [46, 132])}
        {line([46, 132], [22, 148])}
        {line([87, 105], [56, 140])}
        {line([56, 140], [34, 158])}
      </g>
    )
  }

  if (pose === 'quadruped') {
    return (
      <g className="motion-figure">
        <circle cx="54" cy="76" r="11" />
        <path d="M64 82 Q98 68 132 90" className="motion-spine" />
        {line([72, 84], [58, 124])}
        {line([58, 124], [44, 164])}
        {line([88, 82], [84, 126])}
        {line([84, 126], [76, 166])}
        {line([125, 90], [139, 128])}
        {line([139, 128], [151, 165])}
        {line([110, 86], [116, 126])}
        {line([116, 126], [124, 165])}
      </g>
    )
  }

  if (pose === 'prone') {
    return (
      <g className="motion-figure">
        <circle cx="48" cy="105" r="11" />
        <path d="M58 106 Q92 82 128 112" className="motion-spine" />
        {line([72, 101], [54, 140])}
        {line([54, 140], [42, 173])}
        {line([82, 98], [74, 141])}
        {line([74, 141], [66, 174])}
        {line([126, 112], [148, 145])}
        {line([148, 145], [164, 178])}
      </g>
    )
  }

  return <StandingFigure />
}

function MotionPose({ visual }) {
  switch (visual) {
    case 'spine-wave':
    case 'thread-reach':
      return <GroundFigure pose="quadruped" />
    case 'child-reach':
    case 'child-pose':
      return <GroundFigure pose="child" />
    case 'prone-press':
      return <GroundFigure pose="prone" />
    case 'overhead-reach':
    case 'wall-angel':
      return <StandingFigure pose="arms-up" />
    case 'cross-body':
      return <StandingFigure pose="cross-body" />
    case 'standing-balance':
      return <StandingFigure pose="quad" />
    case 'hinge-forward':
      return <StandingFigure pose="hinge" />
    default:
      return <StandingFigure />
  }
}

function DirectionArrow({ visual }) {
  const paths = {
    'neck-circle': 'M78 35 C82 8 121 8 125 35',
    'spine-wave': 'M70 54 C95 34 126 44 140 68',
    'lunge-rotate': 'M104 80 C140 68 154 42 142 22',
    'half-kneeling': 'M102 110 L135 110',
    'side-rotation': 'M90 76 C128 58 148 70 154 98',
    'deep-squat': 'M100 86 L100 142',
    'ankle-rock': 'M92 158 L120 148',
    'wall-turn': 'M122 72 C145 78 154 98 148 118',
    'thread-reach': 'M92 92 L45 126',
    'child-reach': 'M72 122 L30 148',
    'cross-body': 'M146 62 L102 78',
    'wall-angel': 'M78 72 L78 28',
    'overhead-reach': 'M122 68 L112 22',
    'wrist-extend': 'M140 112 L152 92',
    'wrist-flex': 'M140 112 L150 132',
    'standing-balance': 'M132 170 C142 150 132 132 116 126',
    'hinge-forward': 'M104 74 C130 86 140 110 132 132',
    'figure-four': 'M120 154 L96 132',
    'hip-switch': 'M72 144 C98 128 125 132 140 150',
    'calf-lean': 'M92 92 L120 92',
    'prone-press': 'M72 118 L72 80',
    'child-pose': 'M112 104 L82 134',
  }

  const d = paths[visual] ?? 'M82 102 L124 102'

  return (
    <path
      d={d}
      className="motion-direction"
      markerEnd="url(#motion-arrow-head)"
    />
  )
}

export default function MotionIllustration({
  movement,
}) {
  const [playing, setPlaying] = useState(true)
  const [replayKey, setReplayKey] = useState(0)

  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches ?? false,
    [],
  )

  useEffect(() => {
    if (reducedMotion) setPlaying(false)
  }, [reducedMotion])

  const visual = movement?.visual ?? 'general'

  return (
    <section className="motion-illustration-card">
      <header>
        <div>
          <span className="eyebrow">MOVEMENT GUIDE</span>
          <strong>{movement?.motionCue ?? 'Move with control'}</strong>
        </div>

        <div className="motion-controls">
          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? 'Pause visual' : 'Play visual'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={() => {
              setReplayKey((current) => current + 1)
              setPlaying(true)
            }}
            aria-label="Replay movement visual"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      <div
        key={replayKey}
        className={`motion-canvas motion-${visual} ${
          playing ? 'is-playing' : 'is-paused'
        }`}
      >
        <svg
          viewBox="0 0 200 215"
          role="img"
          aria-label={`${movement?.name} movement illustration`}
        >
          <defs>
            <marker
              id="motion-arrow-head"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>

          <ellipse
            cx="100"
            cy="199"
            rx="67"
            ry="7"
            className="motion-floor"
          />
          <MotionPose visual={visual} />
          <DirectionArrow visual={visual} />
          <circle
            cx="100"
            cy="102"
            r="46"
            className="motion-target-glow"
          />
        </svg>
      </div>

      <footer>
        <span>{movement?.targetArea ?? 'Full body'}</span>
        <small>
          Illustration shows the movement pattern, not a
          required range of motion.
        </small>
      </footer>
    </section>
  )
}

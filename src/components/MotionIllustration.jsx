import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const JOINTS = [
  'head',
  'neck',
  'shoulderA',
  'shoulderB',
  'elbowA',
  'elbowB',
  'handA',
  'handB',
  'spineTop',
  'spineMid',
  'pelvis',
  'hipA',
  'hipB',
  'kneeA',
  'kneeB',
  'ankleA',
  'ankleB',
  'footA',
  'footB',
]

const POSES = {
  standing: {
    head: [120, 34],
    neck: [120, 52],
    shoulderA: [96, 64],
    shoulderB: [144, 64],
    elbowA: [84, 96],
    elbowB: [156, 96],
    handA: [82, 130],
    handB: [158, 130],
    spineTop: [120, 64],
    spineMid: [120, 100],
    pelvis: [120, 126],
    hipA: [105, 128],
    hipB: [135, 128],
    kneeA: [103, 169],
    kneeB: [137, 169],
    ankleA: [100, 209],
    ankleB: [140, 209],
    footA: [92, 214],
    footB: [150, 214],
  },
  squat: {
    head: [120, 55],
    neck: [120, 72],
    shoulderA: [96, 83],
    shoulderB: [144, 83],
    elbowA: [91, 113],
    elbowB: [149, 113],
    handA: [106, 132],
    handB: [134, 132],
    spineTop: [120, 82],
    spineMid: [120, 113],
    pelvis: [120, 146],
    hipA: [101, 146],
    hipB: [139, 146],
    kneeA: [78, 176],
    kneeB: [162, 176],
    ankleA: [84, 208],
    ankleB: [156, 208],
    footA: [72, 215],
    footB: [168, 215],
  },
  kneeling: {
    head: [108, 42],
    neck: [108, 58],
    shoulderA: [87, 70],
    shoulderB: [129, 70],
    elbowA: [80, 102],
    elbowB: [136, 100],
    handA: [84, 130],
    handB: [137, 129],
    spineTop: [108, 69],
    spineMid: [110, 104],
    pelvis: [112, 137],
    hipA: [100, 139],
    hipB: [124, 139],
    kneeA: [82, 172],
    kneeB: [142, 174],
    ankleA: [66, 204],
    ankleB: [157, 205],
    footA: [54, 210],
    footB: [169, 210],
  },
  lunge: {
    head: [108, 38],
    neck: [108, 56],
    shoulderA: [87, 68],
    shoulderB: [129, 68],
    elbowA: [77, 99],
    elbowB: [141, 42],
    handA: [76, 131],
    handB: [150, 18],
    spineTop: [108, 67],
    spineMid: [110, 101],
    pelvis: [112, 135],
    hipA: [100, 137],
    hipB: [124, 137],
    kneeA: [80, 169],
    kneeB: [153, 164],
    ankleA: [72, 207],
    ankleB: [180, 198],
    footA: [61, 214],
    footB: [192, 204],
  },
  quadrupedNeutral: {
    head: [57, 84],
    neck: [72, 89],
    shoulderA: [84, 91],
    shoulderB: [91, 94],
    elbowA: [77, 128],
    elbowB: [91, 130],
    handA: [68, 168],
    handB: [86, 169],
    spineTop: [91, 92],
    spineMid: [127, 96],
    pelvis: [157, 111],
    hipA: [147, 113],
    hipB: [163, 115],
    kneeA: [146, 153],
    kneeB: [169, 155],
    ankleA: [136, 194],
    ankleB: [171, 195],
    footA: [126, 203],
    footB: [181, 202],
  },
  quadrupedRound: {
    head: [64, 106],
    neck: [78, 104],
    shoulderA: [88, 101],
    shoulderB: [96, 102],
    elbowA: [79, 133],
    elbowB: [93, 135],
    handA: [70, 169],
    handB: [88, 170],
    spineTop: [96, 100],
    spineMid: [128, 74],
    pelvis: [158, 105],
    hipA: [149, 109],
    hipB: [165, 111],
    kneeA: [146, 153],
    kneeB: [169, 155],
    ankleA: [136, 194],
    ankleB: [171, 195],
    footA: [126, 203],
    footB: [181, 202],
  },
  sideLyingClosed: {
    head: [62, 104],
    neck: [77, 108],
    shoulderA: [89, 112],
    shoulderB: [95, 116],
    elbowA: [110, 124],
    elbowB: [115, 130],
    handA: [138, 129],
    handB: [142, 136],
    spineTop: [96, 114],
    spineMid: [126, 125],
    pelvis: [154, 139],
    hipA: [148, 142],
    hipB: [160, 145],
    kneeA: [142, 169],
    kneeB: [159, 171],
    ankleA: [122, 192],
    ankleB: [144, 198],
    footA: [109, 198],
    footB: [158, 201],
  },
  sideLyingOpen: {
    head: [62, 104],
    neck: [77, 108],
    shoulderA: [89, 112],
    shoulderB: [101, 92],
    elbowA: [110, 124],
    elbowB: [123, 58],
    handA: [138, 129],
    handB: [146, 26],
    spineTop: [96, 114],
    spineMid: [126, 125],
    pelvis: [154, 139],
    hipA: [148, 142],
    hipB: [160, 145],
    kneeA: [142, 169],
    kneeB: [159, 171],
    ankleA: [122, 192],
    ankleB: [144, 198],
    footA: [109, 198],
    footB: [158, 201],
  },
  childPose: {
    head: [69, 112],
    neck: [83, 116],
    shoulderA: [95, 119],
    shoulderB: [100, 123],
    elbowA: [66, 145],
    elbowB: [73, 151],
    handA: [35, 170],
    handB: [47, 178],
    spineTop: [101, 122],
    spineMid: [133, 130],
    pelvis: [164, 151],
    hipA: [155, 153],
    hipB: [169, 156],
    kneeA: [134, 181],
    kneeB: [153, 187],
    ankleA: [101, 197],
    ankleB: [129, 204],
    footA: [86, 201],
    footB: [145, 207],
  },
  figureFour: {
    head: [120, 42],
    neck: [120, 58],
    shoulderA: [97, 70],
    shoulderB: [143, 70],
    elbowA: [89, 102],
    elbowB: [151, 102],
    handA: [96, 132],
    handB: [144, 132],
    spineTop: [120, 70],
    spineMid: [120, 105],
    pelvis: [120, 139],
    hipA: [104, 141],
    hipB: [136, 141],
    kneeA: [90, 174],
    kneeB: [145, 160],
    ankleA: [88, 209],
    ankleB: [111, 176],
    footA: [77, 214],
    footB: [99, 180],
  },
  quadStretch: {
    head: [115, 39],
    neck: [115, 56],
    shoulderA: [92, 68],
    shoulderB: [138, 68],
    elbowA: [88, 100],
    elbowB: [143, 102],
    handA: [89, 132],
    handB: [139, 140],
    spineTop: [115, 68],
    spineMid: [115, 104],
    pelvis: [115, 137],
    hipA: [102, 139],
    hipB: [128, 139],
    kneeA: [101, 175],
    kneeB: [139, 164],
    ankleA: [99, 210],
    ankleB: [127, 141],
    footA: [89, 215],
    footB: [118, 137],
  },
}

const MOVEMENT_POSES = {
  'spine-wave': ['quadrupedNeutral', 'quadrupedRound'],
  'lunge-rotate': ['kneeling', 'lunge'],
  'half-kneeling': ['kneeling', 'lunge'],
  'side-rotation': ['sideLyingClosed', 'sideLyingOpen'],
  'deep-squat': ['standing', 'squat'],
  'ankle-rock': ['standing', 'lunge'],
  'wall-turn': ['standing', 'lunge'],
  'thread-reach': ['quadrupedNeutral', 'quadrupedRound'],
  'child-reach': ['childPose', 'childPose'],
  'hip-switch': ['figureFour', 'squat'],
  'figure-four': ['standing', 'figureFour'],
  'standing-balance': ['standing', 'quadStretch'],
}

const HIGHLIGHTS = {
  spine: [122, 100, 22],
  core: [120, 111, 24],
  hips: [120, 142, 28],
  hip: [120, 142, 28],
  'hip-flexor': [125, 137, 24],
  quad: [135, 166, 26],
  thoracic: [118, 93, 27],
  shoulder: [139, 70, 22],
  'rear-shoulder': [141, 74, 22],
  ankles: [120, 203, 20],
  ankle: [120, 203, 20],
  calf: [139, 185, 22],
  chest: [120, 80, 26],
  lat: [102, 105, 28],
  back: [120, 105, 30],
  glute: [131, 145, 26],
  glutes: [131, 145, 26],
}

const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
]

const interpolatePose = (start, end, t) =>
  Object.fromEntries(
    JOINTS.map((joint) => [
      joint,
      lerp(start[joint], end[joint], t),
    ]),
  )

const segment = (a, b, className = '') => (
  <line
    x1={a[0]}
    y1={a[1]}
    x2={b[0]}
    y2={b[1]}
    className={className}
  />
)

function AthleticFigure({ pose, side }) {
  const flip =
    side === 'left'
      ? 'translate(240 0) scale(-1 1)'
      : undefined

  return (
    <g className="motion2-figure" transform={flip}>
      <circle
        cx={pose.head[0]}
        cy={pose.head[1]}
        r="13"
        className="motion2-head"
      />

      <path
        d={`M ${pose.neck[0]} ${pose.neck[1]}
            Q ${pose.spineTop[0]} ${pose.spineTop[1]}
              ${pose.spineMid[0]} ${pose.spineMid[1]}
            Q ${pose.spineMid[0]} ${pose.spineMid[1]}
              ${pose.pelvis[0]} ${pose.pelvis[1]}`}
        className="motion2-spine"
      />

      {segment(pose.shoulderA, pose.shoulderB, 'motion2-shoulders')}
      {segment(pose.shoulderA, pose.elbowA)}
      {segment(pose.elbowA, pose.handA)}
      {segment(pose.shoulderB, pose.elbowB)}
      {segment(pose.elbowB, pose.handB)}
      {segment(pose.hipA, pose.hipB, 'motion2-pelvis')}
      {segment(pose.hipA, pose.kneeA)}
      {segment(pose.kneeA, pose.ankleA)}
      {segment(pose.ankleA, pose.footA)}
      {segment(pose.hipB, pose.kneeB)}
      {segment(pose.kneeB, pose.ankleB)}
      {segment(pose.ankleB, pose.footB)}

      {[
        pose.shoulderA,
        pose.shoulderB,
        pose.elbowA,
        pose.elbowB,
        pose.hipA,
        pose.hipB,
        pose.kneeA,
        pose.kneeB,
      ].map((joint, index) => (
        <circle
          key={index}
          cx={joint[0]}
          cy={joint[1]}
          r="4"
          className="motion2-joint"
        />
      ))}
    </g>
  )
}

function MuscleHighlights({ movement, side }) {
  const flip =
    side === 'left'
      ? 'translate(240 0) scale(-1 1)'
      : undefined

  return (
    <g transform={flip}>
      {(movement?.muscles ?? []).map((muscle) => {
        const highlight = HIGHLIGHTS[muscle]
        if (!highlight) return null

        return (
          <circle
            key={muscle}
            cx={highlight[0]}
            cy={highlight[1]}
            r={highlight[2]}
            className="motion2-muscle"
          />
        )
      })}
    </g>
  )
}

export default function MotionIllustration({
  movement,
}) {
  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches ?? false,
    [],
  )

  const [playing, setPlaying] = useState(!reducedMotion)
  const [side, setSide] = useState('right')
  const [phase, setPhase] = useState(0)
  const [replayKey, setReplayKey] = useState(0)

  const visual = movement?.visual ?? 'general'
  const [startKey, endKey] =
    MOVEMENT_POSES[visual] ?? ['standing', 'standing']
  const startPose = POSES[startKey]
  const endPose = POSES[endKey]

  useEffect(() => {
    if (!playing || reducedMotion) return

    let frame
    let startedAt

    const tick = (time) => {
      startedAt ??= time
      const elapsed = (time - startedAt) / 2600
      const wave =
        (Math.sin(elapsed * Math.PI * 2 - Math.PI / 2) + 1) /
        2
      setPhase(wave)
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [playing, reducedMotion, replayKey])

  const pose = interpolatePose(
    startPose,
    endPose,
    playing ? phase : 0,
  )

  return (
    <section className="motion2-card">
      <header>
        <div>
          <span className="eyebrow">AVAREN MOTION</span>
          <strong>{movement?.motionCue ?? 'Move with control'}</strong>
        </div>

        <div className="motion2-controls">
          <button
            onClick={() =>
              setSide((current) =>
                current === 'right' ? 'left' : 'right',
              )
            }
            aria-label="Switch movement side"
          >
            {side === 'right' ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>

          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? 'Pause motion' : 'Play motion'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            onClick={() => {
              setReplayKey((current) => current + 1)
              setPhase(0)
              setPlaying(true)
            }}
            aria-label="Replay movement"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </header>

      <div
        key={replayKey}
        className={`motion2-stage ${
          playing ? 'is-playing' : 'is-paused'
        }`}
      >
        <div className="motion2-frame-label start">
          Start
        </div>
        <div className="motion2-frame-label finish">
          Finish
        </div>

        <svg
          viewBox="0 0 240 230"
          role="img"
          aria-label={`${movement?.name} movement guide`}
        >
          <defs>
            <radialGradient id="motion2-muscle-gradient">
              <stop offset="0%" stopColor="#e7c97f" stopOpacity=".42" />
              <stop offset="100%" stopColor="#e7c97f" stopOpacity="0" />
            </radialGradient>
          </defs>

          <ellipse
            cx="120"
            cy="218"
            rx="78"
            ry="7"
            className="motion2-floor"
          />

          <MuscleHighlights movement={movement} side={side} />
          <AthleticFigure pose={pose} side={side} />

          <path
            d="M 58 188 C 86 162 118 154 168 134"
            className="motion2-trail"
          />
        </svg>

        {!playing && (
          <div className="motion2-static-steps">
            <div>
              <span>1</span>
              <small>Set the start position</small>
            </div>
            <div>
              <span>2</span>
              <small>Move with control</small>
            </div>
            <div>
              <span>3</span>
              <small>Return smoothly</small>
            </div>
          </div>
        )}
      </div>

      <div className="motion2-details">
        <article>
          <span>Target</span>
          <strong>{movement?.targetArea ?? 'Full body'}</strong>
        </article>
        <article>
          <span>Breathing</span>
          <strong>
            {movement?.breathingCue ?? 'Breathe naturally'}
          </strong>
        </article>
        <article>
          <span>Tempo</span>
          <strong>
            {movement?.tempoCue ?? 'Slow and controlled'}
          </strong>
        </article>
        <article>
          <span>Range</span>
          <strong>
            {movement?.rangeCue ?? 'Use a comfortable range'}
          </strong>
        </article>
      </div>

      <div className="motion2-warning">
        <span>Common mistake</span>
        <p>
          {movement?.commonMistake ??
            'Avoid forcing the movement or rushing the transition.'}
        </p>
      </div>
    </section>
  )
}

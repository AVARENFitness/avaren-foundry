import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

const BASE_POSES = {
  standing: {
    head: [120, 34],
    neck: [120, 54],
    shoulderL: [98, 69],
    shoulderR: [142, 69],
    elbowL: [88, 104],
    elbowR: [152, 104],
    handL: [85, 137],
    handR: [155, 137],
    chest: [120, 88],
    waist: [120, 122],
    hipL: [107, 137],
    hipR: [133, 137],
    kneeL: [104, 178],
    kneeR: [136, 178],
    ankleL: [102, 214],
    ankleR: [138, 214],
    footL: [92, 219],
    footR: [149, 219],
  },
  quadruped: {
    head: [58, 91],
    neck: [76, 96],
    shoulderL: [88, 100],
    shoulderR: [99, 103],
    elbowL: [79, 136],
    elbowR: [94, 139],
    handL: [70, 177],
    handR: [88, 178],
    chest: [116, 103],
    waist: [143, 111],
    hipL: [154, 119],
    hipR: [168, 121],
    kneeL: [148, 160],
    kneeR: [171, 162],
    ankleL: [137, 201],
    ankleR: [173, 202],
    footL: [125, 208],
    footR: [184, 208],
  },
  kneeling: {
    head: [108, 37],
    neck: [108, 57],
    shoulderL: [88, 71],
    shoulderR: [128, 71],
    elbowL: [81, 105],
    elbowR: [136, 104],
    handL: [84, 138],
    handR: [137, 137],
    chest: [108, 89],
    waist: [111, 123],
    hipL: [100, 138],
    hipR: [124, 138],
    kneeL: [82, 175],
    kneeR: [143, 177],
    ankleL: [65, 210],
    ankleR: [159, 210],
    footL: [53, 215],
    footR: [171, 215],
  },
  lying: {
    head: [60, 107],
    neck: [78, 111],
    shoulderL: [90, 116],
    shoulderR: [100, 120],
    elbowL: [113, 129],
    elbowR: [117, 134],
    handL: [142, 135],
    handR: [146, 141],
    chest: [119, 126],
    waist: [146, 137],
    hipL: [155, 145],
    hipR: [167, 148],
    kneeL: [146, 175],
    kneeR: [162, 178],
    ankleL: [123, 201],
    ankleR: [145, 206],
    footL: [108, 207],
    footR: [160, 209],
  },
  seated: {
    head: [120, 38],
    neck: [120, 58],
    shoulderL: [98, 72],
    shoulderR: [142, 72],
    elbowL: [90, 105],
    elbowR: [150, 105],
    handL: [95, 138],
    handR: [145, 138],
    chest: [120, 90],
    waist: [120, 124],
    hipL: [106, 141],
    hipR: [134, 141],
    kneeL: [87, 173],
    kneeR: [153, 173],
    ankleL: [64, 201],
    ankleR: [176, 201],
    footL: [51, 207],
    footR: [189, 207],
  },
}

const FRAME_LIBRARY = {
  'neck-neutral': { base: 'standing', label: 'Neutral' },
  'neck-left': {
    base: 'standing',
    label: 'Tilt left',
    head: [110, 39],
    neck: [116, 56],
  },
  'neck-down': {
    base: 'standing',
    label: 'Chin down',
    head: [120, 45],
    neck: [120, 58],
  },
  'neck-right': {
    base: 'standing',
    label: 'Tilt right',
    head: [130, 39],
    neck: [124, 56],
  },
  'neck-up': {
    base: 'standing',
    label: 'Look up',
    head: [120, 27],
    neck: [120, 51],
  },

  'quad-neutral': { base: 'quadruped', label: 'Neutral spine' },
  'cat-round': {
    base: 'quadruped',
    label: 'Round',
    head: [66, 109],
    neck: [81, 107],
    chest: [117, 91],
    waist: [143, 87],
    hipL: [154, 112],
    hipR: [168, 114],
  },
  'cow-extend': {
    base: 'quadruped',
    label: 'Extend',
    head: [55, 78],
    neck: [75, 91],
    chest: [116, 111],
    waist: [143, 121],
  },

  'lunge-base': { base: 'kneeling', label: 'Lunge set' },
  'lunge-reach': {
    base: 'kneeling',
    label: 'Reach',
    elbowR: [141, 48],
    handR: [151, 17],
  },
  'lunge-rotate': {
    base: 'kneeling',
    label: 'Rotate',
    shoulderR: [136, 62],
    elbowR: [151, 38],
    handR: [162, 12],
    chest: [113, 86],
  },

  'half-kneel-neutral': { base: 'kneeling', label: 'Neutral' },
  'half-kneel-tuck': {
    base: 'kneeling',
    label: 'Tuck pelvis',
    waist: [108, 126],
    hipL: [98, 141],
    hipR: [122, 141],
  },
  'half-kneel-shift': {
    base: 'kneeling',
    label: 'Shift forward',
    head: [116, 37],
    neck: [116, 57],
    shoulderL: [96, 71],
    shoulderR: [136, 71],
    chest: [116, 89],
    waist: [119, 123],
    hipL: [108, 138],
    hipR: [132, 138],
  },

  'open-book-closed': { base: 'lying', label: 'Closed' },
  'open-book-half': {
    base: 'lying',
    label: 'Half open',
    shoulderR: [101, 102],
    elbowR: [121, 79],
    handR: [142, 58],
  },
  'open-book-open': {
    base: 'lying',
    label: 'Open',
    shoulderR: [102, 92],
    elbowR: [126, 58],
    handR: [151, 25],
  },

  'squat-stand': { base: 'standing', label: 'Stand' },
  'squat-bottom': {
    base: 'standing',
    label: 'Bottom',
    head: [120, 58],
    neck: [120, 77],
    shoulderL: [99, 90],
    shoulderR: [141, 90],
    chest: [120, 106],
    waist: [120, 140],
    hipL: [102, 151],
    hipR: [138, 151],
    kneeL: [79, 181],
    kneeR: [161, 181],
    ankleL: [84, 214],
    ankleR: [156, 214],
    footL: [72, 219],
    footR: [168, 219],
  },
  'squat-shift': {
    base: 'standing',
    label: 'Shift left',
    head: [112, 59],
    neck: [112, 78],
    shoulderL: [91, 91],
    shoulderR: [133, 91],
    chest: [112, 107],
    waist: [112, 141],
    hipL: [94, 152],
    hipR: [130, 152],
    kneeL: [72, 182],
    kneeR: [153, 180],
    ankleL: [78, 214],
    ankleR: [151, 214],
    footL: [67, 219],
    footR: [163, 219],
  },

  'ankle-start': { base: 'standing', label: 'Heel down' },
  'ankle-mid': {
    base: 'standing',
    label: 'Knee forward',
    kneeR: [147, 177],
    ankleR: [154, 214],
    footR: [166, 219],
  },
  'ankle-wall': {
    base: 'standing',
    label: 'Touch wall',
    kneeR: [158, 176],
    ankleR: [165, 214],
    footR: [177, 219],
  },

  'pec-wall-set': {
    base: 'standing',
    label: 'Arm on wall',
    elbowR: [168, 88],
    handR: [190, 88],
  },
  'pec-turn-half': {
    base: 'standing',
    label: 'Turn halfway',
    head: [112, 34],
    neck: [112, 54],
    shoulderL: [90, 69],
    shoulderR: [134, 69],
    chest: [112, 88],
    waist: [112, 122],
    elbowR: [168, 88],
    handR: [190, 88],
  },
  'pec-turn-open': {
    base: 'standing',
    label: 'Turn away',
    head: [103, 34],
    neck: [103, 54],
    shoulderL: [81, 69],
    shoulderR: [125, 69],
    chest: [103, 88],
    waist: [103, 122],
    elbowR: [168, 88],
    handR: [190, 88],
  },

  'thread-start': { base: 'quadruped', label: 'All fours' },
  'thread-under': {
    base: 'quadruped',
    label: 'Reach under',
    shoulderR: [105, 116],
    elbowR: [130, 130],
    handR: [158, 140],
  },
  'thread-open': {
    base: 'quadruped',
    label: 'Open',
    shoulderR: [104, 93],
    elbowR: [127, 61],
    handR: [149, 30],
  },

  'child-center': {
    base: 'quadruped',
    label: 'Sit back',
    chest: [124, 120],
    waist: [150, 135],
    hipL: [160, 151],
    hipR: [173, 153],
    kneeL: [138, 181],
    kneeR: [157, 186],
    ankleL: [103, 204],
    ankleR: [130, 210],
  },
  'child-side': {
    base: 'quadruped',
    label: 'Walk hands',
    shoulderL: [86, 111],
    shoulderR: [96, 114],
    elbowL: [64, 141],
    elbowR: [75, 146],
    handL: [38, 167],
    handR: [49, 174],
    chest: [126, 121],
    waist: [151, 136],
    hipL: [161, 151],
    hipR: [174, 153],
  },
  'child-reach': {
    base: 'quadruped',
    label: 'Reach long',
    shoulderL: [78, 111],
    shoulderR: [88, 114],
    elbowL: [54, 141],
    elbowR: [65, 146],
    handL: [27, 167],
    handR: [38, 174],
    chest: [132, 121],
    waist: [157, 136],
    hipL: [167, 151],
    hipR: [180, 153],
  },

  'ninety-left': { base: 'seated', label: 'Left' },
  'ninety-center': {
    base: 'seated',
    label: 'Center',
    kneeL: [102, 176],
    kneeR: [138, 176],
    ankleL: [88, 204],
    ankleR: [152, 204],
    footL: [76, 210],
    footR: [164, 210],
  },
  'ninety-right': {
    base: 'seated',
    label: 'Right',
    kneeL: [153, 173],
    kneeR: [87, 173],
    ankleL: [176, 201],
    ankleR: [64, 201],
    footL: [189, 207],
    footR: [51, 207],
  },

  'figure-stand': { base: 'standing', label: 'Stand' },
  'figure-cross': {
    base: 'standing',
    label: 'Cross ankle',
    kneeR: [147, 163],
    ankleR: [120, 177],
    footR: [108, 181],
  },
  'figure-sit': {
    base: 'standing',
    label: 'Sit back',
    head: [117, 55],
    neck: [117, 74],
    shoulderL: [96, 87],
    shoulderR: [138, 87],
    chest: [117, 104],
    waist: [117, 138],
    hipL: [102, 150],
    hipR: [132, 150],
    kneeL: [101, 186],
    ankleL: [99, 216],
    footL: [89, 220],
    kneeR: [145, 164],
    ankleR: [118, 181],
    footR: [106, 185],
  },

  'quad-stand': { base: 'standing', label: 'Stand tall' },
  'quad-catch': {
    base: 'standing',
    label: 'Catch ankle',
    kneeR: [145, 166],
    ankleR: [129, 142],
    footR: [118, 138],
    elbowR: [143, 112],
    handR: [131, 142],
  },
  'quad-tuck': {
    base: 'standing',
    label: 'Tuck pelvis',
    waist: [116, 124],
    hipL: [103, 139],
    hipR: [129, 139],
    kneeR: [144, 165],
    ankleR: [128, 141],
    footR: [117, 137],
    elbowR: [142, 111],
    handR: [130, 141],
  },
}

const point = (pose, key) => pose[key]

const mergeFrame = (frameKey) => {
  const frame = FRAME_LIBRARY[frameKey] ?? {
    base: 'standing',
    label: 'Position',
  }

  return {
    ...BASE_POSES[frame.base],
    ...frame,
  }
}

const quad = (a, b, c, d) =>
  `M${a[0]} ${a[1]} L${b[0]} ${b[1]} L${c[0]} ${c[1]} L${d[0]} ${d[1]} Z`

function Limb({
  from,
  joint,
  to,
  width = 13,
}) {
  return (
    <>
      <path
        d={`M${from[0]} ${from[1]} Q${joint[0]} ${joint[1]} ${to[0]} ${to[1]}`}
        className="illustrated-limb"
        style={{ strokeWidth: width }}
      />
      <circle
        cx={joint[0]}
        cy={joint[1]}
        r={width * 0.52}
        className="illustrated-joint"
      />
    </>
  )
}

function IllustratedCharacter({
  frameKey,
  side,
  movement,
}) {
  const pose = mergeFrame(frameKey)
  const flip =
    side === 'left'
      ? 'translate(240 0) scale(-1 1)'
      : undefined

  const shoulderL = point(pose, 'shoulderL')
  const shoulderR = point(pose, 'shoulderR')
  const hipL = point(pose, 'hipL')
  const hipR = point(pose, 'hipR')
  const chest = point(pose, 'chest')
  const waist = point(pose, 'waist')

  const torsoLeft = [
    shoulderL[0] - 3,
    shoulderL[1] + 2,
  ]
  const torsoRight = [
    shoulderR[0] + 3,
    shoulderR[1] + 2,
  ]
  const pelvisRight = [hipR[0] + 4, hipR[1] + 4]
  const pelvisLeft = [hipL[0] - 4, hipL[1] + 4]

  return (
    <g transform={flip}>
      <g className="illustrated-character">
        <path
          d={quad(
            torsoLeft,
            torsoRight,
            pelvisRight,
            pelvisLeft,
          )}
          className="illustrated-torso"
        />

        <ellipse
          cx={chest[0]}
          cy={chest[1]}
          rx="24"
          ry="29"
          className="illustrated-chest"
        />

        <ellipse
          cx={waist[0]}
          cy={waist[1]}
          rx="18"
          ry="23"
          className="illustrated-waist"
        />

        <ellipse
          cx={(hipL[0] + hipR[0]) / 2}
          cy={(hipL[1] + hipR[1]) / 2 + 4}
          rx="21"
          ry="15"
          className="illustrated-pelvis"
        />

        <rect
          x={pose.neck[0] - 7}
          y={pose.neck[1] - 10}
          width="14"
          height="21"
          rx="7"
          className="illustrated-neck"
        />

        <ellipse
          cx={pose.head[0]}
          cy={pose.head[1]}
          rx="15"
          ry="18"
          className="illustrated-head"
        />

        <Limb
          from={shoulderL}
          joint={pose.elbowL}
          to={pose.handL}
          width={13}
        />
        <Limb
          from={shoulderR}
          joint={pose.elbowR}
          to={pose.handR}
          width={13}
        />
        <Limb
          from={hipL}
          joint={pose.kneeL}
          to={pose.ankleL}
          width={17}
        />
        <Limb
          from={hipR}
          joint={pose.kneeR}
          to={pose.ankleR}
          width={17}
        />

        <ellipse
          cx={pose.handL[0]}
          cy={pose.handL[1]}
          rx="7"
          ry="9"
          className="illustrated-hand"
        />
        <ellipse
          cx={pose.handR[0]}
          cy={pose.handR[1]}
          rx="7"
          ry="9"
          className="illustrated-hand"
        />

        <path
          d={`M${pose.ankleL[0]} ${pose.ankleL[1]}
              Q${pose.footL[0] - 5} ${pose.footL[1] - 2}
              ${pose.footL[0] + 8} ${pose.footL[1] + 1}`}
          className="illustrated-foot"
        />
        <path
          d={`M${pose.ankleR[0]} ${pose.ankleR[1]}
              Q${pose.footR[0] - 5} ${pose.footR[1] - 2}
              ${pose.footR[0] + 8} ${pose.footR[1] + 1}`}
          className="illustrated-foot"
        />

        <circle
          cx={shoulderL[0]}
          cy={shoulderL[1]}
          r="7"
          className="illustrated-joint shoulder"
        />
        <circle
          cx={shoulderR[0]}
          cy={shoulderR[1]}
          r="7"
          className="illustrated-joint shoulder"
        />
        <circle
          cx={hipL[0]}
          cy={hipL[1]}
          r="8"
          className="illustrated-joint hip"
        />
        <circle
          cx={hipR[0]}
          cy={hipR[1]}
          r="8"
          className="illustrated-joint hip"
        />
      </g>

      <MuscleLayer
        movement={movement}
        pose={pose}
      />
    </g>
  )
}

function MuscleLayer({ movement, pose }) {
  const regions = {
    neck: [pose.neck[0], pose.neck[1], 13, 13],
    spine: [pose.chest[0], pose.waist[1], 18, 35],
    core: [pose.waist[0], pose.waist[1], 18, 23],
    hips: [
      (pose.hipL[0] + pose.hipR[0]) / 2,
      (pose.hipL[1] + pose.hipR[1]) / 2,
      22,
      15,
    ],
    hip: [
      (pose.hipL[0] + pose.hipR[0]) / 2,
      (pose.hipL[1] + pose.hipR[1]) / 2,
      22,
      15,
    ],
    'hip-flexor': [pose.hipR[0], pose.hipR[1], 13, 17],
    quad: [
      (pose.hipR[0] + pose.kneeR[0]) / 2,
      (pose.hipR[1] + pose.kneeR[1]) / 2,
      12,
      22,
    ],
    thoracic: [pose.chest[0], pose.chest[1], 23, 23],
    shoulder: [pose.shoulderR[0], pose.shoulderR[1], 12, 12],
    'rear-shoulder': [pose.shoulderR[0], pose.shoulderR[1], 12, 12],
    ankle: [pose.ankleR[0], pose.ankleR[1], 10, 9],
    ankles: [
      (pose.ankleL[0] + pose.ankleR[0]) / 2,
      (pose.ankleL[1] + pose.ankleR[1]) / 2,
      20,
      9,
    ],
    calf: [
      (pose.kneeR[0] + pose.ankleR[0]) / 2,
      (pose.kneeR[1] + pose.ankleR[1]) / 2,
      11,
      21,
    ],
    chest: [pose.chest[0], pose.chest[1], 24, 20],
    lat: [pose.chest[0] - 13, pose.chest[1] + 12, 12, 25],
    back: [pose.chest[0], pose.waist[1], 24, 36],
    glute: [pose.hipR[0], pose.hipR[1], 15, 14],
    glutes: [
      (pose.hipL[0] + pose.hipR[0]) / 2,
      (pose.hipL[1] + pose.hipR[1]) / 2,
      22,
      14,
    ],
  }

  return (
    <g className="illustrated-muscle-layer">
      {(movement?.muscles ?? []).map((muscle) => {
        const region = regions[muscle]
        if (!region) return null

        return (
          <ellipse
            key={muscle}
            cx={region[0]}
            cy={region[1]}
            rx={region[2]}
            ry={region[3]}
            className="illustrated-muscle"
          />
        )
      })}
    </g>
  )
}

function Landmark({ type }) {
  if (type === 'wall') {
    return (
      <g className="illustrated-landmark">
        <line x1="195" y1="24" x2="195" y2="220" />
        <line x1="201" y1="24" x2="201" y2="220" />
        <text x="178" y="18">WALL</text>
      </g>
    )
  }

  return (
    <g className="illustrated-landmark">
      <line x1="22" y1="220" x2="218" y2="220" />
      <text x="26" y="213">FLOOR</text>
    </g>
  )
}

function StudioFrame({
  movement,
  frameKey,
  side,
  selected,
  onSelect,
}) {
  const frame = mergeFrame(frameKey)

  return (
    <button
      className={`studio-frame-card ${
        selected ? 'selected' : ''
      }`}
      onClick={onSelect}
    >
      <span>{frame.label}</span>
      <svg viewBox="0 0 240 230">
        <Landmark type={movement.landmark} />
        <IllustratedCharacter
          frameKey={frameKey}
          side={side}
          movement={movement}
        />
      </svg>
    </button>
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

  const frames =
    movement?.studioFrames?.length
      ? movement.studioFrames
      : ['neck-neutral']

  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(!reducedMotion)
  const [speed, setSpeed] = useState(1)
  const [side, setSide] = useState('right')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setFrameIndex(0)
  }, [movement?.id])

  useEffect(() => {
    if (!playing || reducedMotion || frames.length < 2) {
      return
    }

    const interval = window.setInterval(() => {
      setFrameIndex(
        (current) => (current + 1) % frames.length,
      )
    }, 1500 / speed)

    return () => window.clearInterval(interval)
  }, [playing, reducedMotion, speed, frames.length])

  const currentKey = frames[frameIndex]
  const currentFrame = mergeFrame(currentKey)

  const stage = (
    <div className="studio-main-stage">
      <div className="studio-stage-label">
        <span>Phase {frameIndex + 1}</span>
        <strong>{currentFrame.label}</strong>
      </div>

      <svg
        viewBox="0 0 240 230"
        role="img"
        aria-label={`${movement.name}: ${currentFrame.label}`}
      >
        <Landmark type={movement.landmark} />
        <IllustratedCharacter
          frameKey={currentKey}
          side={side}
          movement={movement}
        />
      </svg>

      <div className="studio-phase-dots">
        {frames.map((frame, index) => (
          <button
            key={frame}
            className={
              index === frameIndex ? 'active' : ''
            }
            onClick={() => {
              setPlaying(false)
              setFrameIndex(index)
            }}
            aria-label={`Show phase ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )

  return (
    <section className="motion-studio-card">
      <header>
        <div>
          <span className="eyebrow">
            AVAREN MOTION STUDIO
          </span>
          <strong>
            {movement?.motionCue ?? 'Move with control'}
          </strong>
        </div>

        <div className="studio-controls">
          {movement?.side && (
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
          )}

          <button
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? 'Pause motion' : 'Play motion'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <button
            onClick={() => {
              setFrameIndex(0)
              setPlaying(true)
            }}
            aria-label="Replay motion"
          >
            <RotateCcw size={16} />
          </button>

          <button
            onClick={() => setExpanded(true)}
            aria-label="Enlarge movement guide"
          >
            <Expand size={16} />
          </button>
        </div>
      </header>

      {stage}

      <div className="studio-scrubber">
        <input
          type="range"
          min="0"
          max={Math.max(0, frames.length - 1)}
          step="1"
          value={frameIndex}
          onChange={(event) => {
            setPlaying(false)
            setFrameIndex(Number(event.target.value))
          }}
          aria-label="Movement phase"
        />
      </div>

      <div className="studio-speed">
        <span>Playback speed</span>
        {[0.5, 1, 1.5].map((value) => (
          <button
            key={value}
            className={speed === value ? 'active' : ''}
            onClick={() => setSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>

      <div className="studio-frame-strip">
        {frames.map((frameKey, index) => (
          <StudioFrame
            key={frameKey}
            movement={movement}
            frameKey={frameKey}
            side={side}
            selected={index === frameIndex}
            onSelect={() => {
              setPlaying(false)
              setFrameIndex(index)
            }}
          />
        ))}
      </div>

      <div className="studio-instructions">
        <article>
          <span>1</span>
          <div>
            <small>Set up</small>
            <strong>
              {movement?.setupCue ??
                'Set a stable starting position.'}
            </strong>
          </div>
        </article>

        <article>
          <span>2</span>
          <div>
            <small>Move</small>
            <strong>
              {movement?.actionCue ??
                movement?.instruction}
            </strong>
          </div>
        </article>

        <article>
          <span>3</span>
          <div>
            <small>Breathe</small>
            <strong>
              {movement?.breathingCue ??
                'Breathe slowly and naturally.'}
            </strong>
          </div>
        </article>
      </div>

      <div className="studio-warning">
        <span>Watch for</span>
        <p>
          {movement?.commonMistake ??
            'Avoid forcing the range or rushing the movement.'}
        </p>
      </div>

      {expanded &&
        createPortal(
          <div
            className="studio-expanded-backdrop"
            onClick={() => setExpanded(false)}
          >
            <section
              className="studio-expanded-panel"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <button
                className="studio-expanded-close"
                onClick={() => setExpanded(false)}
              >
                <X size={20} />
              </button>
              <span className="eyebrow">
                {movement.name}
              </span>
              <h2>{currentFrame.label}</h2>
              {stage}
            </section>
          </div>,
          document.body,
        )}
    </section>
  )
}

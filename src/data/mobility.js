export const DAILY_RESET = {
  id: 'daily-reset',
  title: 'Daily Reset',
  subtitle: 'Wake up the body',
  movements: [
    {
      id: 'neck-cars',
      name: 'Neck CARs',
      type: 'reps',
      target: 5,
      side: 'each direction',
      instruction: 'Move slowly through a comfortable circle. Keep the shoulders relaxed.',
    },
    {
      id: 'cat-cow',
      name: 'Cat-Cow',
      type: 'reps',
      target: 8,
      instruction: 'Move gently between rounded and extended positions with your breathing.',
    },
    {
      id: 'worlds-greatest-stretch',
      name: "World's Greatest Stretch",
      type: 'timed',
      seconds: 30,
      side: 'each side',
      instruction: 'Step into a long lunge, place one hand down, and rotate the other arm upward.',
    },
    {
      id: 'hip-flexor',
      name: 'Half-Kneeling Hip Flexor',
      type: 'timed',
      seconds: 30,
      side: 'each side',
      instruction: 'Tuck the pelvis slightly and shift forward without arching the lower back.',
    },
    {
      id: 'thoracic-rotation',
      name: 'Open-Book Rotation',
      type: 'reps',
      target: 6,
      side: 'each side',
      instruction: 'Keep the knees stacked and rotate through the upper back.',
    },
    {
      id: 'squat-pry',
      name: 'Bodyweight Squat Pry',
      type: 'timed',
      seconds: 30,
      instruction: 'Sit into a comfortable squat and gently shift side to side.',
    },
  ],
}

const FLOWS = {
  chest: [
    ['doorway-pec', 'Wall Pec Stretch', 'timed', 30, 'each side', 'Place the forearm against a wall and gently turn away.'],
    ['thread-needle', 'Thread the Needle', 'reps', 6, 'each side', 'Reach under the body, then rotate open through the upper back.'],
  ],
  back: [
    ['child-pose-lat', "Child's Pose Lat Reach", 'timed', 30, 'each side', 'Sit the hips back and walk both hands toward one side.'],
    ['open-book', 'Open-Book Rotation', 'reps', 6, 'each side', 'Keep the knees stacked and rotate through the upper back.'],
  ],
  shoulders: [
    ['cross-body', 'Cross-Body Shoulder Stretch', 'timed', 30, 'each side', 'Bring one arm across the chest without shrugging.'],
    ['wall-angels', 'Floor or Wall Angels', 'reps', 8, '', 'Move slowly while keeping the ribs controlled.'],
  ],
  arms: [
    ['triceps', 'Overhead Triceps Stretch', 'timed', 30, 'each side', 'Reach one hand down the upper back and guide the elbow gently.'],
    ['wrist-flexor', 'Wrist Flexor Stretch', 'timed', 25, 'each side', 'Straighten the elbow and gently extend the wrist.'],
    ['wrist-extensor', 'Wrist Extensor Stretch', 'timed', 25, 'each side', 'Straighten the elbow and gently flex the wrist.'],
  ],
  quads: [
    ['standing-quad', 'Standing Quad Stretch', 'timed', 30, 'each side', 'Keep the knees close and gently tuck the pelvis.'],
    ['hip-flexor', 'Half-Kneeling Hip Flexor', 'timed', 30, 'each side', 'Tuck the pelvis slightly and shift forward.'],
  ],
  hamstrings: [
    ['hamstring-fold', 'Supported Hamstring Fold', 'timed', 30, 'each side', 'Extend one leg and hinge forward with a long spine.'],
  ],
  glutes: [
    ['figure-four', 'Figure-Four Glute Stretch', 'timed', 30, 'each side', 'Cross one ankle over the opposite thigh and sit back gently.'],
    ['ninety-ninety', '90/90 Hip Switches', 'reps', 8, '', 'Rotate both knees side to side under control.'],
  ],
  calves: [
    ['calf-wall', 'Wall Calf Stretch', 'timed', 30, 'each side', 'Keep the back heel down and the back knee straight.'],
  ],
  core: [
    ['cat-cow-recovery', 'Cat-Cow', 'reps', 8, '', 'Move slowly with relaxed breathing.'],
    ['cobra', 'Gentle Prone Press-Up', 'reps', 6, '', 'Press up only as far as feels comfortable.'],
    ['child-pose', "Child's Pose", 'timed', 30, '', 'Sit the hips back and breathe into the back of the rib cage.'],
  ],
}

const normalizeMuscle = (muscle = '') => {
  const value = muscle.toLowerCase()
  if (value.includes('chest')) return 'chest'
  if (value.includes('back') || value.includes('lat')) return 'back'
  if (value.includes('shoulder') || value.includes('delt') || value.includes('trap')) return 'shoulders'
  if (value.includes('bicep') || value.includes('tricep') || value.includes('forearm')) return 'arms'
  if (value.includes('quad')) return 'quads'
  if (value.includes('hamstring')) return 'hamstrings'
  if (value.includes('glute')) return 'glutes'
  if (value.includes('calf')) return 'calves'
  if (value.includes('core') || value.includes('ab')) return 'core'
  return null
}

export function buildRecoveryFlow(session) {
  const muscleKeys = [
    ...new Set(
      (session?.sets ?? [])
        .map((set) => normalizeMuscle(set.muscle))
        .filter(Boolean),
    ),
  ]

  const fallback = ['shoulders', 'back']
  const selected = muscleKeys.length ? muscleKeys : fallback
  const movements = []
  const seen = new Set()

  selected.forEach((key) => {
    ;(FLOWS[key] ?? []).forEach(([id, name, type, amount, side, instruction]) => {
      if (seen.has(id)) return
      seen.add(id)
      movements.push({
        id,
        name,
        type,
        ...(type === 'timed' ? { seconds: amount } : { target: amount }),
        side,
        instruction,
      })
    })
  })

  return {
    id: `recovery-${session?.id ?? 'current'}`,
    title: 'Recovery Flow',
    subtitle: session?.name ? `After ${session.name}` : 'Post-workout recovery',
    movements: movements.slice(0, 6),
  }
}

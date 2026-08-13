const MOVEMENTS = {
  'neck-cars': {
    id: 'neck-cars',
    purpose: 'Improve comfortable neck control and awareness.',
    assetFolder: 'neck-cars',
    assetFrames: 0,
    phaseLabels: ['Neutral', 'Left', 'Chin down', 'Right', 'Look up'],
    setupCue: 'Stand tall. Keep the shoulders relaxed and still.',
    actionCue: 'Move the head slowly through a comfortable circle.',
    breathingCue: 'Breathe slowly throughout the circle',
    tempoCue: 'Very slow and controlled',
    commonMistake: 'Do not roll through pain or shrug the shoulders',
    landmark: 'floor',
    studioFrames: ['neck-neutral', 'neck-left', 'neck-down', 'neck-right', 'neck-up'],
    muscles: ['neck'],
    visual: 'neck-circle',
    targetArea: 'Neck and upper spine',
    motionCue: 'Circle slowly',
    name: 'Neck CARs',
    type: 'reps',
    target: 5,
    side: 'each direction',
    tags: ['neck', 'shoulders', 'general'],
    instruction:
      'Move slowly through a comfortable circle. Keep the shoulders relaxed.',
  },
  'cat-cow': {
    id: 'cat-cow',
    purpose: 'Move the spine through comfortable flexion and extension.',
    assetFolder: 'cat-cow',
    assetFrames: 0,
    phaseLabels: ['Neutral', 'Round', 'Extend'],
    studioFrames: ['quad-neutral', 'cat-round', 'cow-extend'],
    setupCue: 'Hands under shoulders. Knees under hips.',
    actionCue: 'Round the back, then lift the chest and tailbone.',
    landmark: 'floor',
    view: 'side',
    breathingCue: 'Inhale to extend, exhale to round',
    tempoCue: 'Slow and continuous',
    commonMistake: 'Do not force the neck or collapse into the shoulders',
    rangeCue: 'Use only a comfortable spinal range',
    muscles: ['spine', 'core'],
    visual: 'spine-wave',
    targetArea: 'Spine and core',
    motionCue: 'Round and extend',
    name: 'Cat-Cow',
    type: 'reps',
    target: 8,
    tags: ['spine', 'core', 'general'],
    instruction:
      'Move gently between rounded and extended positions with your breathing.',
  },
  'worlds-greatest-stretch': {
    id: 'worlds-greatest-stretch',
    purpose: 'Open the hips while rotating through the upper back.',
    assetFolder: 'worlds-greatest-stretch',
    assetFrames: 0,
    phaseLabels: ['Lunge', 'Plant hand', 'Rotate', 'Reach'],
    studioFrames: ['lunge-base', 'lunge-reach', 'lunge-rotate'],
    setupCue: 'Long lunge. Front foot flat. Inside hand on the floor.',
    actionCue: 'Rotate the free arm toward the ceiling.',
    landmark: 'floor',
    view: 'side',
    breathingCue: 'Exhale as you rotate',
    tempoCue: 'Pause briefly at the top',
    commonMistake: 'Do not let the front knee collapse inward',
    rangeCue: 'Rotate through the upper back, not the lower back',
    muscles: ['hips', 'thoracic'],
    visual: 'lunge-rotate',
    targetArea: 'Hips and upper back',
    motionCue: 'Lunge, reach, rotate',
    name: "World's Greatest Stretch",
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hips', 'thoracic', 'hamstrings', 'general'],
    instruction:
      'Step into a long lunge, place one hand down, and rotate the other arm upward.',
  },
  'hip-flexor': {
    id: 'hip-flexor',
    purpose: 'Open the front of the hip without arching the lower back.',
    assetFolder: 'hip-flexor',
    assetFrames: 0,
    studioFrames: ['half-kneel-neutral', 'half-kneel-tuck', 'half-kneel-shift'],
    setupCue: 'One knee down. Front foot planted.',
    actionCue: 'Tuck the pelvis, then shift forward slightly.',
    landmark: 'floor',
    view: 'side',
    breathingCue: 'Exhale and gently tuck the pelvis',
    tempoCue: 'Hold with steady breathing',
    commonMistake: 'Avoid arching the lower back',
    rangeCue: 'Shift only until the front of the hip opens',
    muscles: ['hip-flexor', 'quad'],
    visual: 'half-kneeling',
    targetArea: 'Front of hip',
    motionCue: 'Tuck and shift',
    name: 'Half-Kneeling Hip Flexor',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hips', 'quads', 'glutes'],
    instruction:
      'Tuck the pelvis slightly and shift forward without arching the lower back.',
  },
  'thoracic-rotation': {
    id: 'thoracic-rotation',
    purpose: 'Improve upper-back rotation while keeping the hips stable.',
    assetFolder: 'open-book',
    assetFrames: 0,
    studioFrames: ['open-book-closed', 'open-book-half', 'open-book-open'],
    setupCue: 'Lie on your side with knees stacked.',
    actionCue: 'Open the top arm without separating the knees.',
    landmark: 'floor',
    view: 'side',
    breathingCue: 'Exhale as the arm opens',
    tempoCue: 'Move slowly in both directions',
    commonMistake: 'Keep the knees stacked',
    rangeCue: 'Rotate through the rib cage',
    muscles: ['thoracic', 'shoulder'],
    visual: 'side-rotation',
    targetArea: 'Upper back',
    motionCue: 'Rotate open',
    name: 'Open-Book Rotation',
    type: 'reps',
    target: 6,
    side: 'each side',
    tags: ['thoracic', 'back', 'shoulders'],
    instruction:
      'Keep the knees stacked and rotate through the upper back.',
  },
  'squat-pry': {
    id: 'squat-pry',
    purpose: 'Explore comfortable hip and ankle range in a supported squat.',
    assetFolder: 'squat-pry',
    assetFrames: 0,
    studioFrames: ['squat-stand', 'squat-bottom', 'squat-shift'],
    setupCue: 'Feet just outside shoulder width.',
    actionCue: 'Sink into a squat and gently shift side to side.',
    landmark: 'floor',
    view: 'front',
    breathingCue: 'Breathe slowly into the bottom position',
    tempoCue: 'Shift gently side to side',
    commonMistake: 'Do not force the heels down',
    rangeCue: 'Use a depth you can control',
    muscles: ['hips', 'ankles'],
    visual: 'deep-squat',
    targetArea: 'Hips and ankles',
    motionCue: 'Sink and shift',
    name: 'Bodyweight Squat Pry',
    type: 'timed',
    seconds: 30,
    tags: ['hips', 'ankles', 'quads', 'glutes'],
    instruction:
      'Sit into a comfortable squat and gently shift side to side.',
  },
  'ankle-rocks': {
    id: 'ankle-rocks',
    studioFrames: ['ankle-start', 'ankle-mid', 'ankle-wall'],
    setupCue: 'Face a wall with the heel planted.',
    actionCue: 'Drive the knee toward the wall without lifting the heel.',
    landmark: 'wall',
    view: 'side',
    breathingCue: 'Keep breathing normally',
    tempoCue: 'Smooth forward and back',
    commonMistake: 'Keep the heel planted',
    rangeCue: 'Move the knee forward without pain',
    muscles: ['ankle', 'calf'],
    visual: 'ankle-rock',
    targetArea: 'Ankle and calf',
    motionCue: 'Knee forward, heel down',
    name: 'Knee-to-Wall Ankle Rocks',
    type: 'reps',
    target: 8,
    side: 'each side',
    tags: ['ankles', 'calves', 'quads'],
    instruction:
      'Drive the knee forward over the toes while keeping the heel down.',
  },
  'wall-pec': {
    id: 'wall-pec',
    studioFrames: ['pec-wall-set', 'pec-turn-half', 'pec-turn-open'],
    setupCue: 'Forearm against the wall at shoulder height.',
    actionCue: 'Turn the chest away from the wall.',
    landmark: 'wall',
    view: 'front',
    breathingCue: 'Exhale as you rotate away',
    tempoCue: 'Ease into the stretch',
    commonMistake: 'Do not shrug the shoulder',
    rangeCue: 'Stop before shoulder discomfort',
    muscles: ['chest', 'shoulder'],
    visual: 'wall-turn',
    targetArea: 'Chest and shoulder',
    motionCue: 'Arm fixed, rotate away',
    name: 'Wall Pec Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['chest', 'shoulders', 'arms'],
    instruction:
      'Place the forearm against a wall and gently turn away.',
  },
  'thread-needle': {
    id: 'thread-needle',
    studioFrames: ['thread-start', 'thread-under', 'thread-open'],
    setupCue: 'Start on hands and knees.',
    actionCue: 'Reach one arm underneath, then rotate it open.',
    landmark: 'floor',
    view: 'front',
    breathingCue: 'Exhale while reaching under',
    tempoCue: 'Reach, pause, then open',
    commonMistake: 'Do not shift all your weight into one hand',
    rangeCue: 'Rotate from the upper back',
    muscles: ['thoracic', 'rear-shoulder'],
    visual: 'thread-reach',
    targetArea: 'Upper back and shoulder',
    motionCue: 'Reach under, then open',
    name: 'Thread the Needle',
    type: 'reps',
    target: 6,
    side: 'each side',
    tags: ['thoracic', 'back', 'shoulders'],
    instruction:
      'Reach under the body, then rotate open through the upper back.',
  },
  'child-pose-lat': {
    id: 'child-pose-lat',
    studioFrames: ['child-center', 'child-side', 'child-reach'],
    setupCue: 'Sit the hips back with both hands forward.',
    actionCue: 'Walk both hands to one side.',
    landmark: 'floor',
    view: 'front',
    breathingCue: 'Breathe into the side of the rib cage',
    tempoCue: 'Hold and relax',
    commonMistake: 'Do not force the hips to the heels',
    rangeCue: 'Reach only as far as the shoulders allow',
    muscles: ['lat', 'back'],
    visual: 'child-reach',
    targetArea: 'Lats and back',
    motionCue: 'Sit back and reach',
    name: "Child's Pose Lat Reach",
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['back', 'lats', 'shoulders'],
    instruction:
      'Sit the hips back and walk both hands toward one side.',
  },
  'cross-body': {
    id: 'cross-body',
    visual: 'cross-body',
    targetArea: 'Rear shoulder',
    motionCue: 'Draw arm across',
    name: 'Cross-Body Shoulder Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['shoulders', 'arms'],
    instruction:
      'Bring one arm across the chest without shrugging.',
  },
  'wall-angels': {
    id: 'wall-angels',
    visual: 'wall-angel',
    targetArea: 'Shoulders and upper back',
    motionCue: 'Slide arms upward',
    name: 'Floor or Wall Angels',
    type: 'reps',
    target: 8,
    tags: ['shoulders', 'thoracic', 'back'],
    instruction:
      'Move slowly while keeping the ribs controlled.',
  },
  'triceps': {
    id: 'triceps',
    visual: 'overhead-reach',
    targetArea: 'Triceps and shoulder',
    motionCue: 'Elbow up, hand down',
    name: 'Overhead Triceps Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['arms', 'shoulders'],
    instruction:
      'Reach one hand down the upper back and guide the elbow gently.',
  },
  'wrist-flexor': {
    id: 'wrist-flexor',
    visual: 'wrist-extend',
    targetArea: 'Forearm flexors',
    motionCue: 'Palm forward',
    name: 'Wrist Flexor Stretch',
    type: 'timed',
    seconds: 25,
    side: 'each side',
    tags: ['arms', 'wrists'],
    instruction:
      'Straighten the elbow and gently extend the wrist.',
  },
  'wrist-extensor': {
    id: 'wrist-extensor',
    visual: 'wrist-flex',
    targetArea: 'Forearm extensors',
    motionCue: 'Knuckles down',
    name: 'Wrist Extensor Stretch',
    type: 'timed',
    seconds: 25,
    side: 'each side',
    tags: ['arms', 'wrists'],
    instruction:
      'Straighten the elbow and gently flex the wrist.',
  },
  'standing-quad': {
    id: 'standing-quad',
    studioFrames: ['quad-stand', 'quad-catch', 'quad-tuck'],
    setupCue: 'Stand tall and hold one ankle behind you.',
    actionCue: 'Bring the heel toward the glute while keeping knees close.',
    landmark: 'floor',
    visual: 'standing-balance',
    targetArea: 'Quad and hip',
    motionCue: 'Heel toward glute',
    name: 'Standing Quad Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['quads', 'hips'],
    instruction:
      'Keep the knees close and gently tuck the pelvis.',
  },
  'hamstring-fold': {
    id: 'hamstring-fold',
    visual: 'hinge-forward',
    targetArea: 'Hamstring',
    motionCue: 'Long spine, hinge',
    name: 'Supported Hamstring Fold',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['hamstrings', 'hips'],
    instruction:
      'Extend one leg and hinge forward with a long spine.',
  },
  'figure-four': {
    id: 'figure-four',
    studioFrames: ['figure-stand', 'figure-cross', 'figure-sit'],
    setupCue: 'Stand tall and cross one ankle over the opposite thigh.',
    actionCue: 'Sit the hips back while keeping the chest lifted.',
    landmark: 'floor',
    view: 'front',
    breathingCue: 'Exhale as you sit back',
    tempoCue: 'Hold with steady breathing',
    commonMistake: 'Do not press directly on the knee',
    rangeCue: 'Stop when the glute begins to stretch',
    muscles: ['glute', 'hip'],
    visual: 'figure-four',
    targetArea: 'Glute and hip',
    motionCue: 'Cross ankle, sit back',
    name: 'Figure-Four Glute Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['glutes', 'hips'],
    instruction:
      'Cross one ankle over the opposite thigh and sit back gently.',
  },
  'ninety-ninety': {
    id: 'ninety-ninety',
    studioFrames: ['ninety-left', 'ninety-center', 'ninety-right'],
    setupCue: 'Sit tall with both knees bent.',
    actionCue: 'Rotate both knees from one side to the other.',
    landmark: 'floor',
    view: 'front',
    breathingCue: 'Exhale through each switch',
    tempoCue: 'Control both directions',
    commonMistake: 'Avoid rushing or lifting the feet excessively',
    rangeCue: 'Use the hip range you can control',
    muscles: ['hips', 'glutes'],
    visual: 'hip-switch',
    targetArea: 'Hips',
    motionCue: 'Rotate knees side to side',
    name: '90/90 Hip Switches',
    type: 'reps',
    target: 8,
    tags: ['hips', 'glutes'],
    instruction:
      'Rotate both knees side to side under control.',
  },
  'calf-wall': {
    id: 'calf-wall',
    visual: 'calf-lean',
    targetArea: 'Calf and ankle',
    motionCue: 'Heel down, lean forward',
    name: 'Wall Calf Stretch',
    type: 'timed',
    seconds: 30,
    side: 'each side',
    tags: ['calves', 'ankles'],
    instruction:
      'Keep the back heel down and the back knee straight.',
  },
  'cobra': {
    id: 'cobra',
    visual: 'prone-press',
    targetArea: 'Abdominals and spine',
    motionCue: 'Press chest upward',
    name: 'Gentle Prone Press-Up',
    type: 'reps',
    target: 6,
    tags: ['core', 'spine'],
    instruction:
      'Press up only as far as feels comfortable.',
  },
  'child-pose': {
    id: 'child-pose',
    visual: 'child-pose',
    targetArea: 'Back and hips',
    motionCue: 'Sit back and breathe',
    name: "Child's Pose",
    type: 'timed',
    seconds: 30,
    tags: ['core', 'back', 'general'],
    instruction:
      'Sit the hips back and breathe into the back of the rib cage.',
  },
}


const FOUNDATION_MOVEMENT_LIBRARY = {
  "neck-cars": {
    "name": "Neck CARs",
    "type": "reps",
    "target": 4,
    "side": "each direction",
    "tags": [
      "neck",
      "shoulders",
      "general"
    ],
    "muscles": [
      "neck",
      "upper traps"
    ],
    "setup": "Sit or stand tall with your ribs stacked over your pelvis. Let both arms hang naturally and gently draw your shoulders away from your ears.",
    "move": "Tuck your chin toward your throat, slowly roll one ear toward the same-side shoulder, continue the circle by looking upward only as far as comfortable, then bring the opposite ear toward the opposite shoulder before returning the chin to center.",
    "finish": "Complete the same slow circle in the opposite direction. Keep the circle smooth and reduce the size anywhere you feel pinching or dizziness.",
    "tips": [
      "Imagine tracing the inside of a large bowl with the crown of your head.",
      "Keep your shoulders completely still while the neck moves.",
      "Use about half of your available range on the first repetition, then gradually explore more."
    ],
    "mistakes": [
      "Turning the movement into a fast head roll.",
      "Shrugging a shoulder toward the ear.",
      "Forcing through a sharp pinch at the back or side of the neck."
    ],
    "purpose": "Restores controlled neck motion after sleep and helps reduce the stiff, forward-head position created by screens."
  },
  "cat-cow": {
    "name": "Cat-Cow",
    "type": "reps",
    "target": 8,
    "tags": [
      "spine",
      "core",
      "general"
    ],
    "muscles": [
      "spine",
      "core"
    ],
    "setup": "Start on hands and knees with wrists directly under shoulders and knees directly under hips. Spread your fingers, press the floor lightly away, and look between your hands.",
    "move": "Inhale as you tip the pelvis forward, let the stomach soften toward the floor, and lift the chest without collapsing the shoulders. Exhale as you tuck the pelvis, press the floor away, round the upper back, and gently bring the chin toward the chest.",
    "finish": "Continue alternating with your breath for the assigned repetitions, then return to a neutral spine with the back of your head, upper back, and tailbone in one long line.",
    "tips": [
      "Let the pelvis start each direction before the rest of the spine follows.",
      "Move one section of the spine at a time instead of dropping into the lower back.",
      "Use your exhale to create the rounded position."
    ],
    "mistakes": [
      "Only moving the neck while the rest of the spine stays still.",
      "Bending the elbows and sinking between the shoulders.",
      "Forcing the lower back into an uncomfortable arch."
    ],
    "purpose": "Restores motion through the entire spine and prepares the back for bending, reaching, and rotation."
  },
  "worlds-greatest-stretch": {
    "name": "World's Greatest Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "hips",
      "thoracic",
      "hamstrings",
      "general"
    ],
    "muscles": [
      "hip flexors",
      "hamstrings",
      "upper back"
    ],
    "setup": "Step one foot forward into a long lunge. Keep the whole front foot on the floor, place both hands inside that foot, and extend the back leg behind you with the heel lifted.",
    "move": "Keep the inside hand planted and rotate the other arm toward the ceiling. Follow the moving hand with your eyes while keeping the front knee tracking over the middle toes and the back leg active.",
    "finish": "Return the hand to the floor, shift the hips slightly back to lengthen the front hamstring, then move back into the lunge before switching sides.",
    "tips": [
      "Make the lunge long enough that the back hip can open.",
      "Press the floor away with the planted hand to create room for rotation.",
      "Exhale as the arm reaches upward."
    ],
    "mistakes": [
      "Letting the front knee collapse inward.",
      "Rotating mainly through the lower back.",
      "Placing the front foot so narrow that balance becomes the main challenge."
    ],
    "purpose": "Combines hip opening, hamstring length, and upper-back rotation to prepare the whole body for the day."
  },
  "hip-flexor": {
    "name": "Half-Kneeling Hip Flexor",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "hips",
      "quads",
      "glutes"
    ],
    "muscles": [
      "hip flexors",
      "quadriceps"
    ],
    "setup": "Kneel with one knee on the floor and the opposite foot planted in front. Keep the front shin close to vertical and lightly squeeze the glute of the kneeling side.",
    "move": "Gently tuck the pelvis as though bringing your belt buckle toward your ribs. Maintain that position while shifting the whole body forward a few inches until the front of the kneeling-side hip opens.",
    "finish": "Hold the stretch without arching the lower back, then shift back, release the glute, and change sides.",
    "tips": [
      "Think tuck first, shift second.",
      "Keep the ribs directly above the pelvis.",
      "A small forward shift is usually enough when the pelvis is positioned correctly."
    ],
    "mistakes": [
      "Arching the lower back to travel farther forward.",
      "Allowing the front knee to drift far past the toes.",
      "Relaxing the kneeling-side glute completely."
    ],
    "purpose": "Reduces front-of-hip stiffness caused by sitting and helps the pelvis move more freely during walking and training."
  },
  "thoracic-rotation": {
    "name": "Open-Book Rotation",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "thoracic",
      "back",
      "shoulders"
    ],
    "muscles": [
      "upper back",
      "chest"
    ],
    "setup": "Lie on one side with hips and knees bent, knees stacked, and both arms reaching straight forward at shoulder height. Rest the head on the floor or a folded arm.",
    "move": "Sweep the top arm across the chest and open it toward the floor behind you. Follow the hand with your eyes while keeping both knees pressed together.",
    "finish": "Pause where the upper back stops rotating, exhale, then reverse the path until both hands meet again.",
    "tips": [
      "Keep the lower body quiet so the rotation comes from the rib cage.",
      "Let the moving shoulder approach the floor rather than forcing it down.",
      "Use a long exhale at the end of the opening."
    ],
    "mistakes": [
      "Separating the knees to create extra range.",
      "Pulling the arm behind the body with momentum.",
      "Twisting through the lower back instead of the upper back."
    ],
    "purpose": "Restores upper-back rotation and chest mobility after sleeping, sitting, or upper-body training."
  },
  "squat-pry": {
    "name": "Bodyweight Squat Pry",
    "type": "timed",
    "seconds": 30,
    "tags": [
      "hips",
      "ankles",
      "quads",
      "glutes"
    ],
    "muscles": [
      "hips",
      "ankles",
      "adductors"
    ],
    "setup": "Stand with feet slightly wider than shoulder width and toes turned out only as much as needed. Keep the whole foot in contact with the floor.",
    "move": "Sit between the hips into the deepest comfortable squat. Place elbows inside the knees, gently press the knees outward, and shift your weight slowly from one foot to the other.",
    "finish": "Center your weight, press through the full foot, and stand tall without letting the knees collapse inward.",
    "tips": [
      "Keep pressure through heel, base of the big toe, and base of the little toe.",
      "Use the elbows only for gentle guidance.",
      "Breathe into the bottom position instead of holding tension."
    ],
    "mistakes": [
      "Forcing the heels down when ankle range is limited.",
      "Collapsing the arches of the feet.",
      "Dropping quickly into a depth you cannot control."
    ],
    "purpose": "Wakes up the hips and ankles while rehearsing a strong, balanced squat position."
  },
  "ankle-rocks": {
    "name": "Knee-to-Wall Ankle Rocks",
    "type": "reps",
    "target": 8,
    "side": "each side",
    "tags": [
      "ankles",
      "calves",
      "quads"
    ],
    "muscles": [
      "ankles",
      "calves"
    ],
    "setup": "Face a wall in a short staggered stance with the front foot flat. Position the toes a few inches from the wall and keep the heel heavy.",
    "move": "Drive the front knee toward the wall in line with the second and third toes. Pause just before the heel wants to lift, then return the knee over the ankle.",
    "finish": "Complete all repetitions without the arch collapsing, then switch feet and match the same controlled range.",
    "tips": [
      "Move the knee straight over the middle toes.",
      "Keep all three points of the foot rooted.",
      "Adjust the foot closer to the wall if the heel lifts."
    ],
    "mistakes": [
      "Rolling the ankle inward.",
      "Letting the heel peel off the floor.",
      "Bouncing at the end of the range."
    ],
    "purpose": "Improves ankle motion needed for comfortable walking, stairs, lunges, and squats."
  },
  "wall-pec": {
    "name": "Wall Pec Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "chest",
      "shoulders",
      "arms"
    ],
    "muscles": [
      "chest",
      "front shoulder"
    ],
    "setup": "Stand beside a wall and place the forearm against it with the elbow around shoulder height. Keep the shoulder blade gently down and back.",
    "move": "Turn your feet and chest away from the wall until a broad stretch appears across the chest and front of the shoulder. Keep the arm connected to the wall without pressing hard.",
    "finish": "Rotate back toward the wall before lowering the arm, then repeat on the other side.",
    "tips": [
      "Keep the shoulder lower than the ear.",
      "Turn the whole torso rather than twisting only the neck.",
      "Use a lower elbow position if shoulder height feels pinchy."
    ],
    "mistakes": [
      "Shrugging the shoulder upward.",
      "Forcing the arm behind the body.",
      "Arching the lower back to increase the stretch."
    ],
    "purpose": "Opens the chest after pressing workouts and counters the rounded posture created by prolonged sitting."
  },
  "thread-needle": {
    "name": "Thread the Needle",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "thoracic",
      "back",
      "shoulders"
    ],
    "muscles": [
      "upper back",
      "rear shoulder"
    ],
    "setup": "Begin on hands and knees with hips over knees and shoulders over hands. Press the supporting hand firmly into the floor.",
    "move": "Slide the opposite arm underneath the body with the palm facing up, allowing the shoulder and side of the head to approach the floor. Reverse the motion and rotate the same arm toward the ceiling.",
    "finish": "Bring the hand back under the shoulder with control, complete the repetitions, then switch sides.",
    "tips": [
      "Keep the hips centered over the knees.",
      "Push through the supporting hand during the opening phase.",
      "Follow the moving hand with your eyes."
    ],
    "mistakes": [
      "Shifting nearly all bodyweight onto the threaded shoulder.",
      "Rotating the hips instead of the rib cage.",
      "Rushing through the open position."
    ],
    "purpose": "Restores upper-back rotation while gently moving the shoulder through reaching and opening positions."
  },
  "child-pose-lat": {
    "name": "Child's Pose Lat Reach",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "back",
      "lats",
      "shoulders"
    ],
    "muscles": [
      "lats",
      "side body"
    ],
    "setup": "Start on hands and knees, sit the hips back toward the heels, and reach both hands forward with palms on the floor.",
    "move": "Walk both hands several inches to one side while keeping the hips centered. Press the opposite palm into the floor and breathe into the long side of the rib cage.",
    "finish": "Walk the hands back to center before moving them to the other side.",
    "tips": [
      "Think about lengthening from the hip to the fingertips.",
      "Keep both sides of the pelvis heavy and level.",
      "Use each inhale to expand the stretched side of the ribs."
    ],
    "mistakes": [
      "Rotating the chest toward the floor.",
      "Shifting both hips toward the reaching side.",
      "Forcing the hips onto the heels when the knees are uncomfortable."
    ],
    "purpose": "Lengthens the lats and side body after pulling work and improves overhead reaching comfort."
  },
  "cross-body": {
    "name": "Cross-Body Shoulder Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "shoulders",
      "arms"
    ],
    "muscles": [
      "rear shoulder",
      "upper back"
    ],
    "setup": "Stand tall and bring one arm straight across the chest at shoulder height. Use the opposite forearm to support it above the elbow.",
    "move": "Draw the arm gently toward the chest while keeping the stretched-side shoulder blade down and the torso facing forward.",
    "finish": "Release the supporting arm slowly, lower both arms, and switch sides.",
    "tips": [
      "Keep the stretched arm long but not locked.",
      "Aim the elbow toward the opposite shoulder rather than toward the neck.",
      "Relax the hand and forearm."
    ],
    "mistakes": [
      "Pulling directly on the elbow joint.",
      "Rotating the torso with the arm.",
      "Shrugging the stretched-side shoulder."
    ],
    "purpose": "Relieves tension through the rear shoulder after pressing, pulling, and prolonged arm use."
  },
  "wall-angels": {
    "name": "Floor or Wall Angels",
    "type": "reps",
    "target": 8,
    "tags": [
      "shoulders",
      "thoracic",
      "back"
    ],
    "muscles": [
      "shoulders",
      "upper back"
    ],
    "setup": "Stand with your back against a wall or lie on the floor. Bend the elbows to about 90 degrees and keep the ribs gently drawn down.",
    "move": "Slide both arms upward only as far as you can maintain the rib position and comfortable shoulder contact, then pull the elbows back toward the starting position.",
    "finish": "Complete the final downward slide and relax the arms without letting the lower back arch.",
    "tips": [
      "Think long through the crown of the head.",
      "Move the shoulder blades upward as the arms rise.",
      "Use a smaller range if the wrists cannot stay near the surface."
    ],
    "mistakes": [
      "Flaring the ribs to reach higher.",
      "Forcing the hands against the wall.",
      "Shrugging and losing control of the shoulder blades."
    ],
    "purpose": "Coordinates the shoulders, shoulder blades, and upper back for easier overhead movement."
  },
  "triceps": {
    "name": "Overhead Triceps Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "arms",
      "shoulders"
    ],
    "muscles": [
      "triceps",
      "shoulder"
    ],
    "setup": "Reach one arm overhead, bend the elbow, and let the hand travel down the upper back. Keep the chest facing forward.",
    "move": "Place the opposite hand above the elbow and guide it gently backward while keeping the ribs stacked and the neck relaxed.",
    "finish": "Release the guiding hand first, straighten the arm overhead, then lower it and switch sides.",
    "tips": [
      "Point the elbow toward the ceiling rather than out to the side.",
      "Keep the chin level.",
      "Use gentle pressure; the hand does not need to travel far down the back."
    ],
    "mistakes": [
      "Pulling the elbow aggressively.",
      "Arching the lower back.",
      "Tilting the head forward to make room for the arm."
    ],
    "purpose": "Restores length through the triceps and shoulder after pressing or arm-focused training."
  },
  "wrist-flexor": {
    "name": "Wrist Flexor Stretch",
    "type": "timed",
    "seconds": 25,
    "side": "each side",
    "tags": [
      "arms",
      "wrists"
    ],
    "muscles": [
      "forearm flexors",
      "wrist"
    ],
    "setup": "Extend one arm in front with the elbow straight and palm facing upward. Let the fingers point toward the floor.",
    "move": "Use the opposite hand to draw the fingers and palm gently downward and back until the stretch runs through the palm-side forearm.",
    "finish": "Ease off the fingers gradually, shake the hand out, and switch arms.",
    "tips": [
      "Keep the elbow straight without locking hard.",
      "Spread the fingers to distribute the stretch.",
      "Keep the shoulder relaxed and away from the ear."
    ],
    "mistakes": [
      "Pulling only one finger.",
      "Bending the elbow to avoid the forearm stretch.",
      "Using enough force to create tingling or numbness."
    ],
    "purpose": "Reduces forearm tightness after gripping, typing, lifting, or prolonged phone use."
  },
  "wrist-extensor": {
    "name": "Wrist Extensor Stretch",
    "type": "timed",
    "seconds": 25,
    "side": "each side",
    "tags": [
      "arms",
      "wrists"
    ],
    "muscles": [
      "forearm extensors",
      "wrist"
    ],
    "setup": "Extend one arm in front with the elbow straight and palm facing down. Make a relaxed fist or keep the fingers softly curled.",
    "move": "Use the other hand to guide the knuckles toward the floor and slightly inward until the top of the forearm stretches.",
    "finish": "Release the pressure slowly, open and close the hand several times, then change arms.",
    "tips": [
      "Keep the stretched-side shoulder low.",
      "Aim the knuckles down rather than pulling the fingers backward.",
      "Use light pressure and a steady breath."
    ],
    "mistakes": [
      "Twisting the forearm instead of flexing the wrist.",
      "Locking the fist tightly.",
      "Continuing through tingling in the fingers."
    ],
    "purpose": "Relieves the top-side forearm muscles that work during gripping, typing, and lifting."
  },
  "standing-quad": {
    "name": "Standing Quad Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "quads",
      "hips"
    ],
    "muscles": [
      "quadriceps",
      "hip flexors"
    ],
    "setup": "Stand beside a wall if balance support is needed. Bend one knee and hold the ankle or pant leg behind you.",
    "move": "Bring the heel toward the glute while keeping both knees close together. Gently tuck the pelvis and squeeze the glute on the stretching side.",
    "finish": "Release the foot under control, place it beside the other foot, then switch sides.",
    "tips": [
      "Keep the standing knee soft.",
      "Point the stretching knee toward the floor.",
      "Use the wall for balance so the stretch stays relaxed."
    ],
    "mistakes": [
      "Pulling the knee far behind the body.",
      "Arching the lower back.",
      "Letting the stretching knee flare outward."
    ],
    "purpose": "Restores length through the quadriceps and front of the hip after lower-body training or long periods of sitting."
  },
  "hamstring-fold": {
    "name": "Supported Hamstring Fold",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "hamstrings",
      "hips"
    ],
    "muscles": [
      "hamstrings",
      "calves"
    ],
    "setup": "Place one heel on the floor slightly in front with the knee softly bent. Shift most of your weight into the back leg and place hands on the hips.",
    "move": "Send the hips backward and tip the torso forward with a long spine until the back of the front thigh stretches.",
    "finish": "Drive through the back foot to return upright, bring the feet together, and switch sides.",
    "tips": [
      "Think chest forward and hips back.",
      "Keep the front toes pointing upward only if comfortable.",
      "Stop before the lower back begins to round."
    ],
    "mistakes": [
      "Reaching for the toes by rounding the spine.",
      "Locking the front knee aggressively.",
      "Turning the front foot outward."
    ],
    "purpose": "Lengthens the hamstrings without requiring a deep forward fold or equipment."
  },
  "figure-four": {
    "name": "Figure-Four Glute Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "glutes",
      "hips"
    ],
    "muscles": [
      "glutes",
      "outer hip"
    ],
    "setup": "Stand near a wall or sit near the front of a chair. Cross one ankle over the opposite thigh just above the knee.",
    "move": "Flex the crossed foot, keep the chest lifted, and send the hips backward until the outer hip and glute stretch.",
    "finish": "Press through the supporting foot to stand tall or uncross the legs while seated, then switch sides.",
    "tips": [
      "Keep the crossed foot active to support the knee.",
      "Guide the crossed knee outward without pressing directly on it.",
      "Maintain a long spine as the hips move back."
    ],
    "mistakes": [
      "Pushing down hard on the crossed knee.",
      "Rounding the back to get lower.",
      "Letting the standing knee collapse inward."
    ],
    "purpose": "Targets the glutes and outer hip after leg training and helps restore comfortable hip rotation."
  },
  "ninety-ninety": {
    "name": "90/90 Hip Switches",
    "type": "reps",
    "target": 8,
    "tags": [
      "hips",
      "glutes"
    ],
    "muscles": [
      "hips",
      "glutes",
      "adductors"
    ],
    "setup": "Sit with knees bent, feet slightly wider than hip width, and hands behind you for light support. Keep the chest lifted.",
    "move": "Lower both knees together toward one side until each leg approaches a 90-degree position. Press through the hips to lift the knees and rotate them to the opposite side.",
    "finish": "Complete the final switch, bring both knees to center, and sit tall before extending the legs.",
    "tips": [
      "Keep both sit bones as heavy as possible.",
      "Move from the hip joints rather than twisting the feet.",
      "Use less hand support as control improves."
    ],
    "mistakes": [
      "Dropping the knees with no control.",
      "Allowing the chest to collapse backward.",
      "Forcing both knees to touch the floor."
    ],
    "purpose": "Builds active internal and external hip rotation for smoother walking, squatting, and changing direction."
  },
  "calf-wall": {
    "name": "Wall Calf Stretch",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "calves",
      "ankles"
    ],
    "muscles": [
      "calves",
      "ankles"
    ],
    "setup": "Face a wall with both hands supported. Step one foot back, point both feet forward, and keep the back heel planted.",
    "move": "Bend the front knee and shift the body toward the wall while keeping the back knee straight and the back arch lifted.",
    "finish": "Shift away from the wall, step the back foot forward, and repeat on the opposite side.",
    "tips": [
      "Keep the back toes pointing directly forward.",
      "Press the back heel down and slightly backward.",
      "Keep the pelvis facing the wall."
    ],
    "mistakes": [
      "Turning the back foot outward.",
      "Allowing the back arch to collapse.",
      "Bending the back knee during the straight-knee version."
    ],
    "purpose": "Restores calf length and ankle comfort after lower-body training, walking, or long periods on your feet."
  },
  "cobra": {
    "name": "Gentle Prone Press-Up",
    "type": "reps",
    "target": 6,
    "tags": [
      "core",
      "spine"
    ],
    "muscles": [
      "abdominals",
      "spine"
    ],
    "setup": "Lie face down with hands beside the lower ribs and elbows pointing backward. Let the legs and glutes stay relaxed.",
    "move": "Press through the hands to lift the chest while the pelvis remains on the floor. Rise only until the front of the body opens without a sharp lower-back sensation.",
    "finish": "Lower the chest slowly, turn the head to one side for a breath, then repeat.",
    "tips": [
      "Let the arms do most of the lifting.",
      "Keep the shoulders away from the ears.",
      "Use a smaller range on the first repetition."
    ],
    "mistakes": [
      "Squeezing the glutes as hard as possible.",
      "Locking the elbows to force height.",
      "Continuing through a pinching lower-back sensation."
    ],
    "purpose": "Gently moves the spine into extension and opens the front of the body after sitting or flexed posture."
  },
  "child-pose": {
    "name": "Child's Pose",
    "type": "timed",
    "seconds": 30,
    "tags": [
      "core",
      "back",
      "general"
    ],
    "muscles": [
      "back",
      "hips"
    ],
    "setup": "Start on hands and knees, bring the big toes toward each other, and separate the knees to a comfortable width.",
    "move": "Send the hips backward toward the heels while walking the hands forward. Rest the forehead on the floor or stacked hands.",
    "finish": "Walk the hands back under the shoulders and return to hands and knees slowly.",
    "tips": [
      "Breathe into the back and sides of the rib cage.",
      "Keep the elbows soft.",
      "Place a cushion under the hips or forehead if needed."
    ],
    "mistakes": [
      "Forcing the hips to the heels.",
      "Holding the breath.",
      "Letting shoulder discomfort build while reaching too far."
    ],
    "purpose": "Creates a calm full-back and hip reset while encouraging slower breathing."
  },
  "shoulder-cars": {
    "name": "Shoulder CARs",
    "type": "reps",
    "target": 4,
    "side": "each side",
    "tags": [
      "shoulders",
      "general"
    ],
    "muscles": [
      "shoulders",
      "scapula"
    ],
    "setup": "Stand tall with one arm at your side, thumb facing forward, ribs gently down, and the opposite hand on the lower ribs.",
    "move": "Raise the working arm forward and overhead without leaning back. At the highest comfortable point, rotate the palm away and continue the arm behind you in the largest controlled circle possible.",
    "finish": "Reverse the exact path to return the arm to your side, then complete all repetitions before switching arms.",
    "tips": [
      "Move slowly enough to notice every degree of the circle.",
      "Keep the ribs still under the opposite hand.",
      "Make the circle smaller if the shoulder clicks painfully or pinches."
    ],
    "mistakes": [
      "Turning the torso to fake more shoulder range.",
      "Bending the elbow during the difficult portion.",
      "Moving quickly through the back half of the circle."
    ],
    "purpose": "Wakes up the full shoulder joint and prepares it for reaching, carrying, and training."
  },
  "arm-circles": {
    "name": "Controlled Arm Circles",
    "type": "reps",
    "target": 10,
    "side": "each direction",
    "tags": [
      "shoulders",
      "general"
    ],
    "muscles": [
      "shoulders",
      "upper back"
    ],
    "setup": "Stand tall with arms extended out to the sides at shoulder height, palms down, and ribs stacked over the pelvis.",
    "move": "Draw small, smooth circles from the shoulders. Gradually increase the diameter while keeping the elbows long and neck relaxed.",
    "finish": "Reduce the circles back to small, stop with control, then repeat in the opposite direction.",
    "tips": [
      "Lead the circle from the upper arm rather than the hands.",
      "Keep the circles equal on both sides.",
      "Maintain light abdominal tension so the torso stays still."
    ],
    "mistakes": [
      "Shrugging as the circles grow.",
      "Swinging the arms with momentum.",
      "Arching the lower back."
    ],
    "purpose": "Raises circulation around the shoulders and gently prepares the upper body for daily activity."
  },
  "scapular-pushup": {
    "name": "Scapular Push-Ups",
    "type": "reps",
    "target": 8,
    "tags": [
      "shoulders",
      "core",
      "general"
    ],
    "muscles": [
      "serratus",
      "shoulder blades",
      "core"
    ],
    "setup": "Begin in a high plank or hands-and-knees position with elbows straight and hands under shoulders.",
    "move": "Without bending the elbows, allow the chest to sink slightly as the shoulder blades move toward each other, then press the floor away until the shoulder blades spread around the rib cage.",
    "finish": "Return to a neutral shoulder position before relaxing the knees or stepping out of the plank.",
    "tips": [
      "Keep the head in line with the spine.",
      "Use the hands to push the floor away.",
      "Choose hands-and-knees if the plank makes the lower back sag."
    ],
    "mistakes": [
      "Bending the elbows like a regular push-up.",
      "Dropping the hips.",
      "Shrugging the shoulders toward the ears."
    ],
    "purpose": "Activates the muscles that control the shoulder blades and support healthy pushing and overhead movement."
  },
  "standing-side-bend": {
    "name": "Standing Side Reach",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "spine",
      "lats",
      "general"
    ],
    "muscles": [
      "side body",
      "lats"
    ],
    "setup": "Stand with feet under the hips. Reach one arm overhead and let the opposite hand rest on the thigh.",
    "move": "Grow tall through the spine, then arc the ribs gently toward the opposite side without twisting the chest or shifting the hips.",
    "finish": "Press through both feet to return upright, lower the arm, and alternate sides.",
    "tips": [
      "Create length before bending.",
      "Keep both sides of the pelvis level.",
      "Reach the fingertips away from the hip."
    ],
    "mistakes": [
      "Collapsing forward while bending.",
      "Pushing the hips far to the side.",
      "Holding the breath."
    ],
    "purpose": "Opens the side body and rib cage for easier reaching and deeper breathing."
  },
  "standing-rotation": {
    "name": "Standing Thoracic Turns",
    "type": "reps",
    "target": 8,
    "side": "alternating",
    "tags": [
      "thoracic",
      "spine",
      "general"
    ],
    "muscles": [
      "upper back",
      "core"
    ],
    "setup": "Stand with feet under the hips, knees soft, and arms crossed lightly over the chest.",
    "move": "Rotate the rib cage to one side while keeping the pelvis and knees facing forward. Return to center and rotate to the other side.",
    "finish": "Complete the final turn, face forward, and let the arms relax.",
    "tips": [
      "Imagine the rotation beginning at the bottom of the rib cage.",
      "Keep equal pressure through both feet.",
      "Exhale as you turn."
    ],
    "mistakes": [
      "Spinning the knees and hips.",
      "Leaning backward.",
      "Using momentum from the arms."
    ],
    "purpose": "Restores gentle upper-body rotation for walking, reaching, and daily turning movements."
  },
  "segmental-roll-down": {
    "name": "Segmental Roll-Down",
    "type": "reps",
    "target": 5,
    "tags": [
      "spine",
      "hamstrings",
      "general"
    ],
    "muscles": [
      "spine",
      "hamstrings"
    ],
    "setup": "Stand tall with feet hip width, knees soft, arms relaxed, and chin level.",
    "move": "Nod the chin, then slowly roll down one section at a time as the arms hang toward the floor. Pause at the bottom without forcing the hands lower.",
    "finish": "Press through the feet, tuck the pelvis slightly, and rebuild the spine from the bottom upward until the head returns last.",
    "tips": [
      "Keep the knees softly bent.",
      "Let gravity move the arms.",
      "Use a full exhale on the way down."
    ],
    "mistakes": [
      "Hinging as one rigid piece.",
      "Locking the knees.",
      "Snapping upright quickly."
    ],
    "purpose": "Wakes up spinal flexion and hamstring tolerance after sleep while teaching controlled bending."
  },
  "bird-dog": {
    "name": "Bird Dog",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "core",
      "hips",
      "shoulders",
      "general"
    ],
    "muscles": [
      "core",
      "glutes",
      "shoulders"
    ],
    "setup": "Start on hands and knees with a neutral spine. Brace gently as though preparing for a light tap to the stomach.",
    "move": "Slide one leg backward and reach the opposite arm forward until both are in line with the torso. Pause without rotating the pelvis.",
    "finish": "Bring hand and knee back beneath the body with control, then alternate sides.",
    "tips": [
      "Reach long rather than lifting high.",
      "Keep both hip bones facing the floor.",
      "Press firmly through the supporting hand."
    ],
    "mistakes": [
      "Arching the lower back.",
      "Opening the hip to the side.",
      "Lifting the arm and leg above torso height."
    ],
    "purpose": "Connects the shoulders, core, and hips for better balance and whole-body control."
  },
  "dead-bug": {
    "name": "Dead Bug",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "core",
      "hips",
      "general"
    ],
    "muscles": [
      "core",
      "hip flexors"
    ],
    "setup": "Lie on your back with arms above the shoulders and hips and knees bent to 90 degrees. Gently flatten the lower ribs toward the floor.",
    "move": "Slowly lower one heel toward the floor while reaching the opposite arm overhead. Stop before the lower back arches, then return to center.",
    "finish": "Alternate sides, complete the final repetition, and place both feet on the floor before relaxing.",
    "tips": [
      "Exhale during each reach.",
      "Make the range smaller to keep the ribs down.",
      "Move the arm and leg at the same speed."
    ],
    "mistakes": [
      "Letting the lower back lift.",
      "Rushing the return to center.",
      "Holding the breath."
    ],
    "purpose": "Activates the core while coordinating opposite arms and legs for everyday movement and lifting."
  },
  "glute-bridge": {
    "name": "Glute Bridge",
    "type": "reps",
    "target": 10,
    "tags": [
      "glutes",
      "hips",
      "general"
    ],
    "muscles": [
      "glutes",
      "hamstrings"
    ],
    "setup": "Lie on your back with knees bent, feet flat and hip width, and heels close enough to touch with the fingertips.",
    "move": "Press evenly through both feet, gently tuck the pelvis, and lift the hips until shoulders, hips, and knees form a long line.",
    "finish": "Lower the spine and hips slowly to the floor before beginning the next repetition.",
    "tips": [
      "Drive through the whole foot.",
      "Pause and squeeze the glutes at the top.",
      "Keep the ribs from flaring upward."
    ],
    "mistakes": [
      "Pushing mainly through the toes.",
      "Overarching the lower back.",
      "Letting the knees fall outward or inward."
    ],
    "purpose": "Wakes up the glutes after sitting and prepares the hips for walking, stairs, and lower-body training."
  },
  "adductor-rockback": {
    "name": "Adductor Rock-Back",
    "type": "reps",
    "target": 8,
    "side": "each side",
    "tags": [
      "hips",
      "adductors",
      "legs"
    ],
    "muscles": [
      "adductors",
      "hips"
    ],
    "setup": "Start on hands and knees, then extend one leg straight to the side with the foot flat or heel down and toes up.",
    "move": "Keep the spine long as you send the hips backward toward the bent-leg heel until the inner thigh of the straight leg stretches.",
    "finish": "Shift forward to the starting position, complete all repetitions, then change sides.",
    "tips": [
      "Keep the straight-leg knee pointing forward.",
      "Move the hips straight backward.",
      "Use the hands to control the depth."
    ],
    "mistakes": [
      "Rounding the lower back.",
      "Turning the straight-leg toes toward the ceiling excessively.",
      "Dropping suddenly into the deepest range."
    ],
    "purpose": "Restores inner-thigh mobility needed for squats, lateral movement, and comfortable hip motion."
  },
  "lateral-lunge-shift": {
    "name": "Lateral Lunge Shift",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "hips",
      "adductors",
      "general"
    ],
    "muscles": [
      "adductors",
      "glutes",
      "quads"
    ],
    "setup": "Take a wide stance with toes facing mostly forward and hands together in front of the chest.",
    "move": "Shift the hips toward one side, bending that knee while keeping the opposite leg long. Keep the bent knee tracking over the toes.",
    "finish": "Push through the bent-side foot to return to center, then move to the other side.",
    "tips": [
      "Send the hips backward as well as sideways.",
      "Keep the opposite foot fully planted.",
      "Use a shallow range until balance feels steady."
    ],
    "mistakes": [
      "Letting the bent knee cave inward.",
      "Turning the chest toward the floor.",
      "Lifting the heel of the straight leg."
    ],
    "purpose": "Wakes up the hips and inner thighs while preparing the body for side-to-side movement."
  },
  "hip-cars": {
    "name": "Standing Hip CARs",
    "type": "reps",
    "target": 4,
    "side": "each side",
    "tags": [
      "hips",
      "balance",
      "general"
    ],
    "muscles": [
      "hips",
      "glutes"
    ],
    "setup": "Stand beside a wall for light support. Lift one knee toward the chest while keeping the pelvis level and standing leg tall.",
    "move": "Open the lifted knee out to the side, rotate the thigh inward so the heel travels behind you, then extend the leg downward without turning the torso.",
    "finish": "Reverse the circle back to the starting knee-up position, complete all repetitions, and switch legs.",
    "tips": [
      "Use the wall only for balance.",
      "Keep the circle slow and controlled.",
      "Make the range smaller if the pelvis begins to turn."
    ],
    "mistakes": [
      "Leaning the torso away from the moving leg.",
      "Twisting the standing foot.",
      "Dropping quickly through the back half of the circle."
    ],
    "purpose": "Moves the hip through its full controlled range and improves single-leg balance."
  },
  "heel-raises": {
    "name": "Slow Heel Raises",
    "type": "reps",
    "target": 12,
    "tags": [
      "ankles",
      "calves",
      "general"
    ],
    "muscles": [
      "calves",
      "feet"
    ],
    "setup": "Stand tall with feet parallel and lightly touch a wall or chair for balance.",
    "move": "Press through the balls of both feet and rise onto the toes. Pause at the top with ankles straight, then lower the heels slowly.",
    "finish": "Place the heels fully on the floor and relax the toes after the final repetition.",
    "tips": [
      "Keep weight over the big and second toes.",
      "Rise and lower at the same speed.",
      "Keep the knees straight but not locked."
    ],
    "mistakes": [
      "Rolling onto the outside edges of the feet.",
      "Bouncing at the bottom.",
      "Leaning the body forward."
    ],
    "purpose": "Activates the calves and feet for walking, balance, and ankle support."
  },
  "toe-raises": {
    "name": "Standing Toe Raises",
    "type": "reps",
    "target": 12,
    "tags": [
      "ankles",
      "feet",
      "general"
    ],
    "muscles": [
      "shin",
      "feet"
    ],
    "setup": "Stand with your back lightly against a wall and feet several inches forward, heels planted.",
    "move": "Lift the front of both feet and toes toward the shins while keeping the heels down, then lower them with control.",
    "finish": "Place the whole foot on the floor and step away from the wall.",
    "tips": [
      "Lift from the ankles rather than curling only the toes.",
      "Keep the knees quiet.",
      "Pause briefly at the top."
    ],
    "mistakes": [
      "Rocking the whole body backward.",
      "Lifting the heels.",
      "Dropping the feet quickly."
    ],
    "purpose": "Wakes up the muscles along the shins and improves foot clearance during walking."
  },
  "ankle-cars": {
    "name": "Ankle CARs",
    "type": "reps",
    "target": 6,
    "side": "each direction",
    "tags": [
      "ankles",
      "feet",
      "general"
    ],
    "muscles": [
      "ankles",
      "feet"
    ],
    "setup": "Sit or stand with one foot slightly lifted and the lower leg held still.",
    "move": "Point the toes, turn the sole inward, pull the toes toward the shin, then turn the sole outward to draw the largest smooth ankle circle you can control.",
    "finish": "Reverse the circle for the same number of repetitions before changing feet.",
    "tips": [
      "Move only at the ankle.",
      "Imagine drawing a circle with the big toe.",
      "Slow down through the stiffest part."
    ],
    "mistakes": [
      "Moving the whole leg.",
      "Rushing and cutting corners off the circle.",
      "Forcing through a sharp pinch."
    ],
    "purpose": "Restores multi-directional ankle control and prepares the feet for the day."
  },
  "single-leg-balance": {
    "name": "Single-Leg Balance",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "balance",
      "ankles",
      "hips",
      "general"
    ],
    "muscles": [
      "feet",
      "ankles",
      "hips"
    ],
    "setup": "Stand near a wall with feet under the hips. Shift weight into one foot and lift the opposite foot an inch from the floor.",
    "move": "Hold the position with the standing knee soft, pelvis level, and eyes focused on one point.",
    "finish": "Place the lifted foot down quietly, reset your posture, and switch sides.",
    "tips": [
      "Spread the standing toes.",
      "Use fingertip support only when needed.",
      "Keep breathing and allow small ankle adjustments."
    ],
    "mistakes": [
      "Locking the standing knee.",
      "Holding the breath.",
      "Gripping the floor by curling the toes."
    ],
    "purpose": "Improves foot, ankle, and hip coordination for steadier daily movement."
  },
  "standing-knee-hug": {
    "name": "Alternating Knee Hug",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "hips",
      "balance",
      "general"
    ],
    "muscles": [
      "glutes",
      "hips"
    ],
    "setup": "Stand tall with feet under the hips and a wall nearby if needed.",
    "move": "Lift one knee and hold it with both hands below the kneecap. Draw it gently toward the chest while the standing leg remains tall.",
    "finish": "Release the leg under control, step down softly, and alternate sides.",
    "tips": [
      "Keep the pelvis level.",
      "Stand tall instead of leaning backward.",
      "Use a light pull rather than compressing the hip aggressively."
    ],
    "mistakes": [
      "Rounding the lower back.",
      "Hiking the standing-side hip.",
      "Dropping the lifted foot."
    ],
    "purpose": "Opens the glutes and wakes up single-leg balance for walking and stairs."
  },
  "march-reach": {
    "name": "March With Overhead Reach",
    "type": "reps",
    "target": 10,
    "side": "alternating",
    "tags": [
      "full-body",
      "balance",
      "shoulders",
      "general"
    ],
    "muscles": [
      "hips",
      "core",
      "shoulders"
    ],
    "setup": "Stand tall with arms at your sides and feet under the hips.",
    "move": "Lift one knee toward hip height while reaching the opposite arm overhead. Return both with control and alternate sides.",
    "finish": "Complete the final march, place both feet evenly, and lower the arms.",
    "tips": [
      "Stay tall through the standing leg.",
      "Coordinate opposite arm and knee.",
      "Move smoothly rather than trying to march quickly."
    ],
    "mistakes": [
      "Leaning backward as the arm reaches.",
      "Slamming the foot down.",
      "Lifting the knee by rounding the spine."
    ],
    "purpose": "Raises body temperature and connects the upper and lower body for a more alert start to the day."
  },
  "walkout": {
    "name": "Standing Walkout",
    "type": "reps",
    "target": 5,
    "tags": [
      "full-body",
      "hamstrings",
      "shoulders",
      "core"
    ],
    "muscles": [
      "hamstrings",
      "core",
      "shoulders"
    ],
    "setup": "Stand with feet hip width and knees softly bent.",
    "move": "Fold forward, place the hands on the floor, and walk them forward until reaching a strong high-plank position. Pause, then walk the hands back toward the feet.",
    "finish": "Bend the knees as needed and roll or hinge back to standing.",
    "tips": [
      "Keep the hips controlled as you reach plank.",
      "Shorten the walk if the lower back sags.",
      "Use bent knees to place the hands down safely."
    ],
    "mistakes": [
      "Dropping the hips in plank.",
      "Locking the knees during the fold.",
      "Rushing the hand steps."
    ],
    "purpose": "Combines hamstring mobility, shoulder loading, and core activation in one equipment-free movement."
  },
  "down-dog-pedal": {
    "name": "Downward-Dog Pedal",
    "type": "reps",
    "target": 8,
    "side": "alternating",
    "tags": [
      "calves",
      "hamstrings",
      "shoulders",
      "general"
    ],
    "muscles": [
      "calves",
      "hamstrings",
      "shoulders"
    ],
    "setup": "Start on hands and knees, tuck the toes, and lift the hips upward and backward into an inverted V.",
    "move": "Bend one knee while pressing the opposite heel gently toward the floor. Switch sides in a slow pedaling rhythm.",
    "finish": "Bend both knees, lower them to the floor, and return to hands and knees.",
    "tips": [
      "Prioritize a long spine over straight legs.",
      "Press evenly through both hands.",
      "Let the shoulders rotate comfortably rather than forcing the chest down."
    ],
    "mistakes": [
      "Locking both knees and rounding the back.",
      "Dumping weight into the wrists.",
      "Bouncing the heels."
    ],
    "purpose": "Wakes up the back of the legs and shoulders while increasing whole-body circulation."
  },
  "breathing-reset": {
    "name": "90/90 Breathing Reset",
    "type": "timed",
    "seconds": 45,
    "tags": [
      "breathing",
      "core",
      "recovery"
    ],
    "muscles": [
      "diaphragm",
      "core"
    ],
    "setup": "Lie on your back with lower legs resting on a chair or couch so hips and knees are near 90 degrees. Place one hand on the chest and one on the lower ribs.",
    "move": "Inhale quietly through the nose and expand the lower ribs into the floor and sides. Exhale slowly through the mouth until the ribs soften downward.",
    "finish": "Take one normal breath, place both feet on the floor, and roll to the side before sitting up.",
    "tips": [
      "Keep the upper chest quiet.",
      "Make the exhale longer than the inhale.",
      "Relax the jaw and shoulders."
    ],
    "mistakes": [
      "Forcing a huge breath into the chest.",
      "Arching the lower back during the inhale.",
      "Holding tension after the exhale."
    ],
    "purpose": "Downshifts tension and restores slower breathing after training or a stressful day."
  },
  "supine-twist": {
    "name": "Supine Knee Drop",
    "type": "timed",
    "seconds": 30,
    "side": "each side",
    "tags": [
      "spine",
      "hips",
      "recovery"
    ],
    "muscles": [
      "lower back",
      "hips"
    ],
    "setup": "Lie on your back with knees bent and feet flat. Extend the arms out to the sides.",
    "move": "Keep the knees together and lower them slowly toward one side while both shoulders remain heavy on the floor.",
    "finish": "Use the abdominal muscles to bring the knees back to center, then lower them to the other side.",
    "tips": [
      "Keep the movement comfortable and slow.",
      "Exhale as the knees lower.",
      "Place a pillow under the knees if they do not reach the floor."
    ],
    "mistakes": [
      "Forcing the knees down with the opposite hand.",
      "Letting the shoulder lift high off the floor.",
      "Dropping the legs quickly."
    ],
    "purpose": "Provides a gentle rotation for the lower trunk and hips during recovery."
  },
  "kneeling-quad-rock": {
    "name": "Kneeling Quad Rock",
    "type": "reps",
    "target": 8,
    "tags": [
      "knees",
      "quads",
      "ankles",
      "recovery"
    ],
    "muscles": [
      "quadriceps",
      "ankles"
    ],
    "setup": "Kneel upright on a soft surface with toes pointed behind or tucked, depending on comfort. Keep the torso tall.",
    "move": "Shift the hips backward a few inches toward the heels while maintaining a straight line from shoulders to knees, then return upright.",
    "finish": "Come back to the tall kneeling position and step one foot forward to stand.",
    "tips": [
      "Use a shallow range at first.",
      "Keep the glutes lightly active.",
      "Place extra padding under the knees if needed."
    ],
    "mistakes": [
      "Folding at the hips.",
      "Moving into knee pain.",
      "Dropping backward without control."
    ],
    "purpose": "Gently loads the quadriceps and knees through a controlled range after lower-body work."
  },
  "forearm-pronation": {
    "name": "Forearm Rotation",
    "type": "reps",
    "target": 10,
    "side": "each side",
    "tags": [
      "wrists",
      "arms",
      "general"
    ],
    "muscles": [
      "forearms",
      "wrists"
    ],
    "setup": "Bend one elbow to 90 degrees and hold it close to the side with the palm facing upward.",
    "move": "Rotate the forearm until the palm faces downward, then rotate back upward without letting the elbow drift away.",
    "finish": "Complete the repetitions, shake the hand out, and switch arms.",
    "tips": [
      "Move slowly through the full comfortable range.",
      "Keep the wrist straight.",
      "Hold the upper arm still against the ribs."
    ],
    "mistakes": [
      "Turning the whole shoulder.",
      "Bending the wrist during rotation.",
      "Moving quickly through a stiff range."
    ],
    "purpose": "Restores forearm rotation used for gripping, typing, carrying, and lifting."
  },
  "neck-side-glide": {
    "name": "Neck Side Glide",
    "type": "reps",
    "target": 6,
    "side": "each side",
    "tags": [
      "neck",
      "general"
    ],
    "muscles": [
      "neck"
    ],
    "setup": "Sit or stand tall with eyes level and shoulders relaxed.",
    "move": "Without tilting or turning the head, slide it horizontally toward one shoulder as though moving along a shelf. Return to center and repeat to the other side.",
    "finish": "Center the head over the ribs and relax the jaw.",
    "tips": [
      "Keep the nose pointing straight forward.",
      "Use a very small range.",
      "Imagine the ears staying level."
    ],
    "mistakes": [
      "Tilting the head.",
      "Rotating the chin.",
      "Shrugging toward the moving side."
    ],
    "purpose": "Gently explores side-to-side neck control without using a large stretch."
  }
}

Object.entries(FOUNDATION_MOVEMENT_LIBRARY).forEach(
  ([id, movement]) => {
    MOVEMENTS[id] = {
      ...(MOVEMENTS[id] ?? {}),
      id,
      equipment: 'none',
      setup: movement.setup,
      move: movement.move,
      finish: movement.finish,
      tips: movement.tips,
      mistakes: movement.mistakes,
      purpose: movement.purpose,
      ...movement,
    }
  },
)

const cloneMovement = (id, durationPreferences = {}) => {
  const movement = MOVEMENTS[id]
  if (!movement) return null

  return {
    ...movement,
    ...(movement.type === 'timed' && durationPreferences[id]
      ? { seconds: durationPreferences[id] }
      : {}),
  }
}

const unique = (items) => [...new Set(items.filter(Boolean))]

const normalizeOptionalText = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const normalizeMuscle = (muscle) => {
  const value = normalizeOptionalText(muscle).toLowerCase()
  if (!value) return null
  if (value.includes('chest')) return 'chest'
  if (value.includes('back') || value.includes('lat')) return 'back'
  if (
    value.includes('shoulder') ||
    value.includes('delt') ||
    value.includes('trap')
  ) return 'shoulders'
  if (
    value.includes('bicep') ||
    value.includes('tricep') ||
    value.includes('forearm')
  ) return 'arms'
  if (value.includes('quad')) return 'quads'
  if (value.includes('hamstring')) return 'hamstrings'
  if (value.includes('glute')) return 'glutes'
  if (value.includes('calf')) return 'calves'
  if (value.includes('core') || value.includes('ab')) return 'core'
  return null
}

export const workoutFocus = (workoutName) => {
  const value = normalizeOptionalText(workoutName).toLowerCase()

  if (!value || value === 'rest') {
    return []
  }

  if (value.includes('chest') || value.includes('back')) {
    return ['chest', 'back', 'shoulders', 'thoracic']
  }

  if (value.includes('arm')) {
    return ['arms', 'shoulders', 'wrists', 'thoracic']
  }

  if (value.includes('leg') || value.includes('core')) {
    return ['hips', 'quads', 'hamstrings', 'glutes', 'ankles', 'core']
  }

  return ['general', 'spine', 'hips', 'shoulders']
}

const movementIdsForFocus = {
  chest: [
    'wall-pec',
    'thread-needle',
    'shoulder-cars',
    'standing-side-bend',
    'scapular-pushup',
  ],
  back: [
    'child-pose-lat',
    'thoracic-rotation',
    'thread-needle',
    'standing-rotation',
    'down-dog-pedal',
  ],
  shoulders: [
    'shoulder-cars',
    'arm-circles',
    'wall-angels',
    'scapular-pushup',
    'cross-body',
  ],
  thoracic: [
    'thoracic-rotation',
    'thread-needle',
    'standing-rotation',
    'standing-side-bend',
    'cat-cow',
  ],
  arms: [
    'triceps',
    'wrist-flexor',
    'wrist-extensor',
    'forearm-pronation',
  ],
  wrists: [
    'wrist-flexor',
    'wrist-extensor',
    'forearm-pronation',
  ],
  hips: [
    'hip-cars',
    'ninety-ninety',
    'worlds-greatest-stretch',
    'adductor-rockback',
    'lateral-lunge-shift',
    'standing-knee-hug',
  ],
  quads: [
    'standing-quad',
    'hip-flexor',
    'kneeling-quad-rock',
    'lateral-lunge-shift',
  ],
  hamstrings: [
    'hamstring-fold',
    'worlds-greatest-stretch',
    'down-dog-pedal',
    'segmental-roll-down',
    'walkout',
  ],
  glutes: [
    'figure-four',
    'ninety-ninety',
    'glute-bridge',
    'standing-knee-hug',
    'hip-cars',
  ],
  ankles: [
    'ankle-rocks',
    'calf-wall',
    'ankle-cars',
    'heel-raises',
    'toe-raises',
    'single-leg-balance',
  ],
  calves: [
    'calf-wall',
    'ankle-rocks',
    'heel-raises',
    'down-dog-pedal',
  ],
  core: [
    'dead-bug',
    'bird-dog',
    'glute-bridge',
    'scapular-pushup',
    'breathing-reset',
  ],
  spine: [
    'cat-cow',
    'thoracic-rotation',
    'segmental-roll-down',
    'supine-twist',
    'standing-rotation',
  ],
  neck: [
    'neck-cars',
    'neck-side-glide',
  ],
  balance: [
    'single-leg-balance',
    'standing-knee-hug',
    'hip-cars',
    'march-reach',
  ],
  general: [
    'march-reach',
    'cat-cow',
    'shoulder-cars',
    'hip-cars',
    'ankle-cars',
    'bird-dog',
    'walkout',
    'standing-rotation',
  ],
}

const latestWorkout = (history = []) =>
  [...history].sort((first, second) =>
    String(first?.date).localeCompare(String(second?.date)),
  ).at(-1) ?? null

const musclesFromSession = (session) =>
  unique(
    (session?.sets ?? [])
      .map((set) => normalizeMuscle(set?.muscle))
      .filter(Boolean),
  )

const daySeed = () =>
  Number(
    new Date().toISOString().slice(0, 10).replaceAll('-', ''),
  )

const rotatePool = (items = [], offset = 0) => {
  if (!items.length) return []
  const start = Math.abs(daySeed() + offset) % items.length
  return [...items.slice(start), ...items.slice(0, start)]
}

const routineLengthLimit = (value) =>
  value === 'short'
    ? 4
    : value === 'extended'
    ? 8
    : 6

const recentMovementIds = (completions = [], limit = 3) =>
  new Set(
    completions
      .slice(-limit)
      .flatMap((entry) => entry.movementIds ?? [])
      .filter(Boolean),
  )

const addMovementIds = (
  target,
  focusKeys,
  limit = 6,
  blocked = new Set(),
) => {
  const fallback = []

  focusKeys.forEach((key, index) => {
    rotatePool(
      movementIdsForFocus[key] ?? [],
      index * 3,
    ).forEach((id) => {
      if (target.includes(id) || target.length >= limit) return

      if (blocked.has(id)) {
        fallback.push(id)
        return
      }

      target.push(id)
    })
  })

  fallback.forEach((id) => {
    if (target.length < limit && !target.includes(id)) {
      target.push(id)
    }
  })
}

export const DAILY_RESET = {
  id: 'daily-reset',
  title: 'Daily Reset',
  subtitle: 'Wake up the body',
  reason: 'A balanced, equipment-free sequence that wakes up the joints, raises body awareness, and prepares you for the day.',
  focusAreas: ['Spine', 'Hips', 'Shoulders'],
  movements: [
    cloneMovement('neck-cars'),
    cloneMovement('cat-cow'),
    cloneMovement('worlds-greatest-stretch'),
    cloneMovement('hip-flexor'),
    cloneMovement('thoracic-rotation'),
    cloneMovement('squat-pry'),
  ],
}

export function buildAdaptiveDailyReset({
  history = [],
  /** Workout due today — null when completed today with no alternate selected. */
  plannedWorkout: workoutDueToday = null,
  durationPreferences = {},
  readiness,
  recentCompletions = [],
  preferences = {},
}) {
  const plannedWorkout = workoutDueToday
  const lastWorkout = latestWorkout(history)
  const previousMuscles = musclesFromSession(lastWorkout)
  const plannedFocus = workoutFocus(plannedWorkout)
  const dislikedMovementIds =
    preferences.dislikedMovementIds ?? []
  const limit = routineLengthLimit(
    preferences.routineLength,
  )
  const blockedMovements = new Set([
    ...recentMovementIds(recentCompletions),
    ...dislikedMovementIds,
  ])
  const dislikedOnly = new Set(
    dislikedMovementIds,
  )

  const movementIds =
    readiness?.completed && readiness.score < 50
      ? ['cat-cow', 'child-pose'].filter(
          (id) => !dislikedOnly.has(id),
        )
      : ['neck-cars', 'cat-cow'].filter(
          (id) => !dislikedOnly.has(id),
        )

  addMovementIds(
    movementIds,
    previousMuscles,
    Math.min(4, limit),
    blockedMovements,
  )
  addMovementIds(
    movementIds,
    plannedFocus,
    limit,
    blockedMovements,
  )

  if (movementIds.length < limit) {
    addMovementIds(
      movementIds,
      ['general', 'hips', 'thoracic', 'ankles'],
      limit,
      dislikedOnly,
    )
  }

  const reasonParts = []

  if (lastWorkout?.name) {
    reasonParts.push(
      `Your last workout was ${lastWorkout.name}, so recovery work is included.`,
    )
  }

  if (readiness?.completed && readiness.score < 50) {
    reasonParts.push(
      'Today’s readiness is low, so the reset uses a gentler recovery emphasis.',
    )
  }

  if (plannedWorkout && plannedWorkout !== 'Rest') {
    reasonParts.push(
      `Today’s reset also prepares you for ${plannedWorkout}.`,
    )
  } else if (lastWorkout?.name) {
    reasonParts.push(
      'A short recovery flow can help you prepare for tomorrow.',
    )
  } else {
    reasonParts.push(
      'Today is set up as a recovery-focused day.',
    )
  }

  const focusAreas = unique([
    ...previousMuscles,
    ...plannedFocus,
  ])
    .slice(0, 4)
    .map((value) =>
      value
        .replace('thoracic', 'upper back')
        .replace('arms', 'arms & wrists')
        .replace(/\b\w/g, (character) => character.toUpperCase()),
    )

  const goal =
    readiness?.completed && readiness.score < 50
      ? 'Move gently into the day.'
      : previousMuscles.some((value) =>
          ['hips', 'quads', 'hamstrings', 'glutes', 'ankles'].includes(value),
        )
      ? 'Restore the lower body.'
      : previousMuscles.some((value) =>
          ['chest', 'back', 'shoulders', 'arms'].includes(value),
        )
      ? 'Open the upper body.'
      : 'Prepare the whole body.'

  return {
    id: `daily-reset-${new Date().toISOString().slice(0, 10)}`,
    title: 'Morning Movement',
    subtitle: goal,
    reason: reasonParts.join(' '),
    focusAreas,
    movements: movementIds
      .slice(0, limit)
      .map((id) => cloneMovement(id, durationPreferences))
      .filter(Boolean),
  }
}

export function buildRecoveryFlow(
  session,
  durationPreferences = {},
  preferences = {},
) {
  const muscleKeys = musclesFromSession(session)
  const fallback = ['shoulders', 'back']
  const selected = muscleKeys.length ? muscleKeys : fallback
  const limit = routineLengthLimit(
    preferences.routineLength,
  )
  const dislikedMovementIds = new Set(
    preferences.dislikedMovementIds ?? [],
  )
  const movementIds = []

  addMovementIds(
    movementIds,
    selected,
    limit,
    dislikedMovementIds,
  )

  if (movementIds.length < limit) {
    addMovementIds(
      movementIds,
      ['thoracic', 'hips', 'general'],
      limit,
      dislikedMovementIds,
    )
  }

  const goal = selected.some((value) =>
    ['hips', 'quads', 'hamstrings', 'glutes', 'ankles', 'calves'].includes(value),
  )
    ? 'Recover the lower body.'
    : selected.some((value) =>
        ['chest', 'back', 'shoulders', 'arms', 'wrists'].includes(value),
      )
    ? 'Restore the upper body.'
    : 'Return the body to neutral.'

  return {
    id: `recovery-${session?.id ?? 'current'}`,
    title: 'Daily Reset',
    subtitle: goal,
    reason: session?.name
      ? `Built from the muscles you trained during ${session.name}.`
      : 'A balanced equipment-free recovery flow.',
    focusAreas: selected.map((value) =>
      value
        .replace('arms', 'arms & wrists')
        .replace(/\b\w/g, (character) => character.toUpperCase()),
    ),
    movements: movementIds
      .slice(0, limit)
      .map((id) => cloneMovement(id, durationPreferences))
      .filter(Boolean),
  }
}

const withinDays = (value, days) => {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return false
  return Date.now() - time <= days * 86400000
}

export function calculateRecoveryIntelligence(state = {}) {
  const history = state.history ?? []
  const mobility = state.mobility?.completed ?? []

  const recentWorkouts = history.filter((session) =>
    withinDays(
      session.finishedAt ?? `${session.date}T12:00:00`,
      7,
    ),
  )

  const recentRecovery = mobility.filter(
    (entry) =>
      entry.title === 'Recovery Flow' &&
      withinDays(entry.completedAt, 7),
  )

  const recentResets = mobility.filter(
    (entry) =>
      entry.title === 'Daily Reset' &&
      withinDays(entry.completedAt, 7),
  )

  const recoveryOpportunity = Math.max(1, recentWorkouts.length)
  const recoveryRatio = Math.min(
    1,
    recentRecovery.length / recoveryOpportunity,
  )
  const resetContribution = Math.min(1, recentResets.length / 4)

  const score = Math.round(
    Math.min(
      100,
      35 +
        recoveryRatio * 45 +
        resetContribution * 20,
    ),
  )

  let status = 'Recovery needs attention'
  let tone = 'low'

  if (score >= 80) {
    status = 'Excellent training balance'
    tone = 'high'
  } else if (score >= 60) {
    status = 'Recovery is keeping pace'
    tone = 'medium'
  }

  const insight =
    recentWorkouts.length === 0
      ? 'Complete a workout to begin building your recovery profile.'
      : recentRecovery.length === 0
      ? `You trained ${recentWorkouts.length} time${
          recentWorkouts.length === 1 ? '' : 's'
        } this week without completing a Recovery Flow.`
      : `You completed ${recentRecovery.length} Recovery Flow${
          recentRecovery.length === 1 ? '' : 's'
        } after ${recentWorkouts.length} workout${
          recentWorkouts.length === 1 ? '' : 's'
        } this week.`

  return {
    score,
    status,
    tone,
    insight,
    workoutsThisWeek: recentWorkouts.length,
    recoveryFlowsThisWeek: recentRecovery.length,
    dailyResetsThisWeek: recentResets.length,
  }
}

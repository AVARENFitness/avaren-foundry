import { useEffect, useMemo, useState } from 'react'
import AppShell from './components/AppShell'
import HomeScreen from './screens/HomeScreen'
import GymScreen from './screens/GymScreen'
import ProgressScreen from './screens/ProgressScreen'
import MoreScreen from './screens/MoreScreen'
import WorkoutBuilderScreen from './screens/WorkoutBuilderScreen'
import CompletionScreen from './screens/CompletionScreen'
import { BASELINES, DEFAULT_PROGRAM } from './data/defaultProgram'
import { estimatedOneRepMax, recentPRs } from './lib/metrics'
import { loadState, saveState } from './lib/storage'

const createInitialState = () => ({
  program: DEFAULT_PROGRAM,
  activeWorkout: null,
  history: [],
  achievements: [],
  baselines: BASELINES,
})

const makeSet = (number, type = 'Working') => ({
  id: crypto.randomUUID(),
  number,
  type,
  weight: '',
  reps: '',
  done: false,
})

function App() {
  const [screen, setScreen] = useState('home')
  const [state, setState] = useState(() => loadState(createInitialState()))
  const [activeExercise, setActiveExerciseState] = useState(
    state.activeWorkout?.activeExerciseIndex ?? 0,
  )

  const setActiveExercise = (value) => {
    const nextValue = typeof value === 'function' ? value(activeExercise) : value
    setActiveExerciseState(nextValue)
    setState((current) =>
      current.activeWorkout
        ? {
            ...current,
            activeWorkout: {
              ...current.activeWorkout,
              activeExerciseIndex: nextValue,
            },
          }
        : current,
    )
  }
  const [completedSession, setCompletedSession] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1050)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => saveState(state), [state])

  const navigate = (nextScreen, callback) => {
    setTransitioning(true)
    window.setTimeout(() => {
      callback?.()
      setScreen(nextScreen)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.setTimeout(() => setTransitioning(false), 260)
    }, 180)
  }

  const startWorkout = () => {
    if (state.activeWorkout) {
      navigate('gym')
      return
    }

    const name = state.program.nextWorkout
    const definitions = state.program.workouts[name] ?? []

    const activeWorkout = {
      id: crypto.randomUUID(),
      name,
      date: new Date().toISOString().slice(0, 10),
      startedAt: new Date().toISOString(),
      activeExerciseIndex: 0,
      exercises: definitions.map((exercise) => ({
        id: crypto.randomUUID(),
        name: exercise.name,
        muscle: exercise.muscle,
        supersetGroup: exercise.supersetGroup || '',
        sets: Array.from({ length: exercise.sets }, (_, index) =>
          makeSet(
            index + 1,
            index === 0 &&
              ['Bench Press', 'Barbell Squats', 'Standing Barbell Press'].includes(
                exercise.name,
              )
              ? 'Warm-up'
              : 'Working',
          ),
        ),
      })),
    }

    setActiveExercise(0)
    navigate('gym', () => {
      setState((current) => ({ ...current, activeWorkout }))
    })
  }

  const updateSet = (exerciseIndex, setIndex, key, value) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].sets[setIndex][key] = value

      if (key === 'done' && value && navigator.vibrate) {
        navigator.vibrate(18)
      }

      return { ...current, activeWorkout }
    })
  }

  const addSet = (exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      const previous = exercise.sets.at(-1)
      exercise.sets.push({
        ...makeSet(exercise.sets.length + 1, previous?.type ?? 'Working'),
        weight: previous?.weight ?? '',
      })
      return { ...current, activeWorkout }
    })
  }

  const repeatPreviousSet = (exerciseIndex, setIndex) => {
    if (setIndex <= 0) return
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const previous = activeWorkout.exercises[exerciseIndex].sets[setIndex - 1]
      const target = activeWorkout.exercises[exerciseIndex].sets[setIndex]
      target.type = previous.type
      target.weight = previous.weight
      target.reps = previous.reps
      target.done = false
      return { ...current, activeWorkout }
    })
  }

  const skipExercise = (exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      exercise.skipped = true
      return { ...current, activeWorkout }
    })

    const next = Math.min(
      (state.activeWorkout?.exercises.length ?? 1) - 1,
      exerciseIndex + 1,
    )
    setActiveExercise(next)
  }

  const quickAddExercise = ({ name, sets, muscle }) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises.push({
        id: crypto.randomUUID(),
        name,
        muscle,
        oneTime: true,
        sets: Array.from({ length: Math.max(1, sets || 3) }, (_, index) =>
          makeSet(index + 1, 'Working'),
        ),
      })
      return { ...current, activeWorkout }
    })

    window.setTimeout(() => {
      const count = state.activeWorkout?.exercises.length ?? 0
      setActiveExercise(count)
    }, 0)
  }

  const removeSet = (exerciseIndex, setIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      const exercise = activeWorkout.exercises[exerciseIndex]
      if (exercise.sets.length <= 1) return current
      exercise.sets.splice(setIndex, 1)
      exercise.sets.forEach((set, index) => {
        set.number = index + 1
      })
      return { ...current, activeWorkout }
    })
  }

  const undoSkipExercise = (exerciseIndex) => {
    setState((current) => {
      const activeWorkout = structuredClone(current.activeWorkout)
      activeWorkout.exercises[exerciseIndex].skipped = false
      return { ...current, activeWorkout }
    })
  }

  const finishWorkout = () => {
    const workout = state.activeWorkout
    if (!workout) return

    const sets = workout.exercises
      .filter((exercise) => !exercise.skipped)
      .flatMap((exercise) =>
      exercise.sets
        .filter((set) => Number(set.reps) > 0)
        .map((set) => ({
          exercise: exercise.name,
          muscle: exercise.muscle,
          type: set.type,
          weight: Number(set.weight || 0),
          reps: Number(set.reps || 0),
          estimatedOneRepMax: estimatedOneRepMax(
            Number(set.weight || 0),
            Number(set.reps || 0),
          ),
        })),
    )

    if (sets.length === 0) {
      alert('Log at least one set before finishing.')
      return
    }

    const incompleteEnteredSets = workout.exercises.flatMap((exercise) =>
      exercise.sets.filter(
        (set) =>
          (set.weight !== '' || set.reps !== '') &&
          !set.done,
      ),
    )

    if (
      incompleteEnteredSets.length > 0 &&
      !confirm(
        `${incompleteEnteredSets.length} entered set${
          incompleteEnteredSets.length === 1 ? '' : 's'
        } are not marked complete. Finish the workout anyway?`,
      )
    ) {
      return
    }

    const rotation = state.program.rotation
    const currentIndex = rotation.indexOf(workout.name)
    const nextWorkout = rotation[(currentIndex + 1) % rotation.length]

    const completedSession = {
      id: workout.id,
      name: workout.name,
      date: workout.date,
      startedAt: workout.startedAt,
      finishedAt: new Date().toISOString(),
      sets,
    }

    setCompletedSession({ session: completedSession, nextWorkout })
    setState((current) => ({
      ...current,
      program: { ...current.program, nextWorkout },
      activeWorkout: null,
      history: [...current.history, completedSession],
      achievements:
        current.history.length === 0
          ? [
              ...current.achievements,
              {
                id: crypto.randomUUID(),
                name: 'First Foundry Workout',
                earnedAt: new Date().toISOString(),
              },
            ]
          : current.achievements,
    }))

    if (navigator.vibrate) navigator.vibrate([25, 40, 35])
    navigate('complete')
  }

  const activeScreen = useMemo(() => {
    if (screen === 'gym') {
      return (
        <GymScreen
          state={state}
          onStart={startWorkout}
          activeExercise={activeExercise}
          setActiveExercise={setActiveExercise}
          onSetChange={updateSet}
          onAddSet={addSet}
          onFinish={finishWorkout}
          onRepeatSet={repeatPreviousSet}
          onSkipExercise={skipExercise}
          onQuickAddExercise={quickAddExercise}
          onRemoveSet={removeSet}
          onUndoSkip={undoSkipExercise}
        />
      )
    }

    if (screen === 'complete') {
      return (
        <CompletionScreen
          session={completedSession?.session}
          nextWorkout={completedSession?.nextWorkout}
          recentPrs={recentPRs(state.history, 8).filter(
            (pr) => pr.date === completedSession?.session?.date,
          )}
          onDone={() => {
            setCompletedSession(null)
            navigate('home')
          }}
        />
      )
    }

    if (screen === 'progress') return <ProgressScreen state={state} />

    if (screen === 'builder') {
      return (
        <WorkoutBuilderScreen
          program={state.program}
          onSave={(program) =>
            setState((current) => ({ ...current, program }))
          }
          onClose={() => navigate('more')}
        />
      )
    }

    if (screen === 'more') {
      return (
        <MoreScreen
          state={state}
          setState={setState}
          onOpenBuilder={() => navigate('builder')}
        />
      )
    }

    return (
      <HomeScreen
        state={state}
        onStart={startWorkout}
        setScreen={setScreen}
      />
    )
  }, [screen, state, activeExercise, completedSession])

  if (showSplash) {
    return (
      <div className="splash-screen">
        <div className="splash-emblem">A</div>
        <div className="splash-overline">AVAREN</div>
        <div className="splash-title">THE FOUNDRY</div>
        <div className="splash-line" />
      </div>
    )
  }

  return (
    <AppShell
      screen={screen}
      setScreen={(next) => navigate(next)}
      activeWorkout={state.activeWorkout}
      transitioning={transitioning}
    >
      {activeScreen}
    </AppShell>
  )
}

export default App

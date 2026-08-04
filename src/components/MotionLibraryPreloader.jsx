import {
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { preloadMotionFlow } from '../lib/motionLibrary'

export default function MotionLibraryPreloader({
  movements,
  onReady,
}) {
  const [state, setState] = useState({
    completed: 0,
    total: movements.length,
    current: 'Motion Library',
    done: false,
  })

  useEffect(() => {
    let active = true

    preloadMotionFlow(
      movements,
      (progress) => {
        if (!active) return
        setState({
          ...progress,
          done:
            progress.completed ===
            progress.total,
        })
      },
    )
      .catch(() => {})
      .finally(() => {
        if (!active) return

        setState((current) => ({
          ...current,
          completed: current.total,
          done: true,
        }))

        window.setTimeout(
          () => onReady?.(),
          350,
        )
      })

    return () => {
      active = false
    }
  }, [movements, onReady])

  const percent = state.total
    ? Math.round(
        (state.completed / state.total) * 100,
      )
    : 100

  return (
    <section className="motion-library-preloader">
      <div className="motion-library-preloader-icon">
        {state.done ? (
          <Check size={24} />
        ) : (
          <Loader2
            size={24}
            className="spin"
          />
        )}
      </div>

      <span className="eyebrow">
        AVAREN MOTION LIBRARY
      </span>
      <h2>
        {state.done
          ? 'Motion Library ready.'
          : 'Preparing movement guides.'}
      </h2>
      <p>
        {state.done
          ? 'Available artwork and instruction cards are ready.'
          : `Checking ${state.current}…`}
      </p>

      <div className="motion-library-preloader-track">
        <div
          style={{
            width: `${percent}%`,
          }}
        />
      </div>

      <strong>{percent}%</strong>
    </section>
  )
}

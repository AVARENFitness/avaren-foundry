import {
  ChevronLeft,
  ChevronRight,
  Expand,
  Pause,
  Play,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getMotionEntry,
  motionFramePath,
} from '../lib/motionLibrary'

export default function MotionCardViewer({
  movement,
}) {
  const [entry, setEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [assetState, setAssetState] =
    useState('unknown')

  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches ?? false,
    [],
  )

  useEffect(() => {
    let active = true

    setLoading(true)
    setEntry(null)
    setIndex(0)
    setPlaying(false)
    setAssetState('unknown')

    getMotionEntry(movement.id)
      .then((value) => {
        if (!active) return
        setEntry(value)
        setAssetState(
          value?.status ?? 'missing',
        )
      })
      .catch(() => {
        if (!active) return
        setAssetState('missing')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [movement.id])

  const frames = Math.max(
    0,
    Number(entry?.frames ?? 0),
  )

  useEffect(() => {
    if (
      !playing ||
      reducedMotion ||
      frames < 2 ||
      assetState !== 'ready'
    ) {
      return
    }

    const timer = window.setInterval(() => {
      setIndex(
        (current) => (current + 1) % frames,
      )
    }, entry?.frameDuration ?? 1200)

    return () => window.clearInterval(timer)
  }, [
    playing,
    reducedMotion,
    frames,
    assetState,
    entry?.frameDuration,
  ])

  const previous = () => {
    if (!frames) return

    setPlaying(false)
    setIndex(
      (current) =>
        (current - 1 + frames) % frames,
    )
  }

  const next = () => {
    if (!frames) return

    setPlaying(false)
    setIndex(
      (current) => (current + 1) % frames,
    )
  }

  const ready =
    entry &&
    entry.status === 'ready' &&
    assetState === 'ready'

  const visual = (
    <section className="asset-motion-card">
      {loading ? (
        <div className="motion-library-loading">
          <span className="motion-library-spinner" />
          <strong>Loading Motion Library…</strong>
        </div>
      ) : ready ? (
        <>
          <div className="asset-motion-image-shell">
            <img
              key={`${movement.id}-${index}`}
              src={motionFramePath(
                entry,
                index,
              )}
              alt={`${movement.name}, phase ${
                index + 1
              } of ${frames}`}
              onError={() => {
                setAssetState('incomplete')
                setPlaying(false)
              }}
            />

            <div className="asset-motion-phase">
              <span>
                Phase {index + 1} of {frames}
              </span>
              <strong>
                {entry.phaseLabels?.[index] ??
                  movement.motionCue ??
                  'Move with control'}
              </strong>
            </div>
          </div>

          <div className="asset-motion-controls">
            <button onClick={previous}>
              <ChevronLeft size={18} />
            </button>

            <button
              className="asset-motion-play"
              onClick={() =>
                setPlaying((current) => !current)
              }
            >
              {playing ? (
                <Pause size={17} />
              ) : (
                <Play size={17} />
              )}
              {playing ? 'Pause' : 'Play'}
            </button>

            <button onClick={next}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="asset-motion-dots">
            {Array.from(
              { length: frames },
              (_, dotIndex) => (
                <button
                  key={dotIndex}
                  className={
                    dotIndex === index
                      ? 'active'
                      : ''
                  }
                  onClick={() => {
                    setPlaying(false)
                    setIndex(dotIndex)
                  }}
                  aria-label={`Show phase ${
                    dotIndex + 1
                  }`}
                />
              ),
            )}
          </div>
        </>
      ) : (
        <div className="asset-motion-pending">
          <div className="motion-library-status">
            <span
              className={`motion-library-status-dot ${assetState}`}
            />
            <strong>
              {assetState === 'incomplete'
                ? 'Motion Card incomplete'
                : 'Motion Card in production'}
            </strong>
          </div>

          <span className="eyebrow">
            AVAREN MOTION LIBRARY
          </span>
          <h3>
            Illustrated guide coming soon.
          </h3>
          <p>
            AVAREN only displays a movement
            illustration when every authored frame is
            present and approved. No generic body
            poses or misleading placeholders are used.
          </p>

          <div className="motion-library-spec">
            <article>
              <span>Character</span>
              <strong>
                AVAREN Master Athlete
              </strong>
            </article>
            <article>
              <span>View</span>
              <strong>
                {entry?.view ?? 'Movement-specific'}
              </strong>
            </article>
            <article>
              <span>Planned frames</span>
              <strong>
                {entry?.frames ?? '—'}
              </strong>
            </article>
            <article>
              <span>Targets</span>
              <strong>
                {entry?.muscles?.join(', ') ??
                  movement.targetArea ??
                  'Mobility'}
              </strong>
            </article>
          </div>

          <div className="asset-motion-text-steps">
            <article>
              <span>1</span>
              <strong>
                {movement.setupCue ??
                  'Set a stable starting position.'}
              </strong>
            </article>
            <article>
              <span>2</span>
              <strong>
                {movement.actionCue ??
                  movement.instruction}
              </strong>
            </article>
            <article>
              <span>3</span>
              <strong>
                {movement.breathingCue ??
                  'Breathe slowly and naturally.'}
              </strong>
            </article>
          </div>
        </div>
      )}
    </section>
  )

  return (
    <>
      <div className="motion-card-viewer">
        <header>
          <div>
            <span className="eyebrow">
              MOVEMENT GUIDE
            </span>
            <strong>
              {entry?.muscles?.join(' · ') ??
                movement.targetArea ??
                movement.tags
                  ?.slice(0, 2)
                  .join(' · ')}
            </strong>
          </div>

          {ready && (
            <button
              onClick={() =>
                setExpanded(true)
              }
              aria-label="Enlarge movement guide"
            >
              <Expand size={17} />
            </button>
          )}
        </header>

        {visual}
      </div>

      {expanded &&
        createPortal(
          <div
            className="asset-motion-expanded"
            onClick={() =>
              setExpanded(false)
            }
          >
            <section
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <button
                className="asset-motion-close"
                onClick={() =>
                  setExpanded(false)
                }
              >
                <X size={20} />
              </button>
              <span className="eyebrow">
                {movement.name}
              </span>
              {visual}
            </section>
          </div>,
          document.body,
        )}
    </>
  )
}

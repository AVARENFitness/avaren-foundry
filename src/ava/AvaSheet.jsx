import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import AvaConfirmationPreview from './AvaConfirmationPreview'
import { buildConfirmationPreview } from './buildConfirmationPreview'
import { AVA_EXAMPLES, AVA_INTRO } from './constants'
import { useAva } from './useAva'
import { useFocusTrap } from './useFocusTrap'

export default function AvaSheet({ open, onClose }) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const { routeMessage } = useAva()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setInput('')
      setLoading(false)
      setResponse(null)
      setShowPreview(false)
    }
  }, [open])

  const preview = response ? buildConfirmationPreview(response) : null

  const handleSubmit = async (event) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    setLoading(true)
    try {
      const result = await routeMessage(message)
      setResponse(result)
      setShowPreview(Boolean(buildConfirmationPreview(result)))
    } finally {
      setLoading(false)
    }
  }

  const handleExample = (example) => {
    setInput(example)
    setResponse(null)
    setShowPreview(false)
    inputRef.current?.focus()
  }

  const handleEditPreview = () => {
    setShowPreview(false)
    inputRef.current?.focus()
  }

  const handleConfirmPreview = () => {
    setShowPreview(false)
  }

  if (!open) return null

  return createPortal(
    <div
      className="ava-sheet-backdrop app-ui-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        ref={panelRef}
        className="ava-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ava-sheet-header">
          <div className="ava-sheet-title">
            <span className="ava-sheet-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <span className="eyebrow">AVA</span>
              <h2 id={titleId}>Ask AVA</h2>
            </div>
          </div>
          <button
            type="button"
            className="ava-sheet-close"
            onClick={onClose}
            aria-label="Close AVA"
          >
            <X size={18} />
          </button>
        </header>

        <p id={descriptionId} className="ava-sheet-intro">
          {AVA_INTRO}
        </p>

        {!response && (
          <div className="ava-sheet-examples">
            {AVA_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="ava-sheet-example"
                onClick={() => handleExample(example)}
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {response && (
          <article className="ava-sheet-result" aria-live="polite">
            <span className="eyebrow">AVA</span>
            <p>{response.summary}</p>
            {response.suggestions?.length > 0 && (
              <ul className="ava-sheet-suggestions">
                {response.suggestions.slice(0, 2).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </article>
        )}

        {preview && showPreview && (
          <AvaConfirmationPreview
            title={preview.title}
            items={preview.items}
            estimates={preview.estimates}
            confidenceLabel={preview.confidenceLabel}
            onConfirm={handleConfirmPreview}
            onEdit={handleEditPreview}
            onCancel={() => setShowPreview(false)}
          />
        )}

        <form className="ava-sheet-form" onSubmit={handleSubmit}>
          <label className="ava-sheet-input-label" htmlFor="ava-sheet-input">
            Your message
          </label>
          <textarea
            id="ava-sheet-input"
            ref={inputRef}
            className="ava-sheet-input"
            rows={3}
            value={input}
            placeholder="Describe what you ate, drank, lifted, or want to know."
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            className="gold-button machined ava-sheet-send"
            disabled={!input.trim() || loading}
          >
            <ArrowUp size={17} />
            {loading ? 'Analyzing…' : 'Send to AVA'}
          </button>
        </form>
      </section>
    </div>,
    document.body,
  )
}

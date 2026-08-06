import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { appUi } from '../lib/appUi'
import { applyAvaNutritionAction } from './applyAvaNutritionAction'
import AvaConfirmationPreview from './AvaConfirmationPreview'
import { buildConfirmationPreview } from './buildConfirmationPreview'
import { AVA_EXAMPLES, AVA_INTRO } from './constants'
import { interpretNutritionMessage } from './nutritionParser'
import { useAva } from './useAva'
import { useFocusTrap } from './useFocusTrap'

export default function AvaSheet({
  open,
  onClose,
  nutrition,
  onNutritionChange,
  undoSnapshot,
  onUndoSnapshotChange,
}) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const { routeMessage } = useAva()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [clarification, setClarification] = useState(null)

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
      setClarification(null)
    }
  }, [open])

  const preview = response ? buildConfirmationPreview(response) : null

  const runInterpretation = async (message, options = {}) => {
    const nutritionResult = interpretNutritionMessage(message, nutrition, options)

    if (nutritionResult.handled) {
      if (nutritionResult.clarification) {
        setClarification(nutritionResult.clarification)
        setShowPreview(false)
        return {
          ok: true,
          source: 'local',
          intent: nutritionResult.intent,
          summary: nutritionResult.summary,
          data: { interpretation: nutritionResult },
        }
      }

      setClarification(null)
      return {
        ok: true,
        source: 'local',
        intent: nutritionResult.intent,
        summary: nutritionResult.summary,
        data: { interpretation: nutritionResult },
      }
    }

    return routeMessage(message)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    setLoading(true)
    try {
      const result = await runInterpretation(message)
      setResponse(result)
      const interpretation = result?.data?.interpretation
      setShowPreview(
        Boolean(
          interpretation?.requiresConfirmation &&
            interpretation?.preview &&
            !interpretation?.clarification,
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  const handleExample = (example) => {
    setInput(example)
    setResponse(null)
    setShowPreview(false)
    setClarification(null)
    inputRef.current?.focus()
  }

  const handleClarificationChoice = async (choice) => {
    setLoading(true)
    try {
      const result = await runInterpretation(input, {
        selectedChoice: choice,
      })
      setResponse(result)
      setClarification(null)
      setShowPreview(Boolean(result?.data?.interpretation?.requiresConfirmation))
    } finally {
      setLoading(false)
    }
  }

  const handleEditPreview = () => {
    setShowPreview(false)
    inputRef.current?.focus()
  }

  const handleConfirmPreview = () => {
    const interpretation = response?.data?.interpretation
    const action = interpretation?.action

    if (!action || !onNutritionChange) {
      setShowPreview(false)
      return
    }

    try {
      const result = applyAvaNutritionAction(nutrition, action)
      onNutritionChange(result.nutrition)
      onUndoSnapshotChange?.(result.undo)
      appUi.toast(result.toastMessage, 'success')
      setShowPreview(false)
      setResponse({
        ok: true,
        source: 'local',
        intent: interpretation.intent,
        summary: result.toastMessage,
        data: { confirmed: true },
      })
    } catch (error) {
      appUi.toast('Unable to save that AVA action.', 'error')
      console.error('AVA nutrition confirm failed:', error)
    }
  }

  const handleUndo = () => {
    if (!undoSnapshot || !onNutritionChange || !onUndoSnapshotChange) return

    onNutritionChange(undoSnapshot.nutrition)
    onUndoSnapshotChange(null)
    appUi.toast('Last AVA nutrition action undone.', 'success')
    setResponse({
      ok: true,
      source: 'local',
      intent: 'food',
      summary: 'Your previous nutrition state was restored.',
      data: { undone: true },
    })
    setShowPreview(false)
    setClarification(null)
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

        {undoSnapshot && (
          <button
            type="button"
            className="ava-undo-button"
            onClick={handleUndo}
          >
            <RotateCcw size={16} />
            Undo last AVA action
          </button>
        )}

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
          </article>
        )}

        {clarification && (
          <section className="ava-clarification" aria-label="Choose a match">
            <span className="eyebrow">CLARIFY</span>
            <p>Which one did you mean?</p>
            <div className="ava-clarification-choices">
              {clarification.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="ava-clarification-choice"
                  onClick={() => handleClarificationChoice(choice)}
                >
                  <strong>{choice.name}</strong>
                  <span>{choice.brand ?? choice.matchType ?? 'Match'}</span>
                </button>
              ))}
            </div>
          </section>
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

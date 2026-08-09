import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, RotateCcw, Sparkles, X } from 'lucide-react'
import { appUi } from '../lib/appUi'
import {
  buildAvaOpeningMessage,
  buildAvaSuggestedPrompts,
} from '../lib/avaConversation'
import {
  ATHLETE_AVA_CONTEXT_FALLBACK,
  buildCoachAvaOpeningMessage,
  buildCoachSuggestedPrompts,
  isCoachAvaAccess,
} from './avaRuntimeContext'
import {
  canUndoLastReversibleAction,
  AVA_TX_STATUS,
  hasActivePendingTransaction,
} from './avaTransactionState'
import {
  clearNutritionTransactionFingerprints,
  executeNutritionInterpretation,
} from './avaNutritionExecutor'
import {
  AVA_CLARIFICATION_OTHER_ID,
  buildPendingContextLabel,
  recordSuccessfulNutritionExecution,
  syncClarificationFromPending,
  undoLastReversibleAction,
} from './avaNutritionTransaction'
import { logCandidateDiagnostics } from './avaFoodRefinement'
import { AVA_PIPELINE_KIND, runAvaMessagePipeline } from './avaMessagePipeline'
import { AVA_ACTION_OUTCOME_KIND, AVA_ACTION_IDS } from './actions/avaActionTypes'
import { isNavigationAction } from './actions/avaActionReferent'
import { orchestrateUiAction } from './actions/avaActionOrchestrator'
import { runCoachDisambiguationStep } from './coach/avaCoachPipeline'
import { recordAvaTurn } from '../lib/avaSessionContext'
import AvaConfirmationPreview from './AvaConfirmationPreview'
import AvaPlanProposalCard from './AvaPlanProposalCard'
import { buildConfirmationPreview } from './buildConfirmationPreview'
import { useAva } from './useAva'
import { useFocusTrap } from './useFocusTrap'

const createMessage = (role, text, extras = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role,
  text,
  ...extras,
})

export default function AvaSheet({
  open,
  onClose,
  onDismissAfterNavigation,
  nutrition,
  onNutritionChange,
  packet,
  session,
  appHistory = [],
  onAvaAction,
  actionRuntime = null,
  coachContext = null,
  role = 'athlete',
}) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const transcriptRef = useRef(null)
  const submitLockRef = useRef(false)
  const openedRef = useRef(false)
  const nutritionRef = useRef(nutrition)
  const { routeMessage } = useAva()
  const dismissAfterNavigation = onDismissAfterNavigation ?? onClose

  const closeSheetAfterNavigation = useCallback(() => {
    queueMicrotask(() => {
      dismissAfterNavigation?.()
    })
  }, [dismissAfterNavigation])

  useEffect(() => {
    nutritionRef.current = nutrition
  }, [nutrition])

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [suggestedPrompts, setSuggestedPrompts] = useState([])
  const [pendingResponse, setPendingResponse] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [clarification, setClarification] = useState(null)
  const [pendingUserMessage, setPendingUserMessage] = useState('')
  const [pendingContextLabel, setPendingContextLabel] = useState(null)
  const [undoMessageId, setUndoMessageId] = useState(null)
  const [undoRevision, setUndoRevision] = useState(0)
  const [candidateRevision, setCandidateRevision] = useState(0)
  const [actionBusyId, setActionBusyId] = useState(null)
  const [executedActionIds, setExecutedActionIds] = useState([])

  const activeClarification = useMemo(() => {
    return syncClarificationFromPending(session) ?? clarification
  }, [session, clarification, candidateRevision, undoRevision])

  const renderCandidateControls = Boolean(activeClarification?.choices?.length)

  useEffect(() => {
    logCandidateDiagnostics({
      session,
      rendered: renderCandidateControls,
      source: 'ava-sheet',
    })
  }, [session, renderCandidateControls, candidateRevision])

  const hasUserMessages = messages.some((message) => message.role === 'user')
  const showUndo =
    undoRevision >= 0 && canUndoLastReversibleAction(session, nutrition)

  useEffect(() => {
    if (!canUndoLastReversibleAction(session, nutrition)) {
      setUndoMessageId(null)
    }
  }, [nutrition, undoRevision, session, open])

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
      openedRef.current = false
      setInput('')
      setLoading(false)
      setMessages([])
      setSuggestedPrompts([])
      setPendingResponse(null)
      setShowPreview(false)
      setClarification(null)
      setPendingUserMessage('')
      setPendingContextLabel(null)
      setUndoMessageId(null)
      clearNutritionTransactionFingerprints()
      return
    }

    if (openedRef.current) return
    openedRef.current = true

    if (isCoachAvaAccess({ role, coachContext })) {
      setMessages([
        createMessage('ava', buildCoachAvaOpeningMessage(coachContext ?? {})),
      ])
      setSuggestedPrompts(buildCoachSuggestedPrompts())
      return
    }

    if (packet) {
      const opening = buildAvaOpeningMessage(packet)
      setMessages([createMessage('ava', opening)])
      setSuggestedPrompts(buildAvaSuggestedPrompts(packet))
      return
    }

    setMessages([createMessage('ava', ATHLETE_AVA_CONTEXT_FALLBACK)])
    setSuggestedPrompts([])
  }, [open, packet, role, coachContext])

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages, loading, showPreview, activeClarification, showUndo])

  const syncCandidatesFromPending = () => {
    const payload = syncClarificationFromPending(session)
    if (payload?.choices?.length) {
      setClarification(payload)
      setPendingContextLabel(buildPendingContextLabel(session?.pendingAction))
      setCandidateRevision((value) => value + 1)
      return true
    }
    return false
  }

  const preview = pendingResponse
    ? buildConfirmationPreview(pendingResponse)
    : null

  const appendMessage = (message) => {
    setMessages((current) => [...current, message])
    if (session && message.role === 'ava') {
      recordAvaTurn(session, message.text, { actions: message.actions ?? [] })
    }
    return message
  }

  const bumpUndoRevision = () => setUndoRevision((value) => value + 1)

  const applyPipelineOutcome = (outcome) => {
    if (!outcome?.message) {
      appendMessage(
        createMessage('ava', "I couldn't finish that action. Try that again."),
      )
      return
    }

    setPendingResponse(outcome.raw ?? null)

    if (outcome.kind === AVA_PIPELINE_KIND.ACTION_SUCCESS) {
      setClarification(null)
      setPendingContextLabel(null)
      setShowPreview(false)
      setCandidateRevision((value) => value + 1)

      const actionId = outcome.raw?.actionId
      const navigated =
        outcome.raw?.payload?.destination ||
        outcome.raw?.navigated ||
        isNavigationAction(actionId)

      if (navigated && actionId) {
        closeSheetAfterNavigation()
        return
      }

      if (outcome.actionResult?.ok) {
        appUi.toast(outcome.message, 'success')
      }

      const avaMessage = appendMessage(createMessage('ava', outcome.message))
      if (canUndoLastReversibleAction(session, nutritionRef.current)) {
        setUndoMessageId(avaMessage.id)
        bumpUndoRevision()
      }
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.CANCELLED) {
      setClarification(null)
      setPendingContextLabel(null)
      setShowPreview(false)
      setCandidateRevision((value) => value + 1)
      appendMessage(createMessage('ava', outcome.message))
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.CLARIFICATION) {
      setShowPreview(Boolean(outcome.showPreview))

      if (outcome.candidates?.choices?.length) {
        setClarification(outcome.candidates)
        setPendingContextLabel(
          outcome.candidates?.coachClientDisambiguation
            ? 'Choose a client'
            : buildPendingContextLabel(session?.pendingAction),
        )
      } else {
        syncCandidatesFromPending()
      }

      setCandidateRevision((value) => value + 1)
      appendMessage(createMessage('ava', outcome.message))
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.CONFIRMATION) {
      setShowPreview(true)
      setClarification(null)
      setPendingContextLabel(buildPendingContextLabel(session?.pendingAction))
      setCandidateRevision((value) => value + 1)
      appendMessage(createMessage('ava', outcome.message))
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.COACH_RESULT) {
      appendMessage(
        createMessage('ava', outcome.message, {
          actions: outcome.actions ?? [],
          coachResults: outcome.coachResults ?? [],
        }),
      )
      setSuggestedPrompts(outcome.suggestions ?? [])
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.ACTION_FAILURE) {
      setShowPreview(false)
      appendMessage(createMessage('ava', outcome.message))
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.PLAN_PROPOSAL) {
      appendMessage(
        createMessage('ava', outcome.message, {
          planProposal: outcome.planProposal,
          actions: outcome.actions ?? [],
        }),
      )
      return
    }

    if (outcome.kind === AVA_PIPELINE_KIND.ACTION_READY) {
      appendMessage(
        createMessage('ava', outcome.message, {
          actions: outcome.actions ?? [],
        }),
      )
      setSuggestedPrompts(outcome.suggestions ?? [])
      return
    }

    appendMessage(
      createMessage('ava', outcome.message, {
        actions: outcome.actions ?? [],
      }),
    )
    setSuggestedPrompts(outcome.suggestions ?? [])

    if (syncCandidatesFromPending()) {
      setShowPreview(false)
      return
    }

    if (!hasActivePendingTransaction(session)) {
      setClarification(null)
      setPendingContextLabel(null)
      setShowPreview(false)
    }
  }

  const runMessage = async (message, options = {}) =>
    runAvaMessagePipeline({
      message,
      nutrition: nutritionRef.current,
      session,
      packet,
      appHistory,
      routeMessage,
      actionRuntime,
      coachContext,
      role,
      onNutritionChange: (nextNutrition) => {
        nutritionRef.current = nextNutrition
        onNutritionChange?.(nextNutrition)
      },
      options,
    })

  const handleSubmit = async (event) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading || submitLockRef.current) return

    submitLockRef.current = true
    appendMessage(createMessage('user', message))
    setPendingUserMessage(message)
    setInput('')
    setSuggestedPrompts([])
    setLoading(true)

    try {
      const outcome = await runMessage(message)
      applyPipelineOutcome(outcome)
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-pipeline] unhandled-submit-error', error)
      }
      appendMessage(
        createMessage(
          'ava',
          "I'm having trouble finishing that one. Try it again.",
        ),
      )
    } finally {
      setLoading(false)
      submitLockRef.current = false
    }
  }

  const handlePrompt = async (prompt) => {
    if (loading || submitLockRef.current) return

    submitLockRef.current = true
    appendMessage(createMessage('user', prompt))
    setSuggestedPrompts([])
    setLoading(true)

    try {
      const outcome = await runMessage(prompt)
      applyPipelineOutcome(outcome)
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-pipeline] unhandled-prompt-error', error)
      }
      appendMessage(
        createMessage(
          'ava',
          "I'm having trouble finishing that one. Try it again.",
        ),
      )
    } finally {
      setLoading(false)
      submitLockRef.current = false
    }
  }

  const handleClarificationChoice = async (choice) => {
    if (loading || submitLockRef.current) return

    submitLockRef.current = true
    setLoading(true)

    try {
      if (activeClarification?.coachClientDisambiguation) {
        const outcome = await runCoachDisambiguationStep({
          choice,
          session,
          coachContext,
          actionRuntime,
          pendingAction: activeClarification?.pendingAction ?? null,
        })
        applyPipelineOutcome(outcome)
        setClarification(null)
        setCandidateRevision((value) => value + 1)
        return
      }

      const sourceMessage =
        session?.pendingAction?.originalUserMessage ||
        session?.pendingAction?.originalMessage ||
        pendingUserMessage ||
        input.trim()

      const outcome = await runMessage(sourceMessage, { selectedChoice: choice })
      applyPipelineOutcome(outcome)

      if (
        outcome.kind !== AVA_PIPELINE_KIND.CLARIFICATION ||
        !outcome.candidates?.choices?.length
      ) {
        if (!syncClarificationFromPending(session)) {
          setClarification(null)
          setPendingContextLabel(null)
        }
      }
      setCandidateRevision((value) => value + 1)
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.debug('[ava-pipeline] unhandled-clarification-error', error)
      }
      appendMessage(
        createMessage(
          'ava',
          "I'm having trouble finishing that one. Try it again.",
        ),
      )
    } finally {
      setLoading(false)
      submitLockRef.current = false
    }
  }

  const handleEditPreview = () => {
    setShowPreview(false)
    inputRef.current?.focus()
  }

  const handleConfirmPreview = () => {
    const interpretation = pendingResponse?.data?.interpretation

    if (!interpretation?.action || !onNutritionChange) {
      setShowPreview(false)
      return
    }

    const execution = executeNutritionInterpretation({
      nutrition,
      interpretation,
      transactionId: session?.pendingAction?.id,
    })

    if (execution.ok) {
      onNutritionChange(execution.nutrition)
      recordSuccessfulNutritionExecution({ session, execution })
      appUi.toast(execution.summary, 'success')
      setShowPreview(false)
      setClarification(null)
      setPendingContextLabel(null)
      setPendingResponse(null)

      const avaMessage = appendMessage(createMessage('ava', execution.summary))
      if (canUndoLastReversibleAction(session, nutrition)) {
        setUndoMessageId(avaMessage.id)
        bumpUndoRevision()
      }
    } else {
      appUi.toast('Unable to save that AVA action.', 'error')
      appendMessage(createMessage('ava', execution.summary))
    }
  }

  const handleUndo = () => {
    if (!onNutritionChange || !canUndoLastReversibleAction(session, nutrition)) return

    const result = undoLastReversibleAction({ nutrition, session })
    if (!result.ok) {
      appUi.toast('Unable to undo that action.', 'error')
      appendMessage(createMessage('ava', result.summary))
      return
    }

    onNutritionChange(result.nutrition)
    appUi.toast(result.summary, 'success')
    setUndoMessageId(null)
    bumpUndoRevision()
    setShowPreview(false)
    setClarification(null)
    setPendingContextLabel(null)
    setPendingResponse(null)
    appendMessage(createMessage('ava', result.summary))
  }

  const handlePlanApply = async (messageId) => {
    if (loading || actionBusyId) return
    setActionBusyId(AVA_ACTION_IDS.APPLY_PLAN_PROPOSAL)
    setLoading(true)
    try {
      const outcome = await runMessage('apply it')
      applyPipelineOutcome(outcome)
      setExecutedActionIds((current) => [
        ...current,
        `${messageId}-${AVA_ACTION_IDS.APPLY_PLAN_PROPOSAL}`,
      ])
    } finally {
      setActionBusyId(null)
      setLoading(false)
    }
  }

  const handlePlanKeepCurrent = async (messageId) => {
    if (loading || actionBusyId) return
    setActionBusyId(AVA_ACTION_IDS.CANCEL_PLAN_PROPOSAL)
    setLoading(true)
    try {
      const outcome = await runMessage('keep current plan')
      applyPipelineOutcome(outcome)
      setExecutedActionIds((current) => [
        ...current,
        `${messageId}-${AVA_ACTION_IDS.CANCEL_PLAN_PROPOSAL}`,
      ])
    } finally {
      setActionBusyId(null)
      setLoading(false)
    }
  }

  const handleAction = async (action, messageId) => {
    const actionId = action.actionId ?? action.id
    if (!actionId || actionBusyId) return

    if (actionId === AVA_ACTION_IDS.APPLY_PLAN_PROPOSAL) {
      await handlePlanApply(messageId)
      return
    }

    if (actionId === AVA_ACTION_IDS.CANCEL_PLAN_PROPOSAL) {
      await handlePlanKeepCurrent(messageId)
      return
    }

    if (actionId === 'OPEN_PLANNER') {
      actionRuntime?.navigate?.('planner')
      closeSheetAfterNavigation()
      return
    }

    setActionBusyId(actionId)

    try {
      if (actionRuntime) {
        const outcome = await orchestrateUiAction({
          actionId,
          runtime: actionRuntime,
          packet,
          session,
          requestId: `${messageId ?? 'ui'}-${actionId}`,
          meta: action.meta ?? {},
        })

        if (outcome.kind === AVA_ACTION_OUTCOME_KIND.ACTION_SUCCESS) {
          setExecutedActionIds((current) => [...current, `${messageId}-${actionId}`])
          closeSheetAfterNavigation()
          return
        }

        appendMessage(createMessage('ava', outcome.message))
        return
      }

      onAvaAction?.(action.id, action.meta ?? {})
      onClose?.()
    } finally {
      setActionBusyId(null)
    }
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
        className="ava-sheet ava-sheet--conversation"
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

        <p id={descriptionId} className="ava-sheet-context">
          {role === 'coach'
            ? 'Coach operations — clients, reviews, and who needs attention.'
            : packet?.briefing?.headline
              ? `Today's read: ${packet.briefing.headline}`
              : 'Training companion for today\'s plan, readiness, and recovery.'}
        </p>

        <div className="ava-sheet-body">
          <div ref={transcriptRef} className="ava-chat-transcript" aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`ava-chat-message ava-chat-message--${message.role}`}
              >
                {message.role === 'ava' && (
                  <span className="ava-chat-label">AVA</span>
                )}
                {message.role === 'user' && (
                  <span className="ava-chat-label ava-chat-label--user">You</span>
                )}
                <p>{message.text}</p>
                {message.planProposal ? (
                  <AvaPlanProposalCard
                    proposal={message.planProposal}
                    busy={Boolean(actionBusyId)}
                    applied={executedActionIds.some((entry) =>
                      entry.startsWith(`${message.id}-${AVA_ACTION_IDS.APPLY_PLAN_PROPOSAL}`),
                    )}
                    onApply={() => handlePlanApply(message.id)}
                    onKeepCurrent={() => handlePlanKeepCurrent(message.id)}
                  />
                ) : null}
                {message.coachResults?.length > 0 && (
                  <div className="ava-coach-results">
                    {message.coachResults.map((item) => (
                      <div
                        key={`${message.id}-${item.athleteId ?? item.clientName}`}
                        className="ava-coach-result"
                      >
                        <div className="ava-coach-result-copy">
                          <strong>{item.clientName}</strong>
                          <span>{item.reason}</span>
                        </div>
                        {(item.actions ?? []).slice(0, 1).map((action) => (
                          <button
                            key={`${item.athleteId}-${action.actionId}`}
                            type="button"
                            className="ava-chat-action ava-coach-result-action"
                            disabled={Boolean(actionBusyId)}
                            onClick={() => handleAction(action, message.id)}
                          >
                            Open
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {message.id === undoMessageId && showUndo && (
                  <button
                    type="button"
                    className="ava-inline-undo"
                    onClick={handleUndo}
                  >
                    <RotateCcw size={14} />
                    Undo
                  </button>
                )}
                {message.actions?.length > 0 && (
                  <div className="ava-chat-actions">
                    {message.actions.map((action) => {
                      const actionKey = action.actionId ?? action.id
                      const isExecuted = executedActionIds.includes(`${message.id}-${actionKey}`)
                      const isBusy = actionBusyId === actionKey

                      if (isExecuted) return null

                      return (
                        <button
                          key={`${message.id}-${actionKey}-${action.label}`}
                          type="button"
                          className="ava-chat-action"
                          disabled={Boolean(actionBusyId)}
                          aria-busy={isBusy}
                          onClick={() => handleAction(action, message.id)}
                        >
                          {isBusy ? 'Opening…' : action.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </article>
            ))}

            {loading && (
              <article className="ava-chat-message ava-chat-message--ava ava-chat-message--pending">
                <span className="ava-chat-label">AVA</span>
                <p className="ava-chat-thinking">
                  <span className="ava-chat-thinking-dot" aria-hidden="true" />
                  <span className="ava-chat-thinking-dot" aria-hidden="true" />
                  <span className="ava-chat-thinking-dot" aria-hidden="true" />
                </p>
              </article>
            )}
          </div>

          {suggestedPrompts.length > 0 && !loading && !hasUserMessages && (
            <div className="ava-sheet-examples" aria-label="Suggested prompts">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="ava-sheet-example"
                  onClick={() => handlePrompt(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {(renderCandidateControls || activeClarification?.choices?.length > 0) && (
            <section
              className="ava-tool-result ava-clarification ava-clarification--active"
              aria-label="Choose a match"
              data-ava-candidate-count={activeClarification?.choices?.length ?? 0}
            >
              <span className="eyebrow">LOGGING</span>
              {pendingContextLabel && (
                <p className="ava-pending-context">{pendingContextLabel}</p>
              )}
              <p className="ava-clarification-prompt">
                {activeClarification?.summary ?? 'Which one was it?'}
              </p>
              <div className="ava-clarification-choices">
                {(activeClarification?.choices ?? []).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={`ava-clarification-choice${choice.isOther ? ' ava-clarification-choice--other' : ''}`}
                    onClick={() => handleClarificationChoice(choice)}
                    disabled={loading}
                    aria-label={choice.name}
                  >
                    <strong>{choice.displayTitle ?? choice.name}</strong>
                    <span>
                      {choice.isOther
                        ? (choice.displaySubtitle ?? 'Search another brand or name')
                        : (choice.displaySubtitle ??
                          ([choice.brand, choice.serving].filter(Boolean).join(' · ') ||
                            'Catalog match'))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {preview && showPreview && (
            <div className="ava-tool-result ava-tool-result--preview">
              <AvaConfirmationPreview
                title={preview.title}
                items={preview.items}
                estimates={preview.estimates}
                confidenceLabel={preview.confidenceLabel}
                onConfirm={handleConfirmPreview}
                onEdit={handleEditPreview}
                onCancel={() => setShowPreview(false)}
              />
            </div>
          )}
        </div>

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
            placeholder="Ask about today's workout, readiness, recovery, or nutrition."
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />

          <button
            type="submit"
            className="gold-button machined ava-sheet-send"
            disabled={!input.trim() || loading}
          >
            <ArrowUp size={17} />
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </form>
      </section>
    </div>,
    document.body,
  )
}

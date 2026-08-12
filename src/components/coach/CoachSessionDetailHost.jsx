import CoachPassSelectionModal from './CoachPassSelectionModal'
import CoachMissedChargeSheet from './CoachMissedChargeSheet'
import CoachSessionDetailSheet from './CoachSessionDetailSheet'
import { useCoachSessionDetail } from '../../hooks/useCoachSessionDetail'

export default function CoachSessionDetailHost({
  clients = [],
  assignments = [],
  onOpenClientProfile,
  onMutated,
  sessions,
  setSessions,
  onLoadSessions,
  children,
}) {
  const detail = useCoachSessionDetail({
    clients,
    assignments,
    onOpenClientProfile,
    onMutated,
    sessions,
    setSessions,
    onLoadSessions,
  })

  const passSelectionTitle =
    detail.passSelection?.mode === 'complete'
      ? 'Which pass should this session use?'
      : 'Choose a training pass'

  const passSelectionDescription =
    detail.passSelection?.mode === 'complete'
      ? 'This session is complete. Select the pass that should receive the debit.'
      : 'This client has more than one eligible pass. Select which pass should receive this debit.'

  return (
    <>
      {typeof children === 'function' ? children(detail.openSession) : children}

      <CoachSessionDetailSheet
        open={Boolean(detail.activeSession)}
        session={detail.activeSession}
        client={detail.activeClient}
        assignments={detail.assignments}
        passSummary={detail.activePassSummary}
        onClose={detail.closeDetail}
        rescheduleMode={detail.rescheduleMode}
        rescheduleDraft={detail.rescheduleDraft}
        onRescheduleDraftChange={detail.setRescheduleDraft}
        onBeginReschedule={detail.beginReschedule}
        onSaveReschedule={detail.saveReschedule}
        onViewClient={detail.handleViewClient}
        onComplete={detail.handleComplete}
        onApplyPassDebit={detail.handleApplyPassDebit}
        onCancel={detail.handleCancel}
        onMarkMissed={detail.handleMarkMissed}
        completingSessionId={detail.completingSessionId}
        passDebitState={detail.passDebitState}
        passActionBusy={detail.passActionBusy}
      />

      <CoachPassSelectionModal
        open={Boolean(detail.passSelection)}
        title={passSelectionTitle}
        description={passSelectionDescription}
        candidates={detail.passSelection?.candidates ?? []}
        submitting={detail.passActionBusy}
        onClose={detail.closePassSelection}
        onSelect={detail.handlePassSelection}
      />

      <CoachMissedChargeSheet
        open={Boolean(detail.missedChargeSession)}
        submitting={detail.passActionBusy}
        onClose={() => detail.setMissedChargeSession(null)}
        onNoCharge={detail.handleMissedNoCharge}
        onCharge={detail.handleMissedCharge}
      />
    </>
  )
}

export { useCoachSessionDetail }

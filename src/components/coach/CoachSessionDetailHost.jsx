import { useState } from 'react'
import CoachPassSelectionModal from './CoachPassSelectionModal'
import CoachMissedChargeSheet from './CoachMissedChargeSheet'
import CoachSessionDetailSheet from './CoachSessionDetailSheet'
import CoachFloorMode from '../CoachFloorMode'
import {
  resolveAthleteDataId,
  resolveRecordBusinessClientId,
} from '../../lib/coachBusinessClient'
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
  const [floorSession, setFloorSession] = useState(null)

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
        onStartFloorMode={(session) => {
          setFloorSession(session)
          detail.closeDetail()
        }}
        onComplete={detail.handleComplete}
        onApplyPassDebit={detail.handleApplyPassDebit}
        onCancel={detail.handleCancel}
        onMarkMissed={detail.handleMarkMissed}
        completingSessionId={detail.completingSessionId}
        passDebitState={detail.passDebitState}
        passActionBusy={detail.passActionBusy}
      />

      {floorSession ? (
        <CoachFloorMode
          session={floorSession}
          client={
            clients.find((client) => {
              const businessClientId = resolveRecordBusinessClientId(client)
              const athleteId = resolveAthleteDataId(client)
              return (
                (floorSession.businessClientId &&
                  businessClientId === floorSession.businessClientId) ||
                (floorSession.athleteId &&
                  athleteId === floorSession.athleteId)
              )
            }) ?? null
          }
          assignments={assignments}
          passSummary={detail.passSummaryFor(floorSession)}
          onClose={() => setFloorSession(null)}
          onCompleteAppointment={async (session) => {
            const result = await detail.handleComplete(session)
            detail.closeDetail()
            if (result?.ok) setFloorSession(null)
            return result
          }}
        />
      ) : null}

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

import { isActiveBusinessClient, isArchivedBusinessClient } from './coachBusinessClient'
import { isOpenFollowUp } from './coachFollowUp'
import { summarizeClientPasses } from './coachPass'
import { SCHEDULED_SESSION_STATUS } from './coachScheduledSessions'
import { relativeDayLabel } from './clientIntelligence'

export const RELATIONSHIP_STATUS = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  ENDED: 'ended',
}

export const buildClientHealthSummary = ({
  client = null,
  nextAppointment = null,
  passes = [],
  appointments = [],
  checkIn = null,
  followUps = [],
  trainingProgress = null,
  now = new Date(),
} = {}) => {
  const passSummary = summarizeClientPasses(passes)
  const completedAppointments = (appointments ?? []).filter(
    (item) => item?.status === SCHEDULED_SESSION_STATUS.COMPLETED,
  )
  const missedAppointments = (appointments ?? []).filter(
    (item) => item?.status === SCHEDULED_SESSION_STATUS.MISSED,
  )
  const lastAppointment = [...completedAppointments].sort((a, b) =>
    String(b.sessionDate ?? b.startsAt ?? '').localeCompare(
      String(a.sessionDate ?? a.startsAt ?? ''),
    ),
  )[0] ?? null

  const recentMissed = [...missedAppointments].sort((a, b) =>
    String(b.sessionDate ?? b.startsAt ?? '').localeCompare(
      String(a.sessionDate ?? a.startsAt ?? ''),
    ),
  )[0] ?? null

  const openFollowUps = (followUps ?? []).filter(isOpenFollowUp)
  const checkInConcern =
    checkIn?.painOrIssue === 'coach_should_know' ||
    Number(checkIn?.recoveryRating ?? 5) <= 2
      ? {
          recoveryRating: checkIn?.recoveryRating ?? null,
          painNote: checkIn?.painNote ?? '',
        }
      : null

  const relationshipStatus = isArchivedBusinessClient(client)
    ? RELATIONSHIP_STATUS.ARCHIVED
    : isActiveBusinessClient(client)
      ? RELATIONSHIP_STATUS.ACTIVE
      : RELATIONSHIP_STATUS.ENDED

  const lastTrainedAt =
    trainingProgress?.lastSessionAt ??
    lastAppointment?.sessionDate ??
    lastAppointment?.startsAt ??
    null

  return {
    nextAppointment: nextAppointment
      ? {
          id: nextAppointment.id,
          sessionDate: nextAppointment.sessionDate ?? null,
          startTime: nextAppointment.startTime ?? null,
          startsAt: nextAppointment.startsAt ?? null,
          appointmentType: nextAppointment.appointmentType ?? null,
        }
      : null,
    remainingPasses: passSummary.totalBalance,
    passSummary,
    lastAppointment: lastAppointment
      ? {
          sessionDate: lastAppointment.sessionDate ?? null,
          status: lastAppointment.status,
        }
      : null,
    recentAttendance: {
      lastTrainedLabel: lastTrainedAt
        ? relativeDayLabel(lastTrainedAt, now)
        : null,
      recentMissed: recentMissed
        ? {
            sessionDate: recentMissed.sessionDate ?? null,
          }
        : null,
    },
    checkInConcern,
    trainingProgress: trainingProgress
      ? {
          recentHighlight: trainingProgress.recentHighlight ?? null,
          lastSessionName: trainingProgress.lastSessionName ?? null,
        }
      : null,
    openFollowUps: openFollowUps.map((item) => ({
      id: item.id,
      reasonType: item.reasonType,
      summary: item.summary,
      status: item.status,
    })),
    relationshipStatus,
  }
}

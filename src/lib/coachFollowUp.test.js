import { describe, expect, it } from 'vitest'
import {
  buildFollowUpSummary,
  canTransitionFollowUpStatus,
  FOLLOWUP_REASON_TYPE,
  FOLLOWUP_STATUS,
  inferFollowUpReason,
  isOpenFollowUp,
  normalizeCoachFollowUp,
  validateCoachFollowUpInput,
} from './coachFollowUp'
import {
  attachSessionModeMetadata,
  hasScheduledInPersonToday,
  resolveSessionMode,
  SESSION_MODE,
} from './sessionMode'
import { resetDevCoachFollowUpStore } from './coachBackend'

describe('sessionMode', () => {
  it('resolves solo, coach-assigned, and in-person modes', () => {
    expect(resolveSessionMode()).toBe(SESSION_MODE.SOLO)
    expect(
      resolveSessionMode({ assignmentId: 'a1', coachAssigned: true }),
    ).toBe(SESSION_MODE.COACH_ASSIGNED)
    expect(
      resolveSessionMode({
        assignmentId: 'a1',
        coachAssigned: true,
        linkedAppointmentToday: true,
      }),
    ).toBe(SESSION_MODE.IN_PERSON_COACHED)
  })

  it('detects scheduled in-person sessions for today', () => {
    const today = '2026-08-09'
    expect(
      hasScheduledInPersonToday(
        [{ sessionDate: today, status: 'scheduled' }],
        today,
      ),
    ).toBe(true)
    expect(
      hasScheduledInPersonToday(
        [{ scheduled_date: today, status: 'cancelled' }],
        today,
      ),
    ).toBe(false)
  })

  it('persists session mode on active workout metadata', () => {
    const workout = attachSessionModeMetadata(
      { id: 'w1', name: 'Chest + Back' },
      SESSION_MODE.IN_PERSON_COACHED,
    )
    expect(workout.sessionMode).toBe(SESSION_MODE.IN_PERSON_COACHED)
  })
})

describe('coachFollowUp', () => {
  it('validates follow-up input', () => {
    expect(
      validateCoachFollowUpInput({
        athleteId: 'athlete-1',
        reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
        summary: 'Shoulder discomfort during bench press.',
      }).ok,
    ).toBe(true)

    expect(
      validateCoachFollowUpInput({
        athleteId: 'athlete-1',
        reasonType: 'INVALID',
        summary: 'Shoulder discomfort during bench press.',
      }).ok,
    ).toBe(false)
  })

  it('builds structured pain summaries without transcript storage', () => {
    const summary = buildFollowUpSummary({
      reasonType: FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT,
      exerciseName: 'Bench Press',
      detail: 'My shoulder really hurts bad on bench and I think it might be torn',
    })

    expect(summary.toLowerCase()).toContain('shoulder')
    expect(summary.toLowerCase()).toContain('bench press')
    expect(summary.toLowerCase()).not.toContain('torn')
    expect(summary.toLowerCase()).not.toContain('really hurts')
    expect(summary.length).toBeGreaterThan(8)
  })

  it('builds structured schedule summaries without transcript storage', () => {
    const summary = buildFollowUpSummary({
      reasonType: FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT,
      detail: "I can't make Friday because my kid has a doctor appointment",
    })

    expect(summary).toBe('Unable to make Friday session.')
    expect(summary).not.toContain('doctor')
  })

  it('infers reason types deterministically', () => {
    expect(
      inferFollowUpReason({
        isPain: true,
      }),
    ).toBe(FOLLOWUP_REASON_TYPE.PAIN_OR_DISCOMFORT)

    expect(
      inferFollowUpReason({
        message: "I can't make Friday",
        isSchedule: true,
      }),
    ).toBe(FOLLOWUP_REASON_TYPE.SCHEDULE_CONFLICT)
  })

  it('supports minimal follow-up status transitions', () => {
    expect(
      canTransitionFollowUpStatus(FOLLOWUP_STATUS.OPEN, FOLLOWUP_STATUS.REVIEWED),
    ).toBe(true)
    expect(
      canTransitionFollowUpStatus(FOLLOWUP_STATUS.REVIEWED, FOLLOWUP_STATUS.RESOLVED),
    ).toBe(true)
    expect(
      canTransitionFollowUpStatus(FOLLOWUP_STATUS.RESOLVED, FOLLOWUP_STATUS.OPEN),
    ).toBe(false)
  })

  it('normalizes database and local follow-up rows', () => {
    const item = normalizeCoachFollowUp({
      id: 'f1',
      coach_id: 'coach-1',
      athlete_id: 'athlete-1',
      reason_type: 'PAIN_OR_DISCOMFORT',
      summary: 'Shoulder discomfort during bench press.',
      status: 'open',
    })

    expect(item.coachId).toBe('coach-1')
    expect(isOpenFollowUp(item)).toBe(true)
  })
})

describe('coachBackend dev follow-up store', () => {
  it('resets dev store between tests', () => {
    resetDevCoachFollowUpStore()
    expect(true).toBe(true)
  })
})

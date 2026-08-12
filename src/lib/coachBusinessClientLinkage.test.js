import { describe, expect, it } from 'vitest'
import {
  APPOINTMENT_LINKAGE_ERROR,
  appointmentLinkageUserMessage,
  auditAppointmentLinkageRepair,
  buildSessionLinkageForensics,
  resolveConnectedBusinessClientId,
  validateConnectedAppointmentLinkage,
} from './coachBusinessClientLinkage'

describe('coachBusinessClientLinkage', () => {
  const coachId = 'coach-1'
  const athleteId = 'athlete-jake'
  const businessClientId = 'bc-jake'

  const businessClients = [
    {
      id: businessClientId,
      coach_id: coachId,
      linked_user_id: athleteId,
    },
  ]

  it('resolves canonical business client from coach bridge', () => {
    const resolution = resolveConnectedBusinessClientId({
      coachId,
      athleteId,
      coachClientBridge: { business_client_id: businessClientId },
      businessClients,
    })

    expect(resolution.businessClientResolved).toBe(true)
    expect(resolution.businessClientId).toBe(businessClientId)
    expect(resolution.resolvedBusinessClientMatchesCoach).toBe(true)
    expect(resolution.resolvedBusinessClientMatchesAthlete).toBe(true)
    expect(resolution.ambiguous).toBe(false)
  })

  it('resolves business client directly from linked_user_id when bridge is missing', () => {
    const resolution = resolveConnectedBusinessClientId({
      coachId,
      athleteId,
      businessClients,
    })

    expect(resolution.businessClientId).toBe(businessClientId)
    expect(resolution.businessClientResolved).toBe(true)
  })

  it('marks ambiguous mappings as unresolved', () => {
    const resolution = resolveConnectedBusinessClientId({
      coachId,
      athleteId,
      businessClients: [
        { id: 'bc-a', coach_id: coachId, linked_user_id: athleteId },
        { id: 'bc-b', coach_id: coachId, linked_user_id: athleteId },
      ],
    })

    expect(resolution.businessClientResolved).toBe(false)
    expect(resolution.ambiguous).toBe(true)
  })

  it('rejects connected appointment creation without business client linkage', () => {
    const result = validateConnectedAppointmentLinkage({
      coachId,
      athleteId,
      businessClientId: null,
      businessClients,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(APPOINTMENT_LINKAGE_ERROR)
    expect(appointmentLinkageUserMessage(result.error)).toContain(
      'missing business linkage',
    )
  })

  it('rejects wrong coach/client mapping', () => {
    const result = validateConnectedAppointmentLinkage({
      coachId: 'other-coach',
      athleteId,
      businessClientId,
      businessClients,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('appointment_coach_client_mismatch')
  })

  it('audits deterministic legacy repair candidates', () => {
    const audit = auditAppointmentLinkageRepair({
      appointments: [
        {
          id: 'session-1',
          coach_id: coachId,
          athlete_id: athleteId,
          business_client_id: null,
        },
        {
          id: 'session-2',
          coach_id: coachId,
          athlete_id: athleteId,
          business_client_id: null,
        },
        {
          id: 'session-linked',
          coach_id: coachId,
          athlete_id: athleteId,
          business_client_id: businessClientId,
        },
      ],
      businessClients,
    })

    expect(audit.repairable).toHaveLength(2)
    expect(audit.ambiguous).toHaveLength(0)
    expect(audit.unresolvable).toHaveLength(0)
    expect(audit.repairable[0].resolvedBusinessClientId).toBe(businessClientId)
  })

  it('reports missing business client linkage on completed sessions', () => {
    const report = buildSessionLinkageForensics({
      id: 'session-1',
      coachId,
      athleteId,
      businessClientId: null,
      status: 'completed',
    })

    expect(report.sessionExists).toBe(true)
    expect(report.athleteIdPresent).toBe(true)
    expect(report.businessClientIdPresent).toBe(false)
    expect(report.coachIdPresent).toBe(true)
    expect(report.statusCompleted).toBe(true)
  })

  it('allows completed appointment pass debit once business client is linked', () => {
    const session = {
      id: 'session-1',
      coachId,
      athleteId,
      businessClientId,
      status: 'completed',
    }

    const linkage = buildSessionLinkageForensics(session)
    const validation = validateConnectedAppointmentLinkage({
      coachId,
      athleteId,
      businessClientId,
      businessClients,
    })

    expect(linkage.businessClientIdPresent).toBe(true)
    expect(validation.ok).toBe(true)
  })
})

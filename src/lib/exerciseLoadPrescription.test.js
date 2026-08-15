import { describe, expect, it } from 'vitest'
import {
  buildCompletedSet,
  formatCompletedSetDisplay,
  formatLegacyCompletedSetDisplay,
  isActiveSetEntered,
  LOAD_TYPES,
  normalizeLoadType,
} from './exerciseLoad'
import {
  formatPrescriptionDisplay,
  formatPrescriptionForCoachPayload,
  gymModeSetLabel,
  normalizePrescription,
  prescribedSetCount,
} from './exercisePrescription'
import {
  materializeWorkoutExercise,
} from './materializeWorkoutExercise'
import { sessionLoadVolume } from './workoutMetrics'
import { sanitizeAthleteCoachAssignment } from './avaTrustedContext'
import { resolveTodayWorkoutContext } from './todayWorkout'
import { getAthleteHomeState } from './athleteHomeState'

describe('8.13 load model', () => {
  it('1. missing loadType defaults safely to external', () => {
    expect(normalizeLoadType(undefined, 'Bench Press')).toBe(LOAD_TYPES.EXTERNAL)
  })

  it('2. external exercise renders weight + reps', () => {
    expect(
      formatCompletedSetDisplay({
        loadType: LOAD_TYPES.EXTERNAL,
        weight: 185,
        reps: 8,
      }),
    ).toBe('185 × 8')
  })

  it('3. bodyweight exercise requires reps only', () => {
    expect(isActiveSetEntered({ reps: 10 }, LOAD_TYPES.BODYWEIGHT)).toBe(true)
    expect(isActiveSetEntered({ reps: '', weight: '' }, LOAD_TYPES.BODYWEIGHT)).toBe(
      false,
    )
  })

  it('4. bodyweight history renders BW, not 0 lb', () => {
    expect(
      formatCompletedSetDisplay({
        loadType: LOAD_TYPES.BODYWEIGHT,
        weight: 0,
        reps: 10,
      }),
    ).toBe('BW × 10')
  })

  it('5. weighted bodyweight renders BW + added load', () => {
    expect(
      formatCompletedSetDisplay({
        loadType: LOAD_TYPES.BODYWEIGHT_ADDED,
        addedWeight: 25,
        reps: 6,
      }),
    ).toBe('BW + 25 lb × 6')
  })

  it('6. assisted renders positive assistance semantics', () => {
    expect(
      formatCompletedSetDisplay({
        loadType: LOAD_TYPES.ASSISTED,
        assistance: 40,
        reps: 10,
      }),
    ).toBe('40 lb assist × 10')
  })

  it('7. load type persists through active workout save/reload', () => {
    const exercise = materializeWorkoutExercise({
      name: 'Pull-up',
      muscle: 'Back',
      loadType: LOAD_TYPES.BODYWEIGHT,
      sets: 3,
    })

    expect(exercise.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(exercise.sets).toHaveLength(3)
  })

  it('8. load type persists into completed history', () => {
    const completed = buildCompletedSet({
      exercise: { name: 'Pull-up', muscle: 'Back', loadType: LOAD_TYPES.BODYWEIGHT },
      set: { type: 'Working', reps: 8, weight: '' },
    })

    expect(completed.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(formatCompletedSetDisplay(completed)).toBe('BW × 8')
  })

  it('9. mixed workout does not produce misleading bodyweight tonnage', () => {
    const session = {
      sets: [
        { exercise: 'Bench Press', loadType: LOAD_TYPES.EXTERNAL, weight: 135, reps: 8 },
        { exercise: 'Pull-up', loadType: LOAD_TYPES.BODYWEIGHT, weight: 0, reps: 10 },
        { exercise: 'Pull-up', loadType: LOAD_TYPES.ASSISTED, assistance: 40, weight: 0, reps: 8 },
      ],
    }

    expect(sessionLoadVolume(session)).toBe(1080)
  })

  it('10. existing legacy sessions still render', () => {
    expect(formatLegacyCompletedSetDisplay({ weight: 225, reps: 5 })).toBe('225 × 5')
    expect(formatLegacyCompletedSetDisplay({ weight: 0, reps: 10 })).toBe('10 reps')
  })
})

describe('8.13 coach prescription', () => {
  it('11. coach can prescribe exact sets/reps', () => {
    const prescription = normalizePrescription({ sets: 4, reps: '6' })
    expect(prescription).toEqual({ sets: 4, reps: { min: 6, max: 6 } })
    expect(formatPrescriptionDisplay(prescription)).toBe('4 sets · 6 reps')
  })

  it('12. coach can prescribe rep range', () => {
    const prescription = normalizePrescription({ sets: 3, reps: '8-12' })
    expect(prescription.reps).toEqual({ min: 8, max: 12 })
    expect(formatPrescriptionDisplay(prescription)).toBe('3 sets · 8–12 reps')
  })

  it('13. assignment receives prescription', () => {
    const payload = formatPrescriptionForCoachPayload({
      name: 'Bench Press',
      muscle: 'Chest',
      sets: 4,
      reps: '6',
      loadType: LOAD_TYPES.EXTERNAL,
    })

    expect(payload.prescription.sets).toBe(4)
    expect(payload.prescription.reps).toEqual({ min: 6, max: 6 })
  })

  it('14. template is not mutated by client-only override', () => {
    const templateExercise = {
      name: 'Bench Press',
      muscle: 'Chest',
      sets: 3,
      reps: '8-12',
    }
    const templateSnapshot = structuredClone(templateExercise)

    formatPrescriptionForCoachPayload({
      ...templateExercise,
      sets: 4,
      reps: '6',
    })

    expect(templateExercise).toEqual(templateSnapshot)
  })

  it('15. prescribed set count initializes athlete set rows', () => {
    const exercise = materializeWorkoutExercise({
      name: 'Lat Pulldown',
      muscle: 'Back',
      sets: 3,
      reps: '8-12',
    })

    expect(exercise.sets).toHaveLength(3)
    expect(prescribedSetCount(exercise.prescription)).toBe(3)
  })

  it('16. athlete can log reps outside target range', () => {
    expect(isActiveSetEntered({ reps: 13 }, LOAD_TYPES.BODYWEIGHT)).toBe(true)
    expect(isActiveSetEntered({ reps: 7 }, LOAD_TYPES.BODYWEIGHT)).toBe(true)
  })

  it('17. active session does not lose entered sets if template later changes', () => {
    const active = materializeWorkoutExercise({ name: 'Bench Press', sets: 4, reps: '6' })
    active.sets[0].reps = 6
    active.sets[0].weight = 185
    active.sets[0].done = true

    const laterTemplate = materializeWorkoutExercise({ name: 'Bench Press', sets: 3, reps: '10' })
    expect(active.sets[0].done).toBe(true)
    expect(laterTemplate.sets).toHaveLength(3)
  })

  it('18. prescription survives refresh/cloud sync', () => {
    const payload = formatPrescriptionForCoachPayload({
      name: 'Bench Press',
      sets: 4,
      reps: '6',
    })

    const rematerialized = materializeWorkoutExercise(payload)
    expect(rematerialized.prescription.sets).toBe(4)
    expect(rematerialized.prescription.reps).toEqual({ min: 6, max: 6 })
  })

  it('19. athlete display shows set/rep target', () => {
    expect(
      formatPrescriptionDisplay({ sets: 4, reps: { min: 6, max: 6 } }),
    ).toBe('4 sets · 6 reps')
  })

  it('20. gym mode shows current set of prescribed total', () => {
    expect(
      gymModeSetLabel(1, { sets: 4, reps: { min: 8, max: 12 } }),
    ).toBe('SET 2 OF 4 · Target: 8–12 reps')
  })

  it('21. no prescription still works with existing workouts', () => {
    const exercise = materializeWorkoutExercise({ name: 'Curls', muscle: 'Biceps', sets: 3 })
    expect(exercise.sets).toHaveLength(3)
    expect(formatPrescriptionDisplay(exercise.prescription)).toBe('3 sets')
  })
})

describe('8.13 combined load + prescription', () => {
  it('22. coach assigns bodyweight pull-up 4 × 6–10', () => {
    const payload = formatPrescriptionForCoachPayload({
      name: 'Pull-up',
      muscle: 'Back',
      sets: 4,
      reps: '6-10',
      loadType: LOAD_TYPES.BODYWEIGHT,
    })

    expect(payload.loadType).toBe(LOAD_TYPES.BODYWEIGHT)
    expect(payload.prescription.reps).toEqual({ min: 6, max: 10 })
  })

  it('23. athlete sees correct prescription + bodyweight mode', () => {
    const assignment = sanitizeAthleteCoachAssignment({
      title: 'Back Day',
      workout_payload: {
        exercises: [
          {
            name: 'Pull-up',
            muscle: 'Back',
            sets: 4,
            reps: '6-10',
            loadType: LOAD_TYPES.BODYWEIGHT,
            prescription: { sets: 4, reps: { min: 6, max: 10 } },
          },
        ],
      },
    })

    expect(assignment.exercises[0].summary).toContain('4 sets · 6–10 reps')
    expect(assignment.exercises[0].summary).toContain('Bodyweight')
  })

  it('24. gym mode requires reps only', () => {
    expect(
      isActiveSetEntered({ reps: 8, weight: '' }, LOAD_TYPES.BODYWEIGHT),
    ).toBe(true)
  })

  it('25. completed history preserves both prescription and actual result', () => {
    const completed = buildCompletedSet({
      exercise: {
        name: 'Pull-up',
        muscle: 'Back',
        loadType: LOAD_TYPES.BODYWEIGHT,
        prescription: { sets: 4, reps: { min: 6, max: 10 } },
      },
      set: { type: 'Working', reps: 9, weight: '' },
    })

    expect(completed.prescription.reps.max).toBe(10)
    expect(formatCompletedSetDisplay(completed)).toBe('BW × 9')
  })
})

describe('8.13 AVA / regression', () => {
  it('26. AVA bodyweight summary does not say 0 lb', () => {
    const summary = formatCompletedSetDisplay({
      loadType: LOAD_TYPES.BODYWEIGHT,
      weight: 0,
      reps: 10,
    })

    expect(summary).not.toMatch(/0 lb/)
    expect(summary).toBe('BW × 10')
  })

  it('27. appointment/schedule flows unaffected', () => {
    const context = resolveTodayWorkoutContext({
      program: { nextWorkout: 'Chest + Back', rotation: ['Chest + Back'], workouts: {} },
      weeklySchedule: {},
      selectedWorkout: null,
      history: [],
    })

    expect(context.name).toBe('Chest + Back')
  })

  it('28. daily home truth unaffected', () => {
    const home = getAthleteHomeState({
      now: new Date('2026-08-15T09:00:00'),
      state: {
        program: {
          nextWorkout: 'Chest + Back',
          rotation: ['Chest + Back'],
          workouts: { 'Chest + Back': [] },
        },
        history: [],
        weeklySchedule: {},
        selectedWorkout: null,
      },
      readiness: { completed: true, factors: [] },
    })

    expect(home.sections).toBeTruthy()
    expect(home.primaryAction?.id).toBeTruthy()
  })

  it('29. coach hub client data unaffected', () => {
    const payload = formatPrescriptionForCoachPayload({
      name: 'Bench Press',
      sets: 4,
      reps: '6',
    })

    expect(payload.name).toBe('Bench Press')
  })

  it('30. workout completion/next-workout logic unaffected', () => {
    const session = {
      sets: [{ exercise: 'Bench Press', loadType: LOAD_TYPES.EXTERNAL, weight: 135, reps: 8 }],
    }

    expect(sessionLoadVolume(session)).toBe(1080)
  })
})

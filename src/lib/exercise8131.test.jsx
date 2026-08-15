import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AssignmentExercisePreview, {
  formatAssignmentExerciseLine,
} from '../components/AssignmentExercisePreview'
import SupersetFocus from '../components/SupersetFocus'
import { LOAD_TYPES } from './exerciseLoad'
import { materializeWorkoutExercise } from './materializeWorkoutExercise'
import { resolveSessionVolumeDisplay } from './sessionVolumeDisplay'
import {
  mapTrustedCompletedSet,
  mapTrustedExercise,
} from './trustedExerciseMapping'

describe('8.13.1 assignment preview', () => {
  it('1. assigned workout preview shows exact reps', () => {
    const line = formatAssignmentExerciseLine({
      name: 'Bench Press',
      sets: 4,
      reps: '6',
    })

    expect(line.prescription).toBe('4 sets · 6 reps')
  })

  it('2. assigned workout preview shows rep range', () => {
    const line = formatAssignmentExerciseLine({
      name: 'Lat Pulldown',
      sets: 3,
      reps: '8-12',
    })

    expect(line.prescription).toBe('3 sets · 8–12 reps')
  })

  it('3. bodyweight assignment preview displays Bodyweight', () => {
    render(
      <AssignmentExercisePreview
        exercises={[
          {
            name: 'Pull-up',
            sets: 4,
            reps: '6-10',
            loadType: LOAD_TYPES.BODYWEIGHT,
          },
        ]}
      />,
    )

    expect(screen.getByText('Pull-up')).toBeInTheDocument()
    expect(screen.getByText('4 sets · 6–10 reps')).toBeInTheDocument()
    expect(screen.getByText('Bodyweight')).toBeInTheDocument()
  })

  it('4. preview does not require athlete to start workout', () => {
    render(
      <AssignmentExercisePreview
        exercises={[{ name: 'Bench Press', sets: 4, reps: '6' }]}
      />,
    )

    expect(screen.getByLabelText('Prescribed exercises')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument()
  })
})

describe('8.13.1 superset load types', () => {
  const baseExercise = (overrides = {}) => ({
    id: 'ex-1',
    name: 'Pull-up',
    muscle: 'Back',
    loadType: LOAD_TYPES.BODYWEIGHT,
    prescription: { sets: 4, reps: { min: 6, max: 10 } },
    sets: [
      {
        id: 'set-1',
        number: 1,
        type: 'Working',
        weight: '',
        reps: '',
        done: false,
      },
    ],
    ...overrides,
  })

  it('5. BW superset exercise uses reps-only input', () => {
    const { container } = render(
      <SupersetFocus
        exercises={[baseExercise()]}
        group="A"
        round={0}
        totalRounds={1}
        onSetChange={() => {}}
      />,
    )

    const labels = [...container.querySelectorAll('.focus-control label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['Reps'])
  })

  it('6. BW+weight superset uses added-load input', () => {
    const { container } = render(
      <SupersetFocus
        exercises={[
          baseExercise({ loadType: LOAD_TYPES.BODYWEIGHT_ADDED }),
        ]}
        group="A"
        round={0}
        totalRounds={1}
        onSetChange={() => {}}
      />,
    )

    const labels = [...container.querySelectorAll('.focus-control label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['Added weight', 'Reps'])
  })

  it('7. assisted superset uses assistance input', () => {
    const { container } = render(
      <SupersetFocus
        exercises={[baseExercise({ loadType: LOAD_TYPES.ASSISTED })]}
        group="A"
        round={0}
        totalRounds={1}
        onSetChange={() => {}}
      />,
    )

    const labels = [...container.querySelectorAll('.focus-control label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['Assistance', 'Reps'])
  })

  it('8. external superset remains unchanged', () => {
    const { container } = render(
      <SupersetFocus
        exercises={[
          baseExercise({
            name: 'Bench Press',
            loadType: LOAD_TYPES.EXTERNAL,
          }),
        ]}
        group="A"
        round={0}
        totalRounds={1}
        onSetChange={() => {}}
      />,
    )

    const labels = [...container.querySelectorAll('.focus-control label')].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual(['Weight', 'Reps'])
  })

  it('9. prescription set count/rep range renders in superset path', () => {
    render(
      <SupersetFocus
        exercises={[baseExercise()]}
        group="A"
        round={0}
        totalRounds={4}
        onSetChange={() => {}}
      />,
    )

    expect(screen.getByText('4 sets · 6–10 reps')).toBeInTheDocument()
    expect(screen.getByText(/SET 1 OF 4 · Target: 6–10 reps/)).toBeInTheDocument()
  })
})

describe('8.13.1 AVA trusted mapping', () => {
  it('10. trusted context describes BW exercise semantically', () => {
    const mapped = mapTrustedExercise({
      name: 'Pull-up',
      sets: 4,
      reps: '6-10',
      loadType: LOAD_TYPES.BODYWEIGHT,
    })

    expect(mapped.summary).toContain('Bodyweight')
    expect(mapped.summary).not.toMatch(/0 lb/)
  })

  it('11. trusted context describes BW+added load', () => {
    const mapped = mapTrustedCompletedSet({
      exercise: 'Pull-up',
      loadType: LOAD_TYPES.BODYWEIGHT_ADDED,
      addedWeight: 25,
      reps: 6,
    })

    expect(mapped.display).toBe('BW + 25 lb × 6')
  })

  it('12. trusted context describes assistance', () => {
    const mapped = mapTrustedCompletedSet({
      exercise: 'Pull-up',
      loadType: LOAD_TYPES.ASSISTED,
      assistance: 40,
      reps: 10,
    })

    expect(mapped.display).toBe('40 lb assist × 10')
  })

  it('13. prescription included correctly where relevant', () => {
    const mapped = mapTrustedExercise({
      name: 'Bench Press',
      sets: 4,
      reps: '6',
    })

    expect(mapped.prescription.reps).toEqual({ min: 6, max: 6 })
    expect(mapped.summary).toBe('4 sets · 6 reps')
  })

  it('14. no 0 lb bodyweight representation', () => {
    const mapped = mapTrustedCompletedSet({
      exercise: 'Pull-up',
      loadType: LOAD_TYPES.BODYWEIGHT,
      weight: 0,
      reps: 10,
    })

    expect(mapped.display).toBe('BW × 10')
    expect(mapped.display).not.toMatch(/0 lb/)
  })
})

describe('8.13.1 volume display', () => {
  it('15. mixed session external-load calculation remains correct', () => {
    const display = resolveSessionVolumeDisplay({
      sets: [
        {
          exercise: 'Bench Press',
          loadType: LOAD_TYPES.EXTERNAL,
          weight: 135,
          reps: 8,
        },
        {
          exercise: 'Pull-up',
          loadType: LOAD_TYPES.BODYWEIGHT,
          weight: 0,
          reps: 10,
        },
      ],
    })

    expect(display.show).toBe(true)
    expect(display.value).toBe(1080)
  })

  it('16. athlete-facing label is not misleading', () => {
    const display = resolveSessionVolumeDisplay({
      sets: [
        {
          exercise: 'Bench Press',
          loadType: LOAD_TYPES.EXTERNAL,
          weight: 135,
          reps: 8,
        },
        {
          exercise: 'Pull-up',
          loadType: LOAD_TYPES.BODYWEIGHT,
          reps: 10,
        },
      ],
    })

    expect(display.label).toBe('Load volume')
    expect(display.hint).toMatch(/External load only/)
  })

  it('17. pure bodyweight session does not present meaningless 0 lb tonnage', () => {
    const display = resolveSessionVolumeDisplay({
      sets: [
        {
          exercise: 'Pull-up',
          loadType: LOAD_TYPES.BODYWEIGHT,
          reps: 10,
        },
      ],
    })

    expect(display.show).toBe(false)
  })
})

describe('8.13.1 snapshot safety', () => {
  it('18. template edit does not mutate active session', () => {
    const active = materializeWorkoutExercise({
      name: 'Bench Press',
      sets: 4,
      reps: '6',
    })
    active.sets[0].reps = 6
    active.sets[0].weight = 185

    const templateAfterEdit = materializeWorkoutExercise({
      name: 'Bench Press',
      sets: 3,
      reps: '10',
    })

    expect(active.sets[0].reps).toBe(6)
    expect(templateAfterEdit.sets).toHaveLength(3)
  })

  it('19. assignment edit before start is materialized correctly', () => {
    const assignmentExercise = {
      name: 'Lat Pulldown',
      sets: 3,
      reps: '8-12',
    }

    const materialized = materializeWorkoutExercise(assignmentExercise)
    expect(materialized.sets).toHaveLength(3)
    expect(materialized.prescription.reps).toEqual({ min: 8, max: 12 })
  })

  it('20. client-specific override does not mutate reusable template', () => {
    const templateExercise = {
      name: 'Bench Press',
      sets: 3,
      reps: '8-12',
    }
    const templateSnapshot = structuredClone(templateExercise)

    materializeWorkoutExercise({
      ...templateExercise,
      sets: 4,
      reps: '6',
    })

    expect(templateExercise).toEqual(templateSnapshot)
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatGoalTarget,
  normalizeAthleteGoal,
  sanitizeAthleteGoalDraft,
} from './athleteGoals'

describe('structured athlete goals', () => {
  it('normalizes database shape for product use', () => {
    expect(
      normalizeAthleteGoal({
        athlete_id: 'athlete-1',
        primary_goal: 'performance',
        target_label: 'Bench press',
        target_value: '225',
        target_unit: 'lb',
        target_date: '2027-01-15',
        priority_areas: ['Strength', 'Recovery'],
        note: 'Build without beating up shoulders.',
      }),
    ).toMatchObject({
      athleteId: 'athlete-1',
      primaryGoal: 'performance',
      targetLabel: 'Bench press',
      targetValue: 225,
      targetUnit: 'lb',
      targetDate: '2027-01-15',
      priorityAreas: ['Strength', 'Recovery'],
    })
  })

  it('sanitizes flexible targets and caps duplicate priorities', () => {
    const result = sanitizeAthleteGoalDraft({
      primaryGoal: 'build_muscle',
      targetLabel: 'Body weight',
      targetValue: '190',
      targetUnit: 'lb',
      priorityAreas: [
        'Muscle',
        'Strength',
        'Muscle',
        'Nutrition',
        'Recovery',
        'Consistency',
        'Mobility',
      ],
      note: '  Controlled gain  ',
    })

    expect(result.targetValue).toBe(190)
    expect(result.priorityAreas).toEqual([
      'Muscle',
      'Strength',
      'Nutrition',
      'Recovery',
      'Consistency',
    ])
    expect(result.note).toBe('Controlled gain')
  })

  it('formats a target without assuming every goal is body weight', () => {
    expect(
      formatGoalTarget({
        targetLabel: 'Bench press',
        targetValue: 225,
        targetUnit: 'lb',
      }),
    ).toBe('Bench press · 225 · lb')

    expect(
      formatGoalTarget({
        targetLabel: 'Training frequency',
        targetValue: 4,
        targetUnit: 'sessions/week',
      }),
    ).toBe('Training frequency · 4 · sessions/week')
  })
})

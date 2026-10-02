import { describe, expect, it } from 'vitest'
import { buildTrustedModelContext, extractClientHints, extractSessionContext } from './trustedContext'

const now = new Date('2026-10-02T18:00:00.000Z')

const foundryState = {
  selectedWorkout: 'Chest + Back',
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  activeWorkout: null,
  program: {
    nextWorkout: 'Chest + Back',
    workouts: {
      'Chest + Back': [
        { name: 'Bench Press', sets: 3, reps: '6-8', muscle: 'Chest' },
        { name: 'Barbell Row', sets: 3, reps: '8-10', muscle: 'Back' },
      ],
    },
  },
  readiness: {
    entries: [
      {
        date: '2026-10-02',
        sleep: 4,
        energy: 3,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  mobility: { completed: [] },
  history: [
    {
      id: 'h1',
      date: '2026-09-28',
      name: 'Legs',
      sets: [{ exercise: 'Squat', weight: 225, reps: 5 }],
    },
    {
      id: 'h2',
      date: '2026-10-01',
      name: 'Arms',
      sets: [{ exercise: 'Curl', weight: 35, reps: 10 }],
    },
  ],
  nutrition: {
    goals: {
      configured: true,
      calories: 2200,
      protein: 180,
      carbs: 225,
      fat: 65,
      fiber: 30,
      waterOz: 100,
      inputs: { goal: 'lose_fat' },
      adaptation: {
        enabled: true,
        lastAppliedAt: '2026-09-29T12:00:00.000Z',
        lastAdjustmentCalories: -150,
        lastObservedPercentPerWeek: -0.2,
        history: [
          {
            appliedAt: '2026-09-29T12:00:00.000Z',
            previousCalories: 2350,
            nextCalories: 2200,
            adjustmentCalories: -150,
            percentPerWeek: -0.2,
            adherence: 0.84,
          },
        ],
      },
    },
    days: {
      '2026-09-29': {
        date: '2026-09-29',
        foods: [{ name: 'Meal', calories: 2100, protein: 175 }],
        weight: 181,
      },
      '2026-10-01': {
        date: '2026-10-01',
        foods: [{ name: 'Meal', calories: 2180, protein: 182 }],
        weight: 180.5,
      },
      '2026-10-02': {
        date: '2026-10-02',
        foods: [
          {
            name: 'Breakfast',
            calories: 650,
            protein: 55,
            carbs: 70,
            fat: 18,
            fiber: 8,
          },
        ],
        waterOz: 40,
        weight: 180,
        workoutActivities: [{ activeCalories: 420 }],
      },
    },
  },
}

describe('AVA athlete universal trusted context', () => {
  it('combines training, nutrition, progress, schedule, and weekly check-in facts', () => {
    const context = buildTrustedModelContext({
      authenticatedUserId: 'athlete-1',
      foundryState,
      serverAssignments: [],
      nutritionProfile: { goals: foundryState.nutrition.goals },
      nutritionDay: {
        snapshot: foundryState.nutrition.days['2026-10-02'],
      },
      athleteAppointments: [
        {
          id: 'appt-1',
          status: 'scheduled',
          starts_at: '2026-10-04T14:00:00.000Z',
          session_date: '2026-10-04',
          start_time: '10:00',
          coach_display_name: 'Coach',
          linked_workout_title: 'Upper Strength',
          location_name: 'AVAREN Gym',
        },
      ],
      weeklyCheckIn: {
        week_start: '2026-09-28',
        week_end: '2026-10-04',
        submitted_at: '2026-10-02T13:00:00.000Z',
        training_rating: 4,
        recovery_rating: 3,
        nutrition_rating: 4,
        pain_or_issue: 'no_issues',
        weekly_win: 'Stayed consistent',
        status: 'submitted',
      },
      sessionContext: extractSessionContext({}),
      clientHints: extractClientHints({}),
      profileFirstName: 'Jacob',
      now,
      hasCloudState: true,
    })

    expect(context.serverFacts.trustedToday.canonicalWorkout).toBe('Chest + Back')
    expect(context.serverFacts.nutrition.calories).toBe(650)
    expect(context.serverFacts.nutrition.activeCalories).toBe(420)
    expect(context.serverFacts.nutrition.effectiveCalorieBudget).toBe(2620)
    expect(context.serverFacts.nutrition.adaptation?.lastAdjustmentCalories).toBe(-150)
    expect(context.serverFacts.progress.sessionsLast7Days).toBe(2)
    expect(context.serverFacts.progress.weightTrend.latest?.weight).toBe(180)
    expect(context.serverFacts.schedule.nextAppointment?.linkedWorkoutTitle).toBe('Upper Strength')
    expect(context.serverFacts.weeklyCheckIn.latest?.nutritionRating).toBe(4)
  })

  it('does not invent athlete schedule or weekly check-in facts when none exist', () => {
    const context = buildTrustedModelContext({
      authenticatedUserId: 'athlete-1',
      foundryState: {},
      serverAssignments: [],
      nutritionProfile: null,
      nutritionDay: null,
      athleteAppointments: [],
      weeklyCheckIn: null,
      sessionContext: extractSessionContext({}),
      clientHints: extractClientHints({}),
      now,
      hasCloudState: false,
    })

    expect(context.serverFacts.schedule.upcomingCount).toBe(0)
    expect(context.serverFacts.schedule.nextAppointment).toBeNull()
    expect(context.serverFacts.weeklyCheckIn.hasSubmission).toBe(false)
    expect(context.serverFacts.progress.totalRecordedSessions).toBe(0)
  })
})

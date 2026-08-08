import { describe, expect, it } from 'vitest'
import { buildAvaContextPacket } from './avaContext'
import { buildAvaDailyBriefing } from './avaIntelligence'

const today = new Date().toISOString().slice(0, 10)

const baseState = {
  history: [
    {
      id: 'session-1',
      date: today,
      name: 'Chest + Back',
      sets: [
        {
          exercise: 'Bench Press',
          muscle: 'Chest',
          weight: 135,
          reps: 8,
          estimatedOneRepMax: 170,
        },
      ],
    },
  ],
  readiness: {
    entries: [
      {
        id: 'ready-1',
        date: today,
        sleep: 4,
        energy: 4,
        soreness: 2,
        stress: 2,
      },
    ],
  },
  selectedWorkout: 'Chest + Back',
  program: {
    nextWorkout: 'Chest + Back',
    workouts: {
      'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
    },
  },
  weeklySchedule: ['Rest', 'Chest + Back', 'Arms', 'Legs', 'Chest + Back', 'Arms', 'Rest'],
  mobility: { completed: [] },
  nutrition: {
    goals: { calories: 2200, protein: 170 },
    days: {},
  },
}

describe('avaContext', () => {
  it('builds a packet aligned with the daily briefing workout', () => {
    const packet = buildAvaContextPacket(baseState, {
      userName: 'Jacob Corell',
      now: new Date(`${today}T18:00:00`),
    })
    const briefing = buildAvaDailyBriefing(baseState, {
      userName: 'Jacob Corell',
      now: new Date(`${today}T18:00:00`),
    })

    expect(packet.athlete.firstName).toBe('Jacob')
    expect(packet.workout.displayName).toBe('Chest + Back')
    expect(packet.workout.displayName).toBe(briefing.workout.displayName)
    expect(packet.briefing.headline).toBe(briefing.headline)
    expect(packet.briefing.primaryAction?.type).toBe(
      briefing.primaryAction?.type,
    )
  })

  it('includes coach assignment context without private coach-hub fields', () => {
    const assignment = {
      id: 'assign-1',
      status: 'assigned',
      title: 'Coach Lower Day',
      due_date: today,
      coach_notes: 'Keep effort controlled.',
      privateCoachReview: 'Internal only',
      workout_payload: {
        name: 'Coach Lower Day',
        exercises: [{ name: 'Squat', sets: 3, muscle: 'Quads' }],
      },
    }

    const packet = buildAvaContextPacket(baseState, {
      assignments: [assignment],
      now: new Date(`${today}T14:00:00`),
    })

    expect(JSON.stringify(packet)).not.toContain('Internal only')
    expect(JSON.stringify(packet)).not.toContain('privateCoachReview')
    expect(packet.workout.coachAssigned).toBe(true)
    expect(packet.assignment?.workoutName).toBe('Coach Lower Day')
  })
})

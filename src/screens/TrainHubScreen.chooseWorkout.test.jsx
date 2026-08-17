import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import TrainHubScreen from './TrainHubScreen'
import { createNutritionState } from '../lib/nutrition'

vi.mock('../hooks/useAthleteAppointments', () => ({
  useAthleteAppointments: () => ({
    status: 'ready',
    loading: false,
    ready: true,
    error: null,
    appointments: [],
    upcomingAppointments: [],
    nextAppointment: null,
    refreshAppointments: vi.fn(),
    reload: vi.fn(),
  }),
}))

describe('TrainHubScreen choose-workout visual contract', () => {
  it('uses AVAREN secondary action styling without light browser defaults', () => {
    const { container } = render(
      <TrainHubScreen
        state={{
          selectedWorkout: null,
          activeWorkout: null,
          program: {
            rotation: ['Chest + Back', 'Arms', 'Legs + Core'],
            workouts: {
              'Chest + Back': [{ name: 'Bench Press', sets: 3, muscle: 'Chest' }],
              Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
              'Legs + Core': [{ name: 'Squat', sets: 3, muscle: 'Legs' }],
            },
          },
          history: [],
          nutrition: createNutritionState(),
        }}
        onStart={() => {}}
        navigate={() => {}}
      />,
    )

    const chooseButton = container.querySelector('.train-choose-workout-link')
    expect(chooseButton).not.toBeNull()
    expect(chooseButton?.classList.contains('athlete-choose-workout-action')).toBe(true)
    expect(chooseButton?.classList.contains('ui-btn-secondary')).toBe(true)
    expect(chooseButton?.classList.contains('home-today-plan-link')).toBe(false)

    const startButton = container.querySelector('.gold-button')
    expect(startButton).not.toBeNull()
    expect(startButton?.textContent).toMatch(/Start Session/i)
  })

  it('shows Resume Workout when an active session exists', () => {
    const { container } = render(
      <TrainHubScreen
        state={{
          selectedWorkout: 'Arms',
          activeWorkout: {
            id: 'session-1',
            name: 'Arms',
            exercises: [],
          },
          program: {
            rotation: ['Arms'],
            workouts: {
              Arms: [{ name: 'Curls', sets: 3, muscle: 'Biceps' }],
            },
          },
          history: [],
          nutrition: createNutritionState(),
        }}
        onStart={() => {}}
        navigate={() => {}}
      />,
    )

    const resumeButton = container.querySelector('.gold-button')
    expect(resumeButton?.textContent).toMatch(/Resume Workout/i)
  })
})

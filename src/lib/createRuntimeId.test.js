import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCoachInsights } from './coach'
import { createRuntimeId, isUuidV4 } from './createRuntimeId'

const workout = () => ({
  id: 'one',
  name: 'Chest + Back',
  date: new Date().toISOString().slice(0, 10),
  startedAt: `${new Date().toISOString().slice(0, 10)}T10:00:00`,
  finishedAt: `${new Date().toISOString().slice(0, 10)}T11:00:00`,
  sets: [
    {
      exercise: 'Bench Press',
      muscle: 'Chest',
      weight: 100,
      reps: 5,
      estimatedOneRepMax: 116,
      type: 'Working',
    },
  ],
})

describe('createRuntimeId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses native crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })

    expect(createRuntimeId()).toBe('11111111-1111-4111-8111-111111111111')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('builds a UUID v4 from getRandomValues when randomUUID is unavailable', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, index) => index)
    const getRandomValues = vi.fn((target) => {
      target.set(bytes)
      return target
    })

    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues,
    })

    const id = createRuntimeId()

    expect(getRandomValues).toHaveBeenCalledTimes(1)
    expect(isUuidV4(id)).toBe(true)
  })

  it('uses a non-uuid fallback only when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)

    const first = createRuntimeId()
    const second = createRuntimeId()

    expect(first.startsWith('rt-')).toBe(true)
    expect(second.startsWith('rt-')).toBe(true)
    expect(first).not.toBe(second)
  })

  it('generates distinct IDs in a small sample', () => {
    const ids = new Set(Array.from({ length: 32 }, () => createRuntimeId()))
    expect(ids.size).toBe(32)
  })
})

describe('coach.makeInsight runtime IDs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((target) => {
      target.set(Uint8Array.from({ length: 16 }, (_, index) => (index * 7) % 256))
      return target
    })

    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues,
    })

    const insights = buildCoachInsights({
      history: [workout()],
      mobility: { completed: [] },
    })

    expect(insights.length).toBeGreaterThan(0)
    insights.forEach((insight) => {
      expect(typeof insight.id).toBe('string')
      expect(insight.id.length).toBeGreaterThan(0)
    })
  })
})

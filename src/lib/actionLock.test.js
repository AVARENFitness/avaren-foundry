import { describe, expect, it } from 'vitest'
import { createActionLock } from './actionLock'

describe('in-flight action lock', () => {
  it('prevents another attempt until released', () => {
    const lock = createActionLock()
    expect(lock.acquire()).toBe(true)
    expect(lock.acquire()).toBe(false)
    lock.release()
    expect(lock.acquire()).toBe(true)
  })
  it('keeps different locks separate', () => {
    const a = createActionLock()
    const b = createActionLock()
    a.acquire()
    expect(b.acquire()).toBe(true)
  })
})

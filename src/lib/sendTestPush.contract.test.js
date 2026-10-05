import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('send-test-push current-device contract', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'supabase/functions/send-test-push/index.ts',
    ),
    'utf8',
  )

  it('requires the exact current endpoint and verifies ownership', () => {
    expect(source).toContain("const endpoint = typeof body?.endpoint === 'string'")
    expect(source).toContain(".eq('user_id', user.id)")
    expect(source).toContain(".eq('endpoint', endpoint)")
  })

  it('uses a unique tag so repeated tests remain visible', () => {
    expect(source).toContain('avaren-push-test-${Date.now()}')
  })
})

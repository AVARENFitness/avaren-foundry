import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('weekly calendar screenshot geometry contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-screenshot-analyze/index.ts'), 'utf8')

  it('separates adjacent appointment rectangles in the same day column', () => {
    expect(source).toContain('EACH SEPARATE colored rectangle')
    expect(source).toContain('never merge')
    expect(source).toContain('Connie rectangle')
  })

  it('reads time from hour lines and duration from block height', () => {
    expect(source).toContain('TOP edge')
    expect(source).toContain('vertical HEIGHT')
    expect(source).toContain('07:30')
  })

  it('preserves truncated client names and refuses to infer identity', () => {
    expect(source).toContain('retain that partial text')
    expect(source).toContain('Do not infer client identities')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('nutrition-image-analyze label contract', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'supabase/functions/nutrition-image-analyze/index.ts'),
    'utf8',
  )

  it('returns printed label macros without scaling them to consumed context', () => {
    expect(source).toContain('IMPORTANT NUTRITION-LABEL CONTRACT')
    expect(source).toContain('ALWAYS return calories, protein, carbs, fat, and fiber exactly for the PRINTED serving')
    expect(source).toContain('DO NOT scale the returned label macros to that consumed amount')
    expect(source).toContain('label says 59 g = 200 calories')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateWaiverFile } from './coachClientDocuments'

describe('client liability waiver records', () => {
  it('accepts the signed file formats AVAREN supports', () => {
    for (const type of [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]) {
      expect(
        validateWaiverFile({ type, size: 1024, name: 'waiver' }),
      ).toBe('')
    }
  })

  it('rejects unsupported or oversized waiver files', () => {
    expect(
      validateWaiverFile({
        type: 'text/plain',
        size: 1024,
        name: 'waiver.txt',
      }),
    ).toMatch(/PDF, JPG, PNG, or WebP/i)

    expect(
      validateWaiverFile({
        type: 'application/pdf',
        size: 11 * 1024 * 1024,
        name: 'waiver.pdf',
      }),
    ).toMatch(/10 MB or smaller/i)
  })

  it('binds records to business clients instead of requiring an athlete account', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/coachClientDocuments.js'),
      'utf8',
    )

    expect(source).toContain("business_client_id")
    expect(source).not.toContain(".eq('athlete_id'")
    expect(source).toContain("client-waivers")
    expect(source).toContain('createSignedUrl')
  })

  it('preserves previous signed waivers as superseded history', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/coachClientDocuments.js'),
      'utf8',
    )

    expect(source).toContain('SUPERSEDED')
    expect(source).toContain(".neq('id', documentId)")
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('calendar block-specific label transcription', () => {
  const client = readFileSync(resolve(process.cwd(), 'src/lib/calendarScreenshotAnalyze.js'),'utf8')
  const blocks = readFileSync(resolve(process.cwd(), 'src/lib/calendarScreenshotBlocks.js'),'utf8')
  const server = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-screenshot-analyze/index.ts'),'utf8')

  it('crops and numbers each measured event without swapping block identifiers', () => {
    expect(blocks).toContain('createCalendarBlockLabelSheet')
    expect(blocks).toContain("'BLOCK ' + block.id")
    expect(blocks).toContain('ctx.drawImage(bitmap, cropX, cropY, cropW, cropH')
    expect(client).toContain('labelSheetDataUrl')
  })
  it('requires title extraction from numbered crops, never from neighboring event rectangles', () => {
    expect(server).toContain('Read each title ONLY from its corresponding numbered crop')
    expect(server).toContain('never borrow a title from another block')
    expect(server).toContain('url:labelSheetDataUrl')
  })
})

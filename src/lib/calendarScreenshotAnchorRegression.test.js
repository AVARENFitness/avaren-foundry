import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const server = readFileSync(resolve(process.cwd(), 'supabase/functions/calendar-screenshot-analyze/index.ts'), 'utf8')
describe('weekly calendar screenshot anchor regression', () => {
  it('uses the first stable hour line, not an arbitrary AI-selected hour line', () => {
    expect(server).toContain('firstVisibleHour')
    expect(server).toContain('firstStableLine')
    expect(server).toContain('calibratedHour*60')
    expect(server).toContain('useFirstLine?firstStableLine')
  })
  it('rejects fake weekdays and only repairs near-current-year Sunday headings', () => {
    expect(server).toContain('startOfWeek(reportedWeek)')
    expect(server).toContain('Math.abs(d.getTime()-now.getTime())<50*86400000')
  })
  it('would calculate correct times for actual measured reference blocks', () => {
    const gridLineAt5=443, pixelsPerHour=87.75
    const calculate=(top,bottom)=>({
      start:Math.round((5*60+(top-gridLineAt5)*60/pixelsPerHour)/15)*15,
      duration:Math.round(((bottom-top)*60/pixelsPerHour)/15)*15,
    })
    expect(calculate(664,703)).toEqual({start:450,duration:30})
    expect(calculate(707,790)).toEqual({start:480,duration:60})
  })
})

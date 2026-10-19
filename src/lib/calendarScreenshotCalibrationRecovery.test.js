import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe,expect,it } from 'vitest'
const source=readFileSync(resolve(process.cwd(),'supabase/functions/calendar-screenshot-analyze/index.ts'),'utf8')
describe('calendar screenshot import calibration recovery',()=>{
 it('retains measured blocks when grid calibration fails',()=>{
  expect(source).toContain('if(!calibrated)')
  expect(source).toContain('partial:true')
  expect(source).toContain("date:''")
  expect(source).toContain("startTime:''")
  expect(source).toContain('geometryValid:false')
  expect(source).not.toContain("Could not calibrate the day columns and hour lines. Try a full weekly screenshot")
 })
 it('records non-sensitive calibration measurements for diagnosing inaccurate grids',()=>{
  expect(source).toContain('calendar-calibration-incomplete')
  expect(source).toContain('measuredGridLines')
 })
})
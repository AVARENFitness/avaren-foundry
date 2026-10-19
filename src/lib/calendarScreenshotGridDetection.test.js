import { describe, it, expect } from 'vitest'
import { detectCalendarDayGrid } from './calendarScreenshotBlocks'
import { prepareCalendarImportReview } from './calendarScreenshotImport'

describe('calendar measured weekday grid', () => {
 it('derives seven columns from their actual vertical guide lines',()=>{
  const width=840,height=1600,data=new Uint8ClampedArray(width*height*4)
  for(let i=0;i<data.length;i+=4){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255}
  for(let n=0;n<7;n++)for(let y=360;y<1480;y++){
   const x=120+n*101,i=(y*width+x)*4
   data[i]=229;data[i+1]=232;data[i+2]=235
  }
  const grid=detectCalendarDayGrid({width,height,data})
  expect(grid?.gridLeftX).toBeCloseTo(120,0)
  expect(grid?.columnWidth).toBeCloseTo(101,0)
 })
 it('never shows a default one-hour session for an unreadable duration',()=>{
  const [row]=prepareCalendarImportReview([{title:'Don/Mi',date:'',startTime:'',durationMinutes:0,geometryValid:false}],[])
  expect(row.durationMinutes).toBe(0)
  expect(row.selected).toBe(false)
 })
})

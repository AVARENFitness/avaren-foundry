import { describe, expect, it } from 'vitest'
import { detectCalendarEventBlocks } from './calendarScreenshotBlocks'

const picture = () => {
  const width=210,height=250,data=new Uint8ClampedArray(width*height*4)
  for(let i=0;i<data.length;i+=4){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255}
  const paint=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
      const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b
    }
  }
  paint(38,90,77,112,63,81,181) // short training session
  paint(38,116,77,157,63,81,181) // separate next session, same colour
  paint(90,105,130,167,130,182,74) // another day
  return {width,height,data}
}
describe('deterministic calendar screenshot block extraction',()=>{
 it('preserves touching/adjacent sessions as separate blocks',()=>{
  const blocks=detectCalendarEventBlocks(picture())
  expect(blocks).toHaveLength(3)
  expect(blocks.filter(x=>x.x>=35&&x.x<80)).toHaveLength(2)
 })
 it('preserves independent weekday columns and event heights',()=>{
  const blocks=detectCalendarEventBlocks(picture())
  const greens=blocks.filter(x=>x.color===2)
  expect(greens).toHaveLength(1)
  expect(greens[0].height).toBeGreaterThan(50)
 })
})

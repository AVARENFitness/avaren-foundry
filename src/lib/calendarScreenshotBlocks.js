// Geometry extraction from actual coloured pixels, not generated AI coordinates.
// Works on a Google Calendar week screenshot with saturated event blocks.
function colorKind(r,g,b) {
  const hi=Math.max(r,g,b), lo=Math.min(r,g,b)
  if (hi<65 || hi-lo<45 || lo>210) return 0
  if (b>r*1.22 && b>g*1.12 && b>110) return 1
  if (g>r*1.24 && g>b*1.08 && g>105) return 2
  return 0
}
export function detectCalendarEventBlocks({ width, height, data }) {
  if (!width || !height || !data) return []
  const px=(x,y) => {
    const i=(y*width+x)*4
    return colorKind(data[i],data[i+1],data[i+2])
  }
  const top=Math.floor(height*.27), bottom=Math.floor(height*.94)
  const projection=[]
  for(let x=0;x<width;x++){
    let count=0
    for(let y=top;y<bottom;y+=4) if(px(x,y)) count++
    projection.push(count)
  }
  const spans=[]
  let begin=-1
  for(let x=0;x<=width;x++){
    const threshold=Math.min(8,Math.max(3,Math.floor((bottom-top)/100)))
    const filled=x<width && projection[x]>=threshold
    if(filled && begin<0) begin=x
    if(!filled && begin>=0){
      if(x-begin>=25)spans.push([begin,x])
      begin=-1
    }
  }
  const blocks=[]
  for(const [left,right] of spans){
    const sampleLeft=left+4
    const kindAt=y => {
      const counts=[0,0,0]
      for(let x=sampleLeft;x<Math.min(sampleLeft+7,right);x++) counts[px(x,y)]++
      return counts[1]>=3?1:counts[2]>=3?2:0
    }
    let start=-1, last=-1, kind=0
    const finish=()=>{
      if(start>=0 && last-start+1>=14) blocks.push({
        id:blocks.length,x:left,y:start,width:right-left,height:last-start+1,color:kind
      })
      start=-1;last=-1;kind=0
    }
    for(let y=top;y<=bottom+4;y++){
      const current=y<bottom?kindAt(y):0
      if(current && start<0){start=y;kind=current;last=y}
      else if(current && current===kind){last=y}
      else if(start>=0 && (current!==kind) && y-last>3){
        finish()
        if(current){start=y;kind=current;last=y}
      }
    }
    finish()
  }
  return blocks.sort((a,b)=>a.x-b.x||a.y-b.y).slice(0,60)
}
export async function getCalendarScreenshotGeometry(file) {
  const bitmap=await createImageBitmap(file)
  try {
    const canvas=document.createElement('canvas')
    const scale=Math.min(1,1300/bitmap.width)
    canvas.width=Math.round(bitmap.width*scale)
    canvas.height=Math.round(bitmap.height*scale)
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    if(!ctx)throw new Error('Screenshot pixel analysis is unavailable on this device.')
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
    return {width:canvas.width,height:canvas.height,blocks:detectCalendarEventBlocks(ctx.getImageData(0,0,canvas.width,canvas.height))}
  }finally{bitmap.close?.()}
}

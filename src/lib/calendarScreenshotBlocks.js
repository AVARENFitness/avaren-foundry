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

// Detect light-gray hourly grid lines across the full calendar width.
// Their pixel spacing fixes event lengths independently of visual AI estimates.
export function detectCalendarHourGrid({ width, height, data }) {
  const candidates=[]
  for(let y=Math.floor(height*.19);y<Math.floor(height*.96);y++){
    let gray=0,total=0
    for(let x=Math.floor(width*.15);x<Math.floor(width*.98);x+=23){
      const i=(y*width+x)*4
      const r=data[i],g=data[i+1],b=data[i+2]
      total++
      if(r>=220&&r<=245&&g>=220&&g<=247&&b>=220&&b<=249 &&
        Math.abs(r-g)<=9&&Math.abs(g-b)<=9)gray++
    }
    if(total>=5&&gray/total>=.77)candidates.push(y)
  }
  const lines=[]
  for(const y of candidates) {
    if(!lines.length||y-lines[lines.length-1].end>3)lines.push({start:y,end:y})
    else lines[lines.length-1].end=y
  }
  const centers=lines.map(a=>Math.round((a.start+a.end)/2))
  const gaps=centers.slice(1).map((y,i)=>y-centers[i]).filter(gap=>
    gap>=height*.025&&gap<=height*.075)
  if(gaps.length<3)return { hourLines:[], pixelsPerHour:0 }
  gaps.sort((a,b)=>a-b)
  const pixelsPerHour=gaps[Math.floor(gaps.length/2)]
  const hourLines=centers.filter((y,i)=>centers.some((other,j)=>j!==i&&
    Math.abs(Math.abs(y-other)-pixelsPerHour)<pixelsPerHour*.12))
  return {hourLines,pixelsPerHour}
}


export function detectCalendarDayGrid({width,height,data}) {
  const xs=[]
  const fromY=Math.floor(height*.2),toY=Math.floor(height*.95)
  for(let x=Math.floor(width*.08);x<width-4;x++) {
    let hits=0,samples=0
    for(let y=fromY;y<toY;y+=13) {
      const i=(y*width+x)*4, r=data[i],g=data[i+1],b=data[i+2]
      if(r>=210&&g>=213&&b>=215&&Math.max(r,g,b)-Math.min(r,g,b)<=22&&r<250&&g<252&&b<253)hits++
      samples++
    }
    if(hits/samples>.52)xs.push(x)
  }
  const clusters=[]
  for(const x of xs){
    const last=clusters[clusters.length-1]
    if(last&&x-last[last.length-1]<=3)last.push(x)
    else clusters.push([x])
  }
  const lines=clusters.map(a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length))
  // Seven equal-width day columns; accept only a coherent sequence.
  const candidates=[]
  for(const first of lines)for(const last of lines){
    const spacing=(last-first)/6
    if(spacing<width/14||spacing>width/5)continue
    const matches=Array.from({length:7},(_,i)=>lines.some(x=>Math.abs(x-first-i*spacing)<Math.max(4,spacing*.08))).filter(Boolean).length
    if(matches>=5)candidates.push({gridLeftX:first,columnWidth:spacing,matches})
  }
  candidates.sort((a,b)=>b.matches-a.matches||a.gridLeftX-b.gridLeftX)
  return candidates[0]??null
}

export async function createCalendarBlockLabelSheet(file, blocks) {
  const bitmap = await createImageBitmap(file)
  try {
    const tileWidth = 330, tileHeight = 145, columns = 2
    const rows = Math.ceil(blocks.length / columns)
    const canvas = document.createElement('canvas')
    canvas.width = tileWidth * columns
    canvas.height = Math.max(1, rows) * tileHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare appointment titles.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    blocks.forEach((block, index) => {
      const left = (index % columns) * tileWidth
      const top = Math.floor(index / columns) * tileHeight
      ctx.fillStyle = '#111'
      ctx.font = 'bold 17px sans-serif'
      ctx.fillText('BLOCK ' + block.id, left + 9, top + 22)
      const cropX = Math.max(0, block.x - 5)
      const cropY = Math.max(0, block.y - 5)
      const cropW = Math.min(bitmap.width - cropX, block.width + 10)
      const cropH = Math.min(bitmap.height - cropY, block.height + 10)
      const scale = Math.min((tileWidth - 18) / cropW, (tileHeight - 37) / cropH, 3)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(bitmap, cropX, cropY, cropW, cropH,
        left + 9, top + 28, cropW * scale, cropH * scale)
    })
    return canvas.toDataURL('image/jpeg', 0.9)
  } finally { bitmap.close?.() }
}

export async function getCalendarScreenshotGeometry(file) {
  const bitmap=await createImageBitmap(file)
  try {
    const canvas=document.createElement('canvas')
    canvas.width=bitmap.width
    canvas.height=bitmap.height
    const ctx=canvas.getContext('2d',{willReadFrequently:true})
    if(!ctx)throw new Error('Screenshot pixel analysis is unavailable on this device.')
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height)
    return {width:canvas.width,height:canvas.height,blocks:detectCalendarEventBlocks(pixels),...detectCalendarHourGrid(pixels),dayGrid:detectCalendarDayGrid(pixels)}
  }finally{bitmap.close?.()}
}

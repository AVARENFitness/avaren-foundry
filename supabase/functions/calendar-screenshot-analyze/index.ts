import { createClient } from 'jsr:@supabase/supabase-js@2'
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' }
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}})
const schema={name:'calendar_geometry_labels',strict:true,schema:{type:'object',additionalProperties:false,required:['weekStart','sundayDayNumber','visibleMonthNumber','gridLeftX','columnWidth','hourAnchor','hourAnchorY','pixelsPerHour','firstVisibleHour','labels'],properties:{
 weekStart:{type:'string'},sundayDayNumber:{type:'integer'},visibleMonthNumber:{type:'integer'},gridLeftX:{type:'number'},columnWidth:{type:'number'},hourAnchor:{type:'integer'},firstVisibleHour:{type:'integer'},hourAnchorY:{type:'number'},pixelsPerHour:{type:'number'},
 labels:{type:'array',items:{type:'object',additionalProperties:false,required:['id','title'],properties:{id:{type:'integer'},title:{type:'string'}}}}
}}}
function startOfWeek(date:string) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null
 const parsed=new Date(date+'T12:00:00Z')
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||parsed.getUTCDay()!==0)return null
 return parsed
}
const timeString=(min:number)=>String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0')
const snap=(value:number)=>Math.round(value/15)*15

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers})
 if(req.method!=='POST')return reply({ok:false},405)
 try{
  const token=req.headers.get('Authorization')
  if(!token)return reply({ok:false,message:'Sign in before importing.'},401)
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:token}}})
  const {data:{user}}=await client.auth.getUser()
  if(!user)return reply({ok:false,message:'Sign in before importing.'},401)
  const {imageDataUrl,geometry,labelSheetDataUrl}=await req.json()
  if(typeof imageDataUrl!=='string'||!imageDataUrl.startsWith('data:image/')||imageDataUrl.length>8_000_000)return reply({ok:false,message:'Invalid screenshot.'},400)
  if(typeof labelSheetDataUrl!=='string'||!labelSheetDataUrl.startsWith('data:image/jpeg;base64,')||labelSheetDataUrl.length>9_000_000)return reply({ok:false,message:'Could not prepare event text crops. Try the screenshot again.'},400)
  const blocks=geometry?.blocks
  if(!Array.isArray(blocks)||!blocks.length||blocks.length>60)return reply({ok:false,message:'No readable event blocks were detected.'},400)
  const width=Number(geometry.width),height=Number(geometry.height)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<250||height<250)return reply({ok:false,message:'Invalid image geometry.'},400)
  const safe=blocks.filter((b:Record<string,unknown>)=>Number.isInteger(b.id)&&
    [b.x,b.y,b.width,b.height].every(n=>Number.isFinite(n as number))&&
    Number(b.x)>=0&&Number(b.y)>=0&&Number(b.x)+Number(b.width)<=width&&Number(b.y)+Number(b.height)<=height)
    .map((b:Record<string,number>)=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),width:Math.round(b.width),height:Math.round(b.height)}))
  if(safe.length!==blocks.length)return reply({ok:false,message:'Invalid event rectangles.'},400)
  const key=Deno.env.get('OPENAI_API_KEY')
  if(!key)return reply({ok:false,message:'Calendar analysis unavailable.'},503)
  const instructions='You are calibrating a GOOGLE CALENDAR WEEK screenshot. The user device has ALREADY measured the event rectangles with code. You MUST NOT invent, create, merge or move events. The SECOND image is a contact sheet of individually cropped events numbered BLOCK id. Read each title ONLY from its corresponding numbered crop in the SECOND image, NOT by guessing from its location in the full calendar. If a crop is unreadable output an empty title; never borrow a title from another block. Report exactly one label per listed rectangle id. Never associate the title from one crop with another ID. Do not include the calendar header, phone clock or blank cells as events. Do not complete truncated names. Also measure the actual pixel positions of: (1) left border of the Sunday day column (gridLeftX), (2) uniform width in pixels of one weekday column (columnWidth), (3) a clearly visible horizontal hour gridline labeled on the left (hourAnchor), (4) that gridline vertical pixel position (hourAnchorY), and (5) vertical pixel spacing between two adjacent hourly gridlines (pixelsPerHour). Coordinates are measured in the supplied screenshot original dimensions. Return sundayDayNumber as the integer date in the leftmost SUNDAY header and visibleMonthNumber as the shown calendar month 1-12. Also return weekStart using that Sunday date header and the correct visible year. In the hour label strip at left, report firstVisibleHour as the hour printed next to the FIRST FULL hourly horizontal line after the weekday heading. Ignore any non-hour top border line. If unreadable return -1. Never use phone status bar time. All numbers must be measured from this screenshot, not guessed based on event text. The colored rectangles are authoritative for which weekday and time each event occupies; you never return times or dates for individual events. If calibration is unclear, set impossible zero values; the app will ask for review.'
  const ai=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
   model:Deno.env.get('AVA_CALENDAR_VISION_MODEL')||'gpt-4o',temperature:0,max_tokens:1700,response_format:{type:'json_schema',json_schema:schema},
   messages:[{role:'system',content:instructions},{role:'user',content:[
    {type:'text',text:'Screenshot dimensions '+width+'x'+height+'. Detected pixel event rectangles (x,y from upper-left): '+JSON.stringify(safe)+'. Independently detected horizontal hour lines (y pixels): '+JSON.stringify(geometry.hourLines||[])+'. Measured weekday column lines: '+JSON.stringify(geometry.dayGrid||null)+'. Prefer one of these lines as hourAnchorY, then transcribe its hour label at the left. Read the title in EACH rectangle by id. Return anchors from the visible grid. The SECOND image contains individually cropped event titles identified by BLOCK numbers. Match every label to its printed BLOCK number. Do not make additional events.'},
    {type:'image_url',image_url:{url:imageDataUrl,detail:'high'}},
    {type:'image_url',image_url:{url:labelSheetDataUrl,detail:'high'}}
   ]}]})})
  if(!ai.ok)return reply({ok:false,message:'AVA could not read this screenshot.'},502)
  const response=await ai.json()
  const data=JSON.parse(response?.choices?.[0]?.message?.content||'{}')
  const reportedWeek=String(data.weekStart||'')
  let sunday=startOfWeek(reportedWeek)
  // If the model supplied the right visible month/day but an impossible year,
  // recover only when that month/day is a Sunday close to today's date.
  if(!sunday && /^\\d{4}-\\d{2}-\\d{2}$/.test(reportedWeek)){
   const [,mm,dd]=reportedWeek.split('-').map(Number)
   const now=new Date()
   const options=[now.getUTCFullYear()-1,now.getUTCFullYear(),now.getUTCFullYear()+1]
     .map(y=>startOfWeek(String(y)+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0')))
     .filter((d):d is Date=>Boolean(d)&&Math.abs(d.getTime()-now.getTime())<50*86400000)
   if(options.length===1)sunday=options[0]
  }
  const headerDay=Number(data.sundayDayNumber)
  const headerMonth=Number(data.visibleMonthNumber)
  if(Number.isInteger(headerDay)&&headerDay>=1&&headerDay<=31&&
     Number.isInteger(headerMonth)&&headerMonth>=1&&headerMonth<=12&&
     (!sunday||sunday.getUTCDate()!==headerDay||sunday.getUTCMonth()+1!==headerMonth)){
    const now=new Date()
    const near=[now.getUTCFullYear()-1,now.getUTCFullYear(),now.getUTCFullYear()+1]
      .map(y=>startOfWeek(String(y)+'-'+String(headerMonth).padStart(2,'0')+'-'+String(headerDay).padStart(2,'0')))
      .filter((d):d is Date=>Boolean(d)&&Math.abs(d.getTime()-now.getTime())<50*86400000)
    sunday=near.length===1?near[0]:null
  }
  const detectedGrid=geometry.dayGrid
  const x0=detectedGrid?.matches>=5?Number(detectedGrid.gridLeftX):Number(data.gridLeftX)
  const dayWidth=detectedGrid?.matches>=5?Number(detectedGrid.columnWidth):Number(data.columnWidth)
  const hour=Number(data.hourAnchor)
  const firstVisibleHour=Number(data.firstVisibleHour)
  const measuredLines=Array.isArray(geometry.hourLines)?geometry.hourLines.map(Number).filter(Number.isFinite):[]
  const measuredSpacing=Number(geometry.pixelsPerHour)
  const measuredAnchor=measuredLines.find((line:number)=>Math.abs(line-Number(data.hourAnchorY)) <= measuredSpacing*.55)
  const useMeasured=measuredLines.length>=4&&measuredSpacing>=15&&Number.isFinite(measuredAnchor)
  const firstStableLine=measuredLines.find((y:number)=>[1,2,3].every(k=>measuredLines.some((other:number)=>Math.abs(other-y-k*measuredSpacing)<=measuredSpacing*.12)))
  const useFirstLine=Number.isInteger(firstVisibleHour)&&firstVisibleHour>=0&&firstVisibleHour<=22&&Number.isFinite(firstStableLine)
  const calibratedHour=useFirstLine?firstVisibleHour:hour
  const hourY=useFirstLine?firstStableLine:(useMeasured?measuredAnchor:Number(data.hourAnchorY))
  const hourSpacing=measuredSpacing>=15?measuredSpacing:Number(data.pixelsPerHour)
  const calibrated=!!sunday&&Number.isFinite(x0)&&x0>=0&&x0<width*.6&&
    Number.isFinite(dayWidth)&&dayWidth>=width/15&&dayWidth<=width/5&&
    x0+dayWidth*6<width&&Number.isInteger(calibratedHour)&&calibratedHour>=0&&calibratedHour<=23&&
    Number.isFinite(hourY)&&hourY>=0&&hourY<height&&
    Number.isFinite(hourSpacing)&&hourSpacing>=15&&hourSpacing<=height/5
  if(!calibrated){
   console.warn('calendar-calibration-incomplete',JSON.stringify({
    sunday:String(data.weekStart||''), x0,dayWidth,hour,firstVisibleHour,hourY,hourSpacing,
    width,height,blockCount:safe.length,measuredGridLines:measuredLines.length,dayGrid:detectedGrid
   }))
   const labels=new Map((Array.isArray(data.labels)?data.labels:[]).map((x:Record<string,unknown>)=>[Number(x.id),String(x.title||'').slice(0,120)]))
   // Return precisely the blocks actually detected, without fabricated times or dates.
   // The coach can correct these as individual draft rows instead of a total failure.
   return reply({ok:true,partial:true,message:'AVA found the appointments but could not verify the calendar grid. Please confirm each date and time before adding.',
    events:safe.map(b=>({ title:labels.get(b.id)||'',date:'',weekday:-1,startTime:'',durationMinutes:0,geometryValid:false,blockId:b.id }))})
  }
  const labels=new Map((Array.isArray(data.labels)?data.labels:[]).map((x:Record<string,unknown>)=>[Number(x.id),String(x.title||'').slice(0,120)]))
  const events=safe.map(b=>{
   const col=Math.floor((b.x+b.width/2-x0)/dayWidth)
   const rawTime=calibratedHour*60+(b.y-hourY)*60/hourSpacing
   const rawDuration=b.height*60/hourSpacing
   const min=snap(rawTime),duration=snap(rawDuration)
   const valid=col>=0&&col<=6&&Number.isFinite(rawTime)&&rawTime>=0&&rawTime<1440&&
    min>=0&&min<1440&&duration>=15&&duration<=960&&Math.abs(rawTime-min)<=8&&
    Math.abs(rawDuration-duration)<=9
   const date=col>=0&&col<=6 ? new Date(sunday!.getTime()+col*86400000).toISOString().slice(0,10) : ''
   return { title:labels.get(b.id)||'',date:valid?date:'',weekday:col>=0&&col<=6?col:-1,
    startTime:valid?timeString(min):'',durationMinutes:valid?duration:0,geometryValid:valid,blockId:b.id }
  })
  return reply({ok:true,events})
 }catch(error){console.error('calendar-screenshot-analyze',error);return reply({ok:false,message:'Screenshot could not be analyzed. Try a clearer calendar image.'},500)}
})

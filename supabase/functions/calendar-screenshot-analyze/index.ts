import { createClient } from 'jsr:@supabase/supabase-js@2'
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type' }
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}})
const schema={name:'calendar_geometry_labels',strict:true,schema:{type:'object',additionalProperties:false,required:['weekStart','gridLeftX','columnWidth','hourAnchor','hourAnchorY','pixelsPerHour','labels'],properties:{
 weekStart:{type:'string'},gridLeftX:{type:'number'},columnWidth:{type:'number'},hourAnchor:{type:'integer'},hourAnchorY:{type:'number'},pixelsPerHour:{type:'number'},
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
  const {imageDataUrl,geometry}=await req.json()
  if(typeof imageDataUrl!=='string'||!imageDataUrl.startsWith('data:image/')||imageDataUrl.length>8_000_000)return reply({ok:false,message:'Invalid screenshot.'},400)
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
  const instructions='You are calibrating a GOOGLE CALENDAR WEEK screenshot. The user device has ALREADY measured the event rectangles with code. You MUST NOT invent, create, merge or move events. Report only the visible title for EACH listed rectangle id. Do not include the calendar header, phone clock or blank cells as events. Do not complete truncated names. Also measure the actual pixel positions of: (1) left border of the Sunday day column (gridLeftX), (2) uniform width in pixels of one weekday column (columnWidth), (3) a clearly visible horizontal hour gridline labeled on the left (hourAnchor), (4) that gridline vertical pixel position (hourAnchorY), and (5) vertical pixel spacing between two adjacent hourly gridlines (pixelsPerHour). Coordinates are measured in the supplied screenshot original dimensions. Return weekStart as the ISO date shown under SUNDAY (not today). All numbers must be measured from this screenshot, not guessed based on event text. The colored rectangles are authoritative for which weekday and time each event occupies; you never return times or dates for individual events. If calibration is unclear, set impossible zero values; the app will ask for review.'
  const ai=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
   model:Deno.env.get('AVA_CALENDAR_VISION_MODEL')||'gpt-4o',temperature:0,max_tokens:1700,response_format:{type:'json_schema',json_schema:schema},
   messages:[{role:'system',content:instructions},{role:'user',content:[
    {type:'text',text:'Screenshot dimensions '+width+'x'+height+'. Detected pixel event rectangles (x,y from upper-left): '+JSON.stringify(safe)+'. Independently detected horizontal hour lines (y pixels): '+JSON.stringify(geometry.hourLines||[])+'. Prefer one of these lines as hourAnchorY, then transcribe its hour label at the left. Read the title in EACH rectangle by id. Return anchors from the visible grid. Do not make additional events.'},
    {type:'image_url',image_url:{url:imageDataUrl,detail:'high'}}
   ]}]})})
  if(!ai.ok)return reply({ok:false,message:'AVA could not read this screenshot.'},502)
  const response=await ai.json()
  const data=JSON.parse(response?.choices?.[0]?.message?.content||'{}')
  const sunday=startOfWeek(String(data.weekStart||''))
  const x0=Number(data.gridLeftX),dayWidth=Number(data.columnWidth),hour=Number(data.hourAnchor)
  const measuredLines=Array.isArray(geometry.hourLines)?geometry.hourLines.map(Number).filter(Number.isFinite):[]
  const measuredSpacing=Number(geometry.pixelsPerHour)
  const measuredAnchor=measuredLines.find((line:number)=>Math.abs(line-Number(data.hourAnchorY)) <= measuredSpacing*.3)
  const useMeasured=measuredLines.length>=4&&measuredSpacing>=15&&Number.isFinite(measuredAnchor)
  const hourY=useMeasured?measuredAnchor:Number(data.hourAnchorY)
  const hourSpacing=useMeasured?measuredSpacing:Number(data.pixelsPerHour)
  const calibrated=!!sunday&&Number.isFinite(x0)&&x0>=0&&x0<width*.6&&
    Number.isFinite(dayWidth)&&dayWidth>=width/15&&dayWidth<=width/5&&
    x0+dayWidth*6<width&&Number.isInteger(hour)&&hour>=0&&hour<=23&&
    Number.isFinite(hourY)&&hourY>=0&&hourY<height&&
    Number.isFinite(hourSpacing)&&hourSpacing>=15&&hourSpacing<=height/5
  if(!calibrated){
   console.warn('calendar-calibration-incomplete',JSON.stringify({
    sunday:String(data.weekStart||''), x0,dayWidth,hour,hourY,hourSpacing,
    width,height,blockCount:safe.length,measuredGridLines:measuredLines.length
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
   const rawTime=hour*60+(b.y-hourY)*60/hourSpacing
   const rawDuration=b.height*60/hourSpacing
   const min=snap(rawTime),duration=snap(rawDuration)
   const valid=col>=0&&col<=6&&Number.isFinite(rawTime)&&rawTime>=0&&rawTime<1440&&
    min>=0&&min<1440&&duration>=15&&duration<=960&&Math.abs(rawTime-min)<=8&&
    Math.abs(rawDuration-duration)<=9
   const date=new Date(sunday!.getTime()+col*86400000).toISOString().slice(0,10)
   return { title:labels.get(b.id)||'',date:valid?date:'',weekday:col>=0&&col<=6?col:-1,
    startTime:valid?timeString(min):'',durationMinutes:valid?duration:0,geometryValid:valid,blockId:b.id }
  })
  return reply({ok:true,events})
 }catch(error){console.error('calendar-screenshot-analyze',error);return reply({ok:false,message:'Screenshot could not be analyzed. Try a clearer calendar image.'},500)}
})

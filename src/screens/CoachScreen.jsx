import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Edit3,
  Mail,
  Plus,
  Search,
  Send,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { assignmentNotificationBackend } from '../lib/assignmentNotifications'
import CoachWorkoutDesigner from '../components/CoachWorkoutDesigner'
import CoachCalendar from '../components/CoachCalendar'
import CoachPrograms from '../components/CoachPrograms'
import SectionHeader from '../components/ui/SectionHeader'
import StatCard from '../components/ui/StatCard'
import EmptyState from '../components/ui/EmptyState'

const today = () => new Date().toISOString().slice(0,10)
const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString([], { month:'short', day:'numeric' }) : 'No due date'
const initials = (email='A') => email.slice(0,1).toUpperCase()

export default function CoachScreen({ workspace, setWorkspace, screen='clients', program, selectedClient, setSelectedClient }) {
  const [clients,setClients]=useState([]), [invitations,setInvitations]=useState([]), [assignments,setAssignments]=useState([]), [templates,setTemplates]=useState([])
  const [query,setQuery]=useState(''), [inviteEmail,setInviteEmail]=useState(''), [notice,setNotice]=useState(''), [loading,setLoading]=useState(true)
  const [showDesigner,setShowDesigner]=useState(false), [designerTemplate,setDesignerTemplate]=useState(null), [clientNotes,setClientNotes]=useState('')
  const [deliveryStatus,setDeliveryStatus]=useState({})

  const load=async()=>{setLoading(true);try{const [c,i,a]=await Promise.all([coachBackend.listClients(),coachBackend.listCoachInvitations(),coachBackend.listCoachAssignments()]);let t=[];try{t=await coachBackend.listWorkoutTemplates()}catch(error){if(!/coach_workout_templates|migration|does not exist/i.test(error.message??''))throw error}setClients(c);setInvitations(i);setAssignments(a);setTemplates(t);setWorkspace((w)=>({...w,clients:c,invitations:i,assignments:a}));const deliveryRows=await assignmentNotificationBackend.deliveryForAssignments(a.map(item=>item.id));setDeliveryStatus(Object.fromEntries(deliveryRows.map(row=>[row.assignment_id,row.read_at?'Read':'Delivered'])));setNotice('')}catch(e){setNotice(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  useEffect(()=>{if(screen!=='clients')setSelectedClient?.(null)},[screen,setSelectedClient])
  useEffect(()=>{if(!selectedClient)return;coachBackend.getClientNotes(selectedClient.athlete_id).then(note=>setClientNotes(note?.notes??'')).catch(()=>setClientNotes(''))},[selectedClient])

  const visibleClients=useMemo(()=>clients.filter(c=>c.athlete_email.toLowerCase().includes(query.trim().toLowerCase())),[clients,query])
  const pending=invitations.filter(i=>i.status==='pending').length
  const dueToday=assignments.filter(a=>a.due_date===today() && ['assigned','started'].includes(a.status)).length
  const completed=assignments.filter(a=>a.status==='completed').length
  const adherence=assignments.length ? Math.round(completed/assignments.length*100) : 0
  const recentActivity=[...assignments].filter(a=>a.status==='completed').sort((a,b)=>new Date(b.completed_at)-new Date(a.completed_at)).slice(0,5)
  const invite=async()=>{const email=inviteEmail.trim().toLowerCase();if(!email.includes('@'))return setNotice('Enter a valid athlete email.');try{await coachBackend.inviteAthlete(email);setInviteEmail('');setNotice('Invitation sent.');await load()}catch(e){setNotice(e.message)}}
  const assignCustom=async(payload)=>{try{await coachBackend.createAssignment(payload);setNotice('Workout assigned.');await load()}catch(e){setNotice(e.message);throw e}}
  const saveTemplate=async({name,workout})=>{try{await coachBackend.saveWorkoutTemplate({name,workout});setNotice('Workout template saved.');await load()}catch(e){setNotice(e.message);throw e}}
  const unassign=async(assignment)=>{if(!confirm(`Unassign ${assignment.title}? The athlete will no longer see it as active, even if it was already opened.`))return;try{await coachBackend.cancelAssignment(assignment.id);setNotice('Workout unassigned.');await load()}catch(e){setNotice(e.message)}}
  const clientAssignments=selectedClient?assignments.filter(a=>a.athlete_id===selectedClient.athlete_id):[]

  const designer = showDesigner ? <CoachWorkoutDesigner clients={clients} program={program} templates={templates} initialClientId={selectedClient?.athlete_id??''} initialTemplate={designerTemplate} onClose={()=>{setShowDesigner(false);setDesignerTemplate(null)}} onSaveTemplate={saveTemplate} onAssign={assignCustom}/> : null

  if(selectedClient && screen==='clients') return <><section className="coach-hub-screen"><button className="coach-back-link" onClick={()=>setSelectedClient(null)}>← Back to clients</button>
    <header className="coach-client-profile-hero"><div className="coach-client-avatar large">{initials(selectedClient.athlete_email)}</div><div><span className="eyebrow">CLIENT PROFILE</span><h1>{selectedClient.athlete_email}</h1><p>Connected since {new Date(selectedClient.created_at).toLocaleDateString()}</p></div><button className="gold-button machined coach-profile-assign" onClick={()=>setShowDesigner(true)}><Plus size={17}/>Create Workout</button></header>
    <div className="coach-dashboard-grid"><StatCard icon={ClipboardList} label="Assignments" value={clientAssignments.length}/><StatCard icon={CheckCircle2} label="Completed" value={clientAssignments.filter(a=>a.status==='completed').length}/><StatCard icon={TrendingUp} label="Adherence" value={`${clientAssignments.length?Math.round(clientAssignments.filter(a=>a.status==='completed').length/clientAssignments.length*100):0}%`}/></div>
    <section className="coach-profile-panel"><SectionHeader eyebrow="COACH NOTES" title="Private observations" description="Visible only in your Coach Hub."/><textarea rows={5} value={clientNotes} onChange={e=>setClientNotes(e.target.value)} placeholder="Goals, limitations, check-in notes, programming context…"/><button className="gold-button machined" onClick={async()=>{await coachBackend.saveClientNotes(selectedClient.athlete_id,clientNotes);setNotice('Client notes saved.')}}>Save Notes</button></section>
    <section className="coach-profile-panel"><SectionHeader eyebrow="ASSIGNMENTS" title="Client activity" action={<button className="coach-secondary-button" onClick={()=>setShowDesigner(true)}><Plus size={16}/>New Workout</button>}/>{clientAssignments.length?clientAssignments.map(a=><article className="coach-review-card coach-assignment-manage-card" key={a.id}><div><strong>{a.title}</strong><span>{a.status} · {formatDate(a.due_date)}</span>{a.completion_summary&&<div className="coach-review-metrics"><span>{a.completion_summary.durationMinutes??'—'} min</span><span>{Number(a.completion_summary.volume??0).toLocaleString()} lb</span><span>{a.completion_summary.sets??0} sets</span></div>}</div>{['assigned','started'].includes(a.status)&&<button className="coach-unassign-button" onClick={()=>unassign(a)}><Trash2 size={15}/>Unassign</button>}</article>):<EmptyState icon={ClipboardList} title="No assignments" description="Create an individualized workout for this client."/>}</section>
    {notice&&<p className="coach-hub-notice">{notice}</p>}</section>{designer}</>

  if(screen==='calendar') return <CoachCalendar clients={clients} assignments={assignments} templates={templates} program={program} onRefresh={load} initialClientId={selectedClient?.athlete_id??''}/>

  if(screen==='programs') return <CoachPrograms clients={clients} templates={templates} program={program} onRefresh={load}/>

  if(screen==='assignments') return <><section className="coach-hub-screen"><SectionHeader eyebrow="PROGRAM DELIVERY" title="Assignments" description="Design, send, track, edit, and unassign client workouts." action={<button className="gold-button machined" disabled={!clients.length} onClick={()=>setShowDesigner(true)}><Plus size={17}/>Create Workout</button>}/>
    {!clients.length&&<p className="coach-hub-notice">Connect a client before creating an assignment.</p>}
    {notice&&<p className="coach-hub-notice">{notice}</p>}
    <section className="coach-profile-panel"><SectionHeader eyebrow="YOUR LIBRARY" title="Workout templates" description="Reusable starting points for individualized programming." action={<button className="coach-secondary-button" onClick={()=>setShowDesigner(true)}><Plus size={16}/>New Template</button>}/>{templates.length?<div className="coach-template-grid">{templates.map(template=><article key={template.id}><div><strong>{template.name}</strong><span>{template.workout_payload?.exercises?.length??0} exercises</span></div><div><button onClick={()=>{setDesignerTemplate(template);setShowDesigner(true)}}><Edit3 size={15}/>Use</button><button onClick={async()=>{if(confirm(`Delete ${template.name}?`)){await coachBackend.deleteWorkoutTemplate(template.id);await load()}}}><Trash2 size={15}/></button></div></article>)}</div>:<EmptyState icon={ClipboardList} title="No custom templates yet" description="Create a workout once, then reuse and personalize it for any client."/>}</section>
    {assignments.length?<div className="coach-assignment-list">{assignments.map(a=><article className={`priority-${a.priority??'normal'} coach-assignment-row`} key={a.id}><div><strong>{a.title}</strong><span>{clients.find(c=>c.athlete_id===a.athlete_id)?.athlete_email??a.athlete_id} · {formatDate(a.due_date)}</span></div><div className="coach-assignment-row-actions"><small>{a.status} · {deliveryStatus[a.id]??'Queued'}</small>{['assigned','started'].includes(a.status)&&<button className="coach-unassign-button" onClick={()=>unassign(a)}><Trash2 size={15}/>Unassign</button>}</div></article>)}</div>:<EmptyState icon={ClipboardList} title="No assignments yet" description="Create an individualized workout for any connected client."/>}</section>{designer}</>

  if(screen==='settings') return <section className="coach-hub-screen"><SectionHeader eyebrow="COACH WORKSPACE" title="Coach settings" description="Database-backed access and private client relationships are active."/><section className="coach-settings-card"><article><span>Connected clients</span><strong>{clients.length}</strong></article><article><span>Pending invitations</span><strong>{pending}</strong></article><article><span>Assignments</span><strong>{assignments.length}</strong></article><article><span>Saved templates</span><strong>{templates.length}</strong></article></section>{notice&&<p className="coach-hub-notice">{notice}</p>}</section>

  return <><section className="coach-hub-screen"><header className="coach-hub-page-header"><div><span className="eyebrow">COACH DASHBOARD</span><h1>Coach Hub</h1><p>Your clients, assignments, and recent results in one focused workspace.</p></div></header>
    <div className="coach-dashboard-grid"><StatCard icon={Users} label="Active clients" value={clients.length}/><StatCard icon={CalendarDays} label="Due today" value={dueToday}/><StatCard icon={Mail} label="Pending invites" value={pending}/><StatCard icon={TrendingUp} label="Adherence" value={`${adherence}%`}/></div>
    <section className="coach-invite-card"><div><UserPlus size={20}/><div><strong>Invite an athlete</strong><span>Use the email on their AVAREN account.</span></div></div><div className="coach-invite-form"><label><Mail size={15}/><input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="athlete@email.com"/></label><button onClick={invite}><Send size={16}/>Invite</button></div>{notice&&<p className="coach-hub-notice">{notice}</p>}</section>
    <section className="coach-roster-section"><header><div><span className="eyebrow">YOUR ROSTER</span><h2>Clients</h2></div><label className="coach-client-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search clients"/></label></header>{loading?<p>Loading clients…</p>:visibleClients.length?<div className="coach-client-list">{visibleClients.map(c=><button className="coach-client-row" key={c.id} onClick={()=>setSelectedClient(c)}><div className="coach-client-avatar">{initials(c.athlete_email)}</div><div className="coach-client-copy"><strong>{c.athlete_email}</strong><span>{assignments.filter(a=>a.athlete_id===c.athlete_id&&['assigned','started'].includes(a.status)).length} active assignments</span></div><ChevronRight size={17}/></button>)}</div>:<EmptyState icon={Users} title="No connected clients yet" description="Send an invitation and have the athlete accept it."/>}</section>
    <section className="coach-profile-panel"><SectionHeader eyebrow="RECENT ACTIVITY" title="Completed workouts"/>{recentActivity.length?recentActivity.map(a=><article className="coach-review-card" key={a.id}><Activity size={18}/><div><strong>{a.title}</strong><span>{clients.find(c=>c.athlete_id===a.athlete_id)?.athlete_email??'Athlete'} completed {new Date(a.completed_at).toLocaleDateString()}</span></div></article>):<EmptyState icon={Activity} title="No completed workouts yet" description="Completed assignments will appear here for review."/>}</section>
    {invitations.length>0&&<section className="coach-pending-section"><header><div><span className="eyebrow">INVITATIONS</span><h2>Recent</h2></div></header><div className="coach-pending-list">{invitations.map(i=><article key={i.id}><div><Mail size={16}/><span>{i.athlete_email}</span></div><div><small>{i.status}</small>{i.status==='pending'&&<button onClick={async()=>{await coachBackend.cancelInvitation(i.id);await load()}}><X size={15}/></button>}</div></article>)}</div></section>}</section>{designer}</>
}

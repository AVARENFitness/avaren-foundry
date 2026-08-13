import {
  ClipboardList,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import { assignmentNotificationBackend } from '../lib/assignmentNotifications'
import { COACH_CLIENT_SORT, sortCoachClients } from '../lib/clientIntelligence'
import { enrichCoachClientRecord, getClientDisplayName, sanitizeCoachLabelDraft } from '../lib/clientDisplayName'
import { openClientReview } from '../lib/coachReviewNavigation'
import { coachClientLabelsBackend } from '../lib/coachClientLabelsBackend'
import { getIdentityCapabilities, probeIdentityCapabilities } from '../lib/identityCapabilities'
import { useCoachPortfolio } from '../hooks/useCoachPortfolio'
import {
  normalizeBusinessClientRecord,
  resolveRecordBusinessClientId,
  resolveAthleteDataId,
} from '../lib/coachBusinessClient'
import {
  validateInviteEmail,
  LIFECYCLE_SUCCESS,
  mapLifecycleUserMessage,
} from '../lib/coachClientUi'
import { invalidateCoachPortfolioCache } from '../lib/coachPortfolioService'
import CoachCreateClientSheet from '../components/coach/CoachCreateClientSheet'
import CoachClientProfile from './CoachClientProfile'
import CoachWorkoutDesigner from '../components/CoachWorkoutDesigner'
import CoachSessionCalendar from '../components/CoachSessionCalendar'
import CoachPrograms from '../components/CoachPrograms'
import CoachCommandCenter from '../components/coach/CoachCommandCenter'
import CoachWeeklyReview from '../components/coach/CoachWeeklyReview'
import SectionHeader from '../components/ui/SectionHeader'
import EmptyState from '../components/ui/EmptyState'

const today = () => new Date().toISOString().slice(0,10)
const formatDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString([], { month:'short', day:'numeric' }) : 'No due date'
const ICON = { size: 18, strokeWidth: 1.75 }

export default function CoachScreen({ workspace, setWorkspace, screen='clients', program, selectedClient, setSelectedClient, coachEmail='Coach', onOpenClientProfile, onNavigateCoachScreen, onCoachAvaContextChange, onRegisterCoachScreenApi }) {
  const [clients,setClients]=useState([]), [invitations,setInvitations]=useState([]), [assignments,setAssignments]=useState([]), [templates,setTemplates]=useState([])
  const [query,setQuery]=useState(''), [inviteEmail,setInviteEmail]=useState(''), [notice,setNotice]=useState(''), [loading,setLoading]=useState(true)
  const [showDesigner,setShowDesigner]=useState(false), [designerTemplate,setDesignerTemplate]=useState(null), [clientNotes,setClientNotes]=useState(''), [notesUpdatedAt,setNotesUpdatedAt]=useState(null)
  const [deliveryStatus,setDeliveryStatus]=useState({})
  const [sortKey,setSortKey]=useState(COACH_CLIENT_SORT.NEEDS_ATTENTION)
  const [weeklyReviewClient,setWeeklyReviewClient]=useState(null)
  const [historicalReviewId,setHistoricalReviewId]=useState(null)
  const [coachLabelsEnabled,setCoachLabelsEnabled]=useState(false)
  const [openScheduleComposer,setOpenScheduleComposer]=useState(false)
  const [showCreateClient,setShowCreateClient]=useState(false)
  const [creatingClient,setCreatingClient]=useState(false)

  useEffect(() => {
    probeIdentityCapabilities().then((caps) => {
      setCoachLabelsEnabled(Boolean(caps.coachClientLabels))
    })
  }, [])

  const { portfolio, portfolioLoading, portfolioError, refreshPortfolio, athleteStatesById, weeklyReviewsByAthleteId, passAvaContextByBusinessClientId } = useCoachPortfolio(
    clients,
    assignments,
  )

  const sortedPortfolio = useMemo(() => {
    if (!portfolio) return null
    return {
      ...portfolio,
      rosterEntries: sortCoachClients(portfolio.rosterEntries, sortKey),
    }
  }, [portfolio, sortKey])

  const load = async () => {
    setLoading(true)
    try {
      const [c, i, a] = await Promise.all([
        coachBackend.listCoachRoster({ includeArchived: true }),
        coachBackend.listCoachInvitations(),
        coachBackend.listCoachAssignments(),
      ])
      let t = []
      try {
        t = await coachBackend.listWorkoutTemplates()
      } catch (error) {
        if (!/coach_workout_templates|migration|does not exist/i.test(error.message ?? '')) {
          throw error
        }
      }

      setClients(c)
      setInvitations(i)
      setAssignments(a)
      setTemplates(t)
      setWorkspace((w) => ({ ...w, clients: c, invitations: i, assignments: a }))
      const deliveryRows = await assignmentNotificationBackend.deliveryForAssignments(
        a.map((item) => item.id),
      )
      setDeliveryStatus(
        Object.fromEntries(
          deliveryRows.map((row) => [row.assignment_id, row.read_at ? 'Read' : 'Delivered']),
        ),
      )
      setNotice('')
      return c
    } catch (e) {
      setNotice(e.message)
      return clients
    } finally {
      setLoading(false)
    }
  }
  useEffect(()=>{load()},[])

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible') return
      load()
      refreshPortfolio()
    }

    document.addEventListener('visibilitychange', refreshOnFocus)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [refreshPortfolio])
  useEffect(()=>{if(screen!=='clients')setSelectedClient?.(null)},[screen,setSelectedClient])
  useEffect(() => {
    if (!selectedClient) return

    const notesAthleteId = resolveAthleteDataId(selectedClient)
    if (!notesAthleteId) {
      setClientNotes('')
      setNotesUpdatedAt(null)
      return
    }

    coachBackend
      .getClientNotes(notesAthleteId)
      .then((note) => {
        setClientNotes(note?.notes ?? '')
        setNotesUpdatedAt(note?.updated_at ?? null)
      })
      .catch(() => {
        setClientNotes('')
        setNotesUpdatedAt(null)
      })
  }, [selectedClient])
  useEffect(() => {
    const contextClient = selectedClient ?? weeklyReviewClient ?? null
    const selectedBusinessClientId = contextClient
      ? resolveRecordBusinessClientId(contextClient)
      : null

    onCoachAvaContextChange?.({
      isCoachMode: true,
      authorized: true,
      clients,
      rosterEntries: sortedPortfolio?.rosterEntries ?? [],
      portfolio: sortedPortfolio,
      assignments,
      athleteStatesById,
      weeklyReviewsByAthleteId,
      coachScreen: screen,
      selectedClient: contextClient,
      selectedClientId: selectedBusinessClientId,
      weeklyReviewOpen: Boolean(weeklyReviewClient),
      profileOpen: Boolean(selectedClient && !weeklyReviewClient),
      portfolioLoading,
      portfolioError,
    })
  }, [
    clients,
    sortedPortfolio,
    assignments,
    athleteStatesById,
    weeklyReviewsByAthleteId,
    screen,
    selectedClient,
    weeklyReviewClient,
    portfolioLoading,
    portfolioError,
    onCoachAvaContextChange,
  ])

  const openAddClient = () => {
    setNotice('')
    setShowCreateClient(true)
  }

  const invite=async()=>{const inviteError=validateInviteEmail(inviteEmail);if(inviteError)return setNotice(inviteError);const email=inviteEmail.trim().toLowerCase();try{await coachBackend.inviteAthlete(email);setInviteEmail('');setNotice(LIFECYCLE_SUCCESS.INVITE_SENT);await load()}catch(e){setNotice(e.message)}}

  const handleCreateClient = async (payload) => {
    setCreatingClient(true)
    try {
      const result = await coachBackend.createBusinessClient(payload)
      setShowCreateClient(false)
      setNotice(LIFECYCLE_SUCCESS.CLIENT_CREATED)
      const roster = await load()
      refreshPortfolio()
      invalidateCoachPortfolioCache()
      const created =
        roster.find(
          (client) =>
            resolveRecordBusinessClientId(client) === result.business_client_id,
        ) ??
        normalizeBusinessClientRecord({
          id: result.business_client_id,
          business_client_id: result.business_client_id,
          linked_user_id: null,
          display_name: result.display_name,
          first_name: payload.firstName,
          last_name: payload.lastName,
          preferred_name: payload.preferredName,
          status: 'active',
          hasCoachBridge: false,
        })
      setSelectedClient?.(created)
    } catch (error) {
      setNotice(mapLifecycleUserMessage(error, 'Unable to create client.'))
    } finally {
      setCreatingClient(false)
    }
  }
  const assignCustom=async(payload)=>{try{await coachBackend.createAssignment(payload);setNotice('Workout assigned.');await load()}catch(e){setNotice(e.message);throw e}}
  const saveTemplate=async({name,workout})=>{try{await coachBackend.saveWorkoutTemplate({name,workout});setNotice('Workout template saved.');await load()}catch(e){setNotice(e.message);throw e}}
  const unassign=async(assignment)=>{if(!(await appUi.confirm({ message:`Cancel ${assignment.title}? It will leave active schedules but remain in assignment history.`, tone:'danger', confirmLabel:'Cancel' })))return;try{await coachBackend.cancelAssignment(assignment.id);setNotice('Assignment cancelled and removed from active schedules.');await load()}catch(e){setNotice(e.message)}}
  const deleteAssignment=async(assignment)=>{if(assignment.status==='completed'){setNotice('Completed workouts cannot be deleted. Archive them instead.');return}if(!(await appUi.confirm({ message:`Permanently delete ${assignment.title}? This removes it from Coach Hub, Calendar, the athlete account, and notifications.`, tone:'danger', confirmLabel:'Delete' })))return;try{await coachBackend.deleteAssignment(assignment.id);setNotice('Assignment permanently deleted.');await load()}catch(e){setNotice(e.message)}}

  const designer = showDesigner ? <CoachWorkoutDesigner clients={clients} program={program} templates={templates} initialClientId={selectedClient?.athlete_id??''} initialTemplate={designerTemplate} onClose={()=>{setShowDesigner(false);setDesignerTemplate(null)}} onSaveTemplate={saveTemplate} onAssign={assignCustom}/> : null

  const openWeeklyReview = (client, reviewId = null) => {
    const result = openClientReview({
      client,
      reviewId,
      openWeeklyReview: (nextClient, nextReviewId) => {
        if (!nextClient) return
        setSelectedClient(nextClient)
        setWeeklyReviewClient(nextClient)
        setHistoricalReviewId(nextReviewId)
      },
    })
    if (!result.ok) {
      setNotice(result.message)
    }
  }

  useEffect(() => {
    onRegisterCoachScreenApi?.({
      clearClientOverlays: () => {
        setWeeklyReviewClient(null)
        setHistoricalReviewId(null)
        setSelectedClient(null)
      },
      openClientProfile: (client) => {
        setWeeklyReviewClient(null)
        setHistoricalReviewId(null)
        setSelectedClient(client)
        onOpenClientProfile?.(client)
      },
      openWeeklyReview: (client, reviewId = null) => {
        if (!client) return
        setSelectedClient(client)
        setWeeklyReviewClient(client)
        setHistoricalReviewId(reviewId)
      },
      setAttentionSort: () => setSortKey(COACH_CLIENT_SORT.NEEDS_ATTENTION),
    })

    return () => onRegisterCoachScreenApi?.(null)
  }, [
    onRegisterCoachScreenApi,
    onOpenClientProfile,
    setSelectedClient,
  ])

  if(weeklyReviewClient && screen==='clients') return <>
    <CoachWeeklyReview
      client={weeklyReviewClient}
      assignments={assignments}
      initialReviewId={historicalReviewId}
      onBack={()=>{
        setWeeklyReviewClient(null)
        setHistoricalReviewId(null)
      }}
      onSaved={()=>{
        refreshPortfolio()
        setNotice('Weekly review saved.')
      }}
      notice={notice}
    />
    {designer}
  </>

  if(selectedClient && screen==='clients') return <>
    <CoachClientProfile
      client={selectedClient}
      assignments={assignments}
      clientNotes={clientNotes}
      notesUpdatedAt={notesUpdatedAt}
      onClientNotesChange={setClientNotes}
      onSaveNotes={async (notes = clientNotes) => {
        const notesAthleteId = resolveAthleteDataId(selectedClient)
        if (!notesAthleteId) return null

        const saved = await coachBackend.saveClientNotes(notesAthleteId, notes)
        setClientNotes(notes)
        setNotesUpdatedAt(saved?.updated_at ?? new Date().toISOString())
        setNotice('Client notes saved.')
        return saved
      }}
      onSaveCoachLabel={async (coachLabel) => {
        const labelAthleteId = resolveAthleteDataId(selectedClient)
        if (!labelAthleteId) return null

        const trimmed = sanitizeCoachLabelDraft(coachLabel)
        const saved = trimmed
          ? await coachClientLabelsBackend.upsertCoachLabel(labelAthleteId, trimmed)
          : await coachClientLabelsBackend.deleteCoachLabel(labelAthleteId)
        const enriched = enrichCoachClientRecord(selectedClient, {
          coachLabel: trimmed ? saved?.coach_label ?? trimmed : '',
        })
        setClients((prev) =>
          prev.map((item) =>
            item.athlete_id === enriched.athlete_id ? enriched : item,
          ),
        )
        setSelectedClient(enriched)
        setWorkspace((w) => ({
          ...w,
          clients: (w.clients ?? []).map((item) =>
            item.athlete_id === enriched.athlete_id ? enriched : item,
          ),
        }))
        setNotice('Coach label saved.')
      }}
      coachLabelsEnabled={coachLabelsEnabled || getIdentityCapabilities().coachClientLabels}
      coachEmail={coachEmail}
      onBack={()=>setSelectedClient(null)}
      onAssignWorkout={()=>setShowDesigner(true)}
      onOpenWeeklyReview={()=>openWeeklyReview(selectedClient)}
      notice={notice}
      onClientUpdated={async (updated) => {
        const normalized = normalizeBusinessClientRecord(updated)
        setClients((prev) =>
          prev.map((item) =>
            resolveRecordBusinessClientId(item) ===
            resolveRecordBusinessClientId(normalized)
              ? { ...item, ...normalized }
              : item,
          ),
        )
        setSelectedClient((current) =>
          resolveRecordBusinessClientId(current) ===
          resolveRecordBusinessClientId(normalized)
            ? { ...current, ...normalized }
            : current,
        )
        await load()
        refreshPortfolio()
        invalidateCoachPortfolioCache()
      }}
      onClientArchived={() => {
        setNotice('Coaching ended. History preserved.')
      }}
    />
    {designer}
  </>

  if(screen==='calendar') return <CoachSessionCalendar clients={clients} assignments={assignments} coachEmail={coachEmail} initialClientId={selectedClient?.athlete_id??''} initialOpenComposer={openScheduleComposer} onComposerOpened={()=>setOpenScheduleComposer(false)} onOpenClientProfile={(client)=>{if(!client)return; if(onOpenClientProfile) onOpenClientProfile(client); else setSelectedClient(client)}} />

  if(screen==='programs') return <CoachPrograms clients={clients} templates={templates} program={program} onRefresh={load}/>

  if(screen==='assignments') return <><section className="coach-hub-screen"><SectionHeader eyebrow="PROGRAM DELIVERY" title="Assignments" description="Design, send, track, edit, and unassign client workouts." action={<button className="gold-button machined coach-primary-action" disabled={!clients.length} onClick={()=>setShowDesigner(true)}><Plus {...ICON}/>Create Workout</button>}/>
    {!clients.length&&<p className="coach-hub-notice">Connect a client before creating an assignment.</p>}
    {notice&&<p className="coach-hub-notice">{notice}</p>}
    <section className="coach-profile-panel"><SectionHeader eyebrow="YOUR LIBRARY" title="Workout templates" description="Reusable starting points for individualized programming." action={<button className="coach-secondary-button" onClick={()=>setShowDesigner(true)}><Plus {...ICON}/>New Template</button>}/>{templates.length?<div className="coach-template-grid">{templates.map(template=><article key={template.id}><div><strong>{template.name}</strong><span>{template.workout_payload?.exercises?.length??0} exercises</span></div><div><button onClick={()=>{setDesignerTemplate(template);setShowDesigner(true)}}><Edit3 {...ICON}/>Use</button><button onClick={async()=>{if(await appUi.confirm({ message:`Delete ${template.name}?`, tone:'danger', confirmLabel:'Delete' })){await coachBackend.deleteWorkoutTemplate(template.id);await load()}}}><Trash2 {...ICON}/></button></div></article>)}</div>:<EmptyState icon={ClipboardList} title="No custom templates yet" description="Create a workout once, then reuse and personalize it for any client."/>}</section>
    {assignments.length?<div className="coach-assignment-list">{assignments.map(a=><article className={`priority-${a.priority??'normal'} coach-assignment-row status-${a.status}`} key={a.id}><div><strong>{a.title}</strong><span>{getClientDisplayName(clients.find(c=>c.athlete_id===a.athlete_id) ?? { athlete_email: a.athlete_id })} · {formatDate(a.due_date)}</span></div><div className="coach-assignment-row-actions"><small>{a.status} · {deliveryStatus[a.id]??'Queued'}</small><div className="coach-assignment-lifecycle-actions">{['assigned','started'].includes(a.status)&&<button className="coach-cancel-button" onClick={()=>unassign(a)}>Cancel</button>}{a.status!=='completed'&&<button className="coach-delete-button" onClick={()=>deleteAssignment(a)}><Trash2 size={15}/>Delete</button>}</div></div></article>)}</div>:<EmptyState icon={ClipboardList} title="No assignments yet" description="Create an individualized workout for any connected client."/>}</section>{designer}</>

  if(screen==='settings') return <section className="coach-hub-screen"><SectionHeader eyebrow="COACH WORKSPACE" title="Coach settings" description="Database-backed access and private client relationships are active."/><section className="coach-settings-card"><article><span>Connected clients</span><strong>{clients.length}</strong></article><article><span>Pending invitations</span><strong>{invitations.filter(i=>i.status==='pending').length}</strong></article><article><span>Assignments</span><strong>{assignments.length}</strong></article><article><span>Saved templates</span><strong>{templates.length}</strong></article></section>{notice&&<p className="coach-hub-notice">{notice}</p>}</section>

  return <>
    <CoachCommandCenter
      clients={clients}
      invitations={invitations}
      assignments={assignments}
      portfolio={sortedPortfolio}
      portfolioLoading={portfolioLoading}
      portfolioError={portfolioError}
      passAvaContextByBusinessClientId={passAvaContextByBusinessClientId}
      loading={loading}
      query={query}
      onQueryChange={setQuery}
      onSelectClient={setSelectedClient}
      onAssignWorkout={()=>setShowDesigner(true)}
      onViewAssignments={()=>onNavigateCoachScreen?.('assignments')}
      onNavigateCoachScreen={onNavigateCoachScreen}
      onSchedule={() => {
        setOpenScheduleComposer(true)
        onNavigateCoachScreen?.('calendar')
      }}
      onReviewNext={()=>{
        const next = sortedPortfolio?.reviewQueue?.[0]
        if (next) openWeeklyReview(next.client)
      }}
      onInvite={invite}
      onAddClient={openAddClient}
      inviteEmail={inviteEmail}
      onInviteEmailChange={setInviteEmail}
      notice={notice}
    />
    <CoachCreateClientSheet
      open={showCreateClient}
      submitting={creatingClient}
      onClose={() => {
        setShowCreateClient(false)
        setNotice('')
      }}
      onSubmit={handleCreateClient}
    />
    {designer}
  </>
}

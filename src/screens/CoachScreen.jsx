import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { coachBackend } from '../lib/coachBackend'
import { appUi } from '../lib/appUi'
import { assignmentNotificationBackend } from '../lib/assignmentNotifications'
import { COACH_CLIENT_SORT, sortCoachClients } from '../lib/clientIntelligence'
import { enrichCoachClientRecord, getClientDisplayName, sanitizeCoachLabelDraft } from '../lib/clientDisplayName'
import { openClientReview } from '../lib/coachReviewNavigation'
import { coachClientLabelsBackend } from '../lib/coachClientLabelsBackend'
import { getIdentityCapabilities, probeIdentityCapabilities } from '../lib/identityCapabilities'
import {
  buildViewForLegacyScreen,
  COACH_SCREENS,
  isLegacyCoachScreen,
  normalizeCoachScreen,
} from '../lib/coachNavigation'
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
import CoachBuildHub from '../components/coach/CoachBuildHub'
import CoachCommandCenter from '../components/coach/CoachCommandCenter'
import CoachWeeklyReview from '../components/coach/CoachWeeklyReview'
import CoachCreateClientSheet from '../components/coach/CoachCreateClientSheet'
import CoachClientProfile from './CoachClientProfile'
import CoachWorkoutDesigner from '../components/CoachWorkoutDesigner'
import CoachSessionCalendar from '../components/CoachSessionCalendar'
import CoachPrograms from '../components/CoachPrograms'

export default function CoachScreen({
  workspace,
  setWorkspace,
  screen = COACH_SCREENS.TODAY,
  program,
  selectedClient,
  setSelectedClient,
  coachEmail = 'Coach',
  onOpenClientProfile,
  onNavigateCoachScreen,
  onCoachAvaContextChange,
  onRegisterCoachScreenApi,
  initialFocusedSessionId = null,
  onFocusedSessionOpened,
}) {
  const [clients,setClients]=useState([]), [invitations,setInvitations]=useState([]), [assignments,setAssignments]=useState([]), [templates,setTemplates]=useState([])
  const [query,setQuery]=useState(''), [inviteEmail,setInviteEmail]=useState(''), [notice,setNotice]=useState(''), [loading,setLoading]=useState(true)
  const [showDesigner,setShowDesigner]=useState(false), [designerTemplate,setDesignerTemplate]=useState(null), [designerClientId,setDesignerClientId]=useState(''), [clientNotes,setClientNotes]=useState(''), [notesUpdatedAt,setNotesUpdatedAt]=useState(null)
  const [buildView, setBuildView] = useState('home')
  const [clientProgramFlow, setClientProgramFlow] = useState(null)
  const previousScreenRef = useRef(screen)
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
    if (isLegacyCoachScreen(screen)) {
      setBuildView(buildViewForLegacyScreen(screen))
      onNavigateCoachScreen?.(normalizeCoachScreen(screen))
    }
  }, [screen, onNavigateCoachScreen])

  useEffect(() => {
    const previousScreen = previousScreenRef.current
    previousScreenRef.current = screen
    const normalized = normalizeCoachScreen(screen)
    if (
      normalized === COACH_SCREENS.BUILD &&
      previousScreen !== COACH_SCREENS.BUILD &&
      !isLegacyCoachScreen(previousScreen)
    ) {
      setBuildView('home')
    }
  }, [screen])

  const openDesigner = ({ clientId = '', template = null } = {}) => {
    setDesignerClientId(clientId || selectedClient?.athlete_id || '')
    setDesignerTemplate(template)
    setShowDesigner(true)
  }

  const openBuildWorkouts = () => {
    setBuildView('workouts')
    onNavigateCoachScreen?.(COACH_SCREENS.BUILD)
  }

  const openBuildPrograms = () => {
    setBuildView('programs')
    onNavigateCoachScreen?.(COACH_SCREENS.BUILD)
  }
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

  const designer = showDesigner ? <CoachWorkoutDesigner clients={clients} program={program} templates={templates} initialClientId={designerClientId} initialTemplate={designerTemplate} onClose={()=>{setShowDesigner(false);setDesignerTemplate(null);setDesignerClientId('')}} onSaveTemplate={saveTemplate} onAssign={assignCustom}/> : null

  const clientProgramContext =
    clientProgramFlow && selectedClient?.athlete_id
      ? {
          mode: clientProgramFlow,
          athleteId: selectedClient.athlete_id,
          clientName: getClientDisplayName(selectedClient),
          onClose: () => setClientProgramFlow(null),
          onRequestBuild: () => setClientProgramFlow('build'),
        }
      : null

  const clientProgramPanel = clientProgramContext ? (
    <CoachPrograms
      clients={clients}
      templates={templates}
      program={program}
      onRefresh={load}
      clientContext={clientProgramContext}
      onAssigned={() => {
        setNotice('Program assigned.')
        setClientProgramFlow(null)
      }}
    />
  ) : null

  const normalizedScreen = normalizeCoachScreen(screen)

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
      openBuildWorkouts,
      openBuildPrograms,
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
      onAssignWorkout={()=>openDesigner({ clientId: selectedClient?.athlete_id ?? '' })}
      onBuildWorkout={()=>openDesigner({ clientId: selectedClient?.athlete_id ?? '' })}
      onAssignProgram={() => setClientProgramFlow('assign')}
      onBuildProgram={() => setClientProgramFlow('build')}
      onOpenWeeklyReview={()=>openWeeklyReview(selectedClient)}
      notice={notice}
      onClientUpdated={async (updated, options = {}) => {
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
        if (options.refreshRoster !== false) {
          await load()
          refreshPortfolio()
          invalidateCoachPortfolioCache()
        }
      }}
      onClientArchived={() => {
        setNotice('Coaching ended. History preserved.')
      }}
    />
    {designer}
    {clientProgramPanel}
  </>

  if (normalizedScreen === COACH_SCREENS.CALENDAR || screen === 'calendar') {
    return (
      <>
        <CoachSessionCalendar
          clients={clients}
          assignments={assignments}
          coachEmail={coachEmail}
          initialClientId={selectedClient?.athlete_id ?? ''}
          initialOpenComposer={openScheduleComposer}
          onComposerOpened={() => setOpenScheduleComposer(false)}
          initialFocusedSessionId={initialFocusedSessionId}
          onFocusedSessionOpened={onFocusedSessionOpened}
          onOpenClientProfile={(client) => {
            if (!client) return
            if (onOpenClientProfile) onOpenClientProfile(client)
            else setSelectedClient(client)
          }}
        />
        {designer}
      </>
    )
  }

  if (normalizedScreen === COACH_SCREENS.BUILD) {
    return (
      <>
        <CoachBuildHub
          view={buildView}
          onViewChange={setBuildView}
          clients={clients}
          templates={templates}
          assignments={assignments}
          program={program}
          deliveryStatus={deliveryStatus}
          notice={notice}
          onRefresh={load}
          onNewWorkout={() => openDesigner()}
          onEditTemplate={(template) => openDesigner({ template })}
          onCreateWorkoutFromProgram={() => openDesigner()}
          onUnassign={unassign}
          onDeleteAssignment={deleteAssignment}
        />
        {designer}
      </>
    )
  }

  if (normalizedScreen === COACH_SCREENS.MORE || screen === 'settings') {
    return (
      <section className="coach-hub-screen coach-more-screen">
        <header className="coach-build-hub-header">
          <span className="eyebrow">COACH</span>
          <h1>More</h1>
          <p className="coach-build-subcopy">Settings and workspace overview.</p>
        </header>
        <section className="coach-settings-card">
          <article>
            <span>Connected clients</span>
            <strong>{clients.length}</strong>
          </article>
          <article>
            <span>Pending invitations</span>
            <strong>{invitations.filter((item) => item.status === 'pending').length}</strong>
          </article>
          <article>
            <span>Active assignments</span>
            <strong>{assignments.length}</strong>
          </article>
          <article>
            <span>Saved workouts</span>
            <strong>{templates.length}</strong>
          </article>
        </section>
        {notice ? <p className="coach-hub-notice">{notice}</p> : null}
      </section>
    )
  }

  if (normalizedScreen === COACH_SCREENS.CLIENTS && !selectedClient) {
    return (
      <>
        <CoachCommandCenter
          rosterOnly
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
          onOpenBuild={openBuildWorkouts}
          onNavigateCoachScreen={onNavigateCoachScreen}
          onAddClient={openAddClient}
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
    )
  }

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
      onSelectClient={(client) => {
        setSelectedClient(client)
        onNavigateCoachScreen?.(COACH_SCREENS.CLIENTS)
      }}
      onOpenBuild={openBuildWorkouts}
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

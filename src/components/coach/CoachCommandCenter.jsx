import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarRange,
  ClipboardList,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { coachBackend } from '../../lib/coachBackend'
import {
  buildUpcomingSessionsByBusinessClientId,
  filterRosterEntriesByHubScope,
  ROSTER_HUB_FILTER,
  ROSTER_PREVIEW_LIMIT,
  resolveRosterPassSummary,
  sortRosterEntriesForOperations,
} from '../../lib/coachClientRosterUi'
import { resolveRecordBusinessClientId } from '../../lib/coachBusinessClient'
import {
  normalizeScheduledSession,
  sortScheduledSessions,
} from '../../lib/coachScheduledSessions'
import CoachAttentionQueue from './CoachAttentionQueue'
import CoachClientCard from './CoachClientCard'
import CoachTodaySchedule from './CoachTodaySchedule'
import CoachSessionDetailHost from './CoachSessionDetailHost'
import EmptyState from '../ui/EmptyState'

const SEARCH_ICON = { size: 16, strokeWidth: 1.75 }

const ROSTER_FILTER_OPTIONS = [
  { id: ROSTER_HUB_FILTER.ACTIVE, label: 'Active' },
  { id: ROSTER_HUB_FILTER.ATTENTION, label: 'Attention' },
  { id: ROSTER_HUB_FILTER.PAST, label: 'Past' },
]

const upcomingRangeEnd = () => {
  const end = new Date()
  end.setDate(end.getDate() + 90)
  return end.toISOString().slice(0, 10)
}

export default function CoachCommandCenter({
  clients = [],
  invitations = [],
  portfolio,
  portfolioLoading = false,
  portfolioError = '',
  passAvaContextByBusinessClientId = {},
  loading = false,
  query = '',
  onQueryChange,
  onSelectClient,
  onAssignWorkout,
  onViewAssignments,
  onInvite,
  onAddClient,
  inviteEmail = '',
  onInviteEmailChange,
  onReviewNext,
  onNavigateCoachScreen,
  onSchedule,
  notice = '',
  assignments = [],
}) {
  const [hubScheduleRefresh, setHubScheduleRefresh] = useState(0)
  const [rosterExpanded, setRosterExpanded] = useState(false)
  const [rosterFilter, setRosterFilter] = useState(ROSTER_HUB_FILTER.ACTIVE)
  const [upcomingByBusinessClientId, setUpcomingByBusinessClientId] = useState({})

  const hero = portfolio?.hero
  const attentionCount = portfolio?.attentionQueue?.length ?? 0

  const loadUpcomingSessions = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const rows = await coachBackend.listScheduledSessions({
        startDate: today,
        endDate: upcomingRangeEnd(),
      })
      const normalized = sortScheduledSessions(
        (rows ?? []).map(normalizeScheduledSession).filter(Boolean),
      )
      setUpcomingByBusinessClientId(
        buildUpcomingSessionsByBusinessClientId(normalized),
      )
    } catch {
      setUpcomingByBusinessClientId({})
    }
  }, [])

  useEffect(() => {
    loadUpcomingSessions()
  }, [loadUpcomingSessions, hubScheduleRefresh])

  const sortedRoster = useMemo(
    () =>
      sortRosterEntriesForOperations(portfolio?.rosterEntries ?? [], {
        upcomingByBusinessClientId,
      }),
    [portfolio?.rosterEntries, upcomingByBusinessClientId],
  )

  const scopedRoster = useMemo(
    () => filterRosterEntriesByHubScope(sortedRoster, rosterFilter),
    [sortedRoster, rosterFilter],
  )

  const filteredRoster = useMemo(
    () =>
      scopedRoster.filter((entry) =>
        String(entry.clientName ?? '')
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [scopedRoster, query],
  )

  const rosterPreview = filteredRoster.slice(0, ROSTER_PREVIEW_LIMIT)
  const visibleRoster = rosterExpanded ? filteredRoster : rosterPreview
  const hiddenRosterCount = Math.max(0, filteredRoster.length - rosterPreview.length)

  if (!clients.length && !loading) {
    return (
      <section className="coach-hub-screen coach-command-center coach-command-center--calm">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">COACH HUB</span>
            <h1>Command Center</h1>
            <p>Add your first client to begin.</p>
          </div>
        </header>
        <EmptyState
          icon={Users}
          title="No active clients yet"
          description="Create a client with or without an AVAREN account."
        />
        <section className="coach-invite-card coach-invite-card--quiet">
          <button
            type="button"
            className="gold-button machined coach-invite-submit"
            onClick={onAddClient}
          >
            Add client
          </button>
          {notice ? <p className="coach-hub-notice">{notice}</p> : null}
        </section>
      </section>
    )
  }

  return (
    <CoachSessionDetailHost
      clients={clients}
      assignments={assignments}
      onOpenClientProfile={onSelectClient}
      onMutated={() => setHubScheduleRefresh((current) => current + 1)}
    >
      {(openSession) => (
    <section className="coach-hub-screen coach-command-center coach-command-center--calm">
      <header className="coach-command-hero coach-command-hero--compact">
        <div>
          <span className="eyebrow">COACH HUB</span>
          <h1>Today</h1>
          {!loading && !portfolioLoading && hero ? (
            <p className="coach-command-summary">
              {hero.activeClients} active
              {attentionCount > 0 ? ` · ${attentionCount} need attention` : ''}
            </p>
          ) : null}
        </div>
      </header>

      {portfolioError && (
        <p className="coach-hub-notice">{portfolioError}</p>
      )}

      <CoachTodaySchedule
        clients={clients}
        onSchedule={onSchedule ?? (() => onNavigateCoachScreen?.('calendar'))}
        onOpenCalendar={() => onNavigateCoachScreen?.('calendar')}
        onOpenClient={onSelectClient}
        onOpenSession={openSession}
        refreshSignal={hubScheduleRefresh}
      />

      <CoachAttentionQueue
        items={portfolio?.attentionQueue ?? []}
        totalCount={portfolio?.attentionQueue?.length ?? 0}
        onViewClient={onSelectClient}
        onViewAll={() => {
          setRosterExpanded(true)
          setRosterFilter(ROSTER_HUB_FILTER.ATTENTION)
        }}
      />

      <section className="coach-command-panel coach-command-roster">
        <header className="coach-command-panel-header coach-command-panel-header--compact">
          <div>
            <span className="eyebrow">CLIENTS</span>
            <h2>{rosterExpanded ? 'All clients' : 'Client preview'}</h2>
          </div>
          {rosterExpanded ? (
            <button
              type="button"
              className="coach-secondary-button coach-command-inline-action"
              onClick={() => setRosterExpanded(false)}
            >
              Show preview
            </button>
          ) : null}
        </header>

        <label className="coach-roster-search-shell coach-roster-search-shell--compact">
          <Search {...SEARCH_ICON} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
          />
        </label>

        <div className="coach-command-sort-row coach-command-sort-row--compact coach-roster-filter-row">
          {ROSTER_FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={rosterFilter === option.id ? 'active' : ''}
              onClick={() => setRosterFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading || portfolioLoading ? (
          <div className="coach-roster-list">
            {[1, 2, 3, 4].map((item) => (
              <article key={item} className="coach-roster-row skeleton" />
            ))}
          </div>
        ) : filteredRoster.length ? (
          <div className="coach-roster-list">
            {visibleRoster.map((entry) => {
              const businessClientId = resolveRecordBusinessClientId(entry.client)
              return (
                <CoachClientCard
                  key={businessClientId ?? entry.client.id ?? entry.clientName}
                  entry={entry}
                  onSelect={onSelectClient}
                  nextSession={upcomingByBusinessClientId[businessClientId] ?? null}
                  passSummary={resolveRosterPassSummary(
                    entry,
                    passAvaContextByBusinessClientId,
                  )}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={
              rosterFilter === ROSTER_HUB_FILTER.ATTENTION
                ? 'All caught up'
                : rosterFilter === ROSTER_HUB_FILTER.PAST
                  ? 'No past clients'
                  : 'No matching clients'
            }
            description={
              rosterFilter === ROSTER_HUB_FILTER.ATTENTION
                ? 'Nothing needs your attention in this filter.'
                : 'Try another search or filter.'
            }
          />
        )}

        {!rosterExpanded && hiddenRosterCount > 0 ? (
          <button
            type="button"
            className="coach-roster-view-all-button"
            onClick={() => setRosterExpanded(true)}
          >
            View all clients ({filteredRoster.length})
          </button>
        ) : null}
      </section>

      <section className="coach-command-panel coach-command-tools">
        <header className="coach-command-panel-header coach-command-panel-header--compact">
          <div>
            <span className="eyebrow">QUICK ACTIONS</span>
          </div>
        </header>
        <div className="coach-command-tools-grid">
          <button
            type="button"
            className="coach-secondary-button"
            onClick={onSchedule ?? (() => onNavigateCoachScreen?.('calendar'))}
          >
            <CalendarRange size={16} />
            Schedule
          </button>
          <button type="button" className="coach-secondary-button" onClick={onAddClient}>
            <UserPlus size={16} />
            Add client
          </button>
          <button type="button" className="coach-secondary-button" onClick={onViewAssignments}>
            <ClipboardList size={16} />
            Assignments
            {hero?.activeAssignments > 0 ? ` (${hero.activeAssignments})` : ''}
          </button>
          <button
            type="button"
            className="coach-secondary-button"
            onClick={() => onNavigateCoachScreen?.('programs')}
          >
            <Users size={16} />
            Programs
          </button>
        </div>
      </section>

      {notice && <p className="coach-hub-notice">{notice}</p>}

      {invitations.length > 0 && (
        <section className="coach-pending-section coach-pending-section--compact">
          <header>
            <div>
              <span className="eyebrow">INVITATIONS</span>
              <h2>{invitations.filter((item) => item.status === 'pending').length} pending</h2>
            </div>
          </header>
        </section>
      )}
    </section>
      )}
    </CoachSessionDetailHost>
  )
}

import {
  ClipboardList,
  Mail,
  Plus,
  Search,
  UserPlus,
  Users,
  CalendarRange,
} from 'lucide-react'
import { COACH_CLIENT_SORT } from '../../lib/clientIntelligence'
import CoachAttentionQueue from './CoachAttentionQueue'
import CoachClientCard from './CoachClientCard'
import CoachWeeklySnapshot from './CoachWeeklySnapshot'
import CoachActivityFeed from './CoachActivityFeed'
import EmptyState from '../ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }
const SEARCH_ICON = { size: 16, strokeWidth: 1.75 }

const SORT_OPTIONS = [
  { id: COACH_CLIENT_SORT.NEEDS_ATTENTION, label: 'Needs Attention' },
  { id: COACH_CLIENT_SORT.RECENTLY_ACTIVE, label: 'Recently Active' },
  { id: COACH_CLIENT_SORT.LEAST_ACTIVE, label: 'Least Active' },
  { id: COACH_CLIENT_SORT.ACTIVE_ASSIGNMENT, label: 'Active Assignment' },
  { id: COACH_CLIENT_SORT.READY, label: 'Ready' },
  { id: COACH_CLIENT_SORT.RECOVERY, label: 'Recovery Priority' },
  { id: COACH_CLIENT_SORT.ALL, label: 'All Clients' },
]

export default function CoachCommandCenter({
  clients = [],
  invitations = [],
  assignments = [],
  portfolio,
  portfolioLoading = false,
  portfolioError = '',
  loading = false,
  query = '',
  onQueryChange,
  sortKey = COACH_CLIENT_SORT.NEEDS_ATTENTION,
  onSortChange,
  onSelectClient,
  onAssignWorkout,
  onViewAssignments,
  onInvite,
  inviteEmail = '',
  onInviteEmailChange,
  onReviewNext,
  notice = '',
}) {
  const hero = portfolio?.hero
  const sortedRoster = portfolio?.rosterEntries ?? []
  const filteredRoster = sortedRoster.filter((entry) =>
    entry.clientName.toLowerCase().includes(query.trim().toLowerCase()),
  )

  if (!clients.length && !loading) {
    return (
      <section className="coach-hub-screen coach-command-center">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">COACH HUB</span>
            <h1>Command Center</h1>
            <p>Your portfolio, priorities, and client intelligence in one calm workspace.</p>
          </div>
        </header>
        <EmptyState
          icon={Users}
          title="No connected clients yet"
          description="Invite an athlete to begin building your coaching command center."
        />
        <section className="coach-invite-card coach-invite-card--quiet">
          <div className="coach-invite-copy">
            <UserPlus {...ICON} />
            <div>
              <strong>Invite an athlete</strong>
              <span>Use the email on their AVAREN account.</span>
            </div>
          </div>
          <div className="coach-invite-form">
            <label className="coach-field-shell">
              <Mail {...ICON} />
              <input
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange?.(event.target.value)}
                placeholder="athlete@email.com"
                aria-label="Athlete email"
              />
            </label>
            <button
              type="button"
              className="gold-button machined coach-invite-submit"
              onClick={onInvite}
            >
              Invite
            </button>
          </div>
          {notice && <p className="coach-hub-notice">{notice}</p>}
        </section>
      </section>
    )
  }

  return (
    <section className="coach-hub-screen coach-command-center">
      <header className="coach-command-hero">
        <div>
          <span className="eyebrow">COACH HUB</span>
          <h1>Command Center</h1>
          <p>Portfolio intelligence for every client relationship.</p>
        </div>

        {loading || portfolioLoading ? (
          <div className="coach-command-hero-grid loading">
            <article><small>Loading</small><strong>…</strong></article>
          </div>
        ) : hero ? (
          <div className="coach-command-hero-grid">
            <article>
              <small>Active Clients</small>
              <strong>{hero.activeClients}</strong>
            </article>
            <article>
              <small>Trained This Week</small>
              <strong>
                {hero.trainedThisWeek > 0 ? hero.trainedThisWeek : '—'}
              </strong>
            </article>
            <article>
              <small>Need Attention</small>
              <strong>
                {hero.needsAttention > 0 ? hero.needsAttention : '—'}
              </strong>
            </article>
            <article>
              <small>Active Assignments</small>
              <strong>
                {hero.activeAssignments > 0 ? hero.activeAssignments : '—'}
              </strong>
            </article>
          </div>
        ) : null}

        {!loading && !portfolioLoading && hero?.weeklyReviews && (
          <div className="coach-command-review-summary">
            <CalendarRange size={16} />
            <span>
              Weekly Reviews · {hero.weeklyReviews.complete} / {hero.weeklyReviews.total} complete
            </span>
          </div>
        )}
      </header>

      {portfolioError && (
        <p className="coach-hub-notice">{portfolioError}</p>
      )}

      <CoachAttentionQueue
        items={portfolio?.attentionQueue ?? []}
        totalCount={portfolio?.attentionQueue?.length ?? 0}
        onViewClient={onSelectClient}
        onViewAll={() => onSortChange?.(COACH_CLIENT_SORT.NEEDS_ATTENTION)}
      />

      {!loading && !portfolioLoading && portfolio?.hero?.weeklyReviews?.remaining > 0 && (
        <section className="coach-command-panel coach-command-review-queue">
          <header className="coach-command-panel-header">
            <div>
              <span className="eyebrow">WORKFLOW</span>
              <h2>Weekly Reviews</h2>
            </div>
            <button
              type="button"
              className="gold-button machined coach-command-inline-action"
              onClick={onReviewNext}
            >
              Review Next
            </button>
          </header>
          <div className="coach-command-empty-copy">
            <strong>{portfolio.hero.weeklyReviews.remaining} remaining</strong>
            <span>Complete this week&apos;s private reviews while client context is still fresh.</span>
          </div>
        </section>
      )}

      <section className="coach-command-panel coach-command-roster">
        <header className="coach-command-panel-header">
          <div>
            <span className="eyebrow">ROSTER</span>
            <h2>Clients</h2>
          </div>
        </header>

        <label className="coach-roster-search-shell">
          <Search {...SEARCH_ICON} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
          />
        </label>

        <div className="coach-command-sort-row">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={sortKey === option.id ? 'active' : ''}
              onClick={() => onSortChange?.(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading || portfolioLoading ? (
          <div className="coach-command-loading-grid">
            {[1, 2, 3].map((item) => (
              <article key={item} className="coach-command-client-card skeleton" />
            ))}
          </div>
        ) : filteredRoster.length ? (
          <div className="coach-command-client-grid">
            {filteredRoster.map((entry) => (
              <CoachClientCard
                key={entry.client.id}
                entry={entry}
                onSelect={onSelectClient}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No matching clients"
            description="Try another search or sorting option."
          />
        )}
      </section>

      <CoachWeeklySnapshot weekly={portfolio?.weekly} />

      <CoachActivityFeed
        events={portfolio?.activityFeed ?? []}
        onSelectClient={onSelectClient}
      />

      <section className="coach-command-panel">
        <header>
          <span className="eyebrow">MOMENTUM</span>
          <h2>Client Wins</h2>
        </header>
        {portfolio?.wins?.length ? (
          <div className="coach-command-wins-list">
            {portfolio.wins.map((win) => (
              <button
                key={win.id}
                type="button"
                className="coach-command-win-row"
                onClick={() => onSelectClient?.(win.client)}
              >
                <div>
                  <strong>{win.clientName}</strong>
                  <span>
                    {win.label} · {win.detail}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="coach-command-empty-copy">
            <strong>No client wins to highlight yet.</strong>
            <span>PRs, streaks, and strong weeks will surface here.</span>
          </div>
        )}
      </section>

      <section className="coach-command-panel">
        <header className="coach-command-panel-header">
          <div>
            <span className="eyebrow">DELIVERY</span>
            <h2>Assignments</h2>
          </div>
          <button
            type="button"
            className="coach-secondary-button coach-command-inline-action"
            onClick={onViewAssignments}
          >
            View Assignments
            <ClipboardList size={16} />
          </button>
        </header>

        <div className="coach-command-assignment-strip">
          <article>
            <small>Active</small>
            <strong>{portfolio?.assignmentOverview?.active ?? '—'}</strong>
          </article>
          <article>
            <small>Incomplete</small>
            <strong>{portfolio?.assignmentOverview?.incomplete ?? '—'}</strong>
          </article>
          <article>
            <small>Overdue</small>
            <strong>{portfolio?.assignmentOverview?.overdue ?? '—'}</strong>
          </article>
        </div>
      </section>

      <section className="coach-command-quick-actions">
        <button type="button" className="coach-secondary-button" onClick={onInvite}>
          <UserPlus {...ICON} />
          Add Client
        </button>
        <button
          type="button"
          className="gold-button machined"
          disabled={!clients.length}
          onClick={onAssignWorkout}
        >
          <Plus {...ICON} />
          Assign Workout
        </button>
        <button type="button" className="coach-secondary-button" onClick={onViewAssignments}>
          <ClipboardList {...ICON} />
          View Assignments
        </button>
      </section>

      <section className="coach-invite-card coach-invite-card--quiet">
        <div className="coach-invite-copy">
          <UserPlus {...ICON} />
          <div>
            <strong>Invite an athlete</strong>
            <span>Use the email on their AVAREN account.</span>
          </div>
        </div>
        <div className="coach-invite-form">
          <label className="coach-field-shell">
            <Mail {...ICON} />
            <input
              value={inviteEmail}
              onChange={(event) => onInviteEmailChange?.(event.target.value)}
              placeholder="athlete@email.com"
              aria-label="Athlete email"
            />
          </label>
          <button
            type="button"
            className="gold-button machined coach-invite-submit"
            onClick={onInvite}
          >
            Invite
          </button>
        </div>
      </section>

      {notice && <p className="coach-hub-notice">{notice}</p>}

      {invitations.length > 0 && (
        <section className="coach-pending-section">
          <header>
            <div>
              <span className="eyebrow">INVITATIONS</span>
              <h2>Recent</h2>
            </div>
          </header>
          <div className="coach-pending-list">
            {invitations.slice(0, 4).map((invitation) => (
              <article key={invitation.id}>
                <div>
                  <Mail {...ICON} />
                  <span>{invitation.athlete_email}</span>
                </div>
                <small>{invitation.status}</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

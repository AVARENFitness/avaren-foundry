import {
  CalendarRange,
  ClipboardList,
  Mail,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react'
import { COACH_CLIENT_SORT } from '../../lib/clientIntelligence'
import CoachAttentionQueue from './CoachAttentionQueue'
import CoachClientCard from './CoachClientCard'
import EmptyState from '../ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }
const SEARCH_ICON = { size: 16, strokeWidth: 1.75 }

const PRIMARY_SORT_OPTIONS = [
  { id: COACH_CLIENT_SORT.NEEDS_ATTENTION, label: 'Attention' },
  { id: COACH_CLIENT_SORT.RECENTLY_ACTIVE, label: 'Recent' },
  { id: COACH_CLIENT_SORT.ALL, label: 'All' },
]

export default function CoachCommandCenter({
  clients = [],
  invitations = [],
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
  onNavigateCoachScreen,
  notice = '',
}) {
  const hero = portfolio?.hero
  const sortedRoster = portfolio?.rosterEntries ?? []
  const filteredRoster = sortedRoster.filter((entry) =>
    entry.clientName.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const attentionCount = portfolio?.attentionQueue?.length ?? 0
  const reviewsRemaining = hero?.weeklyReviews?.remaining ?? 0

  if (!clients.length && !loading) {
    return (
      <section className="coach-hub-screen coach-command-center coach-command-center--calm">
        <header className="coach-hub-page-header">
          <div>
            <span className="eyebrow">COACH HUB</span>
            <h1>Command Center</h1>
            <p>Invite your first athlete to begin.</p>
          </div>
        </header>
        <EmptyState
          icon={Users}
          title="No connected clients yet"
          description="Invite an athlete to begin building your coaching roster."
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
    <section className="coach-hub-screen coach-command-center coach-command-center--calm">
      <header className="coach-command-hero coach-command-hero--compact">
        <div>
          <span className="eyebrow">COACH HUB</span>
          <h1>Command Center</h1>
          {!loading && !portfolioLoading && hero ? (
            <p className="coach-command-summary">
              {hero.activeClients} active
              {attentionCount > 0 ? ` · ${attentionCount} need attention` : ' · roster on track'}
              {reviewsRemaining > 0 ? ` · ${reviewsRemaining} reviews open` : ''}
            </p>
          ) : (
            <p>Who needs you, what&apos;s next, and quick access to every client.</p>
          )}
        </div>
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

      {reviewsRemaining > 0 && (
        <section className="coach-command-panel coach-command-review-compact">
          <div className="coach-command-review-compact-copy">
            <CalendarRange size={16} />
            <div>
              <strong>{reviewsRemaining} weekly review{reviewsRemaining === 1 ? '' : 's'} open</strong>
              <span>Complete reviews while context is fresh.</span>
            </div>
          </div>
          <button
            type="button"
            className="coach-secondary-button coach-command-inline-action"
            onClick={onReviewNext}
          >
            Review next
          </button>
        </section>
      )}

      <section className="coach-command-panel coach-command-roster">
        <header className="coach-command-panel-header">
          <div>
            <span className="eyebrow">CLIENTS</span>
            <h2>Your roster</h2>
          </div>
          <button
            type="button"
            className="coach-secondary-button coach-command-inline-action"
            disabled={!clients.length}
            onClick={onAssignWorkout}
          >
            <Plus size={16} />
            Assign
          </button>
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

        <div className="coach-command-sort-row coach-command-sort-row--compact">
          {PRIMARY_SORT_OPTIONS.map((option) => (
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

      <section className="coach-command-panel coach-command-tools">
        <header className="coach-command-panel-header">
          <div>
            <span className="eyebrow">TOOLS</span>
            <h2>Go deeper</h2>
          </div>
        </header>
        <div className="coach-command-tools-grid">
          <button type="button" className="coach-secondary-button" onClick={onViewAssignments}>
            <ClipboardList size={16} />
            Assignments
            {hero?.activeAssignments > 0 ? ` (${hero.activeAssignments})` : ''}
          </button>
          <button
            type="button"
            className="coach-secondary-button"
            onClick={() => onNavigateCoachScreen?.('calendar')}
          >
            <CalendarRange size={16} />
            Calendar
          </button>
          <button type="button" className="coach-secondary-button" onClick={onInvite}>
            <UserPlus size={16} />
            Add client
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
  )
}

import {
  Bell,
  BriefcaseBusiness,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  Download,
  Dumbbell,
  FileClock,
  GraduationCap,
  Hammer,
  History,
  LogOut,
  MessageCircle,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Share2,
  Sparkles,
  UserRound,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import ImportBackupButton from '../components/ImportBackupButton'
import AthleteCoachPanel from '../components/AthleteCoachPanel'
import { supabase } from '../lib/supabase'
import {
  clearState,
  exportState,
  importState,
  lastBackupAt,
} from '../lib/storage'

const formatTime = (value) => {
  if (!value) return 'Never'

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const MoreItem = ({
  icon: Icon,
  title,
  description,
  detail,
  badge,
  onClick,
  danger = false,
}) => (
  <button
    className={`more-destination ${
      danger ? 'danger' : ''
    }`}
    onClick={onClick}
  >
    <span className="more-destination-icon">
      <Icon size={18} />
    </span>

    <span className="more-destination-copy">
      <strong>{title}</strong>
      {description && (
        <small>{description}</small>
      )}
    </span>

    {badge ? (
      <span className="more-destination-badge">
        {badge}
      </span>
    ) : detail ? (
      <span className="more-destination-detail">
        {detail}
      </span>
    ) : (
      <ChevronRight
        className="more-destination-chevron"
        size={17}
      />
    )}
  </button>
)

export default function MoreScreen({
  state,
  setState,
  fallbackState,
  onOpenBuilder,
  onOpenPlanner,
  onOpenHistory,
  onOpenForge,
  onOpenCoach,
  onOpenNotifications,
  onOpenReadinessTrends,
  onOpenMobility,
  onOpenReset,
  onReplayTour,
  coachRole = 'athlete',
  coachAccessEnabled = false,
  onEnterCoachMode,
  onStartCoachAssignment,
  mobilityTitle = 'Morning Movement',
  mobilityMinutes = 5,
  notificationCount = 0,
  session,
}) {
  const [shareMessage, setShareMessage] =
    useState('')

  const shareAvaren = async () => {
    const shareData = {
      title: 'AVAREN — The Foundry',
      text:
        'Train with AVAREN — workouts, readiness, movement, recovery, and progress in one place.',
      url: window.location.origin,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareMessage('AVAREN shared.')
        return
      }

      await navigator.clipboard.writeText(
        shareData.url,
      )
      setShareMessage(
        'App link copied to your clipboard.',
      )
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setShareMessage(
          'Copy the current browser address to share AVAREN.',
        )
      }
    }
  }

  const email =
    session?.user?.email ?? ''
  const displayName =
    session?.user?.user_metadata
      ?.display_name ||
    email.split('@')[0] ||
    'AVAREN Athlete'

  return (
    <div className="more-screen-redesign">
      <header className="more-hero">
        <div>
          <span className="eyebrow">
            YOUR AVAREN
          </span>
          <h1>Everything in its place.</h1>
          <p>
            Training tools, recovery, account
            settings, and support—organized
            without the clutter.
          </p>
        </div>

        <div className="more-profile-mark">
          <span>
            {displayName
              .slice(0, 1)
              .toUpperCase()}
          </span>
        </div>
      </header>

      <section className="more-primary-card">
        <div className="more-primary-copy">
          <span className="eyebrow">
            TRAINING RECORD
          </span>
          <h2>Workout History</h2>
          <p>
            Review every session, set, note,
            reflection, and personal record.
          </p>
        </div>

        <button
          className="gold-button machined"
          onClick={onOpenHistory}
        >
          <History size={18} />
          Open History
          <ChevronRight size={17} />
        </button>
      </section>

      <section className="more-section">
        <header className="more-section-heading">
          <span>Training</span>
          <small>Plan, train, and review</small>
        </header>

        <div className="more-destination-list">
          <MoreItem
            icon={CalendarDays}
            title="Weekly Program"
            description="Organize the training week"
            onClick={onOpenPlanner}
          />

          <MoreItem
            icon={Settings2}
            title="Workout Builder"
            description="Create and edit workouts"
            onClick={onOpenBuilder}
          />

          {coachAccessEnabled && (
            <MoreItem
              icon={BriefcaseBusiness}
              title="Coach Mode"
              description="Manage clients and assignments"
              detail={
                coachRole === 'coach'
                  ? 'Enabled'
                  : 'Open'
              }
              onClick={
                onEnterCoachMode ??
                onOpenCoach
              }
            />
          )}

          <MoreItem
            icon={Hammer}
            title="The Forge"
            description="Achievements and milestones"
            onClick={onOpenForge}
          />

          <MoreItem
            icon={Zap}
            title="Readiness Trends"
            description="See how recovery changes over time"
            onClick={onOpenReadinessTrends}
          />
        </div>
      </section>

      <section className="more-section">
        <header className="more-section-heading">
          <span>Recovery</span>
          <small>Prepare and reset</small>
        </header>

        <div className="more-destination-list">
          <MoreItem
            icon={Sparkles}
            title="Morning Movement"
            description={mobilityTitle}
            detail={`${mobilityMinutes} min`}
            onClick={onOpenMobility}
          />

          <MoreItem
            icon={RefreshCcw}
            title="Daily Reset"
            description="Recovery based on recent training"
            onClick={onOpenReset}
          />
        </div>
      </section>

      <section className="more-section">
        <header className="more-section-heading">
          <span>Account</span>
          <small>Your profile and preferences</small>
        </header>

        <div className="more-account-card">
          <div className="more-account-icon">
            <UserRound size={19} />
          </div>

          <div>
            <strong>{displayName}</strong>
            <span>{email}</span>
          </div>
        </div>

        <div className="more-destination-list">
          <MoreItem
            icon={Bell}
            title="Notifications"
            description="Reminders and training updates"
            badge={
              notificationCount > 0
                ? notificationCount
                : null
            }
            onClick={onOpenNotifications}
          />

          <MoreItem
            icon={Download}
            title="Export Backup"
            description="Download a copy of your data"
            detail={formatTime(
              state.lastBackupAt ??
                lastBackupAt(),
            )}
            onClick={() => {
              exportState(state)
              setState((current) => ({
                ...current,
                lastBackupAt:
                  new Date().toISOString(),
              }))
            }}
          />

          <div className="more-import-row">
            <ImportBackupButton
              onImport={async (file) => {
                try {
                  const restored =
                    await importState(
                      file,
                      fallbackState,
                    )
                  setState(restored)
                  alert(
                    'Backup restored successfully.',
                  )
                } catch {
                  alert(
                    'That backup file could not be restored.',
                  )
                }
              }}
            />
          </div>
        </div>
      </section>

      <AthleteCoachPanel
        onStartAssignment={
          onStartCoachAssignment
        }
      />

      <section className="more-section">
        <header className="more-section-heading">
          <span>Support</span>
          <small>Share and learn more</small>
        </header>

        <div className="more-destination-list">
          <MoreItem
            icon={GraduationCap}
            title="Replay App Tour"
            description="Review how AVAREN works"
            onClick={onReplayTour}
          />

          <MoreItem
            icon={Share2}
            title="Share AVAREN"
            description="Send the app’s exact link"
            onClick={shareAvaren}
          />

          <MoreItem
            icon={MessageCircle}
            title="Send Feedback"
            description="Report a bug or suggest a feature"
            onClick={() => {
              const subject =
                encodeURIComponent(
                  'AVAREN Feedback',
                )

              const body =
                encodeURIComponent(
                  [
                    'Feedback type: Bug report / Feature request',
                    '',
                    'What happened or what would you like to see?',
                    '',
                    '',
                    'Steps to reproduce:',
                    '',
                    '',
                    `App URL: ${window.location.href}`,
                    `Device / Browser: ${navigator.userAgent}`,
                    `Date: ${new Date().toLocaleString()}`,
                  ].join('\n'),
                )

              window.location.href =
                `mailto:hello@avarenfitness.com?subject=${subject}&body=${body}`
            }}
          />

          <MoreItem
            icon={FileClock}
            title="About AVAREN"
            description="The Foundry training system"
            detail="Beta"
            onClick={() => {
              alert(
                'AVAREN — The Foundry\nA premium training, readiness, movement, and progress system.',
              )
            }}
          />
        </div>

        {shareMessage && (
          <div className="more-share-message">
            <Share2 size={14} />
            {shareMessage}
          </div>
        )}
      </section>

      <section className="more-section more-danger-section">
        <header className="more-section-heading">
          <span>Session</span>
          <small>Account and local data</small>
        </header>

        <div className="more-destination-list">
          <MoreItem
            icon={LogOut}
            title="Sign Out"
            description="Sign out of this account"
            onClick={async () => {
              const { error } =
                await supabase.auth.signOut()

              if (error) {
                alert(error.message)
              }
            }}
          />

          <MoreItem
            icon={RotateCcw}
            title="Reset Local Data"
            description="Erase this device’s local copy"
            danger
            onClick={() => {
              if (
                confirm(
                  'Reset all local Foundry data? Export a backup first. This cannot be undone.',
                )
              ) {
                clearState()
                location.reload()
              }
            }}
          />
        </div>
      </section>

      <footer className="more-version">
        <Dumbbell size={15} />
        <span>AVAREN · Version 1.0 Beta</span>
      </footer>
    </div>
  )
}

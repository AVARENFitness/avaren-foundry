import {
  Bell,
  BriefcaseBusiness,
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
import { useEffect, useMemo, useRef, useState } from 'react'
import CollapsibleIdentityPanel, {
  IDENTITY_EDITOR_MODE,
} from '../components/ui/CollapsibleIdentityPanel'
import ImportBackupButton from '../components/ImportBackupButton'
import AthleteCoachPanel from '../components/AthleteCoachPanel'
import AthleteSessionPackageCard from '../components/AthleteSessionPackageCard'
import AthleteScheduledSessions from '../components/AthleteScheduledSessions'
import { supabase } from '../lib/supabase'
import { appUi } from '../lib/appUi'
import { getAthleteDisplayName } from '../lib/clientDisplayName'
import { probeIdentityCapabilities } from '../lib/identityCapabilities'
import {
  profileSeedFromAuthUser,
  sanitizeOwnProfileDraft,
  userProfileBackend,
} from '../lib/userProfileBackend'
import {
  clearState,
  exportState,
  importState,
  lastBackupAt,
} from '../lib/storage'
import {
  ACCOUNT_SECTIONS,
  DEFAULT_ACCOUNT_SECTION,
  normalizeAccountSection,
  resolveInitialAccountSection,
} from '../lib/accountSectionNav'

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never'

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
    className={`more-destination ${danger ? 'danger' : ''}`}
    onClick={onClick}
  >
    <span className="more-destination-icon"><Icon size={18}/></span>
    <span className="more-destination-copy">
      <strong>{title}</strong>
      {description && <small>{description}</small>}
    </span>
    {badge ? <span className="more-destination-badge">{badge}</span>
      : detail ? <span className="more-destination-detail">{detail}</span>
      : <ChevronRight className="more-destination-chevron" size={17}/>}
  </button>
)

const sections = ACCOUNT_SECTIONS

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
  onDevResetWeeklyCheckIn = null,
  weeklyCheckInDevResetEnabled = false,
}) {
  const [activeSection, setActiveSection] = useState(() =>
    resolveInitialAccountSection(),
  )
  const selectSection = (section) => {
    setActiveSection(normalizeAccountSection(section))
  }
  const [shareMessage, setShareMessage] = useState('')
  const [profileDraft, setProfileDraft] = useState(() =>
    sanitizeOwnProfileDraft(profileSeedFromAuthUser(session?.user ?? {})),
  )
  const [savedProfile, setSavedProfile] = useState(() =>
    sanitizeOwnProfileDraft(profileSeedFromAuthUser(session?.user ?? {})),
  )
  const [profileEditorMode, setProfileEditorMode] = useState(
    IDENTITY_EDITOR_MODE.VIEW,
  )
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileEnabled, setProfileEnabled] = useState(false)
  const [profileError, setProfileError] = useState('')
  const profileSavedTimerRef = useRef(null)
  const userId = session?.user?.id ?? null
  const email = session?.user?.email ?? ''
  const legacyName =
    session?.user?.user_metadata?.display_name ||
    email.split('@')[0] ||
    'AVAREN Athlete'

  useEffect(() => {
    return () => {
      if (profileSavedTimerRef.current) {
        clearTimeout(profileSavedTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    probeIdentityCapabilities().then((caps) => {
      setProfileEnabled(Boolean(caps.userProfiles))
    })
  }, [])

  useEffect(() => {
    if (!userId || !profileEnabled) {
      const seed = sanitizeOwnProfileDraft(profileSeedFromAuthUser(session?.user ?? {}))
      setProfileDraft(seed)
      setSavedProfile(seed)
      return
    }

    let active = true
    setProfileLoading(true)
    userProfileBackend
      .getUserProfile(userId)
      .then((profile) => {
        if (!active) return
        const next = sanitizeOwnProfileDraft(
          profile ?? profileSeedFromAuthUser(session?.user ?? {}),
        )
        setProfileDraft(next)
        setSavedProfile(next)
        setProfileEditorMode(IDENTITY_EDITOR_MODE.VIEW)
      })
      .catch(() => {
        if (!active) return
        const seed = sanitizeOwnProfileDraft(profileSeedFromAuthUser(session?.user ?? {}))
        setProfileDraft(seed)
        setSavedProfile(seed)
      })
      .finally(() => {
        if (active) setProfileLoading(false)
      })

    return () => {
      active = false
    }
  }, [userId, profileEnabled, session?.user?.id])

  const displayName = useMemo(
    () =>
      getAthleteDisplayName({
        profile: savedProfile,
        legacyName,
        email,
      }),
    [savedProfile, legacyName, email],
  )

  const profileFullName = useMemo(() => {
    const parts = [savedProfile.first_name, savedProfile.last_name].filter(Boolean)
    return parts.length ? parts.join(' ') : displayName
  }, [savedProfile, displayName])

  const handleProfileSave = async () => {
    setProfileEditorMode(IDENTITY_EDITOR_MODE.SAVING)
    setProfileError('')
    try {
      const saved = await userProfileBackend.updateOwnUserProfile(profileDraft)
      const next = sanitizeOwnProfileDraft(saved ?? profileDraft)
      setSavedProfile(next)
      setProfileDraft(next)
      setProfileEditorMode(IDENTITY_EDITOR_MODE.SAVED)
      if (profileSavedTimerRef.current) {
        clearTimeout(profileSavedTimerRef.current)
      }
      profileSavedTimerRef.current = setTimeout(() => {
        setProfileEditorMode(IDENTITY_EDITOR_MODE.VIEW)
      }, 1400)
    } catch (error) {
      setProfileError(error?.message ?? 'Could not save profile name.')
      setProfileEditorMode(IDENTITY_EDITOR_MODE.ERROR)
    }
  }

  const shareAvaren = async () => {
    const data = {
      title: 'AVAREN — The Foundry',
      text: 'Train with AVAREN — workouts, readiness, movement, recovery, and progress in one place.',
      url: window.location.origin,
    }
    try {
      if (navigator.share) await navigator.share(data)
      else await navigator.clipboard.writeText(data.url)
      setShareMessage(navigator.share ? 'AVAREN shared.' : 'App link copied.')
    } catch (error) {
      if (error?.name !== 'AbortError') setShareMessage('Copy the current browser address to share AVAREN.')
    }
  }

  return (
    <div className="more-screen-redesign profile-hub">
      <header className="more-hero profile-hub-hero">
        <div>
          <span className="eyebrow">YOUR AVAREN</span>
          <h1>{displayName}</h1>
          <p>Choose an area below. Only the tools you need are shown, so Profile stays clean and quick.</p>
        </div>
        <div className="more-profile-mark"><span>{displayName.slice(0,1).toUpperCase()}</span></div>
      </header>

      <nav className="profile-section-nav" aria-label="Profile sections">
        {sections.map((section) => (
          <button
            key={section}
            className={activeSection === section ? 'active' : ''}
            onClick={() => selectSection(section)}
          >
            {section}
            {section === 'Account' && notificationCount > 0 && (
              <span>{notificationCount}</span>
            )}
          </button>
        ))}
      </nav>

      {activeSection === 'Training' && (
        <div className="profile-section-panel">
          <section className="more-primary-card">
            <div className="more-primary-copy">
              <span className="eyebrow">TRAINING RECORD</span>
              <h2>Workout History</h2>
              <p>Review every session, set, reflection, and personal record.</p>
            </div>
            <button className="gold-button machined" onClick={onOpenHistory}>
              <History size={18}/>Open History<ChevronRight size={17}/>
            </button>
          </section>
          <AthleteSessionPackageCard />
          <AthleteScheduledSessions />
          <AthleteCoachPanel onStartAssignment={onStartCoachAssignment}/>
          <section className="more-section">
            <header className="more-section-heading"><span>Training</span><small>Plan, build, and review</small></header>
            <div className="more-destination-list">
              <MoreItem icon={CalendarDays} title="Weekly Program" description="Organize the training week" onClick={onOpenPlanner}/>
              <MoreItem icon={Settings2} title="Workout Builder" description="Create and edit workouts" onClick={onOpenBuilder}/>
              <MoreItem icon={Hammer} title="The Forge" description="Achievements and milestones" onClick={onOpenForge}/>
              <MoreItem icon={Zap} title="Readiness Trends" description="See how recovery changes over time" onClick={onOpenReadinessTrends}/>
            </div>
          </section>
        </div>
      )}

      {activeSection === 'Recovery' && (
        <section className="more-section profile-section-panel">
          <header className="more-section-heading"><span>Recovery</span><small>Prepare and reset</small></header>
          <div className="more-destination-list">
            <MoreItem icon={Sparkles} title="Morning Movement" description={mobilityTitle} detail={`${mobilityMinutes} min`} onClick={onOpenMobility}/>
            <MoreItem icon={RefreshCcw} title="Daily Reset" description="Recovery based on recent training" onClick={onOpenReset}/>
          </div>
        </section>
      )}

      {activeSection === 'Account' && (
        <section className="more-section profile-section-panel">
          <header className="more-section-heading"><span>Account</span><small>Profile, notifications, and data</small></header>
          <div className="more-account-card">
            <div className="more-account-icon"><UserRound size={19}/></div>
            <div><strong>{displayName}</strong><span>{email}</span></div>
          </div>

          {profileEnabled ? (
            <CollapsibleIdentityPanel
              eyebrow="PROFILE"
              title="Profile name"
              hint="How you appear across AVAREN."
              mode={profileEditorMode}
              canEdit={!profileLoading}
              isEmpty={!savedProfile.first_name && !savedProfile.last_name}
              successMessage="Profile name saved"
              errorMessage={profileError}
              editLabel="Edit"
              addLabel="Add name"
              saveLabel="Save profile name"
              onEdit={() => {
                setProfileDraft(savedProfile)
                setProfileError('')
                setProfileEditorMode(IDENTITY_EDITOR_MODE.EDITING)
              }}
              onCancel={() => {
                setProfileDraft(savedProfile)
                setProfileError('')
                setProfileEditorMode(IDENTITY_EDITOR_MODE.VIEW)
              }}
              onSave={handleProfileSave}
              viewContent={
                <>
                  <div className="identity-summary-row">
                    <small>Name</small>
                    <strong>{profileFullName}</strong>
                  </div>
                  {savedProfile.preferred_name ? (
                    <div className="identity-summary-row">
                      <small>Preferred</small>
                      <strong>{savedProfile.preferred_name}</strong>
                    </div>
                  ) : null}
                </>
              }
              editingContent={
                <div className="coach-client-identity-grid">
                  <label className="coach-field">
                    <span>First name</span>
                    <input
                      className="coach-field-input"
                      value={profileDraft.first_name}
                      disabled={profileEditorMode === IDENTITY_EDITOR_MODE.SAVING}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          first_name: event.target.value,
                        }))
                      }
                      autoComplete="given-name"
                    />
                  </label>
                  <label className="coach-field">
                    <span>Last name</span>
                    <input
                      className="coach-field-input"
                      value={profileDraft.last_name}
                      disabled={profileEditorMode === IDENTITY_EDITOR_MODE.SAVING}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          last_name: event.target.value,
                        }))
                      }
                      autoComplete="family-name"
                    />
                  </label>
                  <label className="coach-field coach-field--wide">
                    <span>Preferred name</span>
                    <input
                      className="coach-field-input"
                      value={profileDraft.preferred_name}
                      disabled={profileEditorMode === IDENTITY_EDITOR_MODE.SAVING}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          preferred_name: event.target.value,
                        }))
                      }
                      placeholder="Optional nickname"
                      autoComplete="nickname"
                    />
                  </label>
                </div>
              }
            />
          ) : null}

          <div className="more-destination-list">
            {coachAccessEnabled && (
              <MoreItem
                icon={BriefcaseBusiness}
                title="Coach Hub"
                description="Clients, session calendar, and assignments"
                detail={coachRole === 'coach' ? 'Enabled' : 'Open'}
                onClick={onEnterCoachMode ?? onOpenCoach}
              />
            )}
            <MoreItem icon={Bell} title="Notifications" description="Reminders and training updates" badge={notificationCount || null} onClick={onOpenNotifications}/>
            <MoreItem icon={Download} title="Export Backup" description="Download a copy of your data" detail={formatTime(state.lastBackupAt ?? lastBackupAt(userId))} onClick={() => {
              exportState(state, userId)
              setState((current) => ({...current,lastBackupAt:new Date().toISOString()}))
            }}/>
            <div className="more-import-row"><ImportBackupButton onImport={async (file) => {
              try {
                const restored = await importState(file, fallbackState, userId)
                setState(restored)
                appUi.toast('Backup restored successfully.', 'success')
              } catch {
                appUi.toast('That backup file could not be restored.', 'error')
              }
            }} /></div>
            <MoreItem icon={LogOut} title="Sign Out" description="Sign out of this account" onClick={async () => {
              const { error } = await supabase.auth.signOut()
              if (error) appUi.toast(error.message, 'error')
            }} />
            <MoreItem icon={RotateCcw} title="Reset Local Data" description="Erase this device’s local copy" danger onClick={async () => {
              if (await appUi.confirm({
                message: 'Reset all local Foundry data? Export a backup first. This cannot be undone.',
                tone: 'danger',
                confirmLabel: 'Reset Data',
              })) {
                clearState(userId)
                location.reload()
              }
            }} />
            {import.meta.env.DEV && weeklyCheckInDevResetEnabled && typeof onDevResetWeeklyCheckIn === 'function' ? (
              <MoreItem
                icon={RefreshCcw}
                title="Reset weekly check-in (dev)"
                description="Delete this week's submission for lifecycle retesting"
                danger
                onClick={() => {
                  void onDevResetWeeklyCheckIn()
                }}
              />
            ) : null}
          </div>
        </section>
      )}

      {activeSection === 'Support' && (
        <section className="more-section profile-section-panel">
          <header className="more-section-heading"><span>Support</span><small>Help, sharing, and app information</small></header>
          <div className="more-destination-list">
            <MoreItem icon={GraduationCap} title="Replay App Tour" description="Review how AVAREN works" onClick={onReplayTour}/>
            <MoreItem icon={Share2} title="Share AVAREN" description="Send the app’s exact link" onClick={shareAvaren}/>
            <MoreItem icon={MessageCircle} title="Send Feedback" description="Report a bug or suggest a feature" onClick={()=>{
              const subject=encodeURIComponent('AVAREN Feedback')
              const body=encodeURIComponent([
                'Feedback type: Bug report / Feature request','','What happened or what would you like to see?','','','Steps to reproduce:','','',
                `App URL: ${window.location.href}`,`Device / Browser: ${navigator.userAgent}`,`Date: ${new Date().toLocaleString()}`
              ].join('\n'))
              window.location.href=`mailto:hello@avarenfitness.com?subject=${subject}&body=${body}`
            }}/>
            <MoreItem icon={FileClock} title="About AVAREN" description="The Foundry training system" detail="Beta" onClick={()=>appUi.alert({
              title: 'About AVAREN',
              message: 'AVAREN — The Foundry\nA premium training, readiness, movement, recovery, and progress system.',
            })}/>
          </div>
          {shareMessage && <div className="more-share-message"><Share2 size={14}/>{shareMessage}</div>}
        </section>
      )}

      <footer className="more-version"><Dumbbell size={15}/><span>AVAREN · Version 1.0 Beta</span></footer>
    </div>
  )
}

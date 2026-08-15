import {
  ArrowLeft,
  CalendarRange,
  ClipboardList,
  Dumbbell,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react'
import { getClientDisplayName } from '../../lib/clientDisplayName'
import { appUi } from '../../lib/appUi'
import { coachBackend } from '../../lib/coachBackend'
import CoachPrograms from '../CoachPrograms'
import SectionHeader from '../ui/SectionHeader'
import EmptyState from '../ui/EmptyState'

const ICON = { size: 18, strokeWidth: 1.75 }

const formatDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })
    : 'No due date'

function BuildHome({ onOpenWorkouts, onOpenPrograms }) {
  return (
    <section className="coach-hub-screen coach-build-hub" data-testid="coach-build-hub">
      <header className="coach-build-hub-header">
        <span className="eyebrow">CREATE</span>
        <h1>Build</h1>
      </header>

      <div className="coach-build-hub-grid">
        <button
          type="button"
          className="coach-build-hub-card"
          data-testid="coach-build-workouts-entry"
          onClick={onOpenWorkouts}
        >
          <Dumbbell size={22} aria-hidden="true" />
          <strong>Workouts</strong>
          <span>Build a single training session.</span>
        </button>

        <button
          type="button"
          className="coach-build-hub-card"
          data-testid="coach-build-programs-entry"
          onClick={onOpenPrograms}
        >
          <CalendarRange size={22} aria-hidden="true" />
          <strong>Programs</strong>
          <span>Organize workouts into a training plan.</span>
        </button>
      </div>
    </section>
  )
}

function WorkoutsLibrary({
  clients,
  templates,
  assignments,
  deliveryStatus,
  notice,
  onNewWorkout,
  onEditTemplate,
  onRefresh,
  onUnassign,
  onDeleteAssignment,
  onBack,
}) {
  return (
    <section
      className="coach-hub-screen coach-build-workouts"
      data-testid="coach-build-workouts"
    >
      <header className="coach-build-subheader">
        <button type="button" className="coach-program-builder-back" onClick={onBack}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div>
          <span className="eyebrow">BUILD</span>
          <h1>Workouts</h1>
          <p className="coach-build-subcopy">Build a single training session.</p>
        </div>
        <button
          type="button"
          className="gold-button machined coach-primary-action"
          data-testid="coach-new-workout"
          disabled={!clients.length}
          onClick={onNewWorkout}
        >
          <Plus {...ICON} />
          New Workout
        </button>
      </header>

      {!clients.length ? (
        <p className="coach-hub-notice">Connect a client before assigning workouts.</p>
      ) : null}
      {notice ? <p className="coach-hub-notice">{notice}</p> : null}

      <section className="coach-profile-panel">
        <SectionHeader
          eyebrow="YOUR LIBRARY"
          title="Saved workouts"
          description="Reusable sessions you can assign to any client."
          action={
            <button
              type="button"
              className="coach-secondary-button"
              onClick={onNewWorkout}
            >
              <Plus {...ICON} />
              New Workout
            </button>
          }
        />

        {templates.length ? (
          <div className="coach-template-grid">
            {templates.map((template) => (
              <article key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <span>{template.workout_payload?.exercises?.length ?? 0} exercises</span>
                </div>
                <div>
                  <button type="button" onClick={() => onEditTemplate(template)}>
                    <Edit3 {...ICON} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="coach-icon-button coach-icon-button--destructive"
                    aria-label={`Delete ${template.name}`}
                    onClick={async () => {
                      if (
                        await appUi.confirm({
                          message: `Delete ${template.name}?`,
                          tone: 'danger',
                          confirmLabel: 'Delete',
                        })
                      ) {
                        await coachBackend.deleteWorkoutTemplate(template.id)
                        await onRefresh()
                      }
                    }}
                  >
                    <Trash2 {...ICON} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No saved workouts yet"
            description="Create a workout once, then assign it to any client."
          />
        )}
      </section>

      {assignments.length ? (
        <section className="coach-profile-panel">
          <SectionHeader
            eyebrow="RECENT"
            title="Assigned workouts"
            description="Active and recent client assignments."
          />
          <div className="coach-assignment-list">
            {assignments.map((assignment) => (
              <article
                className={`priority-${assignment.priority ?? 'normal'} coach-assignment-row status-${assignment.status}`}
                key={assignment.id}
              >
                <div>
                  <strong>{assignment.title}</strong>
                  <span>
                    {getClientDisplayName(
                      clients.find((client) => client.athlete_id === assignment.athlete_id) ?? {
                        athlete_email: assignment.athlete_id,
                      },
                    )}{' '}
                    · {formatDate(assignment.due_date)}
                  </span>
                </div>
                <div className="coach-assignment-row-actions">
                  <small>
                    {assignment.status} · {deliveryStatus[assignment.id] ?? 'Queued'}
                  </small>
                  <div className="coach-assignment-lifecycle-actions">
                    {['assigned', 'started'].includes(assignment.status) ? (
                      <button
                        type="button"
                        className="coach-cancel-button"
                        onClick={() => onUnassign(assignment)}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {assignment.status !== 'completed' ? (
                      <button
                        type="button"
                        className="coach-delete-button"
                        onClick={() => onDeleteAssignment(assignment)}
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}

export default function CoachBuildHub({
  view = 'home',
  onViewChange,
  clients = [],
  templates = [],
  assignments = [],
  program,
  deliveryStatus = {},
  notice = '',
  onRefresh,
  onNewWorkout,
  onEditTemplate,
  onCreateWorkoutFromProgram,
  onUnassign,
  onDeleteAssignment,
}) {
  if (view === 'programs') {
    return (
      <CoachPrograms
        embedded
        clients={clients}
        templates={templates}
        program={program}
        onRefresh={onRefresh}
        onBack={() => onViewChange?.('home')}
        onCreateWorkout={onCreateWorkoutFromProgram}
      />
    )
  }

  if (view === 'workouts') {
    return (
      <WorkoutsLibrary
        clients={clients}
        templates={templates}
        assignments={assignments}
        deliveryStatus={deliveryStatus}
        notice={notice}
        onNewWorkout={onNewWorkout}
        onEditTemplate={onEditTemplate}
        onRefresh={onRefresh}
        onUnassign={onUnassign}
        onDeleteAssignment={onDeleteAssignment}
        onBack={() => onViewChange?.('home')}
      />
    )
  }

  return (
    <BuildHome
      onOpenWorkouts={() => onViewChange?.('workouts')}
      onOpenPrograms={() => onViewChange?.('programs')}
    />
  )
}

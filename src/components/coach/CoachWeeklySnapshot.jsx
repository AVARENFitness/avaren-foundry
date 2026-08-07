export default function CoachWeeklySnapshot({ weekly }) {
  if (!weekly) return null

  const items = [
    {
      label: 'Client workouts',
      value: weekly.totalWorkoutsCompleted
        ? `${weekly.totalWorkoutsCompleted} completed`
        : 'None yet',
      detail: weekly.clientsWhoTrained
        ? `${weekly.clientsWhoTrained} client${weekly.clientsWhoTrained === 1 ? '' : 's'} trained`
        : 'No clients trained yet',
    },
    {
      label: 'Assignments',
      value: weekly.assignmentsCompleted
        ? `${weekly.assignmentsCompleted} completed`
        : 'None completed',
      detail: weekly.activeIncomplete
        ? `${weekly.activeIncomplete} still active`
        : 'No active assignments',
    },
    {
      label: 'Follow-up',
      value: weekly.followUpCount
        ? `${weekly.followUpCount} client${weekly.followUpCount === 1 ? '' : 's'}`
        : 'All clear',
      detail: weekly.overdueAssignments
        ? `${weekly.overdueAssignments} overdue assignment${weekly.overdueAssignments === 1 ? '' : 's'}`
        : 'No overdue assignments',
    },
  ]

  const trainedRatio =
    weekly.clientsWhoTrained > 0 && weekly.totalWorkoutsCompleted > 0
      ? Math.min(
          100,
          Math.round(
            (weekly.clientsWhoTrained /
              Math.max(weekly.clientsWhoTrained, 1)) *
              100,
          ),
        )
      : 0

  return (
    <section className="coach-command-panel">
      <header>
        <span className="eyebrow">THIS WEEK</span>
        <h2>Portfolio pulse</h2>
      </header>

      <div className="coach-command-weekly-grid">
        {items.map((item) => (
          <article key={item.label} className="coach-command-weekly-card">
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </article>
        ))}
      </div>

      {weekly.clientsWhoTrained > 0 && (
        <div className="coach-command-progress-bar" aria-hidden="true">
          <div style={{ width: `${Math.max(trainedRatio, 8)}%` }} />
        </div>
      )}
    </section>
  )
}

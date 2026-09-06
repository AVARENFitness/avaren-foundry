export default function ExerciseHistoryGlance({
  previousDisplay = null,
  bestDisplay = null,
  hasHistory = false,
  emptyLabel = 'No previous performance',
  'aria-label': ariaLabel = 'Exercise history',
}) {
  if (!hasHistory) {
    return (
      <p
        className="exercise-history-glance exercise-history-glance--empty"
        data-testid="exercise-history-glance-empty"
      >
        {emptyLabel}
      </p>
    )
  }

  return (
    <div
      className="exercise-history-glance"
      role="group"
      aria-label={ariaLabel}
      data-testid="exercise-history-glance"
    >
      <div className="exercise-history-glance-item">
        <span>Previous</span>
        <strong>{previousDisplay || emptyLabel}</strong>
      </div>
      {bestDisplay ? (
        <div className="exercise-history-glance-item">
          <span>Best</span>
          <strong>{bestDisplay}</strong>
        </div>
      ) : null}
    </div>
  )
}

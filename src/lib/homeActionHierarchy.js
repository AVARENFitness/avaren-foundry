const actionDestination = (id) => {
  if (id === 'appointment' || id === 'view-schedule') return 'schedule'
  return String(id ?? '')
}

/**
 * Present one action per destination on the athlete Home primary card.
 * Other destinations keep their original order, capped for a compact screen.
 */
export const selectDistinctHomeShortcuts = (
  primaryAction,
  secondaryActions = [],
  limit = 2,
) => {
  const seen = new Set()
  if (primaryAction?.id) seen.add(actionDestination(primaryAction.id))
  return (secondaryActions ?? []).filter((action) => {
    if (!action?.id) return false
    const destination = actionDestination(action.id)
    if (seen.has(destination)) return false
    seen.add(destination)
    return true
  }).slice(0, limit)
}

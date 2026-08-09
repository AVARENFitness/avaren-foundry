/**
 * Builds the runtime surface AVA actions execute against.
 * App.jsx passes canonical navigation/session helpers here — not action logic.
 */
export function createAvaActionRuntime({
  startWorkout,
  navigate,
  openReadiness,
  openRecovery,
  startRecoveryFlow,
  openNutrition,
  getSnapshot,
  getPlanningState,
  applyPlanningChanges,
  submitCoachFollowUp,
  onNavigateIntent,
} = {}) {
  return {
    startWorkout: typeof startWorkout === 'function' ? startWorkout : null,
    navigate: typeof navigate === 'function' ? navigate : null,
    openReadiness: typeof openReadiness === 'function' ? openReadiness : null,
    openRecovery: typeof openRecovery === 'function' ? openRecovery : null,
    startRecoveryFlow:
      typeof startRecoveryFlow === 'function' ? startRecoveryFlow : null,
    openNutrition:
      typeof openNutrition === 'function'
        ? openNutrition
        : typeof navigate === 'function'
          ? () => navigate('nutrition')
          : null,
    getSnapshot: typeof getSnapshot === 'function' ? getSnapshot : () => ({}),
    getPlanningState:
      typeof getPlanningState === 'function' ? getPlanningState : () => ({}),
    applyPlanningChanges:
      typeof applyPlanningChanges === 'function' ? applyPlanningChanges : null,
    submitCoachFollowUp:
      typeof submitCoachFollowUp === 'function' ? submitCoachFollowUp : null,
    onNavigateIntent:
      typeof onNavigateIntent === 'function' ? onNavigateIntent : null,
  }
}

export default createAvaActionRuntime

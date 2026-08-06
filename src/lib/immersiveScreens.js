export function isImmersiveScreen(screen, { mobilityFlow = null } = {}) {
  if (screen === 'gym' || screen === 'complete') return true
  if (screen === 'mobility') return Boolean(mobilityFlow)
  return false
}

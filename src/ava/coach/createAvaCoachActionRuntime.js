/**
 * Coach-mode runtime surface for AVA navigation actions.
 */
export function createAvaCoachActionRuntime({
  setCoachScreen,
  openClientProfile,
  openWeeklyReview,
  openCoachClientList,
  enterCoachHub,
  getSnapshot,
  getCoachContext,
} = {}) {
  return {
    isCoachRuntime: true,
    setCoachScreen:
      typeof setCoachScreen === 'function' ? setCoachScreen : null,
    openClientProfile:
      typeof openClientProfile === 'function' ? openClientProfile : null,
    openWeeklyReview:
      typeof openWeeklyReview === 'function' ? openWeeklyReview : null,
    openCoachClientList:
      typeof openCoachClientList === 'function' ? openCoachClientList : null,
    enterCoachHub:
      typeof enterCoachHub === 'function' ? enterCoachHub : null,
    getSnapshot: typeof getSnapshot === 'function' ? getSnapshot : () => ({}),
    getCoachContext:
      typeof getCoachContext === 'function' ? getCoachContext : () => ({}),
  }
}

export default createAvaCoachActionRuntime

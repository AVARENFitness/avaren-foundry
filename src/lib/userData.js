import { clearState, exportState, importState, lastBackupAt, loadState, saveState } from './storage'

export const requireUserId = (session) => {
  const userId = session?.user?.id
  if (!userId) throw new Error('An authenticated AVAREN user is required.')
  return userId
}

export const userData = {
  load: loadState,
  save: saveState,
  clear: clearState,
  export: exportState,
  import: importState,
  lastBackupAt,
}

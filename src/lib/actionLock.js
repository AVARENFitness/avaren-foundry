// Synchronous lock for actions where a second tap must never start a second request.
export const createActionLock = () => {
  let locked = false
  return {
    acquire() {
      if (locked) return false
      locked = true
      return true
    },
    release() { locked = false },
    isLocked() { return locked },
  }
}

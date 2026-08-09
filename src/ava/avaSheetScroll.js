export const TRANSCRIPT_STICK_THRESHOLD_PX = 80

export const isNearTranscriptBottom = (element, threshold = TRANSCRIPT_STICK_THRESHOLD_PX) => {
  if (!element) return true
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  return distance <= threshold
}

export const scrollTranscriptToBottom = (element, behavior = 'auto') => {
  if (!element) return
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    })
    return
  }
  element.scrollTop = element.scrollHeight
}

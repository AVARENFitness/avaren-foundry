import { getCalendarScreenshotGeometry } from './calendarScreenshotBlocks'
import { supabase } from './supabase'
export async function analyzeCalendarScreenshot(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a calendar screenshot.')
  if (file.size > 6_000_000) throw new Error('Choose a screenshot smaller than 6 MB.')
  const imageDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read screenshot.'))
    reader.readAsDataURL(file)
  })
  if (!supabase) throw new Error('Calendar import is unavailable.')
  const geometry = await getCalendarScreenshotGeometry(file)
  if (!geometry.blocks.length) throw new Error('No calendar event blocks detected. Upload a Google Calendar week screenshot with visible colored events.')
  const { data, error } = await supabase.functions.invoke('calendar-screenshot-analyze-v2', {
    body: { imageDataUrl, geometry },
  })
  if (error || !data?.ok) {
    let message = data?.message
    if (!message && error?.context && typeof error.context.json === 'function') {
      try {
        const detail = await error.context.json()
        message = detail?.message
      } catch { /* Some gateway errors do not return JSON. */ }
    }
    if (!message) {
      const code = Number(error?.context?.status)
      message = code === 401 || code === 403
        ? 'Calendar import authentication expired. Sign out and sign in again, then retry.'
        : code === 413
          ? 'The screenshot is too large. Try a smaller image.'
          : code === 422
            ? 'The screenshot grid could not be calibrated. Keep all weekday headings and hour labels visible.'
            : 'AVA could not process this screenshot. Try again or use a clearer week view.'
    }
    throw new Error(message)
  }
  return Array.isArray(data.events) ? data.events : []
}

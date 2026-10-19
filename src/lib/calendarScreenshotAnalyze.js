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
  const { data, error } = await supabase.functions.invoke('calendar-screenshot-analyze', {
    body: { imageDataUrl, geometry },
  })
  if (error || !data?.ok) throw new Error(data?.message || error?.message || 'Could not analyze calendar screenshot.')
  return Array.isArray(data.events) ? data.events : []
}

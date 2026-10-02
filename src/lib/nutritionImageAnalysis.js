import { supabase } from './supabase'

const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.82

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })

const loadImage = (dataUrl) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not open that image.'))
    image.src = dataUrl
  })

export async function prepareNutritionScanImage(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Choose a photo of the food or nutrition label.')
  }

  const original = await fileToDataUrl(file)
  const image = await loadImage(original)
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that image.')

  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

export async function analyzeNutritionImage({ imageDataUrl, context = '', mode = 'food' }) {
  if (!supabase) {
    throw new Error('Food scanning is unavailable right now.')
  }

  const { data, error } = await supabase.functions.invoke(
    'nutrition-image-analyze',
    {
      body: {
        imageDataUrl,
        context: String(context || '').trim().slice(0, 600),
        mode: mode === 'barcode' ? 'barcode' : 'food',
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Food scan failed.')
  }

  if (!data?.ok || !data?.result) {
    throw new Error('AVAREN could not analyze that photo.')
  }

  return data.result
}

const SUPPORTED_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

const normalizeBarcodeDigits = (value = '') => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return [8, 12, 13].includes(digits.length) ? digits : ''
}

export const isNativeBarcodeDetectorAvailable = () =>
  typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function'

export async function detectNutritionBarcode(file) {
  if (!file || !isNativeBarcodeDetectorAvailable()) return ''

  let detector
  try {
    const supported =
      typeof window.BarcodeDetector.getSupportedFormats === 'function'
        ? await window.BarcodeDetector.getSupportedFormats()
        : SUPPORTED_FORMATS
    const formats = SUPPORTED_FORMATS.filter((format) =>
      supported.includes(format),
    )
    detector = new window.BarcodeDetector({
      formats: formats.length ? formats : undefined,
    })
  } catch {
    try {
      detector = new window.BarcodeDetector()
    } catch {
      return ''
    }
  }

  let bitmap = null
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
      const results = await detector.detect(bitmap)
      return normalizeBarcodeDigits(results?.[0]?.rawValue)
    }

    const imageUrl = URL.createObjectURL(file)
    try {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = imageUrl
      })
      const results = await detector.detect(image)
      return normalizeBarcodeDigits(results?.[0]?.rawValue)
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  } catch {
    return ''
  } finally {
    bitmap?.close?.()
  }
}

export { normalizeBarcodeDigits }

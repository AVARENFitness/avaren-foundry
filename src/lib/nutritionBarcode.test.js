import { describe, expect, it } from 'vitest'
import {
  isNativeBarcodeDetectorAvailable,
  normalizeBarcodeDigits,
} from './nutritionBarcode'

describe('nutritionBarcode', () => {
  it('accepts UPC-A, EAN-8, and EAN-13 digit strings', () => {
    expect(normalizeBarcodeDigits('012345678905')).toBe('012345678905')
    expect(normalizeBarcodeDigits('12345670')).toBe('12345670')
    expect(normalizeBarcodeDigits('4006381333931')).toBe('4006381333931')
  })

  it('strips formatting but rejects unsupported lengths', () => {
    expect(normalizeBarcodeDigits('0 12345-67890 5')).toBe('012345678905')
    expect(normalizeBarcodeDigits('12345')).toBe('')
  })

  it('reports detector availability without throwing', () => {
    expect(typeof isNativeBarcodeDetectorAvailable()).toBe('boolean')
  })
})

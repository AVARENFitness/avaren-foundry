export const AVAREN_LIABILITY_WAIVER_VERSION = '1'

export const AVAREN_LIABILITY_WAIVER_TITLE = 'AVAREN Liability Waiver'

/**
 * Production signing stays disabled until the approved AVAREN waiver wording
 * is inserted here verbatim. Do not replace this with generated legal copy.
 */
export const AVAREN_LIABILITY_WAIVER_TEXT = ''

export const AVAREN_LIABILITY_WAIVER_ACKNOWLEDGEMENT =
  'I confirm that I have read the AVAREN Liability Waiver shown above, understand it, and agree to its terms.'

export const isAvarenLiabilityWaiverConfigured = () =>
  Boolean(AVAREN_LIABILITY_WAIVER_TEXT.trim())

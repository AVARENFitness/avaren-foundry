export const ACCOUNT_SECTIONS = ['Training', 'Recovery', 'Account', 'Support']

export const DEFAULT_ACCOUNT_SECTION = 'Account'

/** Legacy Overview tab — content moved to Training. */
export const LEGACY_ACCOUNT_SECTION_OVERVIEW = 'Overview'

export const LEGACY_OVERVIEW_REDIRECT_SECTION = 'Training'

export const normalizeAccountSection = (section) => {
  if (section === LEGACY_ACCOUNT_SECTION_OVERVIEW) {
    return LEGACY_OVERVIEW_REDIRECT_SECTION
  }

  if (ACCOUNT_SECTIONS.includes(section)) {
    return section
  }

  return DEFAULT_ACCOUNT_SECTION
}

export const resolveInitialAccountSection = (section = null) =>
  normalizeAccountSection(section ?? DEFAULT_ACCOUNT_SECTION)

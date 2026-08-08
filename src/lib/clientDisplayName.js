export const normalizeWhitespace = (value = '') =>
  String(value ?? '').trim().replace(/\s+/g, ' ')

export const emailPrefixFallback = (email = '') => {
  const local = String(email ?? '').split('@')[0] ?? String(email ?? '')
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const emptyUserProfile = () => ({
  first_name: '',
  last_name: '',
  preferred_name: '',
  display_name: '',
})

export const normalizeUserProfileFields = (profile = {}) => ({
  first_name: normalizeWhitespace(profile.first_name ?? ''),
  last_name: normalizeWhitespace(profile.last_name ?? ''),
  preferred_name: normalizeWhitespace(profile.preferred_name ?? ''),
  display_name: normalizeWhitespace(profile.display_name ?? ''),
})

export const buildDisplayNameInput = ({
  coachLabel = '',
  profile = null,
  legacyName = '',
  email = '',
} = {}) => ({
  coachLabel: normalizeWhitespace(coachLabel ?? ''),
  profile: normalizeUserProfileFields(profile ?? emptyUserProfile()),
  legacyName: normalizeWhitespace(legacyName ?? ''),
  email: String(email ?? ''),
})

export const buildDisplayNameInputFromClient = (client = {}) =>
  buildDisplayNameInput({
    coachLabel: client.coach_label ?? client.coachLabel ?? '',
    profile:
      client.profile ??
      normalizeUserProfileFields({
        first_name: client.first_name,
        last_name: client.last_name,
        preferred_name: client.preferred_name,
        display_name: client.display_name,
      }),
    legacyName:
      client.legacyName ??
      client.legacy_name ??
      client.athlete_display_name ??
      '',
    email: client.athlete_email ?? client.email ?? '',
  })

const resolveDisplayInput = (input = {}) => {
  if (
    typeof input === 'object' &&
    input !== null &&
    (input.athlete_email ||
      input.email ||
      input.profile ||
      input.coach_label ||
      input.coachLabel ||
      input.first_name)
  ) {
    return buildDisplayNameInputFromClient(input)
  }

  return buildDisplayNameInput(input)
}

/**
 * Coach-facing canonical display name.
 * Precedence: coach_label → preferred → display → first+last → legacy → email prefix.
 */
export const getClientDisplayName = (input = {}) => {
  const { coachLabel, profile, legacyName, email } = resolveDisplayInput(input)

  if (coachLabel) return coachLabel
  if (profile.preferred_name) return profile.preferred_name
  if (profile.display_name) return profile.display_name

  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')

  if (legacyName) return legacyName
  return emailPrefixFallback(email)
}

/** Athlete-facing display — never uses coach_label. */
export const getAthleteDisplayName = (input = {}) => {
  const { profile, legacyName, email } = resolveDisplayInput(input)

  if (profile.preferred_name) return profile.preferred_name
  if (profile.display_name) return profile.display_name

  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')

  if (legacyName) return legacyName
  return emailPrefixFallback(email)
}

export const getClientFullName = (input = {}) => {
  const { profile, legacyName, email } = resolveDisplayInput(input)

  if (profile.display_name) return profile.display_name

  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  if (parts.length) return parts.join(' ')

  if (legacyName) return legacyName
  return emailPrefixFallback(email)
}

export const getClientSecondaryLabel = (input = {}) => {
  const primary = getClientDisplayName(input)
  const full = getClientFullName(input)

  if (full && full !== primary) {
    return full
  }

  const { email } = resolveDisplayInput(input)
  return email || null
}

/** AVA / roster differentiator — profile full name, not coach label or email. */
export const getClientDisambiguationLabel = (input = {}) => {
  const { profile, legacyName, email } = resolveDisplayInput(input)
  const parts = [profile.first_name, profile.last_name].filter(Boolean)

  if (parts.length) {
    return parts.join(' ')
  }

  if (profile.display_name) {
    return profile.display_name
  }

  if (legacyName) {
    return legacyName
  }

  return getAthleteDisplayName(input) || emailPrefixFallback(email)
}

export const getClientMatchStrings = (input = {}) => {
  const { coachLabel, profile, legacyName, email } = resolveDisplayInput(input)
  const values = new Set()

  ;[
    coachLabel,
    profile.preferred_name,
    profile.display_name,
    profile.first_name,
    profile.last_name,
    getClientFullName(input),
    getAthleteDisplayName(input),
    legacyName,
  ]
    .filter(Boolean)
    .forEach((value) => values.add(normalizeWhitespace(value).toLowerCase()))

  const emailLocal = String(email ?? '').split('@')[0] ?? ''
  if (emailLocal) {
    values.add(normalizeWhitespace(emailLocal).toLowerCase())
  }

  return [...values]
}

export const enrichCoachClientRecord = (client = {}, { profile = null, coachLabel = '' } = {}) => {
  const mergedProfile =
    profile ??
    client.profile ??
    normalizeUserProfileFields({
      first_name: client.first_name,
      last_name: client.last_name,
      preferred_name: client.preferred_name,
      display_name: client.display_name,
    })

  return {
    ...client,
    coach_label: normalizeWhitespace(
      coachLabel || client.coach_label || client.coachLabel || '',
    ),
    profile: mergedProfile,
    legacyName:
      client.legacyName ??
      client.legacy_name ??
      client.athlete_display_name ??
      '',
  }
}

export const sanitizeCoachLabelDraft = (value = '') =>
  normalizeWhitespace(value)

/** @deprecated Use getClientDisplayName(client) */
export const displayClientNameFromEmail = emailPrefixFallback

/** @deprecated */
export const normalizeClientIdentity = (client = {}) =>
  normalizeUserProfileFields(client.profile ?? client)

export const sanitizeOwnProfileDraft = (draft = {}) =>
  normalizeUserProfileFields({
    first_name: draft.first_name ?? draft.firstName ?? '',
    last_name: draft.last_name ?? draft.lastName ?? '',
    preferred_name: draft.preferred_name ?? draft.preferredName ?? '',
    display_name: draft.display_name ?? draft.displayName ?? '',
  })

/** @deprecated */
export const sanitizeClientIdentityDraft = sanitizeOwnProfileDraft

/** @deprecated */
export const clientIdentityFromDraft = sanitizeOwnProfileDraft

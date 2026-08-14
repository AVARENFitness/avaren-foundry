const trim = (value) => String(value ?? '').trim()

export const resolveBusinessClientReminderLabel = (
  client = {},
  { linkedAthleteDisplayName = null } = {},
) => {
  const preferredName = trim(client.preferred_name ?? client.preferredName)
  if (preferredName) return preferredName

  const displayName = trim(client.display_name ?? client.displayName)
  if (displayName) return displayName

  const nameParts = [
    trim(client.first_name ?? client.firstName),
    trim(client.last_name ?? client.lastName),
  ].filter(Boolean)

  if (nameParts.length) return nameParts.join(' ')

  const linkedName = trim(linkedAthleteDisplayName)
  if (linkedName) return linkedName

  return 'Athlete'
}

export const isOfflineBusinessClient = (client = {}) =>
  (client.linked_user_id ?? client.linkedUserId) == null

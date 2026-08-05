const normalizeEmail = (value = '') =>
  String(value).trim().toLowerCase()

const OWNER_COACH_EMAIL =
  normalizeEmail('hello@avarenfitness.com')

export const isCoachAccount = (session) =>
  Boolean(
    OWNER_COACH_EMAIL &&
    normalizeEmail(
      session?.user?.email,
    ) === OWNER_COACH_EMAIL,
  )

export const coachOwnerEmail =
  OWNER_COACH_EMAIL

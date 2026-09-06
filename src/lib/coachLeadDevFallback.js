/**
 * Lead dev-store fallback is allowed only in local development builds.
 * Production must never silently persist leads in memory when Supabase fails.
 */
export const canUseDevLeadStore = () => import.meta.env.DEV

export const leadBackendUnavailableMessage =
  'Coach leads are not available yet. Apply AVAREN_COACH_LEADS_9_0_MIGRATION.sql to Supabase before using leads in this environment.'

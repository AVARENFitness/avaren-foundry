# Sprint 6.0C — Global Readability & Owner-Only Coach Access

## Readability
- Rebuilt the global text scale around readable phone sizes.
- Increased descriptions, helper text, metadata, captions, card titles, controls, and navigation labels.
- Increased button and input heights.
- Improved secondary-text contrast.
- Allowed Profile descriptions to wrap instead of truncating.

## Coach access
- Coach Mode is visible only for the configured owner email.
- Direct access to the Coach Hub route is blocked for every other signed-in account.
- New users receive the normal athlete application only.
- The inactive New Assignment control now clearly says Coming Next.

## Security note
The owner-email gate prevents normal UI and route access. Sprint 6.0D will add database-backed coach roles and Supabase row-level security for production-grade enforcement.

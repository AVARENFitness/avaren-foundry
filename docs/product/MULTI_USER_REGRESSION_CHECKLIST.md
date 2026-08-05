# AVAREN Multi-User Regression Checklist

Run before every release that changes storage, authentication, sync, workouts, progress, nutrition, recovery, or coaching.

- User A and User B have different Supabase user IDs.
- Workout history does not cross accounts.
- PRs and next milestones come only from the current user’s history.
- Nutrition days, saved foods, recipes, water, weight, and goals do not cross accounts.
- Readiness, movement completion, preferences, and onboarding do not cross accounts.
- Signing out clears in-memory state before another account hydrates.
- Cloud state with a mismatched owner ID is rejected.
- Backups are account-bound and cannot be imported by another user.

# Sprint 6.7.2 — User Isolation & Multi-User Foundation

## Fixed
- Removed shared strength baselines that made new users inherit another athlete’s milestone targets.
- New users must establish personal lift baselines from their own completed workouts.
- Local and cloud state now carry an explicit `ownerUserId`.
- State owned by a different account is rejected instead of hydrated.
- Backups cannot be imported into a different AVAREN account.
- Account backup, restore, and reset actions now target the signed-in user only.

## Regression checklist
1. Sign in as User A and complete a workout.
2. Log nutrition, readiness, water, and weight.
3. Sign out and sign in as User B.
4. Confirm User A’s history, milestones, nutrition, recipes, and preferences are absent.
5. Complete different activity as User B.
6. Return to User A and confirm User A’s data is restored unchanged.
7. Confirm a backup from User A cannot be imported while signed in as User B.

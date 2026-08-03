# Engineering Standards

## Release workflow

1. Define the sprint and acceptance criteria.
2. Inspect the exact current files being modified.
3. Create one self-contained AVAREN Builder update.
4. Back up every changed file outside the repository.
5. Apply the update.
6. Run a production build.
7. Roll back automatically if the build fails.
8. Test the feature locally.
9. Review GitHub Desktop changes.
10. Exclude secrets, backups, and generated files.
11. Commit with a focused summary.
12. Push and verify Vercel deployment.
13. Test production on desktop and phone.
14. Update release notes.

## Commit conventions

Use imperative, focused summaries:

- `Add adaptive recovery intelligence`
- `Fix paused mobility timer`
- `Add Journey timeline UI`
- `Release AVAREN Builder v0.1`

Avoid vague summaries:

- `Updates`
- `Fix stuff`
- `New changes`

## Git hygiene

Never commit:

- `.env`
- `.env.local`
- Secret keys
- `node_modules`
- Backup files
- Temporary installer payloads
- Generated build output unless required
- Supabase service-role keys

## Builder requirements

Every Builder update should:

- Verify the project path.
- Verify required source files.
- Create a timestamped backup.
- Install idempotently when possible.
- Avoid duplicating CSS markers.
- Run `npm run build`.
- Restore the backup on failure.
- Print release notes.
- Record installed version.

## Code standards

- Keep domain calculations in pure functions.
- Keep screens focused on composition and interaction.
- Prefer reusable components to duplicate markup.
- Avoid direct mutation.
- Use stable IDs.
- Validate external data.
- Handle missing state defensively.
- Keep mobile behavior as a first-class requirement.
- Add comments only where behavior is not self-evident.

## Testing levels

### Engine tests

Required for:

- Analytics
- Journey
- Milestones
- Recovery Intelligence
- Coach
- Forge

### Component tests

Prioritize:

- Workout controls
- Mobility timer
- Completion
- Authentication
- Data import

### End-to-end tests

Critical flows:

1. Sign up and sign in.
2. Start, resume, switch, and finish a workout.
3. Refresh during an active workout.
4. Complete Daily Reset.
5. Complete Recovery Flow.
6. Sync between two devices.
7. Delete a workout.
8. Restore a backup.
9. Sign out and sign back in.

## Definition of done

A feature is done only when:

- It meets acceptance criteria.
- Build passes.
- Mobile behavior is verified.
- Existing data is preserved.
- Cloud behavior is understood.
- Error and empty states exist.
- Release notes are updated.
- Production deployment is tested.

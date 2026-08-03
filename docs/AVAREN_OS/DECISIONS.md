# Decision Log

## ADR-001 — Local-first workouts

### Decision

Workout interactions save locally before cloud synchronization.

### Reason

Gym connectivity is unreliable. Logging a set cannot depend on the network.

## ADR-002 — Supabase accounts

### Decision

Use Supabase email/password authentication and account-scoped cloud persistence.

### Reason

This supports individual athletes, future clients, and multi-device continuity.

## ADR-003 — Equipment-free mobility by default

### Decision

Daily Reset and Recovery Flow movements require no equipment unless a future user preference explicitly enables it.

### Reason

The routines must work anywhere.

## ADR-004 — User-controlled mobility timers

### Decision

Timers start only when the user chooses. Completion never forces automatic advancement.

### Reason

Users need time to enter position and may hold movements longer.

## ADR-005 — Journey instead of simple history

### Decision

Completed workouts, PRs, mobility, streaks, and milestones belong in one chronological Journey.

### Reason

AVAREN should preserve the athlete’s story, not only store logs.

## ADR-006 — Domain engines before UI

### Decision

Analytics, Journey, milestones, Recovery Intelligence, Coach, and Forge logic should exist as reusable engines.

### Reason

This prevents product logic from becoming trapped inside individual screens.

## ADR-007 — AVAREN Builder releases

### Decision

Feature updates are shipped through self-contained Builder scripts with backups, build verification, and rollback.

### Reason

The project has outgrown fragile manual replacement workflows.

## ADR-008 — Quiet Coach

### Decision

The future Coach surfaces one or two ranked insights instead of becoming a generic chatbot.

### Reason

Trust is built through relevance and restraint.

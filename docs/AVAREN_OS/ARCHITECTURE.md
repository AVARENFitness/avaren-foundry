# Architecture

## Current application

AVAREN is a React application deployed through Vercel and connected to Supabase.

## Main layers

### Presentation

Screens and components render the user experience.

Current major screens:

- Home
- Gym Mode
- Progress
- More
- Weekly Planner
- Workout Builder
- The Journey
- Completion
- Mobility
- Authentication

### Application state

`App.jsx` currently coordinates:

- Navigation
- Workout lifecycle
- Local state
- Mobility flows
- Authentication
- Cloud hydration
- Cloud saving
- Completion and milestone state

As AVAREN grows, this coordination should gradually move into focused hooks and service modules rather than allowing `App.jsx` to become a permanent system controller.

Recommended future extractions:

- `useAuthSession`
- `useCloudSync`
- `useWorkoutSession`
- `useMobilityFlow`
- `useNavigation`
- `useCompletionCelebration`

### Domain engines

Current engines include:

- Metrics
- Analytics
- Journey
- Milestones
- Recovery Intelligence
- Cloud sync
- Storage

Future engines:

- Coach
- Forge achievements
- Notifications
- Readiness
- Programming recommendations
- Client adherence

### Persistence

#### Local storage

The app saves immediately to the device for gym reliability and workout recovery.

#### Supabase

Supabase provides:

- Email/password accounts
- Persistent sessions
- Account-scoped cloud state
- Multi-device synchronization foundation

#### Sync strategy

The intended strategy is local-first:

1. Update the local state immediately.
2. Save locally.
3. Debounce cloud writes.
4. Upload when online.
5. Resume sync after reconnecting.
6. Resolve cloud/local conflicts using timestamps and an explicit policy.

## System map

```text
User action
   ↓
Screen / Component
   ↓
App state or domain action
   ↓
Local save ──────────────→ Immediate reliability
   ↓
Cloud sync ──────────────→ Multi-device continuity
   ↓
Analytics / Journey / Milestones / Recovery
   ↓
Progress, Coach, celebrations, reports
```

## Architecture priorities

1. Protect workout data above all else.
2. Keep domain calculations pure and reusable.
3. Keep UI components focused on presentation.
4. Avoid hardcoding product logic inside screens.
5. Make migrations explicit when state schemas change.
6. Add tests around engines before adding more intelligence.
7. Keep private user data separated by authenticated user ID.

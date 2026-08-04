# Sprint 5.0A.1 — Finish Workout Crash Fix

## Fixed
Removed a conditional `useMemo` hook from GymScreen. Finishing a workout clears the active workout, and the previous hook placement caused React's hook order to change, producing a black screen.

## Preserved
- Live workout clock
- Automatic rest timer
- Rest controls
- PR indicators
- Existing completion flow

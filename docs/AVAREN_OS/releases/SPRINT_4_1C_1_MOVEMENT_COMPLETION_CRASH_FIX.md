# Sprint 4.1C.1 — Movement Completion Crash Fix

## Fixed
Moved the `isMorning` calculation before the completion-screen branch. The rebuilt completion screen previously referenced that variable before declaration, causing a black screen after finishing or skipping the final movement.

## Preserved
- Adaptive flow goals
- Recent-movement avoidance
- Morning Movement variety
- Daily Reset targeting
- Completion screen
- Movement and time totals

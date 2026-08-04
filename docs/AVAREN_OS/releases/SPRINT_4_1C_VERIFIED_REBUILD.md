# Sprint 4.1C — Adaptive Flow Composer Verified Rebuild

## Added
- Recent-flow movement avoidance using the last three completed routines
- Clear Morning Movement goals based on readiness and recent training
- Clear Daily Reset goals based on trained muscle groups
- Completion screens for Morning Movement and Daily Reset
- Movement count, estimated minutes, and trained-region summary
- Completed routines now store the movement IDs that were used

## Fixed
- Rebuilt against the exact current source export
- Completion no longer clears the flow before the completion screen renders
- Morning Movement and Daily Reset are detected separately
- Skipping the final movement follows the same safe completion path as completing it

## Note
The installer runs the production build on the user's machine and automatically restores the previous files if the build fails.

# AVAREN — The Foundry 4.0: Progress + Achievements

Sprint 4 turns workout history into a clean, optional progress experience.

## Added

- Selectable exercise strength graphs
- Estimated 1RM graph
- Heaviest-set graph
- Session-volume graph
- Exercise profiles
- Recent workout replay
- Lifetime exercise statistics
- Dynamic bench, squat, and standing-press milestones
- Recent PR timeline
- PRs displayed after finishing a workout
- Workouts, streak, lifetime sets, lifetime volume, and monthly PR totals

## Design rule

Nothing new appears inside Gym Mode. Progress information is shown only when you open Progress or finish a workout.

## Run from Downloads

```bash
cd ~/Downloads/avaren-foundry-react-progress
npm install
npm run dev
```

## Test

1. Complete a test workout.
2. Open Progress.
3. Select the exercise you logged.
4. Switch between the three graph types.
5. Review the exercise profile and PR feed.

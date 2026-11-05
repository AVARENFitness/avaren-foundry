# AVAREN OS — Cross-App UX and Interaction Audit
Date: 2026-11-04
Scope: Source-level review of Coach Hub, Coach/Athlete Calendar, Athlete Home, active workout, Nutrition, Progress, shared shells and responsive design. This is a source audit, **not** physical-device visual certification.

## Standard
The app should feel native, calm and fast. Each destination has one clear primary action, a visible path back, consistent 44px+ touch controls, no horizontal overflow, and no unnecessarily duplicated navigation. Gold signals a primary action, not general decoration. Important client/workout data must never be hidden by a merely cosmetic change.

## Findings and actions
| Priority | Surface | Evidence | Action / acceptance |
|---|---|---|---|
| P0 | Coach Today | CoachCommandCenter provides Schedule in quick actions and CoachTodaySchedule already provides Schedule plus the Calendar tab | Removed duplicate quick action in PR #133; retain contextual Schedule next to today's roster and bottom Calendar destination. |
| P0 | Coach Calendar | Primary Add opens training composer; More options menu repeated Personal training | Removed redundant menu item in PR #133. Add = training; menu = private event or screenshot import. |
| P0 | Athlete Home | Primary CTA and secondary actions can use overlapping action destinations (appointment vs view schedule) | Deduplicate by destination and cap at two distinct secondary actions in PR #133. |
| P1 | Shared Calendar | CoachSessionCalendar is ~1,400 lines; calendar-shared-polish.css ~840 lines, with stacked overrides | Consolidate into shared view primitives and a single month/date design layer. Preserve permissions and count indicators. |
| P1 | Nutrition | NutritionScreen is ~3,200 lines with 90 button elements and many states for logging/search/edit | Separate Today, Log, Meals, Insights and sheets behind clear entry points. Test camera Quick Log, homemade ingredients, portion fractions and totals before visual changes. |
| P1 | Active workout | GymScreen ~1,125 lines, with several modal states | Audit one-handed log, repeat-last-set, rest timer, unsaved set handling, set completion/finish and exit confirmation. |
| P1 | Coach appointment flows | Session detail and scheduling use different controls; the completed/elapsed session filtering has recently been corrected | Confirm create → edit → reschedule → complete → history including no pass debit; assert immediate Coach Today refresh. |
| P1 | Shared mobile UI | Athlete and Coach shells use separate layouts; CSS repeatedly overrides controls | Create coherent spacing, button size/type, focus, safe-area, iOS keyboard and sheet rules; do not disable user accessibility zoom. |
| P2 | Progress | ProgressScreen ~429 lines with nested details | Prioritize overall metrics, simplify per-lift reveal, check small-device charts and legibility. |
| P2 | AVA and Coach Today | AVA, scheduling, needs-attention and home guidance can compete for first-screen prominence | One decisive next action per screen; supporting guidance collapsible and secondary. |

## Release gates
1. Build and full Vitest suite green on **exact** PR head.
2. Booking, permissions, passes, date/time validation and food/workout persistence unchanged unless specifically tested.
3. iPhone narrow/large and iPad layouts: no overflow, clipped text, unexpected zoom, or overlapping sticky navigation.
4. Coach: Today → schedule → session → reschedule → complete → history. Athlete: Home → workout → log → finish; Nutrition image/manual logging → home totals; Calendar read-only coach appointments + editable personal events.
5. 44px touch targets, accessible labels/current-selected state, clear Save/Cancel and reduced-motion behavior.
6. Confirm Vercel production deployment READY for merged SHA.

## Status
**Implemented in current PR:** removal of duplicate Schedule action, duplicate Calendar training menu option, and athlete Home shortcut dedupe.

**Not yet certified:** actual-device visual QA, full Nutrition refactor, active-workout component refactor and complete end-to-end user flows. Do not describe the application as flawless or Apple/Google-equivalent until these checks have been performed.

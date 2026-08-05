# AVAREN Product Review Checklist

Every release must pass this checklist before commit.

## Purpose and hierarchy
- The screen has one obvious primary action.
- A new user can identify the screen's purpose within five seconds.
- Secondary actions are visually quieter than the primary action.
- Information is ordered by daily importance, not implementation convenience.

## Navigation
- Daily actions begin within two taps.
- No important destination is hidden behind more than two layers.
- Back, tab, and bottom-navigation behavior is predictable.
- The user never has to scroll to discover the primary action.

## Visual quality
- The screen has one visual hero.
- Spacing creates breathing room between concepts.
- Cards are not used when a simple row or disclosure is enough.
- Badges, warnings, and accents do not compete for attention.
- Text remains readable under bright gym lighting.

## Interaction quality
- Every tap produces immediate feedback.
- Loading, empty, success, and error states are explicit.
- Destructive actions require confirmation and explain the result.
- Touch targets are at least 40 px high.

## Product fit
- The experience works for solo and coached users where applicable.
- AI or automation reduces work rather than adding decisions.
- The feature improves progress, clarity, or daily adherence.
- The release does not duplicate an existing destination.

## Multi-user regression
- User A data never appears for User B.
- Account switching reloads the correct state immediately.
- New preferences, favorites, and history are account-scoped.

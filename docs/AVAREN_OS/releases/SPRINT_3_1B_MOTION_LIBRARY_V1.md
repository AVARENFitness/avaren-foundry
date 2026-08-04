# Sprint 3.1B — AVAREN Motion Library V1

## Added

- Central Motion Library manifest
- AVAREN Master Athlete metadata
- Standardized movement folders
- Ready / in-production / incomplete asset states
- Manifest-driven Motion Card viewer
- Asset preloading utilities
- Flow-level preloader component
- Frame and phase-label standards
- Honest fallback when authored artwork is unavailable

## Scope

The Motion Library is restricted to:

- Mobility
- Stretching
- Morning Mobility
- Daily Reset
- Recovery Flow

Strength-training exercises do not require illustration assets.

## Publishing a movement

1. Add every approved frame to `public/motion/<folder>/`.
2. Use names `frame-01.webp`, `frame-02.webp`, and so on.
3. Update `public/motion/manifest.json`.
4. Change the movement status from `in_production` to `ready`.
5. Run the app and confirm every frame loads before committing.

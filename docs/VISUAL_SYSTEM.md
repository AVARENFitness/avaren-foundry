# AVAREN Visual System (7.9.22)

Internal reference for consistent premium UI. Presentation only — never alter product truth.

## Typography roles

| Role | Class / element | Use |
|------|-----------------|-----|
| Eyebrow | `.eyebrow` | Section label — always `display: block` inside cards |
| Page title | `h1` in screen header | One per screen |
| Card title | `.coach-profile-status-card-title`, section `h2` | Local context headline |
| Body | `p`, default copy | Primary readable text |
| Supporting | `.coach-profile-status-card-meta` | Ratings, secondary facts |
| Metadata | `small`, muted spans | Dates, connection info |
| Button label | button text | Action-oriented, short |

**Rule:** Never place `.eyebrow` inline before a title without a block wrapper (`.coach-profile-status-card-copy`).

## Spacing scale

Use existing rhythm — prefer **6 / 8 / 12 / 16 / 20 / 28px** gaps.

- Eyebrow → title: **6px** (within card copy grid)
- Title → meta: **6px**
- Card → card: **12px** (status stack)
- Section → section: **20–28px**
- Floating AVA clearance: respect bottom nav + safe area

## Surfaces & cards

- Prefer **one surface per idea** — avoid card-in-card stacks
- Status cards: `.coach-profile-status-card` — subtle border, minimal fill
- Completed states: quieter border/background (`.coach-profile-status-card--review`)

## Gold usage

Gold (`.gold-button`, `.eyebrow`, active tab) for:

- **One primary action** per local context
- Active navigation selection
- Eyebrow accent

**Not** for completed/passive states. Use `.coach-secondary-button` + badge for reviewed/complete.

## Button hierarchy

| Tier | Class | When |
|------|-------|------|
| Primary | `.gold-button.machined` | Single open task (e.g. review due) |
| Secondary | `.coach-secondary-button` | View, navigate, completed-state actions |
| Tertiary | text/link buttons | Back, dismiss |
| Destructive | `.coach-delete-button` | Irreversible actions |

## Status styles

- Open review: `.coach-profile-status-badge--open` (subtle gold tint)
- Complete: `.coach-profile-status-badge--complete` (neutral, no gold fill)

## Floating Ask AVA

- Hidden on Home (`showFloatingEntry={false}`) — AVA lives in briefing
- Shown elsewhere with bottom safe-area clearance
- Must not overlap primary CTAs or bottom nav

## Coach AVA context

Role from `buildAvaRuntimeContext()` — **not** from screen location.

- Coach fallback: clients, reviews, assignments, attention
- Athlete fallback: never shown when `coachAccess` is true

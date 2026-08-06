# AVAREN Product Blueprint

This document defines AVAREN's long-term product philosophy. Every future feature, screen, and interaction must align with these principles.

For implementation details, see also `docs/AVAREN_OS/VISION.md` and `docs/AVAREN_OS/DESIGN_SYSTEM.md`.

---

## What AVAREN Is

AVAREN is a **luxury fitness product** — a premium training companion that quietly guides athletes through preparation, training, recovery, nutrition, and long-term progress.

It is not a workout logger with features bolted on. It is a calm, focused environment where every element earns its place.

**The promise:** Open AVAREN and know what your body needs today.

---

## Core Philosophy

| Principle | Meaning |
|-----------|---------|
| Luxury, not flashy | Refined dark surfaces, restrained gold, strong typography — never gimmicks |
| Calm UI | Generous spacing, minimal chrome, no visual noise |
| One primary action | Every screen has one obvious next step |
| Minimize taps | Daily actions in two taps or fewer |
| Bright-gym readable | High contrast, large type, tested under harsh lighting |
| Unified experience | Coaches and individual athletes use the exact same app |
| Remove over add | When in doubt, simplify — prefer removing UI over adding UI |
| Consistency over novelty | Match existing patterns before inventing new ones |
| Mobile-first | Phone is the primary device; desktop follows |

---

## The Foundry Identity

The Foundry represents deliberate improvement. Training is a process of being shaped over time — not a collection of isolated sessions.

AVAREN should feel:

- Focused, not noisy
- Premium, not flashy
- Intelligent, not intrusive
- Encouraging, not childish
- Coach-like, not robotic
- Flexible, not controlling

---

## Primary Users

### Individual athlete

Tracks workouts, follows adaptive movement, reviews progress, manages nutrition, and builds a training story over time.

### Coach

Assigns training, monitors adherence, understands client progress, and identifies who needs attention — **within the same app experience** as athletes. Coaching surfaces contextually; it does not fork the product into a separate interface.

### AVAREN team

Ships changes safely through AVAREN Builder and AVAREN OS, guided by this blueprint.

---

## AVA — Artificial Intelligence

AVA is AVAREN's intelligence layer. Naming and behavior are non-negotiable:

1. **Named AVA** — never "AI assistant," "bot," or generic labels in user-facing copy.
2. **Never interrupts** — no unsolicited prompts, pop-ups, badges, or auto-suggestions on screen load.
3. **Only when requested** — AVA appears through explicit user action: a dedicated entry point, search, or tap.
4. **Quiet and focused** — one useful answer at a time, not a chat flood.
5. **Never silent changes** — AVA may recommend; the athlete always confirms before a plan changes.

---

## Product Pillars

### Home

Today's focus at a glance — readiness, primary training action, and one insight. Nothing else competes for attention.

### Train

Workouts, programs, calendar, builder, and history. Gym Mode removes all distractions during active training.

### Nutrition

Food logging, macros, water, weight, recipes, and goals — integrated but not overwhelming.

### Progress

Trends, PRs, measurements, milestones, and The Journey — turning raw logs into meaningful context.

### Account

Settings, notifications, coach connection, and support — accessible but never on the primary path.

---

## What We Will Not Build

Features that violate the philosophy do not ship:

- Dashboards with competing CTAs
- Notification-driven engagement loops
- Separate coach vs. athlete app shells
- AI that speaks without being asked
- Social feeds, leaderboards, or gamification that add noise before value
- Settings screens that require configuration before first use
- Desktop-first layouts adapted down to mobile

When evaluating a proposal, ask: *Does this make AVAREN calmer or noisier?* If noisier, reject it.

---

## Feature Acceptance Criteria

A feature is complete only when:

1. It works reliably (including offline for training flows).
2. It fits existing navigation without adding permanent clutter.
3. It matches the design system and reuses design tokens.
4. It is readable on mobile in bright lighting.
5. It handles empty, error, and loading states gracefully.
6. It works for solo athletes and coached athletes.
7. It respects AVA's non-interruptive contract.
8. It passes the "would we remove something else?" test.

---

## Brand Voice

Language is calm, strong, direct, intelligent, and encouraging.

- Never overly corporate
- Never childish
- Never aggressively motivational

Examples: *"Forged."* · *"Built over time."* · *"Recovery is keeping pace."* · *"Return to the set that matters."*

---

## Relationship to Other Docs

| Document | Purpose |
|----------|---------|
| `docs/ROADMAP.md` | Sequenced feature plan |
| `docs/AVAREN_OS/VISION.md` | Foundry narrative and experience pillars |
| `docs/AVAREN_OS/DESIGN_SYSTEM.md` | Visual components and interaction rules |
| `docs/AVAREN_OS/ARCHITECTURE.md` | Technical system map |
| `docs/AVAREN_OS/ENGINEERING_STANDARDS.md` | Release workflow and code standards |
| `.cursor/rules/*.mdc` | Agent-enforced principles during development |

This blueprint is the source of truth for product decisions. When documents conflict, this file wins.

# Loxiro

> A calm, mobile-first search app. One beautiful box between you and the whole web.

**Status:** 🟡 Planning — no application code yet. See **[docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md)** for the full plan, design system, and roadmap.

## What it is

Loxiro is a **search companion PWA**: one search field, multiple engines (Google, Bing, DuckDuckGo, Brave), clean results, local history and saved pages, and a minimalist interface designed for one-handed mobile use.

It is **not** a full browser engine — that is intentionally out of scope for v0.1.

## Current decisions

| | |
|---|---|
| Platform | Mobile-first, installable PWA |
| Search | Multi-engine, switch without retyping |
| First build | Polished, clickable UI prototype with demo results |
| Backend | None — everything local to the browser |
| Stack | React + Vite + TypeScript + Tailwind + Motion + Lucide |

## Visual direction

![Loxiro concept](docs/assets/loxiro-concept.svg)

The concept board is an editable SVG stored in `docs/assets/` so the design stays version-controlled.

## Quick start

Once Phase 1 is scaffolded:

```bash
npm install
npm run dev
```

## Preview & downloads

A static preview site lives at the repo root:

- [`index.html`](index.html) — preview page with the concept board and one-click download buttons.
- [`loxiro-plan-preview.zip`](loxiro-plan-preview.zip) — plan, concept board (SVG + PNG), README, and preview page bundled for offline use.
- [`docs/assets/loxiro-concept.png`](docs/assets/loxiro-concept.png) — high-resolution concept board.

Open `index.html` through the live preview URL (served on port 8080) to view it on any device, or grab the ZIP directly.

## Docs

- [Project plan](docs/PROJECT_PLAN.md) — vision, scope, screens, design tokens, architecture, roadmap, definition of done, and open questions.
- [Concept board](docs/assets/loxiro-concept.svg) — Home screen visual north star.

---

*Name: Loxiro · Plan draft v0.1 · 2026-10-24*

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

**Permanent live preview: https://loxiro-preview.vercel.app/**

The preview page is fully self-contained — the concept board, full plan, and every download are embedded, so it works offline too.

- [`index.html`](index.html) — self-contained preview page with one-click download buttons.
- [`loxiro-plan-preview.zip`](loxiro-plan-preview.zip) — plan, concept board (SVG + PNG), and README bundled for offline use.
- [`docs/assets/loxiro-concept.png`](docs/assets/loxiro-concept.png) — high-resolution concept board.

> **Note:** the sandbox's `*.e2b.app` preview URL requires a traffic-access token and cannot be shared directly (it returns 403). Use the Vercel link above instead — it is public and permanent.

Rebuild the generated files with `python3 scripts/generate-preview.py && npm run build`.

## Docs

- [Project plan](docs/PROJECT_PLAN.md) — vision, scope, screens, design tokens, architecture, roadmap, definition of done, and open questions.
- [Concept board](docs/assets/loxiro-concept.svg) — Home screen visual north star.

---

*Name: Loxiro · Plan draft v0.1 · 2026-10-24*

# Foreside

Personal FPL decision-intelligence tool: fixture → opponent weakness → tactical zone → player matchup → probability → squad decision.

## Run

```bash
npm install
npm run sync   # pull real data → data/snapshot.json (FPL API + Understat shot locations)
npm run dev    # http://localhost:3000
npm test
```

Re-run `npm run sync` whenever you want fresh prices, news, fixtures and results; the app picks up the new snapshot without a restart. Understat match files are cached in `data/cache`, so re-syncs only fetch new matches.

## How it works

- `scripts/sync-data.ts`: fetches FPL (players, prices, ownership, availability, fixtures, per-GW stats) and Understat (team xG per match, every shot with pitch coordinates). Joins players across sources.
- `src/lib/data/fpl.ts`: turns the snapshot into team ratings (blended xG/xGA with priors), per-90 rates, start probabilities, defensive-contribution rates and 20-zone grids — where each team concedes chances and where each player shoots/creates.
- `src/lib/engine`: match simulation against FPL scoring (1,500 sims per player), zone matchup, explanations, squad analysis, transfer suggestions valued by the change in your best XI.
- Design system: **Family colours × Fey structure** — see `docs/design-system.md`. Dark mode only. ⌘K opens search.
- Signature feature: `/matchups` and `/teams/[id]` — opponent zonal weakness × player footprint (`src/lib/engine/matchups.ts`).

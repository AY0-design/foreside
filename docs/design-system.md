# Foreside design system — Family colour × Fey structure

Two references, strictly split:

- **Colour: Family** (crypto wallet, iOS). Only its palette is used. See `docs/family-design-language.md`.
- **Everything else: Fey** (fey.com, "Make better investments"): layout, structure, components, type scale, density.
  Mobbin captures: [home](https://mobbin.com/screens/35b2c386-c5d3-42a7-bcf3-d17798f8c34c),
  [portfolio](https://mobbin.com/screens/ba4a167d-2b95-49dd-b8d9-fd8ddbeb90dd),
  [analysis / markets table](https://mobbin.com/screens/e6774f81-b465-4de5-9020-eb7dfca726f5),
  [stock detail](https://mobbin.com/screens/7f8ae731-3b5f-42c7-bc83-dd04ecbd04f2).

## Colour (Family)
| Token | Light (unused) | Dark — **the only theme** | Used for |
|---|---|---|---|
| `--bg` | #FFFFFF | #000000 | page |
| `--panel` | #F4F4F5 | #1C1C1E | Fey panels |
| `--panel-strong` | #E9E9EB | #2C2C2E | hover rows, active tabs |
| `--line` | #E9E9EB | #2A2A2C | table dividers |
| `--fg` | #0B0B0C | #FFFFFF | text |
| `--muted` | #8A8A8E | #8E8E93 | labels, decimals |
| `--faint` | #BDBDC1 | #48484A | inactive, axes |
| `--blue` | #0A84FF | | your attack, player footprint, primary series |
| `--pink` | #FF4FA3 | | **opponent weakness** — the Foreside signature |
| `--green` | #1FB46A / #30D158 | | returns, gains, easy fixtures |
| `--orange` | #FF9F0A | | doubts, warnings |
| `--red` | #EB4D3D / #FF453A | | losses, hard fixtures, out |
Foreside ships in dark mode only (Family's dark "act" palette). Primary buttons are Family's white-on-black pills.

## Structure (Fey)
- Top bar: wordmark + page title left; segmented pill tabs and status ("GW6 deadline in 9d 20h") right.
- Floating dock at the bottom centre, with a separate round search button → ⌘K command palette.
- Content ≈1180px wide; a 12-column grid of large rounded panels, 20px gaps, 24px panel padding.
- **Headline pattern:** muted sentence with one bold word — "Gameweek 6 looks **attacking**".
- **Brief card:** an auto-written summary on a faint gradient glow, labelled "Foreside brief".
- **Feed cards:** chip (avatar/badge + name) on top, one-sentence body with an inline change pill, time/context right.
- **Grouped tables:** group header rows (Forwards / Midfielders…), logo + name + muted secondary, right-aligned
  tabular numbers, small tinted delta pills (radius 4), a sparkline column.
- **Detail pages:** hero number with muted decimals and a delta, a thin-line chart with range tabs, a side summary
  panel with tabs, and a stat strip split by vertical dividers.
- Charts: 1.5px lines, no fill, dashed projection after a "Today" marker.

## Fit to FPL (not component-for-component)
Fey's market sentiment → gameweek sentiment; daily recap → gameweek brief; news → zone exploits + availability;
markets table → players by position; stock detail → player and team pages; watchlist → your squad.

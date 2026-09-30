# Family — design language brief (as applied to Foreside)

Extracted from Family (iOS) screens on Mobbin: [home](https://mobbin.com/screens/3207083b-4a32-4990-bc79-a9cb7bf85bdf),
[token detail](https://mobbin.com/screens/640b5bd8-37e6-4aa6-86d6-8a96d91a8ae7), and the
[sending tokens flow](https://mobbin.com/flows/d2b72271-206c-4d4c-99e3-6f2a4cb38a71). Values are estimates from screenshots.

## Summary
Quiet, confident, consumer-grade. A white canvas with near-black type does almost all the work; colour is reserved
for small circular icons and gain/loss. Transactional moments switch to a pure-black sheet with dark grey cards and
a single white pill action. Numbers are the heroes — huge, bold, tightly tracked.

## Visual style
- Minimal, flat, iOS-native. No borders on lists, no drop shadows on content; grouping is whitespace.
- Two modes by context: **light browse** (home, token detail) and **dark act** (send, confirm, action menu).

## Layout
- Header: circular avatar + very bold title (~28px/800) left; small glyph buttons right.
- Text tabs under the header ("Tokens · Collectibles"): active near-black, inactive light grey, no underline.
- Lists are edge-to-edge rows: 40–44px circular icon, name (17/600), sub (14/grey); right-aligned value (17/600) + change (14).
- Hero numbers centred or left, 56–64px bold, sub-line grey.
- ~16/20/24px spacing rhythm; generous vertical air.

## Colour (estimates)
| Role | Light | Dark sheet |
|---|---|---|
| Background | #FFFFFF | #000000 |
| Surface / card | #F4F4F5 | #1C1C1E |
| Surface strong / active pill | #E9E9EB | #2C2C2E |
| Text | #0B0B0C | #FFFFFF |
| Muted text | #8A8A8E | #8E8E93 |
| Faint (inactive tab) | #BDBDC1 | #48484A |
| Positive | ~#1FB46A | ~#30D158 |
| Negative | ~#EB4D3D (often shown grey) | ~#FF453A |
| Icon circles | blue #0A84FF, green #30D158, pink #FF4FA3, orange #FF9F0A | same |

## Typography
- SF Pro–like grotesk (web: Inter). Titles 700–800 with tight tracking; body 400–500; numbers tabular.
- Hierarchy is weight + size, never colour.

## Components
- **Primary button**: full-width pill, black bg/white text in light; white bg/black text on dark sheets. Disabled: #3A3A3C with grey text.
- **Secondary**: grey surface pill. Paired actions split 50/50 ("Swap" / "Send").
- **Action cards** (dark): rounded ~18px #1C1C1E, coloured circle icon, bold white title, grey description, optional outlined badge ("US & EU Only").
- **Inputs**: rounded dark/grey pill with a leading label ("To"), clear (×) button.
- **Segmented timeframes**: plain labels; active = light grey circle/pill.
- **Chart**: thick near-black line, no axes or grid, end-point dot with soft halo.
- **Detail rows** (confirm): grey label left, bold value right, hairline separators, reassuring footnote above the CTA.
- **FAB**: black circle with white "+".

## Do
- Let big bold numbers lead each screen.
- Use black pill buttons; one primary action per view.
- Keep lists borderless; separate with space, not lines.
- Reserve colour for tiny circular icons and up/down deltas.
- Move irreversible actions into a dark confirm sheet with label/value rows.

## Do not
- No card borders or shadows on light surfaces.
- No coloured headings, gradients or decorative chrome.
- No dense tables without row breathing room (≥56px rows).
- No more than one accent colour per component.

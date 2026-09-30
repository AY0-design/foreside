# Visitors — design language brief (as applied to Foreside)

Source: the **live** Visitors product (visitors.now public dashboard, inspected 30 Sep 2026 — computed styles read from the page)
plus the older Mobbin capture ([screen](https://mobbin.com/screens/0038d78a-2f21-4219-90f7-5be8cecd6354)). The live product is
the reference; it is newer than the Mobbin capture.

## Summary
Calm, airy, realtime analytics. One narrow centred column (~768px) on a white page, a single full-bleed smooth line chart
that runs edge to edge, and quiet cards with list rows that double as bar charts. Colour is almost absent: one soft violet
for the primary series and actions, one pale sky for the comparison series, green/red only for deltas.

## Measured tokens
| Role | Value |
|---|---|
| Font | Open Runde (rounded Inter), 14–16px, letter-spacing ≈ -0.02em |
| Page background | #FFFFFF |
| Heading / strong text | #181925, weight 500 |
| Body text | #666666 |
| Labels / inactive tabs | #999999, weight 500, 14px |
| Primary series | #9580FF, 1.5px stroke, faint gradient fill (~20% → 0) |
| Comparison series | sky, same stroke, gradient |
| Chart gridlines | #EAEAEB |
| Primary button | #918DF6 pill, white 14px text, 32px tall |
| Bar-row / pill fill | #F0F0F0 |
| Card | white, radius 16px, shadow `0 1px 3px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.02)`, no border |
| Content width | 768px |

## Layout
- Top bar: logo + project switcher left; single pill action right. Nothing else.
- KPI strip: 4 small stats side by side — grey label with a coloured legend dot, value, tiny delta pill below.
- Full-bleed chart directly under the KPIs, time axis with dot ticks and a grey "now" pill; event markers (source icon) on a dashed vertical line.
- Cards in a 2-up grid below, 24–32px gaps. Card header: title left (16/500), text tabs right (active #181925, inactive #999).
- List rows: label on a #F0F0F0 bar whose width is the value's share; count right-aligned in #666.
- Navigation: a floating dark pill **dock** at the bottom centre with icon buttons; active icon on a lighter chip.
- Realtime: tiny bar sparkline on a dotted baseline, latest bar in violet.

## Do
- Keep one column, lots of air; let the chart breathe full width.
- Use list rows as bars instead of separate charts.
- Use violet only for the primary series, the primary button and "live" indicators.
- Keep numbers modest (16–40px, weight 500–600); hierarchy comes from space, not weight.

## Do not
- No heavy borders, dark panels or saturated fills.
- No dense multi-column dashboards; if it doesn't fit in 768px, it goes in its own card or page.
- No more than two chart series.

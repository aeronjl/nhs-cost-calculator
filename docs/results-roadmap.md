# Results page roadmap

Deepening the fiscal report (`<OutputRail>` and its tabs) along four axes: graphs,
uncertainty/counterfactuals, progressive disclosure, and discoverable delight.

The canonical results surface is `src/components/simulator/output-rail.tsx`. It is
mounted both as the simulator's right-hand rail and as the wizard's Step 5 main
content. Treat improvements here as cross-surface improvements.

## State of play

Hierarchy today: **TopZone (always-visible essentials) → action bar → Report
narrative map (6 signal cards) → detailed tabs (Trajectory · Who pays · Macro ·
Stress · Assumptions · Audit)**. Hash-deep-linking, tab persistence, MD/JSON
appendix exports, ARIA tablist, framer-motion `AnimatedNumber` on the headline.

The model output has matured fast — scoring bridge (static→dynamic→macro→GE),
five-channel macro state path, fiscal counterfactual paths with 90% pre/post-
reaction fans, fiscal-rule-fan breach probabilities, uncertainty-decomposition
layers, prior-sensitivity rows, stress lab tornado.

What works well:

- Coherent tonal convention (blue = improvement / amber = loss / red = breach)
  that holds across every panel.
- Methodology rigour as load-bearing UX — every panel ends with sources/caveats;
  honesty about modelled coverage ("8/10 lines incidence-modelled").
- Hand-rolled SVGs are tasteful — fan polygons at low opacity, gap polygons,
  rule-year guide lines, dashed reaction paths.
- `AnimatedNumber` is right-sized: log-scaled tween 150–500ms with ±15ms jitter.

Where it strains:

- Reads like a Bloomberg terminal — `text-[9px]`/`text-[10px]` everywhere
  (38 occurrences in `baseline-comparison.tsx` alone). 100×48 / 160×72 SVGs.
- Tabs and the Report Narrative Map duplicate the same six destinations.
- Charts are inert beyond SVG `<title>` hovers.
- No connecting tissue between tabs — the Macro tab's bridge is invisible from
  the Trajectory tab even though they share a year axis.
- "Progressive disclosure" today means tabs + a few `<details>`.

## Recommendations by theme

### Graphs

1. **Shared year-of-focus axis** across the multi-year fan, the PSNB/debt:GDP
   counterfactual, and the macro state sparklines. Hovering Y3 anywhere snaps a
   crosshair on every year-aware chart, the bridge updates to Y3, the TopZone
   headline shows the Y3 figure. This is the single biggest move — it converts
   six static charts into one connected instrument.
2. **Sankey scoring bridge** to replace the row-by-row waterfall in
   `MacroBridgeChart` (`macro-tier-breakdown.tsx:168-309`). Iconic fiscal-scoring
   picture: `static yield → behavioural drag → demand effect → CPI/gilt feedback
   → GE year 1`, widths proportional, blue/amber tones.
3. **Stacked-area trajectory**: break the multi-year central line into per-lever
   contributions stacked beneath. Reveals which lever dominates which year.
4. **Probability-of-breach gauge**: half-circle dial animating from 0 to
   `fiscalRuleFan.breachProbability`, with a small contribution-decomposition bar
   underneath (parameter / behavioural / macro / reaction layers).
5. **Decile chart, by lever**: stack each decile bar by lever contribution. "The
   basic-rate cut accounts for 80% of the D1 hit; the corp-tax raise accounts for
   90% of the D10 hit." Data already in `evaluateScenarioDistribution`.
6. **Stop apologising on the size budget**: a "headline chart" slot per tab at
   ~280–360px tall, smaller multiples below.

### Uncertainty and counterfactuals

7. **Make the fan interrogable**: hovering a year on the multi-year fan pulls a
   floating callout — central, 90% CI, P(below zero) at that point.
8. **Show *why* the band is wide**: per-lever variance contribution stack under
   the fan ("CGT 40% · IT basic 25% · borrowing rate 20% · everything else 15%").
   `evaluateScenarioBand` already samples per-lever; the decomposition is free.
9. **Counterfactual diff overlay**: morph baseline ↔ scenario on a toggle; show a
   "ghost" of the previous projection when adding a lever, settling into the new
   one.
10. **"Compare to" overlay**: pick a historical or template scenario; overlay its
    PSNB path on the user's in a desaturated colour. Pulls `ANNOTATED_BUDGETS`
    work into the report.
11. **Rule-relaxation knob**: small "what if the rule was…" control that shifts
    the target year ±2 / changes the buffer; headroom shading recomputes. Model
    already supports this.
12. **Surface the 5–95 band on the headline £**: TopZone shows a single £ today;
    add the 90% band as a width-indicator and inline range.

### Progressive disclosure

13. **Mode toggle on the action bar: Headline / Analyst / Researcher**. Same
    data, three depths. Persist in localStorage.
14. **Collapse the redundancy** between the Report Narrative Map and the tab
    pills — one nav, not two.
15. **Drill from a number, not from a tab**: TopZone's "−£3.2bn after behavioural
    response" should be a button that scrolls + highlights the macro scoring
    bridge.
16. **Per-line waterfall in `HouseholdImpactPanel`**: convert the inline expanded
    list to a small horizontal bar (positive vs negative, sorted by magnitude).

### Discoverable delight

17. **Year-scrubber on the trajectory chart** (drag to scrub; the headline £ and
    bridge update live).
18. **Scenario signature** — small radar/polar with 4–6 axes (progressive ↔
    regressive, tax-led ↔ spend-led, immediate ↔ deferred, hawk ↔ dove). Becomes
    a fingerprint, shareable as an OG card.
19. **One-line plain-English narrative** above the TopZone, synthesised from
    existing model output. Killer feature for casual users and journalists.
20. **Path morphing** when a lever is added: the multi-year fan and decile bars
    interpolate to the new state rather than snapping. Framer Motion's path/
    height interpolation on the existing SVGs.
21. **Cursor crosshair with secondary readout** replacing SVG `<title>` tooltips
    on chart-heavy panels.
22. **Shareable chart screenshots** — a "Copy chart" button per chart producing a
    PNG with title, scenario label, asOf, and share URL footer.

### Smaller items noticed in passing

- `output-rail.tsx:88-93` doc comment says "5 detailed tabs"; `SECTION_NAV` has 6.
- `ReportSignalCard` "intensity" bars need either a meaningful scale or removal —
  cross-card intensities aren't comparable today.
- `who-pays-overview.tsx` "Hardest hit" / "Largest gain" pair should link to the
  household table below.
- `multi-year-projection.tsx` and `scenario-assumptions.tsx` have similar trust-
  building footers that could share a `<MethodologyFooter>` primitive.
- The MD/JSON/Audit buttons are heavy for casual users; consider an "Export"
  menu when in Headline mode.

## Sequencing

| # | Item                                                | Size  | Unblocks            |
|---|-----------------------------------------------------|-------|---------------------|
| 1 | Shared year-of-focus state + crosshair              | 1–2d  | #4, #7, much of #20 |
| 2 | Per-lever stacked-area on multi-year + decile chart | 2–3d  | richer storytelling |
| 3 | Headline / Analyst / Researcher mode                | 1d    | clarifies tension   |
| 4 | Probability-of-breach gauge + uncertainty bar       | 2d    | visceral risk story |
| 5 | One-line plain-English narrative                    | 1d    | OG cards, casual UX |
| 6 | Sankey scoring bridge + path morphing               | 3–4d  | macro storytelling  |
| 7 | "Compare to" historical scenario overlay            | 2d    | relational scenarios|

Everything beyond #7 (year-scrubber, scenario signature radar, shareable
screenshots) is optional polish that compounds with the above.

# Roadmap: Research-grade extensions

The calculator now sits at "serious-economist-tier public tool" after Items
1–5 (distributional / backtest / dynamic scoring / OBR baseline / household
microsim). The remaining gaps are research-grade additions that, done right,
would push the tool from "rigorous public model" to "actively useful to
practitioners."

This file is the long-haul plan. Items are ordered by dependency + value;
work proceeds top-down. Each item has scope, motivation, sub-tasks, sources,
and a definition of done. We don't start an item until we can reasonably
finish it well — partial implementations damage credibility.

Status legend: ☐ pending · ◐ in progress · ✅ complete · ⏭ deferred

---

## Item 6 · Live OBR baseline updates

**Status:** ✅ complete
**Effort estimate:** 2–4 days
**Why first:** Foundational. A stale baseline corrupts everything that
depends on it (PSNB shift, fiscal-rule margin, year-5 framing). Tractable —
this is "fetch + parse + cache" work in the same `Source<T>` pattern we
already use for FX, World Bank, BLS, OECD. Demonstrates ongoing rigor as a
deployment story: every time OBR publishes a new EFO, the simulator updates
within 24h.

### Scope
- Build a live data source that fetches the latest OBR EFO supplementary
  data and reconciles it to our `OBRBaseline` shape.
- Twice-yearly OBR EFO publications drive automatic baseline refresh.
- Fall back to the embedded static baseline on any failure (consistent with
  every other live source in the codebase).

### Sub-tasks
1. Identify the canonical OBR data endpoint(s). Candidates:
   - OBR Public Finances Databank (xlsx / csv)
   - EFO supplementary fiscal tables (xlsx, sheet-coded)
   - obr.uk/data/ index page (HTML — would need scraping)
2. Build `src/data/sources/obr-efo.ts` following `Source<T>` contract.
   Single-responsibility: fetch + parse + return `OBRBaseline` or null.
3. Add `loadResolvedBaseline()` server-side resolver in
   `src/data/baseline/obr-baseline.ts` — pattern matches
   `loadResolvedSlices()` / `loadResolvedComparisons()`.
4. Wire `loadResolvedBaseline()` into `page.tsx` (server component) and
   thread the live baseline through `SimulatorWorkspace` → `OutputRail` →
   `<BaselineComparisonPanel>` as a prop.
5. Update the panel's `asOf` + source label to show whichever EFO is live.
6. Tests: happy path + missing-rows + malformed shapes + network failure.
7. Document the endpoint + cadence + freshness expectations in CLAUDE.md.

### Sources
- OBR data archive: https://obr.uk/data/
- Public Finances Databank (xlsx, monthly): https://obr.uk/data/?type%5B%5D=public-finances-databank
- EFO supplementary fiscal tables: published with each EFO

### Definition of done
- A new EFO publication propagates to the simulator within 24h without code
  changes (only data-fetch cache rotation).
- Static fallback continues to work cleanly if the live source fails.
- Provenance badge in the baseline panel reflects live vs static.
- One end-to-end test asserts that a fresh load reads either live data or
  the static fallback — never crashes, never serves stale > 24h.

---

## Item 7 · Backtest expansion (pre-2010 + more outturn)

**Status:** ✅ complete
**Effort estimate:** 1–3 days
**Why second:** Easy data work that compounds the existing credibility
section. Editorial selection bias is a current weakness (5 documented
budgets, all post-2010); doubling the corpus + reaching back to the Brown /
Blair / Lawson era widens the empirical anchor base without adding
infrastructure complexity.

### Scope
- Add `realised` outcome data for 5+ more historical budgets where outturn
  is well-documented.
- Reach back to pre-2010 era: at least Brown 2008-09 (financial crisis),
  Lawson 1988 (top rate to 40%), Howe 1981 (austerity foundation).
- Update the BacktestSection summary stat as more entries land.

### Sub-tasks
1. Author 4–6 new pre-2010 `AnnotatedBudget` entries with full scenarios.
2. Backfill `realised` outcomes for as many existing entries as practical.
3. Cross-check each `realised` figure against multiple sources (HMRC outturn
   + OBR FER + IFS retrospective).
4. Methodology coverage CI test passes.

### Sources
- OBR Forecast Evaluation Reports (annual, all years post-2010)
- Treasury Public Finances historical archive
- IFS Green Budget archives
- Hansard for budget speeches pre-2000

### Definition of done
- Backtest section shows ≥ 10 budgets with realised data spanning 30+ years.
- Selection-bias caveat updated to reflect broader corpus.

---

## Item 8 · Bayesian uncertainty / fan charts

**Status:** ✅ complete (first pass — independent normal per lever, parameter uncertainty only)
**Effort estimate:** 5–10 days
**Why third:** With a richer empirical base (Item 7), uncertainty
quantification becomes meaningful. Fan charts on every projection (multi-
year net, baseline-relative PSNB, household impact ranges) replace the
current single-line "central estimate" framing — closer to how OBR / BoE
publish forecasts.

### Scope
- Each lever's static figure becomes a distribution: central estimate +
  range (we already have `methodology.range` for some). Sample from the
  distribution to produce confidence bands.
- Multi-year projection becomes a fan chart: 5/25/50/75/95 percentiles
  rather than a single line.
- Baseline-relative PSNB shows a band, not a point.
- Backtest comparison gains "did the realised value fall within OBR's stated
  band?" check.

### Sub-tasks
1. Decide a uncertainty model: independent per-lever distributions vs joint
   covariance? Start with independent (cheap, defensible).
2. Add `distribution?: { mean, sd } | { low, high }` to TaxLever where the
   methodology already names a range.
3. Build a Monte Carlo sampler in `src/lib/uncertainty.ts` (1000 draws by
   default; faster web-worker version for >5000).
4. Replace single-line projection rendering with fan-chart svg component
   (P5/P25/P50/P75/P95 bands).
5. Update output rail to surface the band: "Year 5 net: £20bn (90% CI:
   £15bn–£28bn)".
6. Backtest UI: compare realised to the original CI band rather than central
   point.

### Sources
- OBR EFO methodology (uncertainty bounds discussion)
- IFS Green Budget Chapter 1 typically discusses uncertainty
- HMRC TIE central + bounds estimates

### Definition of done
- Every projection in the simulator shows a band, not a line.
- Backtest figures show the original CI band alongside realised vs central.
- 50+ unit tests cover sampling correctness, percentile math, fan chart
  rendering edge cases (zero variance, large variance, negative central).

---

## Item 9 · FRS microdata-driven microsimulation

**Status:** ✅ complete (synthetic 1000-household, marginal-impact). FRS microdata + full-system recompute remain as future depth.
**Effort estimate:** 2–4 weeks
**Why fourth:** The single biggest credibility lift remaining. Replaces the
9-archetype household table with a weighted simulation across ~20k actual UK
households (Family Resources Survey). At this depth, the calculator
becomes functionally equivalent to TAXBEN / OpenFisca-UK for distributional
analysis.

### Scope
- Integrate Family Resources Survey microdata (or PolicyEngine-UK / OpenFisca-UK
  as a starting layer).
- Tax-benefit code that computes net household income under arbitrary
  parameter changes.
- Per-scenario distributional outputs at the granularity of full FRS.

### Sub-tasks
1. Decide microdata source. Options:
   - **Direct FRS** via UK Data Service registration. Most accurate but
     restricted access; not redistributable.
   - **OpenFisca-UK** (open source, reasonable proxy). Simulates UK system;
     ships with synthetic micro-population.
   - **PolicyEngine-UK** (offshoot of OpenFisca, web-API'd). Could integrate
     as a service.
2. Decide architecture:
   - Run microsim in Node at request time? Slow (1000ms+ for 20k households).
   - Pre-compute scenario-class outputs and serve from cache?
   - Web Worker for the heavy lifting client-side?
3. Build `src/lib/microsim.ts` that wraps whichever engine is chosen.
4. Replace `<HouseholdImpactPanel>` with `<MicrosimulationPanel>` showing:
   - Decile-by-decile mean impact
   - Percentile spreads within each decile
   - Demographic cross-cuts (by household type, region, employment status)
5. Keep the 9-archetype panel as "headline" view; microsim sits behind a
   "Show full distributional analysis" expand.
6. Tests asserting equivalence to OpenFisca's published reference figures
   for at least 3 standard policies.

### Sources
- UK Data Service FRS access:
  https://www.ukdataservice.ac.uk/find-data/major-studies/frs.aspx
- OpenFisca-UK: https://github.com/openfisca/openfisca-uk
- PolicyEngine-UK: https://policyengine.org/uk

### Definition of done
- Per-scenario distributional output reaches at least 1000-household
  granularity.
- Outputs reproduce OpenFisca-UK reference figures within 5% for IT/NICs/UC
  scenarios.
- The 9-archetype panel still works (legacy UX path) but the microsim panel
  is the primary distributional output.

---

## Item 10 · Macro feedback loops

**Status (Scope A):** ✅ complete (per-lever multipliers, per-line + per-scenario evaluation, "second round" UI alongside static + dynamic)
**Status (Scope B):** ✅ complete (multi-year multiplier paths, CPI passthrough, gilt yield response, per-year MacroState UI)
**Status (Scope C):** ✅ complete (single-pass GE feedback: CPI→freeze drag, CPI→indexed spending, gilt→borrow servicing; "third round" UI tier; iterative GE deferred to future round)
**Effort estimate:** Scope A 2–3 days; Scope B 2–4 weeks; Scope C 4–8 weeks.
**Why last:** Most complex. Fiscal moves affect GDP, which affects the tax
base, which affects yield, which affects PSNB, which affects gilt yields.
Modelling this loop credibly is what makes the difference between IGOTM /
OBR's full models and a static calculator. Building a UK macro model from
scratch is research-grade work; we'd realistically integrate something
existing.

### Scope
- Multiplier effects: a £10bn tax cut boosts demand by ~£10bn × multiplier
  → boosts GDP → tax base grows → revenue partially offsets the cut.
- Endogenous gilt yields: large debt issuance pushes yields up; small
  shifts barely register.
- Endogenous CPI: tax rises (especially VAT) feed into inflation, with
  knock-on effects on indexed spending and revenues.
- Bank of England reaction: monetary policy responds to fiscal stance
  (contested, but worth modelling for completeness).

### Sub-tasks
1. Decide between:
   - Build a small DSGE / VAR model in JS/Python.
   - Integrate an existing tool (NIESR's NiGEM? Bank's MAPS? OBR's published
     elasticities?).
   - Lightweight: just multipliers (Y / G, Y / T) per OBR's published
     estimates, no full GE.
2. Lightweight option (simplest credible): use OBR's published multipliers
   as a per-lever scaling factor on year 1 GDP, propagate through.
3. Show "first-round" vs "second-round" effects in the UI: announced
   £10bn → first-round £8bn (after dynamic) → second-round £8.4bn (after
   GDP feedback).
4. Backtest the model: run historical scenarios with feedback on, compare
   to OBR scoring.

### Sources
- OBR multiplier estimates (in EFO supplementary documents)
- IFS Green Budget macro chapters
- HMT TIE estimates with macro feedback included
- NIESR NiGEM (closed source but published estimates available)

### Definition of done
- Every revenue-side or spending-side line shows static / dynamic / dynamic
  + macro yields.
- Backtest reproduces OBR's macro-feedback-included scoring within 15% on
  3+ historical budgets.

---

## Smaller polish items (interleave as opportunities arise)

- ☐ **Regional / devolved-finance breakouts** — Scotland, Wales, NI Barnett
  consequentials; council tax + business rates. Adds geographic UI dimension.
- ☐ **Dynamic OBR data refresh on `/reference`** — backtest section shows
  "as-of" stamps from the live OBR FER feed.
- ☐ **Methodology DOI / citation generator** — every output rail
  state can be cited as `NHSCostCalculator(scenario_id, version_hash)` with
  reproducible URL.
- ☐ **Scenario provenance tracking** — when a scenario is loaded from
  Templates, preserve "based on Reeves Autumn 2024" in the URL state for
  share-link readability.
- ☐ **Export-to-CSV for scenario evaluation** — the scenario's per-line
  result + distributional + household data as a downloadable spreadsheet,
  for journalists / analysts.

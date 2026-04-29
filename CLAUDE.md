# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Next.js dev server (Turbopack) at http://localhost:3000
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — `next lint`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run the Vitest suite once
- `npm run test:watch` — Vitest in watch mode
- `npm run ci` — full local gate: typecheck + tests + build. Run before pushing.

Single-test invocation: `npx vitest run path/to/file.test.ts -t "test name"`.

There is no GitHub Actions / hosted CI by design — the gate is `npm run ci`.

Stack: React 19 (stable), Next 15 (stable), TypeScript 5, Tailwind 3, Vitest 4. Node ≥20 is enforced via `engines` in `package.json`. `npm install` runs unconstrained — no `--legacy-peer-deps`, no `force`. If a future dep introduces a real peer-dep conflict, fix it at the source rather than re-enabling the bypass.

## Architecture

Next.js 15 App Router site. The homepage (`src/app/page.tsx`) is a **fiscal simulator workspace** — a three-pane layout that reads as a single environment for building and exploring scenarios, not a stack of related calculators.

The homepage server component loads live data (FX, dynamic comparison costs) and renders `<SimulatorWorkspace>` (`src/app/SimulatorWorkspace.tsx`), which composes:

- **Workspace shell** (`src/components/simulator/workspace-shell.tsx`) — three-pane layout. Widescreen (lg+): sticky lever rail (260px) | flexible editor | sticky output rail (340px). Tablet/mobile: rail collapses to "+ Add lever" trigger above the editor; output becomes a draggable bottom sheet.
- **Header** (`src/components/simulator/header.tsx`) — brand mark + Templates drawer trigger + Reference link.
- **Lever rail** (`src/components/simulator/lever-rail.tsx`) — categorised, search-enabled list of all 25+ tax levers, 10 spending programmes, and borrowing. Click a lever to add a new line to the active scenario (auto-switches to stack mode). Levers are also `draggable` (HTML5 native) — drop them anywhere in the editor area via `<LeverDropZone>` for a delight affordance on desktop; click remains the touch path.
- **Editor** — three modes against the same scenario state, switched via `EditorTabs`:
  - **Triptych** (`TradeOffEngine.tsx`) — three sliders (tax/borrow/cut) summing to a funding target.
  - **Stack** (`ScenarioBuilder.tsx`) — free-form list of scenario lines; the canonical view.
  - **Vary one** (`CounterfactualPanel.tsx`) — single-lever slider with comparisons.
- **Output rail** (`src/components/simulator/output-rail.tsx`) — progressive-disclosure layout. Top zone (always visible, ~6 lines) renders `<TopZone>`: net effect + dynamic pill, top-3 comparisons, 1-line distributional headline (bottom + top decile per household), 1-line household microsim headline (winners/losers/unaffected %). Below the top zone: 4 `<CollapsibleSection>`s, all closed by default with state persisted in localStorage (`simulator-rail-sections`). Sections: **Trajectory** (multi-year + OBR baseline), **Who pays** (distributional + microsim + 9 archetypes + full comparisons list), **Macro feedback** (`<MacroTierBreakdown>` showing static→dynamic→macro→GE tiers + 90% confidence band + macro state path), **Assumptions** (per-line caveats + full methodology popovers). "Expand all / Collapse all" toggle in the rail header for power users. Mobile and desktop share the structure; mobile renders inside the bottom-sheet pattern.
- **Templates drawer** (`src/components/simulator/templates-drawer.tsx`) — slide-in panel with the 16 annotated UK budgets. Search input + party filter chips. Loading a budget over a non-empty scenario opens `<ScenarioDiffModal>` for confirm/cancel. Drawer state persists in URL via `?drawer=templates` so a "browse the catalog" share link lands with the drawer open.
- **Scenario diff** (`src/components/simulator/scenario-diff-modal.tsx`) — modal showing four colour-coded sections (added/modified/removed/unchanged) when loading a budget over an existing scenario, or when comparing a saved scenario from the ScenarioBuilder chip row. Reuses `diffScenarios()` from `src/lib/scenario.ts`.

The three editors share scenario state via the unified URL namespace (`?scenario=…&editor=…`); switching tabs re-mounts the editor against the same data without losing user work.

**Three top-level routes**: `/wizard` is the guided "Chancellor's office" experience; `/` is the free-form simulator; `/reference` (`src/app/reference/page.tsx`) is the secondary view that hosts NHSSpendingCalculator + PersonalTaxBurden + InternationalPanel + `<BacktestSection>` (forecast-vs-reality across historical UK budgets). Calculator URL state (`?id=…&q=…&a=…&slice=…`) lives on `/reference`. Legacy `/?id=…` links 307-redirect to `/reference?id=…` via `redirect()` in `page.tsx`'s default export — old share-links keep working. Header on `/reference` swaps the Templates/Reference actions for a single "← Simulator" back link.

### Household-level impact (pseudo-microsimulation)

`src/data/households.ts` defines 9 representative UK household archetypes spanning the income distribution: single pensioner, pensioner couple, single parent on UC, near-MW earner, single basic-rate, dual-earner family, single higher-rate, dual-earner with one higher-rate, top-decile household. Each carries gross income breakdown (earned, pension, dividend, benefits), VAT-able spend, composition, decile, and approximate net income. Sources: ASHE 2024 (earnings), state pension rates 2024-25, ONS Family Spending 2023 (consumption shares).

`src/lib/household-impact.ts`'s `evaluateHouseholdImpact(household, scenarioResult)` computes £/yr impact + per-line breakdown. Two-tier methodology mirroring IFS / Resolution Foundation distributional tables:
- **Direct calculation** (`method: "direct"`) for IT bands (basic/higher/additional), employee + employer NICs, VAT, dividend tax, threshold raises (PA), state pension, working-age welfare. Uses each household's actual income exposure to that lever.
- **Decile fallback** (`method: "decile"`) for public-good levers without a household-direct channel (NHS, defence). Allocates £ across deciles via the lever's incidence vector, divides by ~2.8M households per decile.

Limitations honestly documented in the UI: no UC taper interaction, no high-income child benefit charge thresholds, no within-decile heterogeneity, no behavioural response at the household level. A full FRS-microdata simulation (TAXBEN, OpenFisca-UK) would close these gaps but requires restricted microdata access.

`<HouseholdImpactPanel>` renders a compact table per archetype with £/yr + % of net income + click-to-expand per-line breakdown showing which channel was used (direct/decile). Sits in the output rail between distributional analysis and per-line assumptions.

### OBR baseline integration

`src/data/baseline/obr-baseline.ts` carries the OBR Economic and Fiscal Outlook (EFO) baseline forecast — year-by-year PSNB, PSND, debt:GDP, total revenue/spending, GDP, plus the in-force fiscal-rule headroom. Currently anchored to **March 2025 EFO** (6-year horizon, 2024-25 → 2029-30).

**Live override**: `src/data/sources/obr-efo.ts` defines `obrEfoSource` (env-gated `Source<BaselineOverride | null>`), and `loadResolvedBaseline()` overlays the live override onto the static fallback. Set `OBR_BASELINE_DATA_URL` to a JSON document matching the `BaselineOverride` shape — same pattern as `NHS_BUDGET_DATA_URL`. Cached 24h. The simulator picks up the new EFO automatically once the JSON is updated. Sample at `public/data/obr-baseline.json`. 11 unit tests covering happy path, malformed shapes, missing fiscal-rule fields, and network failures.

`src/lib/baseline-projection.ts`'s `projectAgainstBaseline(projection)` overlays a scenario's multi-year projection on the baseline path: subtracts scenario.net from baseline.psnb each year to get adjusted PSNB; adjusts the stability-rule headroom by scenario impact at the rule horizon. The output rail's `<BaselineComparisonPanel>` shows: year-N PSNB shift (£bn + % of GDP), stability-rule margin (broken / unchanged / improved), and an expandable year-by-year path. Baseline asOf + source link surfaced in the panel for honesty about staleness.

### Macro feedback (Scope A + B + C — multiplier, multi-year, CPI/gilt, single-pass GE)

`src/lib/macro.ts` provides `FiscalMultiplier`, `TAX_TO_GDP_RATIO` (0.38 per OBR Mar 2025 EFO), and core helpers (`secondRoundDelta`, `multiplierAtYear`, `macroFeedback`).

**Scope A** (`secondRoundDelta(firstRound, multiplier)`): `firstRound × (1 - multiplier × TAX_TO_GDP_RATIO)` for first-round demand-side feedback. Per-lever multipliers in `TAX_MULTIPLIERS` and `PROGRAMME_MULTIPLIERS`. ~25 tax + 10 programme calibrations from OBR/IFS. Range: 0.1 (CGT, IHT) → 0.9 (working-age welfare). International aid = 0 (offshore leakage).

**Scope B**: multi-year impulse paths + endogenous CPI + gilt yields.
- **Multi-year multiplier paths** — each `FiscalMultiplier` carries a `pathShape` (`fade`, `hump`, `investment`, `spike`, `transfer`, `flat`) defining year-1..5 multiplier evolution. `multiplierAtYear(m, year)` returns the year-N value. `projectScenarioOverYears` applies year-N macro feedback per line, so projections account for the impulse fading or peaking later.
- **CPI passthrough** — `cpiPassthrough` field on FiscalMultiplier. VAT highest (0.85), fuel duty 0.55, EPL 0.25, others 0. Computes year-by-year CPI deviation from VAT/fuel/EPL changes.
- **Gilt yield response** — debt:GDP shifts → gilt yields via `GILT_YIELD_PER_DEBT_GDP_PP` (5bp per 1pp debt:GDP, OBR fiscal-risk analysis).

`evaluateScenarioMacroPath(result, years)` returns `MacroState[]` per year: CPI deviation (pp), GDP deviation (% of GDP), debt:GDP deviation (pp), gilt yield deviation (pp). Cumulative PSNB shifts accumulate into debt:GDP; gilt yields respond linearly. The `<MacroStatePanel>` in the output rail surfaces this as a year-by-year table.

**Scope C** (`projectScenarioWithGEFeedback(result, years)`): closes the loop with single-pass GE feedback. Returns `{ noFeedback, withFeedback, macroPath }`. Three feedback channels:
- **CPI → frozen-threshold drag amplification** (`FREEZE_DRAG_AMPLIFICATION_PER_CPI_PP` = 0.05): freeze yields amplify with positive CPI deviation as more earners cross thresholds.
- **CPI → indexed spending** (state pension via triple lock, `TRIPLE_LOCK_AMPLIFICATION_PER_CPI_PP` = 0.01): pension cost rises with CPI.
- **Gilt yield deviation → borrow servicing**: borrow lines accumulate at year-N (baseline + scenario-deviation) gilt yield, replacing the fixed 4.5% used in Scope A+B.

Single-pass — no iteration to convergence. Documented as such; the feedback effects are typically small enough at policy-realistic magnitudes that single-pass captures most of the GE story without iterative-solver complexity.

The output rail's net summary now shows up to four tiers: **Static → Dynamic (behavioural) → Macro-adjusted (Scope A) → GE-adjusted (Scope C)**, each surfaced when the gap from the previous tier exceeds a small threshold. The multi-year projection's central line is the Scope C with-feedback path.

Sign conventions:
- Revenue raise → fiscal contraction → GDP falls → revenue feedback negative (offsets the raise).
- VAT/fuel raise → CPI up → frozen-threshold revenue amplifies + indexed-spending cost rises.
- Debt-reducing scenario → debt:GDP down → gilt yields fall → borrow servicing cheaper.

### Microsimulation (synthetic 1000-household population)

`src/lib/microsim/` builds on the 9-archetype household-impact pattern with a synthetic 1000-household UK population.

- `population.ts` — generates households from realistic distributions (ASHE 2024 earnings via log-normal, ONS family composition, DWP UC + child benefit eligibility rules). Deterministic per seed (Mulberry32). Each household carries a `weight` so the population represents ~28M UK households when aggregated.
- `tax-benefit.ts` — full-system net-income calculator: IT + NICs (FY24/25 from `tax.ts`), Universal Credit (£4,725 standard / £7,412 couple, child elements, work allowance, 55% taper), child benefit + HICBC clawback, dividend tax (allowance + 8.75/33.75/39.35% bands).
- `impact.ts` — per-scenario microsim: applies each scenario line to every household via the same direct/decile-fallback methodology as `household-impact.ts`. Aggregates to per-decile mean + p10/p50/p90 (within-decile spread), demographic cross-cuts by household type, winners/losers/unaffected percentages.

`<MicrosimulationPanel>` in the output rail surfaces:
- "Winners + losers" headline bar (% of households gaining vs losing, blue/grey/amber)
- Per-decile mean + within-decile p10/p90 spread bar chart
- By-household-type table sorted by mean impact (single parent, pensioner, dual-earner, etc.)

Limitations honestly documented in the UI: synthetic (not FRS microdata), no regional variation, no asset-wealth modelling for CGT, marginal-impact (not full-system recompute) for taper interactions. The microsim adds within-decile heterogeneity the 9-archetype catalog can't capture; the archetype panel still serves as the "named cases" view.

### Bayesian uncertainty (fan charts)

`src/lib/uncertainty.ts` provides Monte Carlo primitives: `seededRng` (Mulberry32 deterministic PRNG), `sampleNormal` (Box-Muller), `percentile` (linear-interpolation rank), `computeBand` (5/25/50/75/95), and `distributionFromRange` (maps `methodology.range` to mean+sd assuming the range is a 95% CI).

`evaluateScenarioBand(result, samples=1000, seed=42)` samples 1000 draws of the scenario's net £, returning a `PercentileBand & {central}`. Per-pp tax levers contribute uncertainty (mean = `gbpPerUnit`, sd from `methodology.range` or 10% fallback); programmes, borrow, and non-pp tax levers stay deterministic. The output rail surfaces "90% CI: £X — £Y" and "50% CI" beneath the static + dynamic net summary when band width exceeds 5% of central.

`projectScenarioBandsByYear(result, years, assumptions, samples, seed)` does the same sampling per year — each draw samples lever yields once and projects them through the full horizon (matching how OBR fan charts model parameter uncertainty rather than stochastic shocks). The MultiYearProjection sparkline renders the 90% (lighter) and 50% (darker) bands as nested polygons behind the central line.

### Behavioural elasticities + multi-year projection

`src/lib/elasticity.ts` defines `Elasticity` (`coefficient`, `note`, `source`). Tax levers carry an optional `elasticity?: Elasticity` field — populated for the 12 rate-style levers most relevant to OBR-style dynamic scoring. The coefficient represents fractional yield haircut per absolute unit of magnitude (e.g. 0.10 on CGT means a +4pp move loses 40% of static yield). `dynamicAdjust(static, elasticity, magnitude)` applies the linear haircut, capped at 95% to prevent sign-flip at extreme magnitudes.

`evaluateLineDynamic(eval)` and `evaluateScenarioDynamic(result)` compute behavioural-adjusted yields. The output rail shows "static net | dynamic net" when the gap exceeds 5%, and per-line dynamic adjustments appear in the assumptions section when the per-lever haircut > 5%.

`projectScenarioOverYears(result, n=5)` projects net £ over a horizon. Rate-style tax + spend lines scale with nominal growth (default 4%); freeze levers ramp to year-N and plateau (their `gbpPerUnit` is already a year-N figure); borrow lines accumulate interest cost (default 4.5% gilt yield × principal × years). The simulator output rail shows a 5-year sparkline + year-1/year-5 net values. Calibration sources: HMRC ready-reckoner (statics), OBR EFOs (dynamic figures + nominal growth assumptions), DMO (gilt yields).

### Wizard (Chancellor's office)

`/wizard` is a guided 6-step walk-through that builds a fiscal scenario through narrative choice rather than free-form lever manipulation. Ends in a hand-off to the simulator with the built scenario pre-loaded.

**Step structure** (`src/components/wizard/steps.tsx`):
1. **Briefing** — current UK fiscal position (PSNB, debt:GDP, year-5 forecast, fiscal-rule margin, key pressures)
2. **Goal** — pick fiscal direction (reduce borrowing / fund NHS / fund defence / cut taxes / hold steady / free-play). Sets up an initial fiscal demand for the HUD's progress bar.
3. **Taxes** — curated cards across income/consumption/asset/sectoral/threshold-freeze + hypothetical (greyed-out, requires-new-legislation) cards
4. **Spending** — increase / cut / statutorily-protected groups
5. **Borrow** — plug residual gap or repay
6. **Result** — hand-off to simulator with the built scenario

**Chancellor HUD** (`src/components/wizard/chancellor-hud.tsx`) — sticky panel showing live impact: net effect, year-N PSNB shift, fiscal-rule margin, distributional one-liner, microsim winners/losers, choice basket. Updates in real time on hover (preview) and click (commit). Compact mobile variant for sticky-banner use.

**Hard forking with WHY** — every choice card carries a `LegislativeMeta` from `src/data/legislation.ts`: status (`available`, `devolved`, `new-legislation`, `statutorily-protected`), badge label, 1-2 sentence explainer, source citation, and a `relaxation` hook (estimated implementation lag + risk) used by future "break the rules" mode. New-legislation and statutorily-protected cards are greyed out by default; clicking shows the WHY rather than committing — distinguishing "this isn't allowed" from "I haven't picked it." Hypothetical levers (wealth tax, LVT, frequent flyer levy, CBAM) live in `HYPOTHETICAL_LEVERS` and surface as never-clickable cards with full explainers.

**Wizard state** (`src/lib/wizard-state.ts`) — `useWizardState()` hook: `committedScenario` (lines the user has confirmed), `previewLines` (hover-time preview), `goal`, `step`. URL-encoded for share-link round-trip. Shell layout (`src/components/wizard/wizard-shell.tsx`) is split-pane on desktop (wizard ~60%, HUD ~40%, sticky), mobile collapses to sticky HUD banner + main content.

The simulator's header has a `[Wizard]` link sitting alongside `[Templates]` and `[Reference]`. The wizard's "Skip to simulator →" button is prominent in both the header and Step 1, plus auto-fires from Step 6.

### Distributional analysis

`src/lib/distribution.ts` defines `IncidenceVector` (10-decile share, decile 1 = bottom 10%) and `IncidenceMeta` (vector + note + source). Tax levers and spending programmes carry an optional `incidence?: IncidenceMeta` field — populated for the 23 most politically relevant levers and 8 programmes per HMRC distributional analysis + IFS conventions. **Convention is ECONOMIC incidence** (employer NICs falls on workers via wages, VAT on consumers, corp tax 50/50 on workers/capital owners). `evaluateScenarioDistribution(result)` aggregates per-decile £ impact across all lines that have incidence vectors; lines without (borrow, tax-other) are excluded and reported via `modelledDelta`. The output rail shows: 10-decile bar chart + per-decile £/household/yr table + % of disposable income (the latter being the most income-equitable measure — a £ flat burden is regressive by ~6× when measured as % of income across deciles).

### Backtesting historical budgets

`AnnotatedBudget.realised?` is an optional `RealisedOutcome` capturing the budget's outturn vs forecast (`predictedDelta` = forecast at announcement, `realisedDelta` = actual at horizon, `note` = explanation). Populated for 5 well-documented budgets: Emergency 2010, Summer 2015, Spring 2021, Autumn 2022, Mini-budget 2022. `<BacktestSection>` (in `/reference`) renders each as a row showing forecast / realised / divergence — with a summary stat across all entries. Frames the model's underlying static-projection methodology honestly: the divergences are documented (frozen thresholds dramatically over-deliver in inflation; behaviourally elastic taxes under-deliver; reversed packages deliver £0). New budgets gain `realised` data as outturn becomes available.

Key modules:

- `src/data/comparisons.ts` — canonical catalog. `COMPARISONS: readonly Comparison[]`. Each `Comparison` carries `id`, `cost`, `nativeCurrency: "GBP" | "USD"`, `asOf: "YYYY-MM"`, and optional `source`. Two opt-in flags: `dynamic: { sourceId }` marks an entry whose cost should be live-fetched (the static `cost` is the fallback); `historical: true` marks one-off events whose figure won't change (e.g. coronation costs). To add a new comparison, append here — the category badges, quick-pick grid, and "What else could X fund?" list all derive from this array. The `"Top"` category is synthesized from items tagged `"Top"`.
  - `loadResolvedComparisons()` is the **server-side entry point** — it walks the catalog, calls `loadDynamicCost(sourceId)` for any `dynamic` entry, and overlays `cost` + `asOf` + `source` from the override when one is returned. The result is `ResolvedComparison[]` carrying an `isLive: boolean` flag the UI uses for provenance badges. Call from `page.tsx`/`og/route.tsx`; pass to the client as a `comparisons` prop.
- `src/data/nhs-budget.ts` — `NHS_ENGLAND_SLICES` is the programme-budgeting breakdown (total + acute + specialised + primary care + mental health + community + prescribing). `NHS_ENGLAND_TOTAL` is the first slice (`id: "total"`). The selected slice is the divisor in the time calculation; users pick via the pill bar. Slice figures are approximate and need verification against the NHS England Annual Report — see the file header. `MINUTES_PER_YEAR` lives here too. CI test in `nhs-budget.test.ts` enforces slice values sum to total within ±2%.
  - `loadResolvedSlices()` is the **server-side entry point** for budget data. It calls `nhsEnglandBudgetSource.fetch()` (env-gated) and overlays any returned values onto the static slice metadata via `applyBudgetOverride`. Use this from `page.tsx` and `og/route.tsx`; never from client code (env vars aren't available there). The client receives the resolved slices array as a `slices` prop.

### Live data sources

- `src/data/sources/types.ts` — `Source<T>` is `{ fetch, fallback }`; `loadSource()` resolves to fallback if fetch returns null. This is the contract for any future live source.
- `src/data/sources/nhs-england-budget.ts` — env-gated NHS budget fetcher. Reads `process.env.NHS_BUDGET_DATA_URL` (unset by default), validates the JSON shape (`{ totalValue, sliceValues, asOf, source? }`), returns `null` on any failure so the static fallback is used. Cached by Next for 1h via `revalidate: 3600`.
- `src/data/sources/dynamic-costs.ts` — registry of `Source<DynamicCost | null>` keyed by source id. All three current sources (`uk-tax-revenue`, `us-median-salary`, `ai-training-cost`) are real public-API integrations. The `envJsonSource(envVar)` factory remains available for future entries that need deploy-time configuration.
- `src/data/sources/uk-tax-revenue.ts` — fetches **World Bank indicator GC.TAX.TOTL.CN** (`https://api.worldbank.org/v2/...`) for the UK and walks back from the latest non-null observation. Cached 24h. Important caveat: World Bank "Tax revenue (current LCU)" excludes social contributions / NICs, so the live value is *narrower* (and lower) than HMRC's "tax + NICs receipts" used in the static fallback. The override's `source.label` ("World Bank (CY 2024)") makes the provenance visible in the UI. Has a unit test covering happy path + missing values + malformed shapes + network failures.
- `src/data/sources/us-median-salary.ts` — fetches **BLS series LEU0252881500** (median weekly earnings, employed full time) and converts weekly → annual via × 52. Prefers the most recent annual estimate (`period: "Q05"`), falls back to the most recent numeric quarterly. BLS public API v1 is unauthenticated with a 25 query/day per-IP limit; `revalidate: 86400` keeps us well under that. Has a unit test covering annual/quarterly preference + BLS placeholder values (`"-"`) + malformed shapes + network failures.
- `src/data/sources/ai-training-cost.ts` — fetches **Epoch AI's "Notable AI Models" CSV** (~2MB) and parses it with a small RFC-4180-subset parser embedded in the file. Filters to rows where `Frontier model = true` with a numeric `Training compute cost (2023 USD)`, picks the most recent by `Publication date`. Source label includes the model name (e.g. "Epoch AI (Grok-2, 2023 USD)"). Cached 24h. Has a unit test covering frontier filtering + missing-cost rows + non-frontier ignore + quoted-fields parsing + missing headers + network failures.
- `public/data/nhs-england-budget.json` — bundled sample matching the static slice values; useful for local testing (point `NHS_BUDGET_DATA_URL` at `http://localhost:3000/data/nhs-england-budget.json`). For production liveness, host the JSON somewhere updatable independently of code (raw.githubusercontent.com on a separate repo, a CMS, an S3 bucket).
- See `.env.example` for setup.

### Per-capita framing

`UK_POPULATION` (in `nhs-budget.ts`) carries the ONS mid-year estimate. Rendered in the calculator as a secondary subtitle under the time output: "£X = £Y per UK person." Slice info caption shows the slice's per-capita figure too. No URL state; the framing is always shown.

### Scenario builder

The most ambitious surface. Stack any number of fiscal lever changes (programme cuts/raises, tax adjustments, borrowing) and see the net effect plus the comparisons that net affords/costs.

- `src/lib/scenario.ts` — typed `ScenarioLine` (programme/tax/borrow); `evaluateLine` reuses the same data as the trade-off engine and counterfactual panel; `evaluateScenario` sums positive deltas (freed) and negative deltas (required) separately. Compact URL serialization: `p:state-pension:-3,t:basic-rate-income-tax:1,b:20000000000` — each line is `<type>:<id>:<magnitude>`. Invalid lines are silently dropped on deserialize.
- `src/lib/saved-scenarios.ts` — localStorage-backed list of user-saved scenarios. `listSavedScenarios()` / `saveScenario(name, scenarioStr)` / `deleteSavedScenario(id)`. Robust to malformed storage data; capped at 20 entries (oldest dropped). 5 unit tests with an in-memory storage fake.
- `src/app/ScenarioBuilder.tsx` — list of editable lines (programme dropdown + percentage input, tax dropdown + pp input, or borrow GBP input). Add/remove buttons. Net summary card. Comparison list. Per-line methodology popover. URL state via `?scenario=...`. "Save scenario" button + saved-scenarios chip row. Saved entries load on click (resets `lines` state).
- `src/app/og/scenario/route.tsx` — edge OG: net £ headline, top 4 lines as rows with their £ deltas, top 3 affordable comparisons. Top of card shows colour-coded freed (blue) / shortfall (amber).

### Counterfactual panel

The inverse of the trade-off engine. Instead of pricing a specific proposal, the user adjusts a single fiscal lever — a spending programme by ±50% or a tax rate by ±5pp — and sees the resulting £ delta plus a ranked list of comparisons it would fund (revenue) or require (shortfall).

- `src/lib/counterfactual.ts` — types + math. `evaluateCounterfactual(cf)` produces `{ deltaGbp, isRevenue, methodology, … }`. `comparisonsCovered(delta, comparisons, fx)` ranks Top-tagged catalog items by count, filters `count >= 1` so we don't say "0 nuclear plants." 11 unit tests in `counterfactual.test.ts`.
- `src/app/CounterfactualPanel.tsx` — UI. Mode tabs ("Adjust spending" / "Adjust a tax"), dropdown + slider per mode, animated headline outcome, comparison list, methodology popover (showing `cuttability?` for programmes, `why this number?` for taxes).

The panel sits between the trade-off engine and the NHS calculator on the homepage.

### Tax lever shapes

Tax levers come in **four shapes** — discriminated by `unit`:

- **`unit: "pp"`** — rate-change levers (basic IT, higher IT, additional IT, VAT, NICs, corp tax). Magnitude is percentage points; `gbpPerUnit` is HMRC's first-year revenue per pp. Carry `currentRate`.
- **`unit: "yr"`** — threshold-freeze levers (PA, HRT, ART). Magnitude is years of additional freeze; `gbpPerUnit` is steady-state revenue per year of freeze (fiscal drag). Carry `currentValue` (the threshold £).
- **`unit: "k"`** — threshold-change levers (`raise-personal-allowance`, `raise-higher-rate-threshold`, `raise-additional-rate-threshold`). Magnitude is **£k of threshold change**; positive = raise the threshold (a tax cut). `gbpPerUnit` is **negative** since raising a threshold loses revenue. The math is uniform (`magnitude × gbpPerUnit`), but the convention is sign-inverted vs the others — documented in the lever methodology.
- **`unit: "bn"`** — catch-all `tax-other` lever. Magnitude is **£bn raised** (positive) or lost (negative); `gbpPerUnit = 1bn`. For sundry budget measures that don't deserve their own lever (asset taxes, gambling duties, EV mileage charges). Use sparingly; the methodology explicitly says "if it's large and recurring, give it its own lever."

Same arithmetic across all four (`gbpPerUnit × magnitude`); a single `describeTaxChange(lever, magnitude)` helper in `scenario.ts` produces the right description verb for each unit (`Raise X by Npp` / `Freeze X for N more years` / `Raise X by £Nk` / `Other tax measures raising £Nbn`). Both `evaluateLine` and `evaluateCounterfactual` use the helper.

### Programme cuttability cap

Each `SpendingProgramme` carries an optional `cuttableFraction` — the rough share of the programme that's realistically cuttable in a single budget. The remainder is statutory/contractual/politically untouchable. Defaults to 1.0 when omitted.

Examples (illustrative):
- State pension: 0.05 (triple lock + statutory; essentially uncuttable in the short term)
- Net debt interest: 0.0 (literally not discretionary)
- Defence: 0.20 (NATO 2% floor; everything above is theoretically negotiable)
- Local-govt grants: 0.05 (already at S114 territory after the 2010-15 cuts)
- International aid: 0.5 (already cut; remaining is closer to the political minimum)

`describeCut` returns `exceedsCuttable: boolean` alongside the % share. UI consumers (TradeOffEngine cut-lever line, ScenarioBuilder programme rows) render an amber warning when a cut exceeds the cuttable fraction. Doesn't block the user — the calculator's job is to make trade-offs visible, not to forbid them — but the warning makes the constraint legible.

### Trade-off engine

The product's primary surface. Frames every policy proposal as a choice between three levers — tax, borrow, cut — that must sum to the target.

- `src/data/levers/tax-rates.ts` — HMRC ready-reckoner (`TAX_LEVERS`). Each lever carries a `unit: "pp" | "yr" | "k" | "bn" | "p-per-litre"` discriminator and a `gbpPerUnit` calibration. Includes rate levers (basic / higher / additional IT, dividend tax, VAT, employee NICs, employer NICs, corp tax, CGT higher rate, IHT), threshold-freeze levers (PA / HRT / additional-rate, encoded as years of freeze), threshold-raise levers (PA / HRT / additional-rate, dividend allowance, employer-NICs secondary threshold, in £k), commodity levers (fuel duty in p/litre), payroll levers (apprenticeship levy, bank surcharge), windfall levers (energy profits levy on top of corp tax), asset-tax levers (SDLT in £bn), and a catch-all `tax-other` (in £bn) for sundry budget measures. Source: HMRC "Direct effects of illustrative tax changes," Jan 2024 (rate + threshold levers); IFS modelling for freeze/fiscal-drag levers; HMRC corp tax statistics for bank surcharge. The `describeTaxChange(lever, magnitude)` helper in `src/lib/scenario.ts` produces unit-aware verbs ("Freeze X for N years" / "Raise X by Npp" / "Raise X by £Nk" / "Raise X by Np/litre" / "Other tax measures raising £Nbn").
- `src/data/levers/uk-spending.ts` — major UK spending programmes (`UK_SPENDING_PROGRAMMES`). Source: HMT PESA 2024.
- `src/data/levers/borrowing.ts` — 30-year gilt yield, UK GDP, current debt level. Used to translate "+£X borrowed" into "+£Y/yr interest" and "+Zpp debt:GDP."
- `src/lib/trade-off.ts` — math. `Allocation = { tax, borrow, cut }` in £. `adjustLever` moves £ from one lever and proportionally rebalances the others. `rescale` preserves ratios when the target changes. `describeTax` / `describeBorrow` / `describeCut` produce policy translations. 11 unit tests in `trade-off.test.ts`.
- `src/app/TradeOffEngine.tsx` — client component. Funding target picker (preset comparisons or custom amount), three sliders (native `<input type="range">`), per-lever dropdowns for which tax / programme. Net-effect summary.

The comparison catalog (`COMPARISONS`) doubles as the menu of preset funding targets — adding a new comparison automatically adds a new option to the trade-off engine's goal picker.

### Annotated budgets

Pre-built scenario URLs for real UK budgets and Spring Statements. Each entry pairs editorial context (chancellor, party, what happened, market reaction) with a serialized `Scenario` that approximates the fiscal moves. Loading a budget pushes its scenario into the URL and the scenario builder picks it up via `useSearchParams`.

- `src/data/budgets/annotated.ts` — `ANNOTATED_BUDGETS` array, **16 entries** spanning **June 2010 to March 2026**, ordered newest-first. Six chancellors covered: Osborne ×2, Hammond ×2, Sunak ×4, Kwarteng ×1, Hunt ×4, Reeves ×3. Three parties: Coalition (2010), Conservative (2010-2024), Labour (2024-). Headline anchors: **Emergency Budget 2010** (Osborne — the foundational austerity budget; VAT 17.5%→20%, £11bn welfare cuts; 14+ years of UK fiscal politics traces to here); **Budget 2021** (Sunak — patient zero of the freeze era); **Mini-budget 2022** (Kwarteng — gilt market crash); **Autumn Budget 2024** (Reeves — first Labour budget in 14 years). Each entry has `chancellor`, `party`, `shortDescription`, `notes` (2-4 sentences of context), `source`, and `caveats` (what the scenario simplifies). The freeze chain reads through the data: introduced 2021, extended 2022, extended 2025.
- `src/app/AnnotatedBudgetsPanel.tsx` — list view with party-coloured pills, expandable notes (`<details>` → context + caveats + source link), and a "Replay" button that pushes the scenario into the URL and smooth-scrolls to the scenario builder.
- `src/app/ScenarioBuilder.tsx` listens for URL changes via `useSearchParams` and re-derives `lines` when the URL's scenario differs from the current state — this is the integration point that makes "replay" work.

**Authoring a new budget**: set name/date/chancellor/party/sources, encode major fiscal levers as scenario lines (closest available lever; document substitutions in `caveats`), order lines by magnitude descending. Verify against the Treasury's published Red Book and OBR's outlook.

**Placeholder entries**: an entry with `placeholder: true` renders disabled with an "Awaiting authoring" button and a `placeholder` badge. Used for budgets that the codebase author can't populate (e.g. budgets after the maintainer's reference cutoff). Edit the entry to remove the flag once content is available.

### International comparison panel

A "where does the UK sit?" surface using OECD Health at a Glance data. Eight peer countries plus the OECD average, with four columns: % GDP spent on health, $ per capita PPP, life expectancy, treatable mortality.

- `src/data/international/health-spending.ts` — `COUNTRY_HEALTH` array (8 peer countries + OECD avg). **Critical caveat baked in**: every country's spending figure is total (public + private), which is *broader* than NHS England spending used elsewhere on the page. Per-country methodology covers measurement boundaries (US public/private mix, German SHI vs general taxation, Dutch managed-market model, etc.). `applyCountryHealthOverride()` overlays live World Bank values; `loadResolvedCountries()` is the server-side entry point.
- `src/data/sources/world-bank-health.ts` — fetches three World Bank indicators in parallel for the 8 peer countries: `SH.XPD.CHEX.GD.ZS` (% GDP), `SH.XPD.CHEX.PP.CD` (per-capita PPP), `SP.DYN.LE00.IN` (life expectancy). Uses multi-country batch syntax (`country/GBR;USA;DEU;...`). Per country, picks the most recent non-null observation; returns `{ overrides, asOf, source }`. Cached 24h.
- `src/data/sources/oecd-treatable-mortality.ts` — direct **OECD SDMX-CSV** integration. Dataflow `OECD.ELS.HD,DSD_HEALTH_STAT@DF_AM,1.0`, measure `TRTM` at unit `DT_10P5HB`.
- `src/data/sources/oecd-physicians.ts` — same OECD SDMX pattern for **practising physicians per 1,000 population**. Dataflow `OECD.ELS.HD,DSD_HEALTH_EMP_REAC@DF_PHYS,1.0`, key `HSE.10P3HB.PHYS.P` (Health Sector Employment / per-1000 / Physicians / Practising-not-licensed). Used as the workforce-capacity column in the international panel.
- `src/data/sources/oecd-hospital-beds.ts` — OECD SDMX for **hospital beds per 1,000 population**. Dataflow `DSD_HEALTH_REAC_HOSP@DF_BEDS_SECT`, measure `HB` at `10P3HB`. Issues two parallel queries: `OWNERSHIP_TYPE=_T` (preferred — total) and `OWNERSHIP_TYPE=P` (public-only fallback). UK reports only public (NHS doesn't decompose); the P fallback is what makes the UK row populate. Australia doesn't report to this dataflow at all, so stays on its static fallback.
- `src/data/sources/oecd-nurses.ts` — OECD SDMX for **practising nurses per 1,000 population**. Dataflow `DSD_HEALTH_REAC_EMP@DF_NURSE`, key `HSE.10P3HB.MINU.P` (MINU = midwives, nurses and other healthcare assistants combined; P = practising not licensed).
- `src/data/sources/oecd-cancer-survival.ts` — OECD SDMX for **breast cancer 5-year net survival rate**. Dataflow `DSD_HCQO@DF_CC` (Cancer Care), measure `CCBRNTSR`. Lags ~5 years because the metric requires multi-year follow-up. UK consistently bottom of OECD peers (~86% vs 90%+ in US/AU/JP).
- **OECD rate limiting**: their public SDMX API rate-limits aggressively (HTTP 429 `"You have exceeded the number of requests..."`). With our 24h `revalidate`, a single deployment hits each endpoint at most once per day, well within limits. For development with cache invalidations, expect intermittent 429s — the source returns `null` cleanly and the static fallback values render. Static fallbacks are populated from successful probes during authoring.
- Both OECD sources require the explicit `Accept: application/vnd.sdmx.data+csv;version=1.0` header — OECD's API negotiates strictly. CSV-parsed; per-country latest-year observation.
- `src/data/international/health-spending.ts` — `loadResolvedCountries()` calls **all three sources in parallel** and merges. `applyCountryHealthOverride()` overlays per-country values: World Bank → `spendPctGdp` / `spendPerCapitaPpp` / `lifeExpectancy`; OECD mortality → `treatableMortality`; OECD physicians → `physiciansPerThousand`. The country row's `source.label` is composed from whichever sources contributed (e.g. "World Bank (CY 2024) + OECD Avoidable Mortality (CY 2023) + OECD Physicians (CY 2023)").
- `src/app/InternationalPanel.tsx` — sortable table, UK row highlighted, methodology popover per country, **provenance badge in the header showing "(N of M live)"**.
- **What's still static**: the OECD-average row (neither source computes it). Methodology-coverage CI test enforces every country has substantive methodology.

### Personal tax burden

- `src/lib/tax.ts` — UK income tax + employee NIC bands (FY24/25, frozen for 25/26). Handles personal-allowance taper above £100k. Pure functions; tested in `tax.test.ts` (15 tests) covering each band boundary and the taper.
- `nhsShareOfTax(totalTax)` applies a flat ~18% factor (NHS England / total HMRC receipts). Documented as an approximation; precise apportionment is out of scope for a calculator.
- `src/app/PersonalTaxBurden.tsx` — client card on the homepage. Salary input → tax breakdown + NHS share + the same time framing the main calculator uses ("Your NHS share = X minutes of NHS England spending"). Default salary £35k.

### Methodology popovers

The product principle here is "lead with the headline, expose assumptions on demand." Every figure that the trade-off engine surfaces — every tax lever, every cut programme, every NHS slice, the borrowing constants — has a substantive methodology object: what it measures, alternative measures, plausible range, caveat, and source.

- `src/lib/methodology.ts` — the `Methodology` type. `measure` (what's in the number, not just a source URL), `alternatives[]` (other defensible framings), `range` (when uncertainty matters), `caveat` (what a domain expert would object to first).
- `src/components/ui/popover.tsx` — Radix Popover primitive.
- `src/components/ui/methodology-popover.tsx` — the trigger + portalled popover.
- **Methodologies live next to the data they describe**, not in a separate registry:
  - `TaxLever.methodology` in `src/data/levers/tax-rates.ts` — covers the rate set (basic / higher / additional IT, dividend tax, VAT, employee + employer NICs, corp tax), asset taxes (CGT higher rate, IHT), threshold freezes + raises (PA / HRT / additional rate), commodity duties (fuel duty), sectoral surcharges (apprenticeship levy, bank surcharge, energy profits levy), SDLT, and the catch-all `tax-other`.
  - `SpendingProgramme.methodology` in `src/data/levers/uk-spending.ts` (10 programmes; each focuses on cuttability and political/legal constraints).
  - `BudgetSlice.methodology` in `src/data/nhs-budget.ts` (7 entries — total + 6 programme-budgeting categories).
  - `BORROWING.methodology` in `src/data/levers/borrowing.ts`.
- `src/data/methodologies.ts` — only the *orphan* methodologies that aren't tied to a data row: `UK_POPULATION_METHODOLOGY`, `NHS_TAX_SHARE_METHODOLOGY`.
- `src/data/methodology-coverage.test.ts` — CI gate: every row in major data files must carry a substantive methodology (a thin `{ source, asOf, measure }` doesn't qualify — needs `alternatives`, `range`, or substantive `caveat`).

When writing a new methodology: `measure` says exactly what's in the number (not "NHS budget" but "NHS England programme spending, excluding DHSC central, public health grant, training"). `alternatives` make the framing choice visible. `caveat` calls out the thing a domain expert would object to first.

### Provenance and freshness

- `src/components/ui/provenance-badge.tsx` — small inline `live`/`static` chip with a tooltip explaining the state. Rendered next to slice source links and next to dynamic comparison source links in the calculator's bottom list.
- `src/data/comparisons.test.ts` — freshness gate. Static (non-dynamic, non-historical) entries must have `asOf` within 24 months. Dynamic entries are skipped (the source keeps them fresh; the static `cost` is best-effort fallback). Historical entries are skipped (one-off facts). Also enforces unique ids and well-formed `asOf` strings, and that every `dynamic.sourceId` exists in `DYNAMIC_COST_SOURCES`.
- `src/lib/currency.ts` — `Currency` type, `toGBP` / `fromGBP`, and `FALLBACK_USD_PER_GBP`. **Costs in `comparisons.ts` stay in their native currency.** Convert at the boundary: `toGBP` when comparing/multiplying against the canonical amount, `fromGBP` when rendering for the user's selected display currency.
- `src/lib/fx.ts` — server-side `getUsdPerGbp()` fetcher with Next's per-hour `revalidate` cache. Falls back to `FALLBACK_USD_PER_GBP` on failure. **Only call this from server contexts** (server components, route handlers); the client receives the rate as a prop.
- `src/lib/url-state.ts` — server-side resolvers:
  - `resolveState({ id?, q?, a?, slice? }, …)` — comparison calculator. Returns `{ option, quantity, amount, slice }`.
  - `resolveSimulatorState({ scenario?, editor?, g?, gq?, ga?, …legacy params }, …)` — **the canonical simulator decoder**. First looks for unified `?scenario=&editor=…&g=…&gq=…&ga=…`; if absent, falls back to legacy `?to_*=` (trade-off) or `?cf_*=` (counterfactual) and converts via the scenario converters in `src/lib/scenario.ts` (`allocationToScenario`, `counterfactualToScenario`). Returns `{ scenario, editor, goalId, goalQuantity, customAmount }`.
  - `tradeOffPropsFromSimulator(sim, comparisons)` / `counterfactualPropsFromSimulator(sim)` — derive editor-shaped props from the unified state for the existing `<TradeOffEngine>` / `<CounterfactualPanel>` components.
  - Legacy resolvers (`resolveTradeOffState`, `resolveCounterfactualState`) are still exported for the legacy OG routes only.
- `src/lib/url-write.ts` — **client-friendly** URL helpers (zero data imports). Exports `buildUrl(current, owned, next)`, the param-name constants (`SCENARIO_PARAMS`, `SIMULATOR_OWNED_PARAMS`, plus legacy `TRADE_OFF_PARAMS` / `COUNTERFACTUAL_PARAMS` for back-compat decode), the `EditorMode` type (`"triptych" | "single" | "stack"`), and the default constants. **All simulator editors write the unified namespace** (`?scenario=&editor=&g=&gq=&ga=`) and clear legacy params via `SIMULATOR_OWNED_PARAMS`.
- **URL state migration (Phase 0)**: legacy share-links continue to work because `resolveSimulatorState` decodes both shapes. Trade-off shares (`?to_goal=hs2-mile&to_split=33,33,34`) decode to a 3-line scenario with `editor=triptych`. Counterfactual shares (`?cf_mode=tax&cf_pp=2`) decode to a 1-line scenario with `editor=single`. New shares always emit the unified shape. Round-trip tests in `url-state.test.ts` cover 38 fixtures of legacy + unified shapes.
- `src/app/og/route.tsx` — comparison-mode 1200×630 OG card. Reads `id`/`q`/`a`/`slice`.
- `src/app/og/scenario/route.tsx` — **canonical scenario OG card**. Reads `?scenario=` and renders the universal stack visual (net £ headline + top 4 lines + top 3 comparisons covered).
- `src/app/og/trade-off/route.tsx` and `src/app/og/counterfactual/route.tsx` — **legacy OG routes**, kept for back-compat with old share-links. New shares from `page.tsx` always go to `/og/scenario`. Safe to delete after a deprecation window.
- `src/app/page.tsx` `generateMetadata` reads the unified state via `resolveSimulatorState`; selects the right OG endpoint based on `sim.editor` (single → counterfactual-style copy; triptych → trade-off-style copy; otherwise → scenario-style copy), all pointing at `/og/scenario`. Comparison shares still go to `/og`.
- `src/app/page.tsx` — server component. `generateMetadata({ searchParams })` returns dynamic title/description and `openGraph.images = ["/og?..."]` for per-link OG cards. The page's default export awaits `searchParams`, calls `resolveState`, and passes initial props to the client.
- `src/app/utils/formatters.ts` — `formatMoney` (symbol only, no conversion) and `formatTime` (humanizes minutes into years/months/.../seconds).
- `src/app/NHSSpendingCalculator.tsx` — the only client component. Accepts `initialAmount`, `initialOptionId`, `initialQuantity`, `initialUsdPerGbp` props from the server. The internal `amount` state is **always GBP**; `displayAmount = fromGBP(amount, currency, usdPerGbp)` is computed once per render. The client does **not** fetch FX — the server fetches it via `getUsdPerGbp()` and passes the value down, so the OG image, initial paint, and the calculator all agree on the same rate.
- `src/components/ui/currency-toggle.tsx` — accessible GBP/USD switch (`role="group"`, `aria-pressed`). Used twice in the calculator with different positioning classes (desktop absolute, mobile inline). Category chips use the same pattern: `<button aria-pressed>` styled with `badgeVariants`.
- Headline figure animates via `AnimatedNumber` (framer-motion spring). The currency symbol is rendered as a sibling so the spring only runs on the digits.
- URL sync: a debounced (250ms) effect writes `?id=…&q=…` (when a comparison is selected) or `?a=…` (custom amount) via `router.replace`, preserving unrelated params. `useRouter` is from `next/navigation`.
- Amount input: `editingAmount: string | null` is the focused-edit mirror. While focused the input shows raw digits the user typed (no commas → cursor never jumps); on blur it reverts to `amount.toLocaleString()`. `selectedQuantity` uses select-on-focus so clicking the field auto-selects the current value.

`public/og-fallback.jpeg` is the previous static OG card preserved in `public/` (out of Next's `app/` file-convention) so it doesn't compete with the dynamic `/og` route. Not currently referenced anywhere — re-add to `metadata.openGraph.images` if you want it as a default.

UI primitives live in `src/components/ui/` (shadcn/ui "new-york" style, neutral base — see `components.json`). `framer-motion` animates the funded-items list; `react-icons` provides the podcast brand icons. Path alias `@/*` → `src/*`.

## Conventions

- TypeScript strict mode; tabs for indentation.
- Tailwind via `tailwind.config.ts` + `src/app/globals.css`; merge classes with `cn` from `src/lib/utils.ts`.
- Comparison costs are stored in `nativeCurrency` — never pre-convert. When you change a value, update `asOf`. The headline `NHS_BUDGET.value` should be refreshed each fiscal year alongside its `asOf` and `source`.
- Tests live next to their subjects as `*.test.ts`. Vitest config (`vitest.config.ts`) wires the `@/*` path alias. Pure-function tests only — no jsdom/component tests are configured.

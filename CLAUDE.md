# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server (Turbopack) at http://localhost:3000
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — `next lint`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` / `npm run test:watch` — Vitest
- `npm run ci` — typecheck + tests + build. Run before pushing.

Single-test: `npx vitest run path/to/file.test.ts -t "test name"`.

No GitHub Actions / hosted CI by design — the gate is `npm run ci`.

Stack: React 19, Next 15, TypeScript 5, Tailwind 3, Vitest 4. Node ≥20 enforced via `engines`. `npm install` runs unconstrained — no `--legacy-peer-deps`. Fix peer-dep conflicts at the source.

## Architecture

Next.js 15 App Router site. The homepage (`src/app/page.tsx`) **is the wizard** — a guided fiscal-policy walkthrough that lands on a full report at step 6. There is no separate "simulator" entry. The homepage server component loads live data (FX, dynamic comparison costs, OBR baseline, historical outturns) and renders `<WizardShell>` (`src/components/wizard/wizard-shell.tsx`).

The wizard owns the entire user-facing surface:

- **`<WizardShell>`** — split-pane on desktop (60/40), sticky HUD + content on mobile. Hosts the steps and `<ChancellorHud>` (sticky live-impact panel; updates on hover preview / click commit).
- **Steps** (`src/components/wizard/steps.tsx`):
  1. **Briefing** — current UK fiscal position
  2. **Goal** — direction (reduce borrowing / fund NHS / fund defence / cut taxes / hold steady / free-play)
  3. **Taxes** — curated `<ChoiceCard>`s, including hypothetical (greyed) cards
  4. **Spending** — increase / cut / statutorily-protected
  5. **Borrow** — plug residual or repay
  6. **Result** — `<RefineScenarioPanel>` (free-form line edits via the categorised `<LeverRail>`) plus `<OutputRail>` (the analytics report surface)
- **Wizard state** (`src/lib/wizard-state.ts`) — `useWizardState()` returns `{ committedScenario, previewLines, goal, step, era, mode }`. URL-encoded so share-links + reload survive.

`src/components/simulator/` is misleadingly named: it now hosts the report surface (`OutputRail`, all chart components, scenario diff / compare modals, scenario signature radar, year scrubber, callouts, copy-chart button) consumed inside step 6, not a separate simulator. Rename TBD; treat the path as "report surface" until it moves.

**Two real routes**:
- `/` — the wizard (above).
- `/reference` (`src/app/reference/page.tsx`) — NHSSpendingCalculator + PersonalTaxBurden + InternationalPanel + `<BacktestSection>`. Calculator URL state (`?id=…&q=…&a=…&slice=…`) lives here. Legacy `/?id=…` links 307-redirect via `redirect()` in `page.tsx`'s comparison-share branch.

`/wizard` is a `permanentRedirect` to `/` (`src/app/wizard/page.tsx`); `/sandbox` redirects to `/?wstep=5`. Both preserve URL params so old bookmarks keep working.

### Output rail (the report inside step 6)

`<OutputRail>` (`src/components/simulator/output-rail.tsx`) is the analytics surface step 6 mounts:

- **TopZone** (`top-zone.tsx`) — always visible. Animated net £ headline, plain-English narrative, scenario signature radar (5-axis fingerprint), top-3 comparisons, decile + microsim headlines. Supporting stats are drill buttons that scroll to the relevant tab.
- **Action bar** — `Headline / Analyst / Researcher` mode toggle (persisted in `simulator-rail-mode`), copy-link, MD/JSON appendix exports, audit panel jump, scenario compare modal trigger.
- **Year-of-focus** — `<ScenarioYearScrubber>` slider plus a first-visit `<DiscoverableHint>`. Drag or hover any chart to focus a year; focus syncs across the multi-year fan, counterfactual paths, scoring bridge, and macro-state sparklines via `useYearFocus` (hovered overrides locked).
- **Report narrative map** — signal cards previewing each detail tab.
- **Detail tabs**: Trajectory · Who pays · Macro · Stress · Assumptions · Audit. Stress + Audit hidden in Headline mode. Active tab cross-fades on switch; long tabs carry a sticky within-tab `<TabSubNav>` (scroll-spy-driven).
- **Per-chart Save-as-PNG** on signature / multi-year / counterfactual via `html-to-image`. **Scenario compare modal** opens a side-by-side A vs B view (saved scenarios + annotated UK budgets, headline + signatures + decile rows + top-line deltas).

### Household-level impact (pseudo-microsimulation)

`src/data/households.ts` — 9 representative UK household archetypes (single pensioner → top-decile household). Each carries gross income breakdown, VAT-able spend, composition, decile, net income. Sources: ASHE 2024, state pension 2024-25, ONS Family Spending 2023.

`src/lib/household-impact.ts`'s `evaluateHouseholdImpact(household, scenarioResult)` computes £/yr + per-line breakdown. Two-tier methodology mirroring IFS / Resolution Foundation:
- **Direct** (`method: "direct"`) for IT bands, NICs, VAT, dividend tax, threshold raises, state pension, working-age welfare.
- **Decile fallback** (`method: "decile"`) for public-good levers (NHS, defence) — allocates via the lever's incidence vector, divides by ~2.8M households per decile.

Documented limits: no UC taper interaction, no HICBC, no within-decile heterogeneity, no behavioural response. Full FRS-microdata simulation (TAXBEN, OpenFisca-UK) would close gaps but requires restricted access. `<HouseholdImpactPanel>` shows £/yr + % of net income + per-line breakdown.

### OBR baseline integration

`src/data/baseline/obr-baseline.ts` — OBR EFO baseline (PSNB, PSND, debt:GDP, revenue/spending, GDP, fiscal-rule headroom). Anchored to **March 2025 EFO** (2024-25 → 2029-30).

**Live override**: `src/data/sources/obr-efo.ts`'s `obrEfoSource` (env-gated). `loadResolvedBaseline()` overlays onto the static fallback. Set `OBR_BASELINE_DATA_URL` to JSON matching `BaselineOverride`. Cached 24h. Sample at `public/data/obr-baseline.json`.

`src/lib/baseline-projection.ts`'s `projectAgainstBaseline(projection)` overlays scenarios on the baseline path. `<BaselineComparisonPanel>` shows year-N PSNB shift, stability-rule margin, year-by-year path.

### Macro feedback (Scope A + B + C)

`src/lib/macro.ts` provides `FiscalMultiplier`, `TAX_TO_GDP_RATIO` (0.38 per OBR Mar 2025 EFO), and helpers (`secondRoundDelta`, `multiplierAtYear`, `macroFeedback`).

**Scope A** — `firstRound × (1 - multiplier × TAX_TO_GDP_RATIO)`. Per-lever multipliers in `TAX_MULTIPLIERS` / `PROGRAMME_MULTIPLIERS` (~25 tax + 10 programme calibrations from OBR/IFS). Range 0.1 (CGT, IHT) → 0.9 (working-age welfare). Aid = 0 (offshore leakage).

**Scope B** — multi-year impulse paths + endogenous CPI + gilt yields:
- Each `FiscalMultiplier` carries a `pathShape` (`fade`, `hump`, `investment`, `spike`, `transfer`, `flat`). `multiplierAtYear(m, year)` returns year-N value.
- `cpiPassthrough` field — VAT 0.85, fuel duty 0.55, EPL 0.25, others 0.
- Gilt yield response — `GILT_YIELD_PER_DEBT_GDP_PP` (5bp per 1pp debt:GDP).

`evaluateScenarioMacroPath(result, years)` returns `MacroState[]` per year (CPI / GDP / debt:GDP / gilt-yield deviations). Surfaced via `<MacroStatePanel>`.

**Scope C** (`projectScenarioWithGEFeedback(result, years)`) — single-pass GE feedback. Three channels:
- CPI → frozen-threshold drag (`FREEZE_DRAG_AMPLIFICATION_PER_CPI_PP` = 0.05).
- CPI → indexed spending (triple-lock pension, `TRIPLE_LOCK_AMPLIFICATION_PER_CPI_PP` = 0.01).
- Gilt yield deviation → borrow servicing.

Single-pass — no iteration to convergence. Net summary shows up to four tiers (Static → Dynamic → Macro → GE), surfaced when gap exceeds threshold. Multi-year projection's central line is the Scope C with-feedback path.

Sign conventions:
- Revenue raise → fiscal contraction → GDP falls → revenue feedback negative.
- VAT/fuel raise → CPI up → frozen-threshold revenue amplifies + indexed-spending cost rises.
- Debt-reducing → debt:GDP down → gilt yields fall → borrow servicing cheaper.

### Microsimulation (synthetic 1000-household population)

`src/lib/microsim/`:
- `population.ts` — generates households from realistic distributions (ASHE 2024 log-normal earnings, ONS family composition, DWP UC + child benefit rules). Deterministic per seed (Mulberry32). Each household carries `weight` so population aggregates to ~28M UK households.
- `tax-benefit.ts` — full-system net-income calc: IT + NICs (FY24/25), Universal Credit (£4,725 standard / £7,412 couple, child elements, work allowance, 55% taper), child benefit + HICBC clawback, dividend tax.
- `impact.ts` — applies each scenario line to every household via direct/decile-fallback. Aggregates per-decile mean + p10/p50/p90, demographic cross-cuts, winners/losers/unaffected %.

`<MicrosimulationPanel>` surfaces winners/losers bar, per-decile mean + within-decile spread chart, by-household-type table.

Documented limits: synthetic (not FRS), no regional variation, no asset-wealth modelling for CGT, marginal-impact (not full-system recompute) for taper interactions.

### Bayesian uncertainty (fan charts)

`src/lib/uncertainty.ts` — Monte Carlo primitives: `seededRng` (Mulberry32), `sampleNormal` (Box-Muller), `percentile`, `computeBand` (5/25/50/75/95), `distributionFromRange` (maps `methodology.range` to mean+sd assuming 95% CI).

`evaluateScenarioBand(result, samples=1000, seed=42)` returns `PercentileBand & {central}`. Per-pp tax levers contribute uncertainty (sd from `methodology.range` or 10% fallback); programmes/borrow/non-pp deterministic. Output rail shows "90% CI" when band width exceeds 5% of central.

`projectScenarioBandsByYear(result, years, ...)` samples lever yields once per draw, projects through the horizon (matches OBR fan-chart semantics). MultiYearProjection sparkline renders 90% (lighter) and 50% (darker) bands.

### Behavioural elasticities + multi-year projection

`src/lib/elasticity.ts` — `Elasticity` (`coefficient`, `note`, `source`). Tax levers carry an optional `elasticity?` field for the 12 rate-style levers most relevant to OBR-style dynamic scoring. Coefficient = fractional yield haircut per absolute unit of magnitude (0.10 on CGT means a +4pp move loses 40% of static yield). `dynamicAdjust` capped at 95%.

`projectScenarioOverYears(result, n=5)` projects net £. Rate-style tax + spend lines scale with nominal growth (default 4%); freeze levers ramp to year-N and plateau; borrow accumulates interest (default 4.5% gilt × principal × years). Calibration: HMRC ready-reckoner, OBR EFOs, DMO.

### Wizard detail

(Wizard shell + steps + state are described in [Architecture](#architecture). Detail below.)

**Hard forking with WHY** — every choice card in steps 2–5 carries `LegislativeMeta` from `src/data/legislation.ts`: status (`available`, `devolved`, `new-legislation`, `statutorily-protected`), badge, explainer, source, `relaxation` hook (lag + risk). New-legislation / statutorily-protected greyed; click shows WHY rather than commits. Hypothetical levers (wealth tax, LVT, frequent flyer, CBAM) live in `HYPOTHETICAL_LEVERS`.

**Goal materialisation** — step 6 wraps the committed scenario with `materialiseGoalLine(goal)` from `src/lib/wizard-goals.ts`, so a "fund-NHS" goal lands as an explicit programme line in the report rather than an implicit assumption.

### Distributional analysis

`src/lib/distribution.ts` — `IncidenceVector` (10-decile share, decile 1 = bottom 10%) and `IncidenceMeta`. Tax levers + programmes carry an optional `incidence?` field for the 23 most politically relevant levers + 8 programmes per HMRC + IFS conventions. **Convention is ECONOMIC incidence** (employer NICs on workers, VAT on consumers, corp tax 50/50 workers/capital). `evaluateScenarioDistribution` aggregates per-decile £; lines without incidence (borrow, tax-other) reported via `modelledDelta`. Output rail shows decile bar chart + £/household/yr + % of disposable income.

### Backtesting historical budgets

`AnnotatedBudget.realised?` — optional `RealisedOutcome` (`predictedDelta` / `realisedDelta` / `note`). Populated for 5 well-documented budgets (Emergency 2010, Summer 2015, Spring 2021, Autumn 2022, Mini-budget 2022). `<BacktestSection>` (in `/reference`) renders forecast / realised / divergence with summary stat. Frames the model's underlying static-projection methodology honestly.

### Key data modules

- `src/data/comparisons.ts` — canonical catalog. `Comparison` carries `id`, `cost`, `nativeCurrency: "GBP" | "USD"`, `asOf`, optional `source`. Two flags: `dynamic: { sourceId }` for live-fetched costs (static `cost` is fallback); `historical: true` for one-off events. `loadResolvedComparisons()` is the **server-side entry point** — walks the catalog, calls `loadDynamicCost(sourceId)`, returns `ResolvedComparison[]` with `isLive` for provenance badges.
- `src/data/nhs-budget.ts` — `NHS_ENGLAND_SLICES` programme-budgeting breakdown. `NHS_ENGLAND_TOTAL` is `id: "total"`. `MINUTES_PER_YEAR` lives here. CI test enforces slices sum to total within ±2%. `loadResolvedSlices()` is the **server-side entry point**.

### Live data sources

- `src/data/sources/types.ts` — `Source<T>` is `{ fetch, fallback }`; `loadSource()` resolves to fallback if fetch returns null.
- `src/data/sources/nhs-england-budget.ts` — env-gated (`NHS_BUDGET_DATA_URL`). Cached 1h.
- `src/data/sources/dynamic-costs.ts` — registry of `Source<DynamicCost | null>`. Three current sources are real public-API integrations.
- `src/data/sources/uk-tax-revenue.ts` — World Bank indicator GC.TAX.TOTL.CN. Cached 24h. Caveat: World Bank "Tax revenue (current LCU)" excludes social contributions / NICs (narrower than HMRC's "tax + NICs receipts" used in the static fallback).
- `src/data/sources/us-median-salary.ts` — BLS series LEU0252881500 (median weekly × 52). Prefers annual (`period: "Q05"`), falls back to most recent quarterly. BLS v1 unauthenticated, 25 query/day per IP.
- `src/data/sources/ai-training-cost.ts` — Epoch AI's "Notable AI Models" CSV. Filters frontier rows with numeric training cost, picks most recent by publication date. Cached 24h.
- `public/data/nhs-england-budget.json` — bundled sample. See `.env.example`.

### Per-capita framing

`UK_POPULATION` (in `nhs-budget.ts`) — ONS mid-year. Rendered as "£X = £Y per UK person." Always shown; no URL state.

### Scenario primitives

- `src/lib/scenario.ts` — typed `ScenarioLine` (programme/tax/borrow); `evaluateLine` reuses lever data; `evaluateScenario` sums positive (freed) and negative (required) deltas separately. URL serialization: `p:state-pension:-3,t:basic-rate-income-tax:1,b:20000000000` — `<type>:<id>:<magnitude>`. Invalid lines silently dropped. Also exports `projectScenarioOverYears` (year-by-year net), `projectScenarioWithGEFeedback` (Scope C macro loop), `projectScenarioTieredOverYears` (per-year static / dynamic / macro / GE for the year-aware bridge), `evaluateScenarioBand` + `evaluateScenarioBandContributions` (Monte Carlo + per-lever variance share).
- `src/lib/saved-scenarios.ts` — localStorage list. `listSavedScenarios()` / `saveScenario` / `deleteSavedScenario`. Capped at 20. Surfaced inside the report's compare picker + side-by-side compare modal.
- `src/lib/counterfactual.ts` — `evaluateCounterfactual(cf)` produces `{ deltaGbp, isRevenue, methodology, … }`. `comparisonsCovered` ranks Top-tagged items by count, filters `count >= 1`.
- `src/lib/scenario-narrative.ts` — `composeScenarioNarrative()` produces the plain-English one-liner shown in the TopZone (action sentence + microsim or decile distributional sentence).
- `src/lib/scenario-signature.ts` — `computeScenarioSignature()` returns the five-axis fingerprint (tax / spend / borrow / progressive / long-run) shown in the TopZone radar and the OG card.
- `src/lib/year-focus.tsx` — `<YearFocusProvider>` + `useYearFocus()`. Two-tier state: `lockedYear` (scrubber) + `hoveredYear` (chart hover); effective `year = hovered ?? locked`. All year-aware charts read this.
- `src/lib/use-animated-values.ts` — `useAnimatedValues` (rAF-driven array morphing for SVG paths) and `useAnimatedPerLineValues` (keyed-by-id variant for stacked-area charts where line identity matters across set changes).
- `src/lib/use-scroll-spy.ts` — IntersectionObserver-driven active-section tracker for `<TabSubNav>`.

### Tax lever shapes

Discriminated by `unit`:

- **`unit: "pp"`** — rate-change (basic IT, higher IT, additional IT, VAT, NICs, corp tax). Magnitude is pp; `gbpPerUnit` is HMRC's first-year revenue per pp. Carries `currentRate`.
- **`unit: "yr"`** — threshold-freeze (PA, HRT, ART). Magnitude is years; `gbpPerUnit` is steady-state per year of freeze.
- **`unit: "k"`** — threshold-change (raise PA / HRT / ART). Magnitude is £k; positive = raise (a tax cut). `gbpPerUnit` is **negative** since raising loses revenue. Sign-inverted vs others — documented in methodology.
- **`unit: "bn"`** — catch-all `tax-other`. Magnitude is £bn; `gbpPerUnit = 1bn`. Use sparingly.
- Also `"p-per-litre"` for fuel duty.

Same arithmetic across all (`gbpPerUnit × magnitude`); `describeTaxChange(lever, magnitude)` in `scenario.ts` produces the right verb per unit.

### Programme cuttability cap

Each `SpendingProgramme` carries an optional `cuttableFraction` — share realistically cuttable in a single budget. Defaults to 1.0.

Examples: state pension 0.05, net debt interest 0.0, defence 0.20, local-govt grants 0.05, international aid 0.5.

`describeCut` returns `exceedsCuttable: boolean`. UI renders amber warning above cap (doesn't block — calculator's job is to make trade-offs visible).

### Trade-off engine + lever data

- `src/data/levers/tax-rates.ts` — HMRC ready-reckoner (`TAX_LEVERS`). Includes rate, threshold-freeze, threshold-raise, commodity, payroll, windfall, asset-tax, and catch-all levers. Source: HMRC "Direct effects of illustrative tax changes" Jan 2024; IFS for fiscal-drag; HMRC corp tax stats for bank surcharge.
- `src/data/levers/uk-spending.ts` — `UK_SPENDING_PROGRAMMES`. Source: HMT PESA 2024.
- `src/data/levers/borrowing.ts` — 30-year gilt yield, UK GDP, current debt level.
- `src/lib/trade-off.ts` — `Allocation = { tax, borrow, cut }` in £. `adjustLever`, `rescale`, `describeTax` / `describeBorrow` / `describeCut`. 11 unit tests.

The `COMPARISONS` catalog doubles as the menu of preset funding targets.

### Annotated budgets

- `src/data/budgets/annotated.ts` — `ANNOTATED_BUDGETS`, **16 entries** June 2010 → March 2026, newest-first. Six chancellors (Osborne ×2, Hammond ×2, Sunak ×4, Kwarteng ×1, Hunt ×4, Reeves ×3); three parties. Anchors: Emergency Budget 2010, Budget 2021 (freeze era origin), Mini-budget 2022, Autumn Budget 2024. Each entry: `chancellor`, `party`, `shortDescription`, `notes`, `source`, `caveats`.
- `src/components/simulator/templates-drawer.tsx` — slide-in panel inside the wizard listing the 16 budgets with party-coloured pills, notes, and a "Replay" button. Loading over a non-empty scenario opens `<ScenarioDiffModal>`. Drawer state persists in URL via `?drawer=templates`.
- "Replay" pushes the budget's serialised scenario into the wizard's URL state (`?wiz=…&wstep=5`); `useWizardState()` re-derives `committedScenario` from the URL and re-mounts step 6 against the new lines. Saved-scenarios + annotated budgets also surface inside the report via the compare picker on the trajectory tab and the side-by-side compare modal in the action bar.
- `src/app/AnnotatedBudgetsPanel.tsx` — old list-style component, no longer imported anywhere. Dead code; safe to delete in a future cleanup pass.

**Authoring**: encode major fiscal levers as scenario lines (closest available; document substitutions in `caveats`); order by magnitude descending; verify against Treasury Red Book + OBR.

**Placeholder entries**: `placeholder: true` renders disabled with "Awaiting authoring" badge.

### International comparison panel

OECD Health at a Glance — 8 peers + OECD average; columns: % GDP on health, $ per capita PPP, life expectancy, treatable mortality, physicians, beds, nurses, cancer survival.

- `src/data/international/health-spending.ts` — `COUNTRY_HEALTH`. **Critical caveat**: spending is total (public + private), broader than NHS England. Per-country methodology covers measurement boundaries. `applyCountryHealthOverride()` overlays live values; `loadResolvedCountries()` is the **server-side entry point**, calling all sources in parallel.
- `src/data/sources/world-bank-health.ts` — three indicators in parallel: `SH.XPD.CHEX.GD.ZS`, `SH.XPD.CHEX.PP.CD`, `SP.DYN.LE00.IN`. Multi-country batch syntax (`country/GBR;USA;DEU;...`). Cached 24h.
- `src/data/sources/oecd-treatable-mortality.ts` — OECD SDMX-CSV. Dataflow `OECD.ELS.HD,DSD_HEALTH_STAT@DF_AM,1.0`, measure `TRTM` at `DT_10P5HB`.
- `src/data/sources/oecd-physicians.ts` — `OECD.ELS.HD,DSD_HEALTH_EMP_REAC@DF_PHYS,1.0`, key `HSE.10P3HB.PHYS.P`.
- `src/data/sources/oecd-hospital-beds.ts` — `DSD_HEALTH_REAC_HOSP@DF_BEDS_SECT`, measure `HB` at `10P3HB`. Two parallel queries: `OWNERSHIP_TYPE=_T` (preferred) and `=P` (public-only fallback). UK reports only public; Australia doesn't report at all.
- `src/data/sources/oecd-nurses.ts` — `DSD_HEALTH_REAC_EMP@DF_NURSE`, key `HSE.10P3HB.MINU.P` (MINU = midwives + nurses + assistants).
- `src/data/sources/oecd-cancer-survival.ts` — `DSD_HCQO@DF_CC`, measure `CCBRNTSR`. Lags ~5 years.
- **OECD rate limiting**: rate-limits aggressively (HTTP 429). With 24h `revalidate` deployments stay well under limits; dev cache invalidations expect intermittent 429s — source returns `null` cleanly. Both OECD sources require explicit `Accept: application/vnd.sdmx.data+csv;version=1.0`.
- `src/app/InternationalPanel.tsx` — sortable, UK highlighted, methodology popover per country, provenance badge "(N of M live)".
- Static fallback only: OECD-average row.

### Personal tax burden

- `src/lib/tax.ts` — UK IT + employee NIC bands (FY24/25, frozen for 25/26). Personal-allowance taper above £100k. Pure functions; 15 tests.
- `nhsShareOfTax(totalTax)` — flat ~18% factor (NHS England / total HMRC receipts). Approximation.
- `src/app/PersonalTaxBurden.tsx` — salary input → tax breakdown + NHS share + time framing. Default £35k.

### Methodology popovers

Product principle: "lead with the headline, expose assumptions on demand." Every figure has a substantive `Methodology` object.

- `src/lib/methodology.ts` — `Methodology` type: `measure`, `alternatives[]`, `range`, `caveat`, `source`.
- `src/components/ui/methodology-popover.tsx` — trigger + portalled popover.
- **Methodologies live next to data**:
  - `TaxLever.methodology` in `src/data/levers/tax-rates.ts`
  - `SpendingProgramme.methodology` in `src/data/levers/uk-spending.ts`
  - `BudgetSlice.methodology` in `src/data/nhs-budget.ts`
  - `BORROWING.methodology` in `src/data/levers/borrowing.ts`
- `src/data/methodologies.ts` — orphan methodologies (`UK_POPULATION_METHODOLOGY`, `NHS_TAX_SHARE_METHODOLOGY`).
- `src/data/methodology-coverage.test.ts` — CI gate: every row in major data files must have substantive methodology (a thin `{ source, asOf, measure }` doesn't qualify).

When writing: `measure` says exactly what's in the number. `alternatives` make framing visible. `caveat` calls out the thing a domain expert would object to first.

### Provenance and freshness

- `src/components/ui/provenance-badge.tsx` — `live`/`static` chip with tooltip.
- `src/data/comparisons.test.ts` — freshness gate. Static (non-dynamic, non-historical) entries must have `asOf` within 24 months. Enforces unique ids + well-formed `asOf` + every `dynamic.sourceId` exists in `DYNAMIC_COST_SOURCES`.
- `src/lib/currency.ts` — `Currency`, `toGBP`/`fromGBP`, `FALLBACK_USD_PER_GBP`. **Costs in `comparisons.ts` stay in native currency**; convert at the boundary.
- `src/lib/fx.ts` — `getUsdPerGbp()` server-side fetcher with per-hour `revalidate`. **Server contexts only**; client receives rate as prop.

### URL state

The wizard owns its own URL namespace via `useWizardState()` (`src/lib/wizard-state.ts`): `?wstep=&wgoal=&wera=&wmode=&wiz=…`. The legacy simulator namespace is kept around purely as a *decoder* for old share-links, which `src/app/page.tsx` reads server-side and feeds to the wizard as initial state (landing at step 6).

- `src/lib/url-state.ts` — server-side resolvers:
  - `resolveState(...)` — comparison calculator. Returns `{ option, quantity, amount, slice }`.
  - `resolveSimulatorState(...)` — **legacy simulator decoder**. Reads unified `?scenario=&editor=…&g=&gq=&ga=`; falls back to legacy `?to_*=` (trade-off) or `?cf_*=` (counterfactual) and converts via `allocationToScenario` / `counterfactualToScenario` in `src/lib/scenario.ts`. Returns `{ scenario, editor, goalId, goalQuantity, customAmount }`. Used by `page.tsx` to convert old share-links into wizard initial state.
  - `tradeOffPropsFromSimulator` / `counterfactualPropsFromSimulator` — derive editor-shaped props (legacy OG routes only).
  - Legacy resolvers (`resolveTradeOffState`, `resolveCounterfactualState`) still exported for legacy OG routes.
- `src/lib/url-write.ts` — **client-friendly** URL helpers (zero data imports). `buildUrl`, `SCENARIO_PARAMS`, `SIMULATOR_OWNED_PARAMS`, legacy `TRADE_OFF_PARAMS` / `COUNTERFACTUAL_PARAMS` for back-compat decode, `EditorMode = "triptych" | "single" | "stack"`.
- **Legacy share-links keep working** — `resolveSimulatorState` decodes both forms. Trade-off (`?to_goal=hs2-mile&to_split=33,33,34`) → 3-line scenario; counterfactual (`?cf_mode=tax&cf_pp=2`) → 1-line. Both land at the wizard's step 6 pre-populated. 38 round-trip fixtures in `url-state.test.ts`.

### OG cards

- `src/app/og/route.tsx` — comparison-mode 1200×630. Reads `id`/`q`/`a`/`slice`.
- `src/app/og/scenario/route.tsx` — **canonical scenario OG**. Reads `?scenario=` (or wizard `?wiz=` via `resolveReportScenario`); net £ headline + top 4 lines + top 3 comparisons + scenario signature radar.
- `src/app/og/trade-off/route.tsx` and `src/app/og/counterfactual/route.tsx` — **legacy**, kept for back-compat. Safe to delete after deprecation window.
- `src/app/page.tsx` `generateMetadata` reads `resolveReportScenario(params, comparisons)` and points the OG image at `/og/scenario`. Comparison-only shares (`?id=…/?q=…/?a=…/?slice=…`) point at `/og`.

### NHS calculator client component

- `src/app/NHSSpendingCalculator.tsx` — accepts `initialAmount`, `initialOptionId`, `initialQuantity`, `initialUsdPerGbp` props. Internal `amount` state is **always GBP**; `displayAmount = fromGBP(amount, currency, usdPerGbp)`. Client does **not** fetch FX — server passes it via prop so OG/initial paint/calculator agree.
- `src/components/ui/currency-toggle.tsx` — `role="group"`, `aria-pressed`. Used twice with different positioning classes.
- Headline animates via `AnimatedNumber` (framer-motion spring); currency symbol is sibling so spring runs on digits only.
- URL sync: 250ms-debounced effect writes `?id=&q=` or `?a=` via `router.replace` (preserves unrelated params).
- Amount input: `editingAmount: string | null` is the focused-edit mirror — raw digits while focused (cursor stable), `toLocaleString()` on blur.
- `formatMoney` / `formatTime` in `src/app/utils/formatters.ts`.

`public/og-fallback.jpeg` — previous static OG card preserved out of `app/`; not currently referenced.

UI primitives in `src/components/ui/` (shadcn/ui "new-york", neutral). `framer-motion` for funded-items list; `react-icons` for podcast brand icons. Path alias `@/*` → `src/*`.

## Conventions

- TypeScript strict; tabs for indentation.
- Tailwind via `tailwind.config.ts` + `src/app/globals.css`; merge classes with `cn` from `src/lib/utils.ts`.
- Comparison costs stored in `nativeCurrency` — never pre-convert. Update `asOf` when changing values. Refresh `NHS_BUDGET.value` each fiscal year alongside `asOf` and `source`.
- Tests live next to subjects as `*.test.ts`. Vitest config wires `@/*` alias. Pure-function tests only — no jsdom/component tests.

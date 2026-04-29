// Macro feedback (Scope A): per-lever fiscal multiplier × tax-to-GDP ratio
// gives the revenue feedback from the demand-side response to a fiscal move.
//
// Why this matters:
//   The static yield (HMRC ready-reckoner) and dynamic yield (behavioural-
//   adjusted) both ignore the demand-side feedback: a £6bn tax raise pulls
//   £6bn out of the household sector, which reduces consumption + investment,
//   which reduces GDP, which reduces the tax base, which partially offsets
//   the original £6bn raise. The same loop runs in reverse for cuts.
//
//   OBR's full models capture this via dynamic scoring with macro-feedback
//   adjustment. We capture it (Scope A) via a single linear coefficient per
//   lever — the published OBR/IFS fiscal multiplier.
//
// Math (Scope A — linear approximation):
//   firstRoundDelta = static or dynamic-adjusted £
//   gdpImpact       = -firstRoundDelta × multiplier  (sign: revenue raised
//                                                     contracts demand)
//   revenueFeedback = gdpImpact × TAX_TO_GDP_RATIO
//   secondRoundDelta = firstRoundDelta + revenueFeedback
//                    = firstRoundDelta × (1 - multiplier × TAX_TO_GDP_RATIO)
//
// Scope B (planned): replace the linear coefficient with a small VAR or
//   accounting-identity model that tracks GDP, CPI, and gilt yields
//   endogenously. Scope C: integrate with NIESR / BoE MAPS / a small DSGE.

// Path shape encodes the multi-year impulse response. Each shape multiplies
// the lever's `coefficient` to give year-by-year multipliers across the
// 5-year horizon.
//
// Standard OBR/IFS shapes:
//   - "fade":     peak year 1, fades quickly. Most rate-style taxes.
//   - "hump":     peak year 2, longer tail. Some spending programmes.
//   - "investment": peak year 2-3, persistent. Capital spending (transport,
//                 NHS capital).
//   - "spike":    sharp year-1 effect, almost nothing later. VAT.
//   - "transfer": flat-ish across years. Welfare, pensions.
//   - "flat":     coefficient applies every year (legacy / Scope A).
//
// Sources: OBR EFO macro chapters; IFS Green Budget (annual); HMT TIE.
export type PathShape =
	| "fade"
	| "hump"
	| "investment"
	| "spike"
	| "transfer"
	| "flat";

const PATH_PROFILES: Record<PathShape, readonly number[]> = {
	fade: [1.0, 0.7, 0.5, 0.3, 0.15],
	hump: [0.8, 1.0, 0.7, 0.4, 0.2],
	investment: [0.6, 1.0, 1.1, 0.9, 0.6],
	spike: [1.0, 0.3, 0.1, 0.05, 0.02],
	transfer: [1.0, 0.9, 0.7, 0.5, 0.3],
	flat: [1.0, 1.0, 1.0, 1.0, 1.0],
};

export interface MultiplierSplit {
	// Capital expenditure multiplier (HS2-style projects, building works).
	// Typically higher than current spending in slack regimes — Blanchard
	// 2013 finds capital multipliers near 1.0+ at the ZLB.
	capital: number;
	// Current expenditure multiplier (wages, operations, supplies).
	// Typically lower than capital because consumer-facing spending leaks
	// to imports faster and is less tied to multi-year build-up profiles.
	current: number;
	// Fraction of the programme that is capital (0-1). HMT PESA's
	// resource/capital split is the source. Transport ~30% capital, NHS
	// ~5%, defence ~25%.
	capitalShare: number;
}

export interface FiscalMultiplier {
	// Peak GDP impact per £ of fiscal stance change. The shape determines how
	// this evolves over the 5-year horizon.
	// Typical range: 0.1 (asset taxes, very narrow base) → 1.0+ (capital
	// spending, working-age welfare). Calibrated to OBR EFO supplementary
	// documents and IFS Green Budget estimates.
	coefficient: number;
	// Optional capital/current decomposition. When present, the effective
	// coefficient used by the macro evaluator becomes the blended
	// `capital × capitalShare + current × (1 - capitalShare)` instead of
	// the static coefficient. Useful for surfacing why a programme has
	// the multiplier it does (transport's ~0.8 is mostly current-spending
	// with a thin capital amplifier on top).
	multiplierSplit?: MultiplierSplit;
	// Path shape over years. Default "flat" preserves Scope A behaviour for
	// legacy callers; modern levers should pick a shape from the catalog.
	pathShape?: PathShape;
	// Year-1 CPI passthrough as a fraction of the £ fiscal stance change
	// scaled by total nominal GDP. VAT is highest (~0.85 — direct price
	// effect on consumer goods); fuel duty around 0.5; income measures
	// have no direct CPI effect (default 0). Used to compute the inflation
	// channel of macro feedback.
	//
	// Convention: positive cpiPassthrough means a revenue raise pushes CPI up
	// (a tax-rise inflation effect). Spending changes can also affect CPI via
	// demand pressure but that's captured indirectly through GDP; we only
	// model the direct pass-through here.
	cpiPassthrough?: number;
	note: string;
	source?: { url: string; label: string };
}

// Effective coefficient — split-aware. When a multiplierSplit is provided,
// returns the blended capital + current value. Otherwise the static
// coefficient. Pure helper used by multiplierAtYear and any consumer that
// wants to render "why does this programme have this multiplier?"
export const effectiveCoefficient = (m: FiscalMultiplier): number => {
	if (m.multiplierSplit) {
		const { capital, current, capitalShare } = m.multiplierSplit;
		return capital * capitalShare + current * (1 - capitalShare);
	}
	return m.coefficient;
};

// Year-N multiplier value (1-indexed; year 1 = announcement year).
// For year > path length, uses the last value (assumes the multiplier
// stabilises after the path).
export const multiplierAtYear = (
	m: FiscalMultiplier | undefined,
	year: number,
): number => {
	if (!m) return 0;
	const profile = PATH_PROFILES[m.pathShape ?? "flat"];
	const idx = Math.max(0, Math.min(profile.length - 1, year - 1));
	return effectiveCoefficient(m) * (profile[idx] ?? 0);
};

// UK total managed expenditure / GDP ratio. Used as the conversion factor
// from GDP impact to revenue feedback. ~38% per OBR Mar 2025 EFO baseline.
export const TAX_TO_GDP_RATIO = 0.38;

// UK nominal GDP (latest baseline year, £). Used to scale £ fiscal moves
// to GDP-share terms.
export const UK_GDP_BASE = 2_550_000_000_000;

// Sensitivity of long-run gilt yields to debt:GDP ratio changes, per OBR
// fiscal-risk analysis. Each 1pp rise in debt:GDP adds ~5bp to long-rate
// yields in the long run; in practice the relationship is non-linear and
// global-rate-environment-dependent. Linear approximation for Scope B.
export const GILT_YIELD_PER_DEBT_GDP_PP = 0.0005; // 5bp per 1pp debt:GDP

// Reduced-form monetary reaction function used by the scenario macro path.
// Units are percentage-point Bank Rate response per percentage-point CPI or
// GDP deviation. The response is deliberately partial and smoothed because MPC
// decisions are forward-looking and do not mechanically offset fiscal shocks.
export const BANK_RATE_RESPONSE_TO_CPI_PP = 0.45;
export const BANK_RATE_RESPONSE_TO_GDP_PCT = 0.25;
export const BANK_RATE_RESPONSE_SMOOTHING = 0.55;
export const BANK_RATE_DEVIATION_FLOOR_PP = -1.5;
export const BANK_RATE_DEVIATION_CEILING_PP = 2.5;

// CPI amplification factor on frozen-threshold revenue. A 1pp CPI uplift
// pulls more earners across nominal-frozen thresholds, raising revenue by
// roughly this fraction of base yield per pp of CPI. Calibrated to the
// 2021-23 freeze experience: 4–6pp inflation uplift drove ~30% extra
// year-N freeze revenue.
export const FREEZE_DRAG_AMPLIFICATION_PER_CPI_PP = 0.05;

// Compute the revenue feedback (signed) from a first-round delta + a
// fiscal multiplier. Returns 0 when no multiplier is provided.
//
// Sign convention: positive firstRoundDelta = revenue freed = fiscal
// contraction = GDP falls = revenue feedback is negative (further offsets
// the original raise).
//
// `year` (1-indexed, default 1) selects which year of the multiplier path
// to apply. Scope A callers can omit `year` to use the year-1 (peak) value.
export const macroFeedback = (
	firstRoundDelta: number,
	multiplier: FiscalMultiplier | undefined,
	year = 1,
): number => {
	if (!multiplier) return 0;
	const m = multiplierAtYear(multiplier, year);
	return -firstRoundDelta * m * TAX_TO_GDP_RATIO;
};

// Add macro feedback to a first-round delta to get second-round (post-
// feedback) yield. Capped to sign-preserving (no flips) at extreme
// multipliers — defensive, the linear model breaks down anyway at very
// high coefficients.
export const secondRoundDelta = (
	firstRoundDelta: number,
	multiplier: FiscalMultiplier | undefined,
	year = 1,
): number => {
	const feedback = macroFeedback(firstRoundDelta, multiplier, year);
	const result = firstRoundDelta + feedback;
	// Sign preservation: if feedback flips the sign of the result, clamp.
	if (Math.sign(result) !== Math.sign(firstRoundDelta) && firstRoundDelta !== 0) {
		return 0;
	}
	return result;
};

// Useful for the UI: the £ haircut/boost from macro feedback as a fraction
// of the first-round delta at year N. Returns 0 when no multiplier.
export const macroFeedbackFraction = (
	multiplier: FiscalMultiplier | undefined,
	year = 1,
): number => {
	if (!multiplier) return 0;
	return multiplierAtYear(multiplier, year) * TAX_TO_GDP_RATIO;
};

// ---------------------------------------------------------------------------
// Per-lever multipliers — central calibration table.
//
// Sources: OBR EFO supplementary documents (multiplier discussion in macro
// chapters), IFS Green Budget Chapter 1 (annual), HMT Green Book Annex A2.
// Where OBR/IFS publish a range, we take the central estimate.
//
// Calibration philosophy:
//   - Tax measures: lower multipliers than spending (less direct demand
//     effect; partly offset by saving)
//   - Asset taxes (CGT, IHT): very low (narrow base, low MPC)
//   - VAT: highest among taxes (direct on consumption)
//   - Spending on transfers (UC, state pension): high (close to 1 — high
//     MPC of recipients)
//   - Capital spending (transport, NHS capital): high (multiplier > 1
//     possible)
//   - International aid: 0 (no UK GDP impact)
//
// Updated: 2025-Q1 against OBR Mar 2025 EFO. Re-check annually.
// ---------------------------------------------------------------------------

const OBR_SOURCE = {
	url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
	label: "OBR EFO Mar 2025 + IFS Green Budget",
};

export const TAX_MULTIPLIERS: Readonly<Record<string, FiscalMultiplier>> = {
	"basic-rate-income-tax": {
		coefficient: 0.5,
		pathShape: "fade",
		note: "Basic-rate earners have moderate-to-high marginal propensity to consume; rate change has a meaningful demand effect that fades as households adjust over 2-3 years.",
		source: OBR_SOURCE,
	},
	"higher-rate-income-tax": {
		coefficient: 0.4,
		pathShape: "fade",
		note: "Higher-rate earners save more of marginal income; demand effect is smaller per £ raised.",
		source: OBR_SOURCE,
	},
	"additional-rate-income-tax": {
		coefficient: 0.3,
		pathShape: "fade",
		note: "Top earners have the lowest marginal propensity to consume; demand effect is muted.",
		source: OBR_SOURCE,
	},
	"dividend-tax": {
		coefficient: 0.2,
		pathShape: "fade",
		note: "Dividend income is concentrated among savers and asset-holders; demand effect is small.",
		source: OBR_SOURCE,
	},
	"vat-standard": {
		coefficient: 0.7,
		pathShape: "spike",
		cpiPassthrough: 0.85,
		note: "VAT is a direct consumption tax; demand effect spikes in year 1 (immediate price effect on household spending) then fades sharply as relative prices stabilise. CPI passthrough is highest of any UK lever — Howe 1979 (8→15%) added ~4pp to inflation that year.",
		source: OBR_SOURCE,
	},
	"nics-main": {
		coefficient: 0.5,
		pathShape: "fade",
		note: "Similar profile to basic-rate IT — affects employed earnings with moderate-to-high MPC.",
		source: OBR_SOURCE,
	},
	"employer-nics-main": {
		coefficient: 0.4,
		pathShape: "hump",
		note: "Economic incidence on workers via wages — but with a lag as wage adjustments take 1-2 years. Multiplier peaks year 2.",
		source: OBR_SOURCE,
	},
	"employer-nics-secondary-threshold": {
		coefficient: 0.5,
		pathShape: "hump",
		note: "Threshold drops bring low-paid jobs into NICs; affected workers have higher MPC. Same lagged-wage dynamic as the rate.",
		source: OBR_SOURCE,
	},
	"corporation-tax": {
		coefficient: 0.2,
		pathShape: "hump",
		note: "Slow flow-through to demand: incidence partly on capital owners (low MPC) and partly on workers via wages over time. Effect peaks year 2-3.",
		source: OBR_SOURCE,
	},
	"capital-gains-tax": {
		coefficient: 0.1,
		pathShape: "fade",
		note: "Very narrow base (concentrated top decile); realisations highly elastic to rate changes. Low aggregate demand effect.",
		source: OBR_SOURCE,
	},
	"inheritance-tax": {
		coefficient: 0.1,
		pathShape: "fade",
		note: "Asset-holders with very low MPC; transfer doesn't immediately affect consumption.",
		source: OBR_SOURCE,
	},
	"stamp-duty": {
		coefficient: 0.5,
		pathShape: "spike",
		note: "Direct effect on housing transactions in year 1 (transactions surge or collapse). Effect fades quickly as the housing market re-equilibrates.",
		source: OBR_SOURCE,
	},
	"fuel-duty": {
		coefficient: 0.6,
		pathShape: "spike",
		cpiPassthrough: 0.55,
		note: "Direct consumption tax on a near-essential good. Year-1 spike via immediate price pass-through; effect fades as households adjust. Substantial CPI passthrough (fuel is a transport-sector input affecting most retail prices).",
		source: OBR_SOURCE,
	},
	"bank-surcharge": {
		coefficient: 0.2,
		pathShape: "hump",
		note: "Falls on bank profits and capital owners; modest pass-through to wages and customers with lag.",
		source: OBR_SOURCE,
	},
	"energy-profits-levy": {
		coefficient: 0.2,
		pathShape: "fade",
		cpiPassthrough: 0.25,
		note: "Falls on oil & gas profits; partly capital-owner incidence + partly consumer via energy prices. Moderate CPI passthrough — energy companies pass some of the levy through retail energy bills.",
		source: OBR_SOURCE,
	},
	"apprenticeship-levy": {
		coefficient: 0.4,
		pathShape: "hump",
		note: "Falls on large employers' payrolls; pass-through to wages with lag.",
		source: OBR_SOURCE,
	},
	"raise-personal-allowance": {
		coefficient: 0.5,
		pathShape: "fade",
		note: "Same incidence as basic-rate IT.",
		source: OBR_SOURCE,
	},
	"raise-higher-rate-threshold": {
		coefficient: 0.4,
		pathShape: "fade",
		note: "Same incidence as higher-rate IT.",
		source: OBR_SOURCE,
	},
	"raise-additional-rate-threshold": {
		coefficient: 0.3,
		pathShape: "fade",
		note: "Same incidence as additional-rate IT.",
		source: OBR_SOURCE,
	},
	"freeze-personal-allowance": {
		coefficient: 0.5,
		pathShape: "fade",
		note: "Fiscal drag pulls in basic-rate earners — same demand profile.",
		source: OBR_SOURCE,
	},
	"freeze-higher-rate-threshold": {
		coefficient: 0.4,
		pathShape: "fade",
		note: "Fiscal drag at the higher-rate threshold — same demand profile.",
		source: OBR_SOURCE,
	},
	"freeze-additional-rate-threshold": {
		coefficient: 0.3,
		pathShape: "fade",
		note: "Fiscal drag at the additional-rate threshold — same demand profile.",
		source: OBR_SOURCE,
	},
	"dividend-allowance": {
		coefficient: 0.2,
		pathShape: "fade",
		note: "Same incidence as dividend tax rate.",
		source: OBR_SOURCE,
	},
	"tax-other": {
		coefficient: 0.4,
		pathShape: "fade",
		note: "Catch-all; assumes a typical mixed-tax multiplier. Use a more specific lever where possible.",
		source: OBR_SOURCE,
	},
};

export const PROGRAMME_MULTIPLIERS: Readonly<Record<string, FiscalMultiplier>> = {
	"state-pension": {
		coefficient: 0.6,
		pathShape: "transfer",
		note: "Pensioners spend a high proportion of pension income; effect is fairly persistent across years.",
		source: OBR_SOURCE,
	},
	"working-age-welfare": {
		coefficient: 0.9,
		pathShape: "transfer",
		note: "Highest multiplier in the system: UC + disability + housing recipients have the highest MPC and spend almost all income on UK consumption. Effect persistent.",
		source: OBR_SOURCE,
	},
	"nhs-england": {
		coefficient: 0.6,
		pathShape: "hump",
		multiplierSplit: {
			// Capital component (hospital builds, equipment) ~5% of NHS
			// budget; long lag but high domestic content.
			capital: 1.0,
			current: 0.58,
			capitalShare: 0.05,
		},
		note: "Mostly wages + UK suppliers; capital component takes longer to flow through (peaks year 2). Imports of medical equipment dampen.",
		source: OBR_SOURCE,
	},
	education: {
		coefficient: 0.7,
		pathShape: "transfer",
		multiplierSplit: {
			// School builds + further-education equipment ~10% of DfE
			// budget (capital DEL). High domestic content but build-up lag.
			capital: 0.9,
			current: 0.68,
			capitalShare: 0.1,
		},
		note: "Largely wages (teachers + support staff); high domestic content; effect persistent.",
		source: OBR_SOURCE,
	},
	defence: {
		coefficient: 0.5,
		pathShape: "investment",
		multiplierSplit: {
			// Defence procurement (ships, aircraft, weapons) ~25% of
			// defence budget; high lag, mixed UK/import content.
			capital: 0.8,
			current: 0.4,
			capitalShare: 0.25,
		},
		note: "Mix of UK personnel + capital projects (ships, aircraft) that take 2-3 years to flow through to GDP.",
		source: OBR_SOURCE,
	},
	"police-justice": {
		coefficient: 0.7,
		pathShape: "transfer",
		note: "Almost entirely UK wages with very low import content; high persistent multiplier.",
		source: OBR_SOURCE,
	},
	"local-govt-grants": {
		coefficient: 0.8,
		pathShape: "transfer",
		multiplierSplit: {
			// Council capital DEL (social housing, road maintenance,
			// schools transferred to LAs) ~10% of grant budget. Capital
			// component has higher multiplier in slack regimes; current
			// is high MPC front-line services.
			capital: 1.0,
			current: 0.78,
			capitalShare: 0.1,
		},
		note: "Front-line services (social care, environmental, libraries) — mostly UK wages and low-paid workers with high MPC.",
		source: OBR_SOURCE,
	},
	transport: {
		coefficient: 0.8,
		pathShape: "investment",
		multiplierSplit: {
			// Transport has the highest capital share among UK programmes
			// (~30% — HS2, road, rail subsidy build-out). Capital
			// multiplier in slack-economy ZLB regimes goes higher (the
			// classic Blanchard 2013 finding); this is the structural
			// reason 2010-era transport multipliers were amplified.
			capital: 1.1,
			current: 0.7,
			capitalShare: 0.3,
		},
		note: "Capital projects (rail, road) have build-up profile; multiplier peaks year 2-3 and persists.",
		source: OBR_SOURCE,
	},
	"international-aid": {
		coefficient: 0.0,
		pathShape: "flat",
		note: "Spending flows offshore; no measurable UK GDP impact. The classic 'leakage' line in macro modelling.",
		source: OBR_SOURCE,
	},
	"net-debt-interest": {
		coefficient: 0.1,
		pathShape: "flat",
		note: "Mostly transfers to gilt-holders (some domestic, some foreign); minor persistent demand effect.",
		source: OBR_SOURCE,
	},
};

export const getTaxMultiplier = (id: string): FiscalMultiplier | undefined =>
	TAX_MULTIPLIERS[id];

export const getProgrammeMultiplier = (
	id: string,
): FiscalMultiplier | undefined => PROGRAMME_MULTIPLIERS[id];

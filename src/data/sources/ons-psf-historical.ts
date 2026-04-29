import type { Source } from "./types";
import type { BaselineYear, OBRBaseline } from "@/data/baseline/obr-baseline";
import type { EraId } from "@/data/eras";

// Live override for the historical-era OUTTURN baselines. Pre-2010 ONS
// PSF revisions are infrequent but real (the ONS occasionally restates
// 1970s-90s series after methodology changes); 2010+ ONS PSF is updated
// monthly. The simulator should pick up restated outturns without code
// changes.
//
// Set ONS_PSF_HISTORICAL_URL to a stable JSON endpoint that returns a
// `Record<EraId, OBRBaseline>` shape — keys "1979", "1988", "2010",
// "2021" (current era doesn't carry an outturn, it's live). The expected
// host is the same pattern as OBR_BASELINE_DATA_URL: a small parser job
// ingests ONS PSF tables and publishes JSON to raw.githubusercontent.com,
// a CMS, or an S3 bucket.
//
// When unset (the default), the embedded static OUTTURN_xxxx baselines
// in `src/data/historical/era-baselines.ts` are used unchanged. The
// static figures are noted as "approximate" — fetching live ONS PSF is
// the path to precision.

// A partial year override: fiscalYear is required (it's the merge key);
// every other field is optional. Lets a real ONS PSF restatement that
// only adjusts 2014-15 transmit just that one year without re-sending
// the entire era.
export type PartialBaselineYear = { fiscalYear: string } & Partial<
	Omit<BaselineYear, "fiscalYear">
>;

// A partial era baseline override. Top-level fields are all optional —
// merge with static; years merge by fiscalYear.
export interface PartialEraBaseline {
	asOf?: string;
	source?: { url: string; label: string };
	years?: readonly PartialBaselineYear[];
	stabilityRuleHeadroom?: number;
	stabilityRuleAt?: string;
	investmentRuleHeadroom?: number;
}

export type HistoricalOverride = Partial<Record<EraId, PartialEraBaseline>>;

const isFiniteNumber = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

// Plausibility bounds: catches obvious data-entry errors and malicious
// payloads that pass type checks but produce nonsense (£999bn psnb /
// £1bn gdp would imply 99,900% psnbPctGdp). Values that genuinely fall
// outside these ranges would need the bounds widened — better to fail
// loudly than silently accept junk.
//
// Each bound is justified against the UK's historical record. To extend
// the wizard back to 1940s/wartime data, widen `psndPctGdpMax` (peak
// 1947 was ~270%, well within the current 300% cap; 1815 post-Napoleonic
// peak was ~260%). To extend forward (decades of nominal expansion),
// the GDP ceiling is set generous enough to absorb that.
//
// Bounds are exported so tests can construct validators with custom
// ranges for boundary-case probing without forking the validator code.
export interface PlausibilityBounds {
	psnbPctGdpMax: number;
	psndPctGdpMax: number;
	gdpFloor: number;
	gdpCeiling: number;
}

// Country-specific bound presets. The simulator is UK-focused so UK is
// the active default, but the factory pattern makes extension to other
// fiscal regimes mechanical: pass the relevant preset to
// createHistoricalOverrideValidator. Calibrations come from each
// country's IMF Historical Public Debt Database + post-war fiscal records.
export const UK_PLAUSIBILITY_BOUNDS: PlausibilityBounds = {
	// PSNB outside ±50% of GDP is implausible.
	//   - UK post-WWII record: ~14% (2009-10 financial crisis)
	//   - WWII peak: ~30% briefly (1944-45)
	//   - 50% leaves substantial buffer for hypothetical extreme scenarios
	//     while still rejecting obvious junk (£999bn / £1bn = 99,900%).
	psnbPctGdpMax: 50,
	// Debt:GDP outside 0-300% is implausible for the UK.
	//   - Modern range: 0-105% (1990s-present)
	//   - Post-WWII peak: 270% (1947)
	//   - Post-Napoleonic peak: 260% (1815)
	//   - 300% leaves headroom; 1940s wartime data would still fit.
	psndPctGdpMax: 300,
	// GDP floor: £50bn.
	//   - UK 1979 nominal GDP ≈ £200bn (well above floor)
	//   - UK 1950 ≈ £13bn (below floor — would need widening for 1950s)
	//   - £50bn captures the wizard's current historical range cleanly.
	gdpFloor: 50_000_000_000,
	// GDP ceiling: £100T.
	//   - UK 2024 nominal GDP ≈ £2.55T
	//   - At 5% nominal growth indefinitely, GDP would hit £100T around
	//     year ~75 (2099).  Generous buffer; rejects obvious junk.
	gdpCeiling: 100_000_000_000_000,
};

// Japan: high debt:GDP regime. ¥-denominated, ~240% modern (Q4 2024)
// largely held domestically. Different bounds than UK — wider debt:GDP
// ceiling, much higher gdp floor (¥500T = ~£2.7T modern).
export const JAPAN_PLAUSIBILITY_BOUNDS: PlausibilityBounds = {
	psnbPctGdpMax: 50, // Japan's deficits 2009-12 hit ~10% — UK-similar bound
	psndPctGdpMax: 350, // 1944 wartime peak ~200%; modern 240%; 350% buffer
	gdpFloor: 100_000_000_000_000, // ¥100T = ~£540bn (catches early 1980s)
	gdpCeiling: 100_000_000_000_000_000, // ¥100,000T at 5% growth horizon
};

// US: federal-level fiscal regime. $-denominated, debt:GDP modern ~130%,
// post-WWII peak 120%. Much larger nominal GDP than UK.
export const US_PLAUSIBILITY_BOUNDS: PlausibilityBounds = {
	psnbPctGdpMax: 50, // 2020 COVID spike ~15%; 50% same buffer
	psndPctGdpMax: 200, // post-WWII 120%, modern 130%; 200% generous
	gdpFloor: 1_000_000_000_000, // $1T (catches 1970s)
	gdpCeiling: 1_000_000_000_000_000, // $1Q
};

// Eurozone aggregate (or any individual member treated similarly):
// EU fiscal-rule constraints (3% deficit, 60% debt) shape modern range.
export const EUROZONE_PLAUSIBILITY_BOUNDS: PlausibilityBounds = {
	psnbPctGdpMax: 30, // Stability and Growth Pact 3% target; rule violations rare past 10%
	psndPctGdpMax: 200, // Greece debt-crisis peak 180%; 200% covers extreme cases
	gdpFloor: 100_000_000_000, // €100bn (covers individual smaller member states)
	gdpCeiling: 1_000_000_000_000_000, // €1Q aggregate over 75-year horizon
};

// Active default for this codebase. Re-exported under the original name
// for back-compat with existing call sites.
export const DEFAULT_PLAUSIBILITY_BOUNDS = UK_PLAUSIBILITY_BOUNDS;

// Country code → bounds preset map. Drives validator selection in the
// fetch path. Currently only "UK" is wired into the simulator's data
// layer, but the pattern is extensible: new country support is one
// entry here + a corresponding ERA_BASELINES set, no new code paths.
export type CountryCode = "UK" | "JAPAN" | "US" | "EUROZONE";

export const PLAUSIBILITY_BOUNDS_BY_COUNTRY: Record<
	CountryCode,
	PlausibilityBounds
> = {
	UK: UK_PLAUSIBILITY_BOUNDS,
	JAPAN: JAPAN_PLAUSIBILITY_BOUNDS,
	US: US_PLAUSIBILITY_BOUNDS,
	EUROZONE: EUROZONE_PLAUSIBILITY_BOUNDS,
};

// Factory: build a partial-year validator with custom plausibility
// bounds. The default factory call uses DEFAULT_PLAUSIBILITY_BOUNDS.
export const createPartialYearValidator =
	(bounds: PlausibilityBounds = DEFAULT_PLAUSIBILITY_BOUNDS) =>
	(v: unknown): v is PartialBaselineYear => {
		if (typeof v !== "object" || v === null) return false;
		const y = v as Record<string, unknown>;
		// fiscalYear is the only required field (merge key).
		if (typeof y.fiscalYear !== "string" || !/^\d{4}-\d{2}$/.test(y.fiscalYear))
			return false;
		// Other fields, if present, must be valid finite numbers.
		for (const k of [
			"psnb",
			"psnbPctGdp",
			"psnd",
			"psndPctGdp",
			"totalRevenue",
			"totalSpending",
			"gdp",
		] as const) {
			if (k in y && y[k] !== undefined && !isFiniteNumber(y[k])) return false;
		}
		// Some fields must be positive when present.
		for (const k of ["totalRevenue", "totalSpending", "gdp"] as const) {
			if (k in y && y[k] !== undefined && (y[k] as number) <= 0) return false;
		}
		// Plausibility bounds. Values outside these are rejected as junk —
		// catches £999bn psnb / £1bn gdp construction attacks and obvious
		// data-entry errors.
		if (
			y.psnbPctGdp !== undefined &&
			Math.abs(y.psnbPctGdp as number) > bounds.psnbPctGdpMax
		)
			return false;
		if (
			y.psndPctGdp !== undefined &&
			((y.psndPctGdp as number) < 0 ||
				(y.psndPctGdp as number) > bounds.psndPctGdpMax)
		)
			return false;
		if (y.gdp !== undefined) {
			const g = y.gdp as number;
			if (g < bounds.gdpFloor || g > bounds.gdpCeiling) return false;
		}
		return true;
	};

const isPartialYear = createPartialYearValidator();

const VALID_ERAS: readonly EraId[] = ["1979", "1988", "2010", "2021"];

// Factory: build a HistoricalOverride validator with custom plausibility
// bounds. Composes the partial-year validator (also factoried) and the
// per-era partial baseline validator. Default factory uses
// DEFAULT_PLAUSIBILITY_BOUNDS.
export const createHistoricalOverrideValidator = (
	bounds: PlausibilityBounds = DEFAULT_PLAUSIBILITY_BOUNDS,
) => {
	const partialYear = createPartialYearValidator(bounds);
	const partialEraBaseline = (v: unknown): v is PartialEraBaseline => {
		if (typeof v !== "object" || v === null) return false;
		const o = v as Record<string, unknown>;
		if (
			o.asOf !== undefined &&
			(typeof o.asOf !== "string" || !/^\d{4}-\d{2}$/.test(o.asOf))
		)
			return false;
		if (o.source !== undefined) {
			if (typeof o.source !== "object" || o.source === null) return false;
			const s = o.source as Record<string, unknown>;
			if (typeof s.url !== "string" || typeof s.label !== "string")
				return false;
		}
		if (o.years !== undefined) {
			if (!Array.isArray(o.years)) return false;
			if (!o.years.every(partialYear)) return false;
		}
		if (
			o.stabilityRuleHeadroom !== undefined &&
			!isFiniteNumber(o.stabilityRuleHeadroom)
		)
			return false;
		if (
			o.stabilityRuleAt !== undefined &&
			typeof o.stabilityRuleAt !== "string"
		)
			return false;
		if (
			o.investmentRuleHeadroom !== undefined &&
			!isFiniteNumber(o.investmentRuleHeadroom)
		)
			return false;
		return true;
	};
	return (v: unknown): v is HistoricalOverride => {
		if (typeof v !== "object" || v === null) return false;
		const o = v as Record<string, unknown>;
		for (const [k, val] of Object.entries(o)) {
			if (!VALID_ERAS.includes(k as EraId)) return false;
			if (val !== null && val !== undefined && !partialEraBaseline(val))
				return false;
		}
		return true;
	};
};

const isHistoricalOverride = createHistoricalOverrideValidator();

// Factory: build a Source<HistoricalOverride | null> for a specific
// country. Validator uses that country's plausibility bounds, so a
// junk payload tagged with UK GDP figures but routed to a Japan source
// would correctly fail validation.
//
// URL resolution (per-country, with fallback):
//   1. ONS_PSF_HISTORICAL_URL_{COUNTRY} (e.g. ONS_PSF_HISTORICAL_URL_JAPAN)
//   2. ONS_PSF_HISTORICAL_URL (generic — for single-country deploys)
// Lets a multi-country deployment route each country to its own JSON
// endpoint, while single-country deploys keep using the generic var.
export const createOnsPsfHistoricalSource = (
	country: CountryCode = "UK",
): Source<HistoricalOverride | null> => {
	const validate = createHistoricalOverrideValidator(
		PLAUSIBILITY_BOUNDS_BY_COUNTRY[country],
	);
	const resolveUrl = (): string | undefined =>
		process.env[`ONS_PSF_HISTORICAL_URL_${country}`] ??
		process.env.ONS_PSF_HISTORICAL_URL;
	return {
		fallback: null,
		fetch: async () => {
			const url = resolveUrl();
			if (!url) return null;
			try {
				const response = await fetch(url, { next: { revalidate: 86400 } });
				if (!response.ok) return null;
				const data = await response.json();
				return validate(data) ? data : null;
			} catch {
				return null;
			}
		},
	};
};

// Default export — UK source, preserves the existing call sites.
export const onsPsfHistoricalSource: Source<HistoricalOverride | null> =
	createOnsPsfHistoricalSource("UK");

// Overlay the historical override onto a static outturn baseline. Two
// resolution paths:
//   - Full replacement: the era override carries every required field,
//     including a complete years[] — return as-is. Backwards-compatible
//     with the previous behaviour.
//   - Per-year merge: when the override is partial (e.g. only updates
//     2014-15), merge by fiscalYear. Top-level fields override only when
//     present. Lets real ONS PSF restatements ship just the changed
//     years without re-transmitting the entire era's payload.
export const applyHistoricalOverride = (
	staticOutturn: OBRBaseline,
	era: EraId,
	override: HistoricalOverride | null,
): OBRBaseline => {
	if (!override) return staticOutturn;
	const eraOverride = override[era];
	if (!eraOverride) return staticOutturn;

	// Merge years by fiscalYear: each static year is replaced by its
	// override if one exists. Override years that don't match a static
	// year are appended (typical case: a future year not yet in the
	// static dataset).
	let mergedYears = staticOutturn.years;
	if (eraOverride.years && eraOverride.years.length > 0) {
		const overrideMap = new Map(
			eraOverride.years.map((y) => [y.fiscalYear, y]),
		);
		const matched = staticOutturn.years.map((staticYear) => {
			const partial = overrideMap.get(staticYear.fiscalYear);
			if (!partial) return staticYear;
			overrideMap.delete(staticYear.fiscalYear);
			const merged = { ...staticYear, ...partial };
			// Internal consistency: if the override revises psnb / psnd /
			// gdp but doesn't supply the corresponding %-of-GDP figure,
			// recompute it from the merged values. Stops a partial payload
			// from leaving psnb at the new value while psnbPctGdp still
			// reflects the old psnb.
			const psnbPctOverridden = partial.psnbPctGdp !== undefined;
			const psndPctOverridden = partial.psndPctGdp !== undefined;
			const psnbAffected =
				partial.psnb !== undefined || partial.gdp !== undefined;
			const psndAffected =
				partial.psnd !== undefined || partial.gdp !== undefined;
			if (psnbAffected && !psnbPctOverridden && merged.gdp > 0) {
				merged.psnbPctGdp = (merged.psnb / merged.gdp) * 100;
			}
			if (psndAffected && !psndPctOverridden && merged.gdp > 0) {
				merged.psndPctGdp = (merged.psnd / merged.gdp) * 100;
			}
			return merged;
		});
		const appended = Array.from(overrideMap.values()).map((partial) => ({
			// Defaults for any field the partial doesn't supply. Real
			// payloads should populate these — defaults stop the result
			// from being malformed if they don't.
			fiscalYear: partial.fiscalYear,
			psnb: partial.psnb ?? 0,
			psnbPctGdp: partial.psnbPctGdp ?? 0,
			psnd: partial.psnd ?? 0,
			psndPctGdp: partial.psndPctGdp ?? 0,
			totalRevenue: partial.totalRevenue ?? 1,
			totalSpending: partial.totalSpending ?? 1,
			gdp: partial.gdp ?? 1,
		}));
		mergedYears = [...matched, ...appended];
	}

	return {
		asOf: eraOverride.asOf ?? staticOutturn.asOf,
		source: eraOverride.source ?? staticOutturn.source,
		years: mergedYears,
		stabilityRuleHeadroom:
			eraOverride.stabilityRuleHeadroom ?? staticOutturn.stabilityRuleHeadroom,
		stabilityRuleAt:
			eraOverride.stabilityRuleAt ?? staticOutturn.stabilityRuleAt,
		investmentRuleHeadroom:
			eraOverride.investmentRuleHeadroom ?? staticOutturn.investmentRuleHeadroom,
	};
};

import type { Source } from "./types";
import type { BaselineYear, OBRBaseline } from "@/data/baseline/obr-baseline";

// Live override for the OBR baseline. Twice yearly, OBR publishes a fresh
// Economic and Fiscal Outlook (EFO); we want the simulator to pick up the
// new figures within 24h without code changes.
//
// The JSON shape mirrors OBRBaseline exactly. Set OBR_BASELINE_DATA_URL to
// a stable JSON endpoint (raw.githubusercontent.com, a CMS, or an S3 bucket
// updated by a small parser job that ingests the EFO supplementary tables
// after each publication).
//
// When unset (the default), the embedded static baseline in
// `src/data/baseline/obr-baseline.ts` is used unchanged. The static figures
// are anchored to the most recent EFO at the time the file was last edited.

export interface BaselineOverride {
	asOf: string; // YYYY-MM
	source: { url: string; label: string };
	years: BaselineYear[];
	stabilityRuleHeadroom: number; // £
	stabilityRuleAt: string; // fiscalYear
	investmentRuleHeadroom: number; // £
}

const isFiniteNumber = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);

const isYear = (v: unknown): v is BaselineYear => {
	if (typeof v !== "object" || v === null) return false;
	const y = v as Record<string, unknown>;
	if (typeof y.fiscalYear !== "string" || !/^\d{4}-\d{2}$/.test(y.fiscalYear))
		return false;
	if (!isFiniteNumber(y.psnb)) return false;
	if (!isFiniteNumber(y.psnbPctGdp)) return false;
	if (!isFiniteNumber(y.psnd)) return false;
	if (!isFiniteNumber(y.psndPctGdp)) return false;
	if (!isFiniteNumber(y.totalRevenue) || y.totalRevenue <= 0) return false;
	if (!isFiniteNumber(y.totalSpending) || y.totalSpending <= 0) return false;
	if (!isFiniteNumber(y.gdp) || y.gdp <= 0) return false;
	return true;
};

const isOverride = (v: unknown): v is BaselineOverride => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	if (typeof o.asOf !== "string" || !/^\d{4}-\d{2}$/.test(o.asOf)) return false;
	if (typeof o.source !== "object" || o.source === null) return false;
	const s = o.source as Record<string, unknown>;
	if (typeof s.url !== "string" || typeof s.label !== "string") return false;
	if (!Array.isArray(o.years) || o.years.length === 0) return false;
	if (!o.years.every(isYear)) return false;
	if (!isFiniteNumber(o.stabilityRuleHeadroom)) return false;
	if (typeof o.stabilityRuleAt !== "string") return false;
	if (!isFiniteNumber(o.investmentRuleHeadroom)) return false;
	return true;
};

export const obrEfoSource: Source<BaselineOverride | null> = {
	fallback: null,
	fetch: async () => {
		const url = process.env.OBR_BASELINE_DATA_URL;
		if (!url) return null;
		try {
			const response = await fetch(url, { next: { revalidate: 86400 } });
			if (!response.ok) return null;
			const data = await response.json();
			return isOverride(data) ? data : null;
		} catch {
			return null;
		}
	},
};

// Apply an override (or null) on top of the static baseline. Override is a
// full replacement: each EFO is a complete refresh, partial updates don't
// make sense.
export const applyBaselineOverride = (
	staticBaseline: OBRBaseline,
	override: BaselineOverride | null,
): OBRBaseline => {
	if (!override) return staticBaseline;
	return {
		asOf: override.asOf,
		source: override.source,
		years: override.years,
		stabilityRuleHeadroom: override.stabilityRuleHeadroom,
		stabilityRuleAt: override.stabilityRuleAt,
		investmentRuleHeadroom: override.investmentRuleHeadroom,
	};
};

import type { Source } from "./types";
import { aiTrainingCostSource } from "./ai-training-cost";
import { ukTaxRevenueSource } from "./uk-tax-revenue";
import { usMedianSalarySource } from "./us-median-salary";

// Live override for a single comparison cost. Same semantics as
// `BudgetOverride` but scoped to one figure.
export interface DynamicCost {
	value: number;
	asOf: string; // YYYY-MM
	source?: { url: string; label?: string };
}

const isDynamicCost = (v: unknown): v is DynamicCost => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	if (typeof o.value !== "number" || o.value < 0) return false;
	if (typeof o.asOf !== "string" || !/^\d{4}-\d{2}$/.test(o.asOf)) return false;
	return true;
};

// Factory for env-gated JSON sources. Used when an entry has a static fallback
// already declared on its `Comparison` and we just want to swap in fresher
// values when the corresponding env var is set. Future real-API integrations
// (e.g. HMRC content API, ONS Beta) would replace specific entries in
// `DYNAMIC_COST_SOURCES` with their own custom `Source<DynamicCost | null>`
// implementation; the registry contract stays the same.
const envJsonSource = (
	envVar: string,
): Source<DynamicCost | null> => ({
	fallback: null,
	fetch: async () => {
		const url = process.env[envVar];
		if (!url) return null;
		try {
			const response = await fetch(url, { next: { revalidate: 3600 } });
			if (!response.ok) return null;
			const data = await response.json();
			return isDynamicCost(data) ? data : null;
		} catch {
			return null;
		}
	},
});

// Source ids referenced by `Comparison.dynamic.sourceId`. Adding a new dynamic
// comparison: declare a new entry here and tag the catalog entry with the
// matching id. An unknown id silently behaves as "no override available."
//
// All current entries are real public-API integrations (World Bank, BLS,
// Epoch AI). Keeping the env-gated `envJsonSource` factory above for any new
// dynamic comparison whose source needs to be configured at deploy time.
export const DYNAMIC_COST_SOURCES: Record<
	string,
	Source<DynamicCost | null>
> = {
	"uk-tax-revenue": ukTaxRevenueSource,
	"us-median-salary": usMedianSalarySource,
	"ai-training-cost": aiTrainingCostSource,
};

const NULL_SOURCE: Source<DynamicCost | null> = {
	fallback: null,
	fetch: async () => null,
};

export const loadDynamicCost = async (
	sourceId: string,
): Promise<DynamicCost | null> => {
	const source = DYNAMIC_COST_SOURCES[sourceId] ?? NULL_SOURCE;
	const result = await source.fetch();
	return result ?? source.fallback;
};

import type { Source } from "./types";

// Shape of the live JSON document. Matches the static fallback in
// `nhs-budget.ts`. Keys in `sliceValues` correspond to slice ids.
export interface BudgetOverride {
	totalValue: number;
	sliceValues: Record<string, number>;
	asOf: string; // YYYY-MM
	source?: { url: string; label: string };
}

const isOverride = (v: unknown): v is BudgetOverride => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	if (typeof o.totalValue !== "number" || o.totalValue <= 0) return false;
	if (typeof o.asOf !== "string" || !/^\d{4}-\d{2}$/.test(o.asOf)) return false;
	if (typeof o.sliceValues !== "object" || o.sliceValues === null) return false;
	for (const v of Object.values(o.sliceValues as Record<string, unknown>)) {
		if (typeof v !== "number" || v < 0) return false;
	}
	return true;
};

// Set NHS_BUDGET_DATA_URL to a stable JSON endpoint to enable live overrides.
// The endpoint can live in a separate repo (raw.githubusercontent.com), a CMS,
// an S3 bucket, or any CDN that serves the JSON shape above. When unset, the
// curated static values in `nhs-budget.ts` are used unchanged.
export const nhsEnglandBudgetSource: Source<BudgetOverride | null> = {
	fallback: null,
	fetch: async () => {
		const url = process.env.NHS_BUDGET_DATA_URL;
		if (!url) return null;
		try {
			const response = await fetch(url, { next: { revalidate: 3600 } });
			if (!response.ok) return null;
			const data = await response.json();
			return isOverride(data) ? data : null;
		} catch {
			return null;
		}
	},
};

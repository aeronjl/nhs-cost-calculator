import type { ResolvedComparison } from "@/data/comparisons";
import { type TaxLever, getTaxLever } from "@/data/levers/tax-rates";
import { describeTaxChange } from "@/lib/scenario";
import {
	type SpendingProgramme,
	getProgramme,
} from "@/data/levers/uk-spending";
import { toGBP } from "@/lib/currency";
import type { Methodology } from "@/lib/methodology";

// A "what if" is the inverse of the trade-off engine: instead of pricing a
// proposal, the user adjusts a single fiscal lever and the tool says what's
// freed (positive delta) or required (negative delta), and what real-world
// projects that delta corresponds to.

export type Counterfactual =
	| { type: "programme"; id: string; deltaFraction: number } // -1..+1
	| { type: "tax"; id: string; deltaPp: number }; // -5..+5

export interface CounterfactualResult {
	description: string;
	deltaGbp: number; // > 0 = revenue freed; < 0 = revenue shortfall
	isRevenue: boolean;
	leverLabel: string; // e.g. "State pension", "Basic-rate income tax"
	methodology: Methodology;
	source: { url: string; label: string };
}

export function evaluateCounterfactual(cf: Counterfactual): CounterfactualResult {
	if (cf.type === "programme") {
		const programme: SpendingProgramme = getProgramme(cf.id);
		// Cutting (deltaFraction < 0) frees revenue; increasing (>0) requires it.
		const deltaGbp = -programme.value * cf.deltaFraction;
		const pct = Math.abs(cf.deltaFraction * 100);
		return {
			description:
				cf.deltaFraction >= 0
					? `Increase ${programme.name} by ${pct.toFixed(1)}%`
					: `Cut ${programme.name} by ${pct.toFixed(1)}%`,
			deltaGbp,
			isRevenue: deltaGbp > 0,
			leverLabel: programme.name,
			methodology: programme.methodology,
			source: programme.source,
		};
	}
	const lever: TaxLever = getTaxLever(cf.id);
	const deltaGbp = lever.gbpPerUnit * cf.deltaPp;
	return {
		description: describeTaxChange(lever, cf.deltaPp),
		deltaGbp,
		isRevenue: deltaGbp > 0,
		leverLabel: lever.name,
		methodology: lever.methodology,
		source: lever.source,
	};
}

export interface CounterfactualComparison {
	comparison: ResolvedComparison;
	count: number; // |delta| / unit cost
	costPerUnit: number; // GBP
}

// Pick comparisons whose unit cost is meaningful at this delta size.
// "Top" tagged items by default, ranked by count descending; we keep a small
// floor (count >= 1) so we don't say "0 nuclear plants" for tiny deltas.
export function comparisonsCovered(
	deltaGbp: number,
	comparisons: readonly ResolvedComparison[],
	usdPerGbp: number,
	limit = 5,
): CounterfactualComparison[] {
	const abs = Math.abs(deltaGbp);
	if (abs === 0) return [];
	return comparisons
		.filter((c) => c.categories.includes("Top"))
		.map((c) => {
			const costPerUnit = toGBP(c.cost, c.nativeCurrency, usdPerGbp);
			const count = costPerUnit > 0 ? abs / costPerUnit : 0;
			return { comparison: c, count, costPerUnit };
		})
		.filter((c) => c.count >= 1)
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

import type {
	ScenarioDistribution,
	ScenarioResult,
	YearProjection,
} from "@/lib/scenario";

// "Scenario signature" — a five-axis fingerprint of a scenario, designed to
// give every scenario a distinctive *shape* on a small radar plot. The five
// axes are independent enough that no two policy templates produce the same
// silhouette, but they aggregate familiar concepts (tax, spend, borrow,
// progressivity, time profile) so the chart reads as plain English.
//
// Each axis is unipolar in [0, 1]:
//   - tax       — total tax-line magnitude, normalised at £50bn = 1.0
//   - spend     — total programme-line magnitude, similarly
//   - borrow    — total borrow-line magnitude, similarly
//   - progressive — burden weighted by income decile (1 = all on top decile,
//                   0 = all on bottom; 0.5 = neutral). Computed only when
//                   the scenario has any modelled losses; otherwise sits at
//                   the neutral midpoint so the silhouette doesn't pretend
//                   to know progressivity it can't see.
//   - longRun   — |year-5 net| / |year-1 net|, mapped to [0, 1] via /2 cap.
//                 0 = effect dies, 0.5 = stable across the horizon, 1 = the
//                 effect doubles or more by year 5.

const NORMALIZE_GBP = 50_000_000_000;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface ScenarioSignature {
	tax: number;
	spend: number;
	borrow: number;
	progressive: number;
	longRun: number;
}

export interface ScenarioSignatureInputs {
	result: ScenarioResult;
	distribution: ScenarioDistribution;
	year1?: YearProjection;
	year5?: YearProjection;
}

export function computeScenarioSignature(
	inputs: ScenarioSignatureInputs,
): ScenarioSignature | null {
	const { result, distribution, year1, year5 } = inputs;
	if (result.lines.length === 0) return null;

	let taxTotal = 0;
	let spendTotal = 0;
	let borrowTotal = 0;
	for (const ev of result.lines) {
		const abs = Math.abs(ev.deltaGbp);
		if (ev.line.type === "tax") taxTotal += abs;
		else if (ev.line.type === "programme") spendTotal += abs;
		else if (ev.line.type === "borrow") borrowTotal += abs;
	}

	let burdenSum = 0;
	let weightedDecileSum = 0;
	for (let i = 0; i < 10; i++) {
		const burden = Math.max(0, distribution.perDecile[i] ?? 0);
		burdenSum += burden;
		weightedDecileSum += burden * (i + 1);
	}
	const meanBurdenDecile =
		burdenSum > 0 ? weightedDecileSum / burdenSum : 5.5;
	const progressive = clamp01((meanBurdenDecile - 1) / 9);

	const y1 = year1 ? Math.abs(year1.net) : Math.abs(result.net);
	const y5 = year5 ? Math.abs(year5.net) : y1;
	const longRun = y1 > 0 ? clamp01(y5 / y1 / 2) : 0.5;

	return {
		tax: clamp01(taxTotal / NORMALIZE_GBP),
		spend: clamp01(spendTotal / NORMALIZE_GBP),
		borrow: clamp01(borrowTotal / NORMALIZE_GBP),
		progressive,
		longRun,
	};
}

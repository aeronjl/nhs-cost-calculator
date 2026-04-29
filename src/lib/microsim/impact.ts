// Per-scenario microsimulation impact across the synthetic population.
//
// Computes the £/yr net-income change for every household in the synthetic
// population under a given scenario, then aggregates into decile means,
// within-decile spread, and demographic cross-cuts. Output is the headline
// numbers a Treasury / IFS / Resolution Foundation distributional table would
// publish.
//
// Methodology mirrors existing household-impact.ts: direct calculation for
// IT/NICs/VAT/dividend/state pension/UC/child benefit; decile fallback for
// public-good levers (NHS, defence) and future debt service. The synthetic
// population gives us within-decile heterogeneity that the 9-archetype
// catalog can't.

import { getProgramme } from "@/data/levers/uk-spending";
import { getTaxLever } from "@/data/levers/tax-rates";
import {
	FUTURE_DEBT_SERVICE_INCIDENCE,
	projectBorrowingPath,
} from "@/lib/borrowing";
import {
	type LineEvaluation,
	type ScenarioResult,
} from "@/lib/scenario";
import {
	type SynthHousehold,
	assignDeciles,
} from "./population";
import { computeNetIncome } from "./tax-benefit";

const HOUSEHOLDS_PER_DECILE_REAL = 2_800_000;
const PA = 12_570;
const HRT = 50_270;
const ART = 125_140;
const NIC_PT = 12_570;
const NIC_UEL = 50_270;
const VAT_BASE_FRAC = 1 / 1.2;

const bandIncome = (income: number, lower: number, upper: number): number =>
	Math.max(0, Math.min(income, upper) - lower);

const taxableIncome = (h: SynthHousehold): number =>
	h.earnedIncome + h.privatePensionIncome + h.statePensionIncome;

// For per-scenario microsim, we only need the £ impact per household per line
// — we don't need to recompute UC tapers etc. for each scenario change. The
// marginal-impact approach is the same simplification IFS/Resolution
// Foundation use in their published tables. For full-system microsim with
// taper interactions we'd recompute net income twice; that's a future round.

const benefitIncomeOf = (h: SynthHousehold): number => {
	// Use the tax-benefit code's UC + child benefit estimate as the household's
	// "benefit income" (similar to RepresentativeHousehold's benefitIncome).
	const ni = computeNetIncome(h);
	return ni.uc + ni.childBenefit;
};

export interface MicrosimLineImpact {
	leverId: string;
	method: "direct" | "decile" | "skipped";
	impactGbp: number;
}

const computeLineImpactForSynth = (
	h: SynthHousehold,
	decile: number,
	evaluation: LineEvaluation,
): MicrosimLineImpact => {
	const { line, deltaGbp } = evaluation;

	if (line.type === "borrow") {
		const year5 = projectBorrowingPath(line.magnitude, 5)[4];
		const decileShare = FUTURE_DEBT_SERVICE_INCIDENCE[decile - 1] ?? 0.1;
		return {
			leverId: "",
			method: "decile",
			impactGbp:
				((year5?.interestCostGbp ?? 0) * decileShare) /
				HOUSEHOLDS_PER_DECILE_REAL,
		};
	}

	if (line.type === "programme") {
		const prog = getProgramme(line.leverId);
		if (line.leverId === "state-pension") {
			if (h.pensioners === 0) {
				return { leverId: line.leverId, method: "direct", impactGbp: 0 };
			}
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp: h.statePensionIncome * (-line.magnitude / 100),
			};
		}
		if (line.leverId === "working-age-welfare") {
			const benefitIncome = benefitIncomeOf(h);
			if (benefitIncome === 0) {
				return { leverId: line.leverId, method: "direct", impactGbp: 0 };
			}
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp: benefitIncome * (-line.magnitude / 100),
			};
		}
		if (prog.incidence) {
			const decileShare = prog.incidence.vector[decile - 1] ?? 0.1;
			return {
				leverId: line.leverId,
				method: "decile",
				impactGbp: (deltaGbp * decileShare) / HOUSEHOLDS_PER_DECILE_REAL,
			};
		}
		return { leverId: line.leverId, method: "skipped", impactGbp: 0 };
	}

	const lever = getTaxLever(line.leverId);
	if (lever.unit === "pp") {
		if (line.leverId === "basic-rate-income-tax") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp:
					bandIncome(taxableIncome(h), PA, HRT) * (line.magnitude / 100),
			};
		}
		if (line.leverId === "higher-rate-income-tax") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp:
					bandIncome(taxableIncome(h), HRT, ART) * (line.magnitude / 100),
			};
		}
		if (line.leverId === "additional-rate-income-tax") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp:
					bandIncome(taxableIncome(h), ART, Infinity) *
					(line.magnitude / 100),
			};
		}
		if (line.leverId === "nics-main") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp:
					bandIncome(h.earnedIncome, NIC_PT, NIC_UEL) *
					(line.magnitude / 100),
			};
		}
		if (line.leverId === "employer-nics-main") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp:
					Math.max(0, h.earnedIncome - 5_000) * (line.magnitude / 100),
			};
		}
		if (line.leverId === "vat-standard") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp: h.vatableSpend * VAT_BASE_FRAC * (line.magnitude / 100),
			};
		}
		if (line.leverId === "dividend-tax") {
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp: h.dividendIncome * (line.magnitude / 100),
			};
		}
	}

	if (lever.unit === "k") {
		if (line.leverId === "raise-personal-allowance") {
			const ti = taxableIncome(h);
			if (ti <= PA) {
				return { leverId: line.leverId, method: "direct", impactGbp: 0 };
			}
			const marginalRate =
				ti > HRT ? 0.42 : ti > NIC_PT ? 0.28 : 0.20;
			return {
				leverId: line.leverId,
				method: "direct",
				impactGbp: -line.magnitude * 1000 * marginalRate * h.adults,
			};
		}
	}

	if (lever.incidence) {
		const decileShare = lever.incidence.vector[decile - 1] ?? 0.1;
		return {
			leverId: line.leverId,
			method: "decile",
			impactGbp: (deltaGbp * decileShare) / HOUSEHOLDS_PER_DECILE_REAL,
		};
	}

	return { leverId: line.leverId, method: "skipped", impactGbp: 0 };
};

export interface MicrosimAggregate {
	// Per-decile arrays, length 10. Decile 1 = bottom 10%, 10 = top.
	decileMean: number[]; // mean £ impact per household in this decile
	decileP10: number[];
	decileP50: number[];
	decileP90: number[];
	decileMeanPctIncome: number[];
	decileNet: number[]; // mean baseline net income per decile

	// Demographic cross-cuts: mean impact by household type
	byType: Map<string, { mean: number; meanPctIncome: number; count: number }>;

	// Scenario-level totals
	totalImpact: number; // sum of weighted per-household impacts
	winners: number; // % of households gaining (impact < 0 → gaining)
	losers: number; // % of households losing
	unaffected: number;

	// Sample size + warnings
	sampleSize: number;
	skippedLines: number;
}

const percentile = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0;
	const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
	return sorted[idx]!;
};

export interface PerHouseholdResult {
	id: number;
	type: SynthHousehold["type"];
	decile: number;
	baselineNet: number;
	totalImpactGbp: number;
	perLine: MicrosimLineImpact[];
}

export const evaluateMicrosim = (
	households: readonly SynthHousehold[],
	scenario: ScenarioResult,
): { perHousehold: PerHouseholdResult[]; agg: MicrosimAggregate } => {
	// Compute baseline net income for each household, then assign deciles.
	const netByHousehold = new Map<number, number>();
	for (const h of households) {
		netByHousehold.set(h.id, computeNetIncome(h).net);
	}
	const decileMap = assignDeciles(households, (h) =>
		netByHousehold.get(h.id) ?? 0,
	);

	const perHousehold: PerHouseholdResult[] = households.map((h) => {
		const decile = decileMap.get(h.id) ?? 5;
		const perLine = scenario.lines.map((ev) =>
			computeLineImpactForSynth(h, decile, ev),
		);
		const totalImpactGbp = perLine.reduce(
			(sum, p) => sum + p.impactGbp,
			0,
		);
		return {
			id: h.id,
			type: h.type,
			decile,
			baselineNet: netByHousehold.get(h.id) ?? 0,
			totalImpactGbp,
			perLine,
		};
	});

	// Aggregate per decile
	const decileMean: number[] = Array(10).fill(0);
	const decileP10: number[] = Array(10).fill(0);
	const decileP50: number[] = Array(10).fill(0);
	const decileP90: number[] = Array(10).fill(0);
	const decileMeanPctIncome: number[] = Array(10).fill(0);
	const decileNet: number[] = Array(10).fill(0);

	for (let d = 1; d <= 10; d++) {
		const rows = perHousehold.filter((r) => r.decile === d);
		if (rows.length === 0) continue;
		const impacts = rows.map((r) => r.totalImpactGbp);
		const incomes = rows.map((r) => r.baselineNet);
		const sortedImpacts = [...impacts].sort((a, b) => a - b);
		decileMean[d - 1] = impacts.reduce((a, b) => a + b, 0) / impacts.length;
		decileP10[d - 1] = percentile(sortedImpacts, 0.1);
		decileP50[d - 1] = percentile(sortedImpacts, 0.5);
		decileP90[d - 1] = percentile(sortedImpacts, 0.9);
		const meanInc = incomes.reduce((a, b) => a + b, 0) / incomes.length;
		decileNet[d - 1] = meanInc;
		decileMeanPctIncome[d - 1] =
			meanInc > 0 ? decileMean[d - 1]! / meanInc : 0;
	}

	// By household type
	const byType = new Map<
		string,
		{ mean: number; meanPctIncome: number; count: number }
	>();
	const types = new Set(perHousehold.map((r) => r.type));
	for (const t of types) {
		const rows = perHousehold.filter((r) => r.type === t);
		const impacts = rows.map((r) => r.totalImpactGbp);
		const incomes = rows.map((r) => r.baselineNet);
		const meanImpact = impacts.reduce((a, b) => a + b, 0) / rows.length;
		const meanInc = incomes.reduce((a, b) => a + b, 0) / rows.length;
		byType.set(t, {
			mean: meanImpact,
			meanPctIncome: meanInc > 0 ? meanImpact / meanInc : 0,
			count: rows.length,
		});
	}

	// Winners / losers / unaffected (>£10/yr threshold to count as "affected")
	const THRESHOLD = 10;
	let winners = 0;
	let losers = 0;
	let unaffected = 0;
	for (const r of perHousehold) {
		if (r.totalImpactGbp < -THRESHOLD) winners++;
		else if (r.totalImpactGbp > THRESHOLD) losers++;
		else unaffected++;
	}
	const total = perHousehold.length;

	// Total impact (weighted to UK total)
	const totalImpact = perHousehold.reduce((sum, r) => {
		const h = households.find((hh) => hh.id === r.id)!;
		return sum + r.totalImpactGbp * h.weight;
	}, 0);

	// Skipped lines (rough — count lines that produced 0 impact across all
	// households via "skipped" method)
	const skippedLines = scenario.lines.filter((line) =>
		perHousehold.every((r) =>
			r.perLine.some(
				(p) =>
					p.leverId === line.line.leverId && p.method === "skipped",
			),
		),
	).length;

	return {
		perHousehold,
		agg: {
			decileMean,
			decileP10,
			decileP50,
			decileP90,
			decileMeanPctIncome,
			decileNet,
			byType,
			totalImpact,
			winners: winners / total,
			losers: losers / total,
			unaffected: unaffected / total,
			sampleSize: perHousehold.length,
			skippedLines,
		},
	};
};

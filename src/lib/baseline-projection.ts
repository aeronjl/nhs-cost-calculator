// Project a scenario against the OBR baseline.
//
// The baseline is OBR's "do-nothing" forecast — current-policy PSNB, debt:GDP,
// revenue, and spending across a 5-year horizon. A scenario's net £ effect
// year-by-year shifts that path: revenue-raising lines reduce PSNB, cost lines
// increase it. This module computes the shifted trajectory so the simulator
// can show "vs OBR baseline" framing alongside its raw scenario figures.
//
// Sign convention from `evaluateScenarioOverYears`:
//   projection[i].net > 0 = fiscal capacity in that year
//   projection[i].psnbShift > 0 = PSNB improves
//
// Borrowing is the important exception: it can provide year-1 cash (`net`)
// while worsening PSNB (`psnbShift`) because debt issuance is financing, not
// revenue.
//
// Baseline shift: positive psnbShift REDUCES PSNB; negative psnbShift
// INCREASES PSNB. So `adjustedPsnb = baselinePsnb - projection.psnbShift`.

import type {
	BaselineYear,
	OBRBaseline,
} from "@/data/baseline/obr-baseline";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	type ProjectionAssumptions,
	type ScenarioResult,
	type YearProjection,
	projectScenarioWithGEFeedback,
} from "./scenario";
import {
	type PercentileBand,
	computeBand,
	sampleNormal,
	seededRng,
} from "./uncertainty";

export interface BaselineRelativeYear {
	year: number; // 1-indexed; year 1 = baseline.years[0]
	fiscalYear: string;
	baselinePsnb: number;
	scenarioNet: number;
	adjustedPsnb: number;
	psnbShift: number; // signed: positive = scenario reduces PSNB (better)
	baselinePsnbPctGdp: number;
	adjustedPsnbPctGdp: number;
	baselineDebtGdp: number;
	// Cumulative scenario effect on debt stock relative to baseline.
	debtStockDeltaGbp: number;
	adjustedDebtGdp: number;
	gdp: number;
}

export interface BaselineComparison {
	years: readonly BaselineRelativeYear[];
	// Year matching the OBR fiscal-rule horizon (typically year 5).
	ruleYear: BaselineRelativeYear | null;
	// Headroom remaining against the stability rule after the scenario applies.
	// Positive = scenario keeps the country within rule + leaves margin.
	// Negative = scenario breaks the rule.
	adjustedStabilityHeadroom: number;
	diagnostics: FiscalRuleDiagnostics;
	policyReactionPath: readonly PolicyReactionYear[];
	baseline: OBRBaseline;
}

export type FiscalRiskRating = "low" | "watch" | "tight" | "breach";

export interface FiscalRuleDiagnostics {
	stabilityRuleBreached: boolean;
	consolidationRequiredGbp: number;
	headroomBufferGbp: number;
	debtProxyRisingAtHorizon: boolean;
	debtProxyShiftPpAtHorizon: number;
	policyReactionGbp: number;
	riskRating: FiscalRiskRating;
	note: string;
}

export interface PolicyReactionYear {
	year: number;
	fiscalYear: string;
	correctionGbp: number;
	correctedPsnb: number;
	correctedDebtGdp: number;
}

export interface FiscalRuleFan {
	samples: number;
	breachProbability: number;
	tightOrBreachProbability: number;
	debtRisingProbability: number;
	headroomBand: PercentileBand;
	ruleYearPsnbBand: PercentileBand;
	ruleYearDebtGdpBand: PercentileBand;
	policyReactionBand: PercentileBand;
	centralHeadroomGbp: number;
	centralRiskRating: FiscalRiskRating;
}

export const evaluateFiscalRuleDiagnostics = (
	years: readonly BaselineRelativeYear[],
	baseline: OBRBaseline,
	adjustedStabilityHeadroom: number,
): FiscalRuleDiagnostics => {
	const ruleYear =
		years.find((y) => y.fiscalYear === baseline.stabilityRuleAt) ??
		years.at(-1) ??
		null;
	const previousYear =
		ruleYear && ruleYear.year > 1
			? years.find((y) => y.year === ruleYear.year - 1)
			: null;
	const stabilityRuleBreached = adjustedStabilityHeadroom < 0;
	const consolidationRequiredGbp = stabilityRuleBreached
		? Math.abs(adjustedStabilityHeadroom)
		: 0;
	const headroomBufferGbp = adjustedStabilityHeadroom;
	const debtProxyRisingAtHorizon =
		!!ruleYear &&
		!!previousYear &&
		ruleYear.adjustedDebtGdp > previousYear.adjustedDebtGdp;
	const debtProxyShiftPpAtHorizon = ruleYear
		? ruleYear.adjustedDebtGdp - ruleYear.baselineDebtGdp
		: 0;
	const riskRating: FiscalRiskRating = stabilityRuleBreached
		? "breach"
		: adjustedStabilityHeadroom < 5_000_000_000 || debtProxyRisingAtHorizon
			? "tight"
			: adjustedStabilityHeadroom < 15_000_000_000 ||
					Math.abs(debtProxyShiftPpAtHorizon) > 1
				? "watch"
				: "low";
	const policyReactionGbp =
		riskRating === "breach"
			? consolidationRequiredGbp
			: riskRating === "tight"
				? Math.max(0, 10_000_000_000 - adjustedStabilityHeadroom)
				: 0;
	const note = stabilityRuleBreached
		? "Scenario breaches the stability-rule margin; a professional forecast would normally include offsetting tax or spending action."
		: debtProxyRisingAtHorizon
			? "Scenario leaves the debt proxy rising at the rule horizon, so market and policy reaction risk is elevated."
			: adjustedStabilityHeadroom < 15_000_000_000
				? "Scenario leaves limited headroom relative to normal forecast error."
				: "Scenario preserves material headroom against the current fiscal-rule proxy.";
	return {
		stabilityRuleBreached,
		consolidationRequiredGbp,
		headroomBufferGbp,
		debtProxyRisingAtHorizon,
		debtProxyShiftPpAtHorizon,
		policyReactionGbp,
		riskRating,
		note,
	};
};

export const buildPolicyReactionPath = (
	years: readonly BaselineRelativeYear[],
	diagnostics: FiscalRuleDiagnostics,
): PolicyReactionYear[] => {
	if (diagnostics.policyReactionGbp <= 0 || years.length === 0) return [];
	const horizonYear = years.at(-1)?.year ?? years.length;
	let cumulativeCorrectionGbp = 0;
	return years.map((year) => {
		const ramp =
			horizonYear <= 1 ? 1 : Math.max(0, (year.year - 1) / (horizonYear - 1));
		const correctionGbp = diagnostics.policyReactionGbp * ramp;
		cumulativeCorrectionGbp += correctionGbp;
		return {
			year: year.year,
			fiscalYear: year.fiscalYear,
			correctionGbp,
			correctedPsnb: year.adjustedPsnb - correctionGbp,
			correctedDebtGdp:
				year.adjustedDebtGdp -
				(year.gdp > 0 ? (cumulativeCorrectionGbp / year.gdp) * 100 : 0),
		};
	});
};

export const projectAgainstBaseline = (
	projection: readonly YearProjection[],
	baseline: OBRBaseline = OBR_BASELINE,
): BaselineComparison => {
	const years: BaselineRelativeYear[] = [];
	let cumulativeDebtStockDeltaGbp = 0;
	for (let i = 0; i < projection.length; i++) {
		const proj = projection[i];
		const baseYear: BaselineYear | undefined = baseline.years[i];
		if (!proj || !baseYear) continue;
		const psnbShift = proj.psnbShift ?? proj.net;
		const adjustedPsnb = baseYear.psnb - psnbShift;
		const adjustedPsnbPctGdp =
			baseYear.gdp > 0 ? (adjustedPsnb / baseYear.gdp) * 100 : 0;
		cumulativeDebtStockDeltaGbp -= psnbShift;
		const adjustedDebtGdp =
			baseYear.psndPctGdp +
			(baseYear.gdp > 0
				? (cumulativeDebtStockDeltaGbp / baseYear.gdp) * 100
				: 0);
		years.push({
			year: i + 1,
			fiscalYear: baseYear.fiscalYear,
			baselinePsnb: baseYear.psnb,
			scenarioNet: proj.net,
			adjustedPsnb,
			psnbShift,
			baselinePsnbPctGdp: baseYear.psnbPctGdp,
			adjustedPsnbPctGdp,
			baselineDebtGdp: baseYear.psndPctGdp,
			debtStockDeltaGbp: cumulativeDebtStockDeltaGbp,
			adjustedDebtGdp,
			gdp: baseYear.gdp,
		});
	}

	const ruleYear =
		years.find((y) => y.fiscalYear === baseline.stabilityRuleAt) ?? null;
	const adjustedStabilityHeadroom = ruleYear
		? baseline.stabilityRuleHeadroom + ruleYear.psnbShift
		: baseline.stabilityRuleHeadroom;
	const diagnostics = evaluateFiscalRuleDiagnostics(
		years,
		baseline,
		adjustedStabilityHeadroom,
	);
	const policyReactionPath = buildPolicyReactionPath(years, diagnostics);

	return {
		years,
		ruleYear,
		adjustedStabilityHeadroom,
		diagnostics,
		policyReactionPath,
		baseline,
	};
};

const sampledBaseline = (
	baseline: OBRBaseline,
	growthShock: number,
	psnbErrorsGbp: readonly number[],
): OBRBaseline => {
	const years = baseline.years.map((year, index) => {
		const gdpShock = Math.pow(1 + growthShock, index + 1);
		const gdp = Math.max(1, year.gdp * gdpShock);
		const psnb = year.psnb + (psnbErrorsGbp[index] ?? 0);
		const psnd =
			year.psnd +
			psnbErrorsGbp
				.slice(0, index + 1)
				.reduce((sum, value) => sum + value, 0);
		return {
			...year,
			gdp,
			psnb,
			psnd,
			psnbPctGdp: (psnb / gdp) * 100,
			psndPctGdp: (psnd / gdp) * 100,
		};
	});
	const foundRuleIndex = years.findIndex(
		(year) => year.fiscalYear === baseline.stabilityRuleAt,
	);
	const ruleIndex = foundRuleIndex >= 0 ? foundRuleIndex : years.length - 1;
	return {
		...baseline,
		years,
		stabilityRuleHeadroom:
			baseline.stabilityRuleHeadroom - (psnbErrorsGbp[ruleIndex] ?? 0),
	};
};

export const projectFiscalRuleFan = (
	result: ScenarioResult,
	baseline: OBRBaseline = OBR_BASELINE,
	samples = 1000,
	seed = 137,
	assumptions: Partial<ProjectionAssumptions> = {},
): FiscalRuleFan => {
	const centralProjection = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
		assumptions,
	).withFeedback;
	const central = projectAgainstBaseline(centralProjection, baseline);
	const rng = seededRng(seed);
	const headroomSamples: number[] = [];
	const ruleYearPsnbSamples: number[] = [];
	const ruleYearDebtGdpSamples: number[] = [];
	const policyReactionSamples: number[] = [];
	let breachCount = 0;
	let tightOrBreachCount = 0;
	let debtRisingCount = 0;

	for (let sample = 0; sample < samples; sample++) {
		const commonShock = sampleNormal(rng, { mean: 0, sd: 1 });
		const growthShock =
			commonShock * -0.0045 + sampleNormal(rng, { mean: 0, sd: 0.005 });
		const inflationShock =
			commonShock * 0.008 + sampleNormal(rng, { mean: 0, sd: 0.005 });
		const bankRateShock =
			commonShock * 0.0055 + sampleNormal(rng, { mean: 0, sd: 0.004 });
		const giltShock =
			commonShock * 0.0075 + sampleNormal(rng, { mean: 0, sd: 0.005 });
		let persistentPsnbErrorPctGdp = 0;
		const psnbErrorsGbp = baseline.years.map((year) => {
			const innovation =
				commonShock * 0.0018 + sampleNormal(rng, { mean: 0, sd: 0.0025 });
			persistentPsnbErrorPctGdp =
				0.6 * persistentPsnbErrorPctGdp + innovation;
			return year.gdp * persistentPsnbErrorPctGdp;
		});
		const sampled = sampledBaseline(baseline, growthShock, psnbErrorsGbp);
		const projection = projectScenarioWithGEFeedback(
			result,
			sampled.years.length,
			{
				...assumptions,
				nominalGrowth: Math.max(
					0,
					(assumptions.nominalGrowth ?? 0.04) + growthShock,
				),
				inflation: Math.max(
					-0.01,
					(assumptions.inflation ?? 0.03) + inflationShock,
				),
				bankRate: Math.max(
					-0.005,
					(assumptions.bankRate ?? 0.0375) + bankRateShock,
				),
				yieldCurveShift: (assumptions.yieldCurveShift ?? 0) + giltShock,
			},
		).withFeedback;
		const comparison = projectAgainstBaseline(projection, sampled);
		const ruleYear = comparison.ruleYear ?? comparison.years.at(-1);
		headroomSamples.push(comparison.adjustedStabilityHeadroom);
		ruleYearPsnbSamples.push(ruleYear?.adjustedPsnb ?? 0);
		ruleYearDebtGdpSamples.push(ruleYear?.adjustedDebtGdp ?? 0);
		policyReactionSamples.push(comparison.diagnostics.policyReactionGbp);
		if (comparison.diagnostics.stabilityRuleBreached) breachCount++;
		if (
			comparison.diagnostics.riskRating === "tight" ||
			comparison.diagnostics.riskRating === "breach"
		) {
			tightOrBreachCount++;
		}
		if (comparison.diagnostics.debtProxyRisingAtHorizon) debtRisingCount++;
	}

	return {
		samples,
		breachProbability: breachCount / samples,
		tightOrBreachProbability: tightOrBreachCount / samples,
		debtRisingProbability: debtRisingCount / samples,
		headroomBand: computeBand(headroomSamples),
		ruleYearPsnbBand: computeBand(ruleYearPsnbSamples),
		ruleYearDebtGdpBand: computeBand(ruleYearDebtGdpSamples),
		policyReactionBand: computeBand(policyReactionSamples),
		centralHeadroomGbp: central.adjustedStabilityHeadroom,
		centralRiskRating: central.diagnostics.riskRating,
	};
};

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
import type { YearProjection } from "./scenario";

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

	return {
		years,
		ruleYear,
		adjustedStabilityHeadroom,
		diagnostics,
		baseline,
	};
};

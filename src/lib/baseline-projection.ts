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
	baseline: OBRBaseline;
}

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

	return {
		years,
		ruleYear,
		adjustedStabilityHeadroom,
		baseline,
	};
};

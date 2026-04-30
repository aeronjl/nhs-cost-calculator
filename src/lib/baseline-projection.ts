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
	FISCAL_REACTION_PRIOR_SENSITIVITY_CASES,
	type FiscalReactionPriorProfileId,
	type FiscalReactionPriorSensitivityCaseId,
} from "@/data/fiscal-reaction-priors";
import {
	type ProjectionAssumptions,
	type ScenarioResult,
	type YearProjection,
	evaluateScenario,
	projectScenarioWithGEFeedback,
} from "./scenario";
import {
	type PercentileBand,
	computeBand,
	sampleNormal,
	seededRng,
} from "./uncertainty";
import {
	type BorrowingRegimeEstimate,
	estimateBorrowingStressRegime,
	sampleBorrowingRegimeOverlayBp,
} from "./borrowing-regime";
import {
	POLICY_REACTION_PROTOTYPES,
	buildPolicyReactionPackage,
	type PolicyReactionOptionId,
	type PolicyReactionPackage,
	policyReactionPackageToScenarioLines,
	selectPolicyReactionOptionId,
} from "./policy-reaction-packages";

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
	policyReactionOptions: readonly PolicyReactionOption[];
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

export interface PolicyReactionOptionYear extends PolicyReactionYear {
	grossTighteningGbp: number;
	effectiveCorrectionGbp: number;
	taxTighteningGbp: number;
	spendingTighteningGbp: number;
	gdpDragGbp: number;
}

export interface PolicyReactionOption {
	id: PolicyReactionOptionId;
	label: string;
	description: string;
	taxShare: number;
	spendingShare: number;
	multiplier: number;
	implementationLagYears: number;
	package: PolicyReactionPackage;
	annualGrossTighteningGbp: number;
	annualEffectiveCorrectionGbp: number;
	horizonGdpDragGbp: number;
	headroomAfterReactionGbp: number;
	psnbAtHorizon: number;
	debtGdpAtHorizon: number;
	path: readonly PolicyReactionOptionYear[];
}

export interface FiscalRuleFan {
	samples: number;
	breachProbability: number;
	tightOrBreachProbability: number;
	debtRisingProbability: number;
	pathBands: readonly FiscalRulePathFanYear[];
	headroomBand: PercentileBand;
	ruleYearPsnbBand: PercentileBand;
	ruleYearDebtGdpBand: PercentileBand;
	policyReactionBand: PercentileBand;
	policyReactionTriggeredProbability: number;
	endogenousReactionGrossBand: PercentileBand;
	endogenousReactionGdpDragBand: PercentileBand;
	endogenousReactionResidualGapBand: PercentileBand;
	postReactionBreachProbability: number;
	postReactionTightOrBreachProbability: number;
	postReactionDebtRisingProbability: number;
	postReactionHeadroomBand: PercentileBand;
	postReactionRuleYearPsnbBand: PercentileBand;
	postReactionRuleYearDebtGdpBand: PercentileBand;
	postReactionPolicyReactionBand: PercentileBand;
	reactionPackageMix: readonly {
		id: PolicyReactionOptionId;
		label: string;
		count: number;
		probability: number;
	}[];
	centralHeadroomGbp: number;
	centralRiskRating: FiscalRiskRating;
}

export interface FiscalRulePathFanYear {
	year: number;
	fiscalYear: string;
	psnbBand: PercentileBand;
	debtGdpBand: PercentileBand;
	postReactionPsnbBand: PercentileBand;
	postReactionDebtGdpBand: PercentileBand;
}

export interface FiscalRulePriorSensitivityRow {
	id: FiscalReactionPriorSensitivityCaseId;
	label: string;
	description: string;
	priorProfileIds: readonly FiscalReactionPriorProfileId[];
	fan: FiscalRuleFan;
	dominantPackage: FiscalRuleFan["reactionPackageMix"][number] | null;
	postReactionBreachDeltaFromNeutral: number;
	p95GrossActionDeltaFromNeutral: number;
}

export interface FiscalRulePriorSensitivity {
	samples: number;
	rows: readonly FiscalRulePriorSensitivityRow[];
	neutral: FiscalRulePriorSensitivityRow;
}

export type FiscalRuleUncertaintyLayerId =
	| "central"
	| "baseline-forecast-error"
	| "macro-shocks"
	| "borrowing-regime"
	| "policy-reaction";

export interface FiscalRuleUncertaintyLayer {
	id: FiscalRuleUncertaintyLayerId;
	label: string;
	description: string;
	samples: number;
	headroomBand: PercentileBand;
	breachProbability: number;
	tightOrBreachProbability: number;
	p5DeltaFromPreviousGbp: number;
	p50DeltaFromPreviousGbp: number;
	p95DeltaFromPreviousGbp: number;
}

export interface FiscalRuleUncertaintyDecomposition {
	samples: number;
	centralHeadroomGbp: number;
	layers: readonly FiscalRuleUncertaintyLayer[];
}

export interface FiscalRuleFanOptions {
	regimeSwitching?: boolean;
	policyReactionTree?: boolean;
	policyReactionPackage?: PolicyReactionOptionId | "stress-contingent";
	policyReactionPriorProfileIds?: readonly FiscalReactionPriorProfileId[];
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

export const buildPolicyReactionOptions = (
	years: readonly BaselineRelativeYear[],
	diagnostics: FiscalRuleDiagnostics,
): PolicyReactionOption[] => {
	if (diagnostics.policyReactionGbp <= 0 || years.length === 0) return [];
	const horizonYear = years.at(-1)?.year ?? years.length;

	return POLICY_REACTION_PROTOTYPES.map((prototype) => {
		const reactionPackage = buildPolicyReactionPackage(
			prototype,
			diagnostics.policyReactionGbp,
			horizonYear,
		);
		const averageMultiplier =
			reactionPackage.staticTighteningGbp > 0
				? reactionPackage.gdpDragGbp / reactionPackage.staticTighteningGbp
				: 0;
		const taxShare =
			reactionPackage.staticTighteningGbp > 0
				? reactionPackage.taxTighteningGbp /
					reactionPackage.staticTighteningGbp
				: prototype.taxShare;
		const spendingShare =
			reactionPackage.staticTighteningGbp > 0
				? reactionPackage.spendingTighteningGbp /
					reactionPackage.staticTighteningGbp
				: prototype.spendingShare;
		let cumulativeEffectiveCorrectionGbp = 0;
		const path = years.map<PolicyReactionOptionYear>((year) => {
			const activeYears = Math.max(
				1,
				horizonYear - prototype.implementationLagYears,
			);
			const ramp =
				year.year <= prototype.implementationLagYears
					? 0
					: Math.min(
							1,
							(year.year - prototype.implementationLagYears) / activeYears,
						);
			const grossTighteningGbp =
				reactionPackage.staticTighteningGbp * ramp;
			const gdpDragGbp = reactionPackage.gdpDragGbp * ramp;
			const effectiveCorrectionGbp =
				reactionPackage.effectiveCorrectionGbp * ramp;
			cumulativeEffectiveCorrectionGbp += effectiveCorrectionGbp;
			return {
				year: year.year,
				fiscalYear: year.fiscalYear,
				correctionGbp: effectiveCorrectionGbp,
				grossTighteningGbp,
				effectiveCorrectionGbp,
				taxTighteningGbp: reactionPackage.taxTighteningGbp * ramp,
				spendingTighteningGbp:
					reactionPackage.spendingTighteningGbp * ramp,
				gdpDragGbp,
				correctedPsnb: year.adjustedPsnb - effectiveCorrectionGbp,
				correctedDebtGdp:
					year.adjustedDebtGdp -
					(year.gdp > 0
						? (cumulativeEffectiveCorrectionGbp / year.gdp) * 100
						: 0),
			};
		});
		const horizon = path.at(-1)!;
		return {
			...prototype,
			taxShare,
			spendingShare,
			multiplier: averageMultiplier,
			package: reactionPackage,
			annualGrossTighteningGbp: reactionPackage.staticTighteningGbp,
			annualEffectiveCorrectionGbp: horizon.effectiveCorrectionGbp,
			horizonGdpDragGbp: horizon.gdpDragGbp,
			headroomAfterReactionGbp:
				diagnostics.headroomBufferGbp + horizon.effectiveCorrectionGbp,
			psnbAtHorizon: horizon.correctedPsnb,
			debtGdpAtHorizon: horizon.correctedDebtGdp,
			path,
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
	const policyReactionOptions = buildPolicyReactionOptions(years, diagnostics);

	return {
		years,
		ruleYear,
		adjustedStabilityHeadroom,
		diagnostics,
		policyReactionPath,
		policyReactionOptions,
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

const borrowingRegimeForScenario = (
	result: ScenarioResult,
	years: number,
): BorrowingRegimeEstimate | null => {
	let amountGbp = 0;
	let largestBorrowingLine: ScenarioResult["lines"][number] | null = null;
	for (const evaluation of result.lines) {
		const { line } = evaluation;
		if (line.type !== "borrow" || line.magnitude <= 0) continue;
		amountGbp += line.magnitude;
		if (
			!largestBorrowingLine ||
			line.magnitude > largestBorrowingLine.line.magnitude
		) {
			largestBorrowingLine = evaluation;
		}
	}
	if (amountGbp <= 0) return null;
	return estimateBorrowingStressRegime(amountGbp, years, {
		strategyId: largestBorrowingLine?.line.borrowingStrategyId,
		portfolio: largestBorrowingLine?.line.borrowingPortfolio,
		context: largestBorrowingLine?.line.borrowingContext,
	});
};

interface FiscalRuleDrawState {
	growthShock: number;
	inflationShock: number;
	giltShock: number;
	bankRateShock: number;
	regimeOverlay: number;
	commonShock: number;
}

const policyReactionPrototypeById = (id: PolicyReactionOptionId) =>
	POLICY_REACTION_PROTOTYPES.find((prototype) => prototype.id === id) ??
	POLICY_REACTION_PROTOTYPES[0]!;

const selectEndogenousPolicyReactionId = (
	comparison: BaselineComparison,
	draw: FiscalRuleDrawState,
	mode: PolicyReactionOptionId | "stress-contingent" | undefined,
	institutionalPriorProfileIds:
		| readonly FiscalReactionPriorProfileId[]
		| undefined,
): PolicyReactionOptionId | null => {
	return selectPolicyReactionOptionId({
		policyReactionGbp: comparison.diagnostics.policyReactionGbp,
		stabilityRuleBreached: comparison.diagnostics.stabilityRuleBreached,
		growthShock: draw.growthShock,
		inflationShock: draw.inflationShock,
		rateStress: draw.giltShock + draw.bankRateShock + draw.regimeOverlay,
		mode,
		institutionalPriorProfileIds,
	});
};

const drawReactionYieldRelief = (
	pkg: PolicyReactionPackage,
	targetCorrectionGbp: number,
	regimeOverlay: number,
): number => {
	if (targetCorrectionGbp <= 0 || regimeOverlay <= 0) return 0;
	const closureRatio = Math.min(1, pkg.effectiveCorrectionGbp / targetCorrectionGbp);
	return Math.min(0.005, regimeOverlay * closureRatio * 0.6);
};

const drawFiscalRuleShockState = (
	rng: () => number,
	regimeRng: () => number,
	baseline: OBRBaseline,
	borrowingRegime: BorrowingRegimeEstimate | null,
) => {
	const commonShock = sampleNormal(rng, { mean: 0, sd: 1 });
	const growthShock =
		commonShock * -0.0045 + sampleNormal(rng, { mean: 0, sd: 0.005 });
	const inflationShock =
		commonShock * 0.008 + sampleNormal(rng, { mean: 0, sd: 0.005 });
	const bankRateShock =
		commonShock * 0.0055 + sampleNormal(rng, { mean: 0, sd: 0.004 });
	const giltShock =
		commonShock * 0.0075 + sampleNormal(rng, { mean: 0, sd: 0.005 });
	const regimeOverlay =
		borrowingRegime === null
			? 0
			: sampleBorrowingRegimeOverlayBp(borrowingRegime, regimeRng) / 10_000;
	let persistentPsnbErrorPctGdp = 0;
	const psnbErrorsGbp = baseline.years.map((year) => {
		const innovation =
			commonShock * 0.0018 + sampleNormal(rng, { mean: 0, sd: 0.0025 });
		persistentPsnbErrorPctGdp =
			0.6 * persistentPsnbErrorPctGdp + innovation;
		return year.gdp * persistentPsnbErrorPctGdp;
	});
	return {
		commonShock,
		growthShock,
		inflationShock,
		bankRateShock,
		giltShock,
		regimeOverlay,
		psnbErrorsGbp,
	};
};

const drawAssumptionsForShocks = (
	assumptions: Partial<ProjectionAssumptions>,
	shocks: Pick<
		ReturnType<typeof drawFiscalRuleShockState>,
		"growthShock" | "inflationShock" | "bankRateShock" | "giltShock"
	>,
	yieldOverlay = 0,
): Partial<ProjectionAssumptions> => ({
	...assumptions,
	nominalGrowth: Math.max(
		0,
		(assumptions.nominalGrowth ?? 0.04) + shocks.growthShock,
	),
	inflation: Math.max(
		-0.01,
		(assumptions.inflation ?? 0.03) + shocks.inflationShock,
	),
	bankRate: Math.max(
		-0.005,
		(assumptions.bankRate ?? 0.0375) + shocks.bankRateShock,
	),
	yieldCurveShift:
		(assumptions.yieldCurveShift ?? 0) + shocks.giltShock + yieldOverlay,
});

export const projectFiscalRuleFan = (
	result: ScenarioResult,
	baseline: OBRBaseline = OBR_BASELINE,
	samples = 1000,
	seed = 137,
	assumptions: Partial<ProjectionAssumptions> = {},
	options: FiscalRuleFanOptions = {},
): FiscalRuleFan => {
	const centralProjection = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
		assumptions,
	).withFeedback;
	const central = projectAgainstBaseline(centralProjection, baseline);
	const rng = seededRng(seed);
	const regimeRng = seededRng(seed + 7_919);
	const headroomSamples: number[] = [];
	const ruleYearPsnbSamples: number[] = [];
	const ruleYearDebtGdpSamples: number[] = [];
	const policyReactionSamples: number[] = [];
	const postReactionHeadroomSamples: number[] = [];
	const postReactionRuleYearPsnbSamples: number[] = [];
	const postReactionRuleYearDebtGdpSamples: number[] = [];
	const postReactionPolicyReactionSamples: number[] = [];
	const endogenousReactionGrossSamples: number[] = [];
	const endogenousReactionGdpDragSamples: number[] = [];
	const endogenousReactionResidualGapSamples: number[] = [];
	const psnbPathSamples: number[][] = baseline.years.map(() => []);
	const debtGdpPathSamples: number[][] = baseline.years.map(() => []);
	const postReactionPsnbPathSamples: number[][] = baseline.years.map(() => []);
	const postReactionDebtGdpPathSamples: number[][] = baseline.years.map(
		() => [],
	);
	const reactionPackageCounts: Record<PolicyReactionOptionId, number> = {
		balanced: 0,
		"tax-led": 0,
		"spending-led": 0,
		delayed: 0,
	};
	let breachCount = 0;
	let tightOrBreachCount = 0;
	let debtRisingCount = 0;
	let postReactionBreachCount = 0;
	let postReactionTightOrBreachCount = 0;
	let postReactionDebtRisingCount = 0;
	let reactionTriggeredCount = 0;
	const borrowingRegime =
		options.regimeSwitching === false
			? null
			: borrowingRegimeForScenario(result, baseline.years.length);

	for (let sample = 0; sample < samples; sample++) {
		const shocks = drawFiscalRuleShockState(
			rng,
			regimeRng,
			baseline,
			borrowingRegime,
		);
		const sampled = sampledBaseline(
			baseline,
			shocks.growthShock,
			shocks.psnbErrorsGbp,
		);
		const drawAssumptions = drawAssumptionsForShocks(
			assumptions,
			shocks,
			shocks.regimeOverlay,
		);
		const projection = projectScenarioWithGEFeedback(
			result,
			sampled.years.length,
			drawAssumptions,
		).withFeedback;
		const comparison = projectAgainstBaseline(projection, sampled);
		const ruleYear = comparison.ruleYear ?? comparison.years.at(-1);
		comparison.years.forEach((year, index) => {
			psnbPathSamples[index]?.push(year.adjustedPsnb);
			debtGdpPathSamples[index]?.push(year.adjustedDebtGdp);
		});
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

		let postReactionComparison = comparison;
		let reactionGrossGbp = 0;
		let reactionGdpDragGbp = 0;
		let reactionResidualGapGbp = 0;
		const selectedReactionId =
			options.policyReactionTree === false
				? null
				: selectEndogenousPolicyReactionId(
						comparison,
						{
							growthShock: shocks.growthShock,
							inflationShock: shocks.inflationShock,
							giltShock: shocks.giltShock,
							bankRateShock: shocks.bankRateShock,
							regimeOverlay: shocks.regimeOverlay,
							commonShock: shocks.commonShock,
						},
						options.policyReactionPackage,
						options.policyReactionPriorProfileIds,
					);
		if (selectedReactionId) {
			reactionTriggeredCount++;
			reactionPackageCounts[selectedReactionId]++;
			const prototype = policyReactionPrototypeById(selectedReactionId);
			const reactionPackage = buildPolicyReactionPackage(
				prototype,
				comparison.diagnostics.policyReactionGbp,
				sampled.years.length,
			);
			const reactionLines = policyReactionPackageToScenarioLines(
				reactionPackage,
				`fan-${sample}-${selectedReactionId}`,
			);
			const yieldRelief = drawReactionYieldRelief(
				reactionPackage,
				comparison.diagnostics.policyReactionGbp,
				shocks.regimeOverlay,
			);
			const reactedResult = evaluateScenario([
				...result.lines.map((evaluation) => evaluation.line),
				...reactionLines,
			]);
			const reactedProjection = projectScenarioWithGEFeedback(
				reactedResult,
				sampled.years.length,
				{
					...drawAssumptions,
					yieldCurveShift:
						(drawAssumptions.yieldCurveShift ?? 0) - yieldRelief,
				},
			).withFeedback;
			postReactionComparison = projectAgainstBaseline(
				reactedProjection,
				sampled,
			);
			reactionGrossGbp = reactionPackage.staticTighteningGbp;
			reactionGdpDragGbp = reactionPackage.gdpDragGbp;
			reactionResidualGapGbp = reactionPackage.residualGapGbp;
		}
		const postReactionRuleYear =
			postReactionComparison.ruleYear ?? postReactionComparison.years.at(-1);
		postReactionComparison.years.forEach((year, index) => {
			postReactionPsnbPathSamples[index]?.push(year.adjustedPsnb);
			postReactionDebtGdpPathSamples[index]?.push(year.adjustedDebtGdp);
		});
		postReactionHeadroomSamples.push(
			postReactionComparison.adjustedStabilityHeadroom,
		);
		postReactionRuleYearPsnbSamples.push(
			postReactionRuleYear?.adjustedPsnb ?? 0,
		);
		postReactionRuleYearDebtGdpSamples.push(
			postReactionRuleYear?.adjustedDebtGdp ?? 0,
		);
		postReactionPolicyReactionSamples.push(
			postReactionComparison.diagnostics.policyReactionGbp,
		);
		endogenousReactionGrossSamples.push(reactionGrossGbp);
		endogenousReactionGdpDragSamples.push(reactionGdpDragGbp);
		endogenousReactionResidualGapSamples.push(reactionResidualGapGbp);
		if (postReactionComparison.diagnostics.stabilityRuleBreached) {
			postReactionBreachCount++;
		}
		if (
			postReactionComparison.diagnostics.riskRating === "tight" ||
			postReactionComparison.diagnostics.riskRating === "breach"
		) {
			postReactionTightOrBreachCount++;
		}
		if (postReactionComparison.diagnostics.debtProxyRisingAtHorizon) {
			postReactionDebtRisingCount++;
		}
	}

	return {
		samples,
		breachProbability: breachCount / samples,
		tightOrBreachProbability: tightOrBreachCount / samples,
		debtRisingProbability: debtRisingCount / samples,
		pathBands: baseline.years.map((year, index) => ({
			year: index + 1,
			fiscalYear: year.fiscalYear,
			psnbBand: computeBand(psnbPathSamples[index] ?? []),
			debtGdpBand: computeBand(debtGdpPathSamples[index] ?? []),
			postReactionPsnbBand: computeBand(
				postReactionPsnbPathSamples[index] ?? [],
			),
			postReactionDebtGdpBand: computeBand(
				postReactionDebtGdpPathSamples[index] ?? [],
			),
		})),
		headroomBand: computeBand(headroomSamples),
		ruleYearPsnbBand: computeBand(ruleYearPsnbSamples),
		ruleYearDebtGdpBand: computeBand(ruleYearDebtGdpSamples),
		policyReactionBand: computeBand(policyReactionSamples),
		policyReactionTriggeredProbability: reactionTriggeredCount / samples,
		endogenousReactionGrossBand: computeBand(endogenousReactionGrossSamples),
		endogenousReactionGdpDragBand: computeBand(endogenousReactionGdpDragSamples),
		endogenousReactionResidualGapBand: computeBand(
			endogenousReactionResidualGapSamples,
		),
		postReactionBreachProbability: postReactionBreachCount / samples,
		postReactionTightOrBreachProbability:
			postReactionTightOrBreachCount / samples,
		postReactionDebtRisingProbability: postReactionDebtRisingCount / samples,
		postReactionHeadroomBand: computeBand(postReactionHeadroomSamples),
		postReactionRuleYearPsnbBand: computeBand(postReactionRuleYearPsnbSamples),
		postReactionRuleYearDebtGdpBand: computeBand(
			postReactionRuleYearDebtGdpSamples,
		),
		postReactionPolicyReactionBand: computeBand(
			postReactionPolicyReactionSamples,
		),
		reactionPackageMix: POLICY_REACTION_PROTOTYPES.map((prototype) => ({
			id: prototype.id,
			label: prototype.label,
			count: reactionPackageCounts[prototype.id],
			probability: reactionPackageCounts[prototype.id] / samples,
		})),
		centralHeadroomGbp: central.adjustedStabilityHeadroom,
		centralRiskRating: central.diagnostics.riskRating,
	};
};

const fiscalRuleLayerFromSamples = (
	id: FiscalRuleUncertaintyLayerId,
	label: string,
	description: string,
	headroomSamples: readonly number[],
	previous: FiscalRuleUncertaintyLayer | null,
): FiscalRuleUncertaintyLayer => {
	const samples = headroomSamples.length;
	const headroomBand = computeBand([...headroomSamples]);
	return {
		id,
		label,
		description,
		samples,
		headroomBand,
		breachProbability:
			samples > 0
				? headroomSamples.filter((value) => value < 0).length / samples
				: 0,
		tightOrBreachProbability:
			samples > 0
				? headroomSamples.filter((value) => value < 5_000_000_000).length /
					samples
				: 0,
		p5DeltaFromPreviousGbp: previous
			? headroomBand.p5 - previous.headroomBand.p5
			: 0,
		p50DeltaFromPreviousGbp: previous
			? headroomBand.p50 - previous.headroomBand.p50
			: 0,
		p95DeltaFromPreviousGbp: previous
			? headroomBand.p95 - previous.headroomBand.p95
			: 0,
	};
};

export const projectFiscalRuleUncertaintyDecomposition = (
	result: ScenarioResult,
	baseline: OBRBaseline = OBR_BASELINE,
	samples = 300,
	seed = 137,
	assumptions: Partial<ProjectionAssumptions> = {},
	options: FiscalRuleFanOptions = {},
): FiscalRuleUncertaintyDecomposition => {
	const sampleCount = Math.max(1, Math.floor(samples));
	const centralProjection = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
		assumptions,
	).withFeedback;
	const central = projectAgainstBaseline(centralProjection, baseline);
	const centralHeadroomSamples = Array.from(
		{ length: sampleCount },
		() => central.adjustedStabilityHeadroom,
	);
	const baselineErrorSamples: number[] = [];
	const macroShockSamples: number[] = [];
	const borrowingRegimeSamples: number[] = [];
	const policyReactionSamples: number[] = [];
	const rng = seededRng(seed);
	const regimeRng = seededRng(seed + 7_919);
	const borrowingRegime =
		options.regimeSwitching === false
			? null
			: borrowingRegimeForScenario(result, baseline.years.length);

	for (let sample = 0; sample < sampleCount; sample++) {
		const shocks = drawFiscalRuleShockState(
			rng,
			regimeRng,
			baseline,
			borrowingRegime,
		);
		const baselineErrorOnly = sampledBaseline(
			baseline,
			0,
			shocks.psnbErrorsGbp,
		);
		const baselineErrorComparison = projectAgainstBaseline(
			centralProjection,
			baselineErrorOnly,
		);
		baselineErrorSamples.push(
			baselineErrorComparison.adjustedStabilityHeadroom,
		);

		const sampled = sampledBaseline(
			baseline,
			shocks.growthShock,
			shocks.psnbErrorsGbp,
		);
		const macroAssumptions = drawAssumptionsForShocks(
			assumptions,
			shocks,
			0,
		);
		const macroProjection = projectScenarioWithGEFeedback(
			result,
			sampled.years.length,
			macroAssumptions,
		).withFeedback;
		const macroComparison = projectAgainstBaseline(macroProjection, sampled);
		macroShockSamples.push(macroComparison.adjustedStabilityHeadroom);

		const regimeAssumptions = drawAssumptionsForShocks(
			assumptions,
			shocks,
			shocks.regimeOverlay,
		);
		const regimeProjection = projectScenarioWithGEFeedback(
			result,
			sampled.years.length,
			regimeAssumptions,
		).withFeedback;
		const regimeComparison = projectAgainstBaseline(regimeProjection, sampled);
		borrowingRegimeSamples.push(regimeComparison.adjustedStabilityHeadroom);

		let postReactionComparison = regimeComparison;
		const selectedReactionId =
			options.policyReactionTree === false
				? null
				: selectEndogenousPolicyReactionId(
						regimeComparison,
						{
							growthShock: shocks.growthShock,
							inflationShock: shocks.inflationShock,
							giltShock: shocks.giltShock,
							bankRateShock: shocks.bankRateShock,
							regimeOverlay: shocks.regimeOverlay,
							commonShock: shocks.commonShock,
						},
						options.policyReactionPackage,
						options.policyReactionPriorProfileIds,
					);
		if (selectedReactionId) {
			const prototype = policyReactionPrototypeById(selectedReactionId);
			const reactionPackage = buildPolicyReactionPackage(
				prototype,
				regimeComparison.diagnostics.policyReactionGbp,
				sampled.years.length,
			);
			const reactionLines = policyReactionPackageToScenarioLines(
				reactionPackage,
				`decomp-${sample}-${selectedReactionId}`,
			);
			const yieldRelief = drawReactionYieldRelief(
				reactionPackage,
				regimeComparison.diagnostics.policyReactionGbp,
				shocks.regimeOverlay,
			);
			const reactedResult = evaluateScenario([
				...result.lines.map((evaluation) => evaluation.line),
				...reactionLines,
			]);
			const reactedProjection = projectScenarioWithGEFeedback(
				reactedResult,
				sampled.years.length,
				{
					...regimeAssumptions,
					yieldCurveShift:
						(regimeAssumptions.yieldCurveShift ?? 0) - yieldRelief,
				},
			).withFeedback;
			postReactionComparison = projectAgainstBaseline(
				reactedProjection,
				sampled,
			);
		}
		policyReactionSamples.push(
			postReactionComparison.adjustedStabilityHeadroom,
		);
	}

	const layers: FiscalRuleUncertaintyLayer[] = [];
	const addLayer = (
		id: FiscalRuleUncertaintyLayerId,
		label: string,
		description: string,
		headroomSamples: readonly number[],
	) => {
		const previous = layers.at(-1) ?? null;
		layers.push(
			fiscalRuleLayerFromSamples(
				id,
				label,
				description,
				headroomSamples,
				previous,
			),
		);
	};
	addLayer(
		"central",
		"Central path",
		"Deterministic scenario against the central baseline.",
		centralHeadroomSamples,
	);
	addLayer(
		"baseline-forecast-error",
		"Baseline forecast error",
		"Adds persistent PSNB forecast errors to the baseline headroom path.",
		baselineErrorSamples,
	);
	addLayer(
		"macro-shocks",
		"Macro shocks",
		"Adds correlated growth, inflation, Bank Rate, and gilt-yield shocks.",
		macroShockSamples,
	);
	addLayer(
		"borrowing-regime",
		"Borrowing regime",
		"Adds labelled credibility/backstop regime overlays for borrowing packages.",
		borrowingRegimeSamples,
	);
	addLayer(
		"policy-reaction",
		"Policy reaction",
		"Applies endogenous offset packages and any residual implementation gap.",
		policyReactionSamples,
	);

	return {
		samples: sampleCount,
		centralHeadroomGbp: central.adjustedStabilityHeadroom,
		layers,
	};
};

const dominantReactionPackage = (
	fan: FiscalRuleFan,
): FiscalRuleFan["reactionPackageMix"][number] | null =>
	fan.reactionPackageMix
		.filter((row) => row.count > 0)
		.slice()
		.sort((a, b) => {
			const probabilityDelta = b.probability - a.probability;
			if (Math.abs(probabilityDelta) > 1e-9) return probabilityDelta;
			return a.label.localeCompare(b.label);
		})[0] ?? null;

export const projectFiscalRulePriorSensitivity = (
	result: ScenarioResult,
	baseline: OBRBaseline = OBR_BASELINE,
	samples = 300,
	seed = 137,
	assumptions: Partial<ProjectionAssumptions> = {},
	options: Omit<FiscalRuleFanOptions, "policyReactionPriorProfileIds"> = {},
): FiscalRulePriorSensitivity => {
	const baseRows = FISCAL_REACTION_PRIOR_SENSITIVITY_CASES.map((caseDef) => {
		const fan = projectFiscalRuleFan(
			result,
			baseline,
			samples,
			seed,
			assumptions,
			{
				...options,
				policyReactionPackage:
					options.policyReactionPackage ?? "stress-contingent",
				policyReactionPriorProfileIds: caseDef.priorProfileIds,
			},
		);
		return {
			id: caseDef.id,
			label: caseDef.label,
			description: caseDef.description,
			priorProfileIds: caseDef.priorProfileIds,
			fan,
			dominantPackage: dominantReactionPackage(fan),
		};
	});
	const neutralBase =
		baseRows.find((row) => row.id === "neutral") ?? baseRows[0]!;
	const rows: FiscalRulePriorSensitivityRow[] = baseRows.map((row) => ({
		...row,
		postReactionBreachDeltaFromNeutral:
			row.fan.postReactionBreachProbability -
			neutralBase.fan.postReactionBreachProbability,
		p95GrossActionDeltaFromNeutral:
			row.fan.endogenousReactionGrossBand.p95 -
			neutralBase.fan.endogenousReactionGrossBand.p95,
	}));
	const neutral = rows.find((row) => row.id === neutralBase.id) ?? rows[0]!;
	return {
		samples,
		rows,
		neutral,
	};
};

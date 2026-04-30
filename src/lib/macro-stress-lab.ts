import { BORROWING } from "@/data/levers/borrowing";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	type BaselineComparison,
} from "./baseline-projection";
import {
	projectScenarioWithGEFeedback,
	type ProjectionAssumptions,
	type ScenarioResult,
	type YearProjection,
} from "./scenario";

export type MacroStressParameterId =
	| "growth"
	| "inflation"
	| "bank-rate"
	| "multipliers"
	| "tax-buoyancy"
	| "debt-risk-premium";

export interface MacroStressLabCase {
	id: string;
	parameterId: MacroStressParameterId | "central";
	parameterLabel: string;
	label: string;
	assumptionLabel: string;
	assumptions: Partial<ProjectionAssumptions>;
	adjustedHeadroomGbp: number;
	headroomDeltaGbp: number;
	ruleYearPsnbGbp: number;
	ruleYearPsnbDeltaGbp: number;
	ruleYearDebtGdpPct: number;
	ruleYearDebtGdpDeltaPp: number;
	finalNetGbp: number;
	finalNetDeltaGbp: number;
	finalDebtInterestGbp: number;
	finalDebtInterestDeltaGbp: number;
	riskRating: BaselineComparison["diagnostics"]["riskRating"];
	consolidationRequiredGbp: number;
}

export interface MacroStressLabParameter {
	id: MacroStressParameterId;
	label: string;
	unitLabel: string;
	lowCase: MacroStressLabCase;
	highCase: MacroStressLabCase;
	downsideCase: MacroStressLabCase;
	upsideCase: MacroStressLabCase;
	headroomRangeGbp: number;
	worstHeadroomDeltaGbp: number;
}

export interface MacroStressLab {
	ruleYear: string;
	central: MacroStressLabCase;
	parameters: readonly MacroStressLabParameter[];
	largestDownsideParameterLabel: string;
	largestSwingParameterLabel: string;
}

const DEFAULT_NOMINAL_GROWTH = 0.04;

interface ParameterDefinition {
	id: MacroStressParameterId;
	label: string;
	unitLabel: string;
	lowLabel: string;
	highLabel: string;
	lowAssumptions: Partial<ProjectionAssumptions>;
	highAssumptions: Partial<ProjectionAssumptions>;
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const scalePct = (value: number): string => `${Math.round(value * 100)}%`;

const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
	{
		id: "growth",
		label: "Nominal GDP growth",
		unitLabel: "+/-1pp annual nominal growth",
		lowLabel: `Low growth (${pct(DEFAULT_NOMINAL_GROWTH - 0.01)})`,
		highLabel: `High growth (${pct(DEFAULT_NOMINAL_GROWTH + 0.01)})`,
		lowAssumptions: { nominalGrowth: DEFAULT_NOMINAL_GROWTH - 0.01 },
		highAssumptions: { nominalGrowth: DEFAULT_NOMINAL_GROWTH + 0.01 },
	},
	{
		id: "inflation",
		label: "Inflation",
		unitLabel: "+/-1pp CPI/RPI path",
		lowLabel: `Low inflation (${pct(BORROWING.inflation - 0.01)})`,
		highLabel: `High inflation (${pct(BORROWING.inflation + 0.01)})`,
		lowAssumptions: { inflation: BORROWING.inflation - 0.01 },
		highAssumptions: { inflation: BORROWING.inflation + 0.01 },
	},
	{
		id: "bank-rate",
		label: "Bank Rate",
		unitLabel: "+/-1pp starting Bank Rate",
		lowLabel: `Low Bank Rate (${pct(BORROWING.bankRate - 0.01)})`,
		highLabel: `High Bank Rate (${pct(BORROWING.bankRate + 0.01)})`,
		lowAssumptions: { bankRate: BORROWING.bankRate - 0.01 },
		highAssumptions: { bankRate: BORROWING.bankRate + 0.01 },
	},
	{
		id: "multipliers",
		label: "Multiplier strength",
		unitLabel: "75-125% of central fiscal multipliers",
		lowLabel: `Low multipliers (${scalePct(0.75)})`,
		highLabel: `High multipliers (${scalePct(1.25)})`,
		lowAssumptions: { multiplierScale: 0.75 },
		highAssumptions: { multiplierScale: 1.25 },
	},
	{
		id: "tax-buoyancy",
		label: "Tax buoyancy",
		unitLabel: "80-120% GDP-to-revenue feedback",
		lowLabel: `Weak tax buoyancy (${scalePct(0.8)})`,
		highLabel: `Strong tax buoyancy (${scalePct(1.2)})`,
		lowAssumptions: { taxBuoyancyScale: 0.8 },
		highAssumptions: { taxBuoyancyScale: 1.2 },
	},
	{
		id: "debt-risk-premium",
		label: "Gilt risk premium",
		unitLabel: "50-150% debt/GDP yield sensitivity",
		lowLabel: `Low sensitivity (${scalePct(0.5)})`,
		highLabel: `High sensitivity (${scalePct(1.5)})`,
		lowAssumptions: { debtRiskPremiumScale: 0.5 },
		highAssumptions: { debtRiskPremiumScale: 1.5 },
	},
];

const buildCase = (
	result: ScenarioResult,
	baseline: OBRBaseline,
	centralComparison: BaselineComparison | null,
	centralProjectionFinal: YearProjection | null,
	def: {
		id: string;
		parameterId: MacroStressLabCase["parameterId"];
		parameterLabel: string;
		label: string;
		assumptionLabel: string;
		assumptions: Partial<ProjectionAssumptions>;
	},
): MacroStressLabCase => {
	const projection = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
		def.assumptions,
	).withFeedback;
	const comparison = projectAgainstBaseline(projection, baseline);
	const ruleYear = comparison.ruleYear ?? comparison.years.at(-1);
	const centralRuleYear =
		centralComparison?.ruleYear ?? centralComparison?.years.at(-1);
	const finalProjection = projection.at(-1);
	const centralFinalProjection = centralProjectionFinal;
	return {
		id: def.id,
		parameterId: def.parameterId,
		parameterLabel: def.parameterLabel,
		label: def.label,
		assumptionLabel: def.assumptionLabel,
		assumptions: def.assumptions,
		adjustedHeadroomGbp: comparison.adjustedStabilityHeadroom,
		headroomDeltaGbp:
			centralComparison === null
				? 0
				: comparison.adjustedStabilityHeadroom -
					centralComparison.adjustedStabilityHeadroom,
		ruleYearPsnbGbp: ruleYear?.adjustedPsnb ?? 0,
		ruleYearPsnbDeltaGbp:
			centralRuleYear === undefined
				? 0
				: (ruleYear?.adjustedPsnb ?? 0) - centralRuleYear.adjustedPsnb,
		ruleYearDebtGdpPct: ruleYear?.adjustedDebtGdp ?? 0,
		ruleYearDebtGdpDeltaPp:
			centralRuleYear === undefined
				? 0
				: (ruleYear?.adjustedDebtGdp ?? 0) - centralRuleYear.adjustedDebtGdp,
		finalNetGbp: finalProjection?.net ?? 0,
		finalNetDeltaGbp:
			centralFinalProjection === null
				? 0
				: (finalProjection?.net ?? 0) - centralFinalProjection.net,
		finalDebtInterestGbp: finalProjection?.debtInterestGbp ?? 0,
		finalDebtInterestDeltaGbp:
			centralFinalProjection === null
				? 0
				: (finalProjection?.debtInterestGbp ?? 0) -
					centralFinalProjection.debtInterestGbp,
		riskRating: comparison.diagnostics.riskRating,
		consolidationRequiredGbp: comparison.diagnostics.consolidationRequiredGbp,
	};
};

export const buildMacroStressLab = (
	result: ScenarioResult,
	baseline: OBRBaseline = OBR_BASELINE,
): MacroStressLab => {
	const centralProjection = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
	).withFeedback;
	const centralComparison = projectAgainstBaseline(centralProjection, baseline);
	const centralProjectionFinal = centralProjection.at(-1) ?? null;
	const central = buildCase(
		result,
		baseline,
		null,
		null,
		{
			id: "central",
			parameterId: "central",
			parameterLabel: "Central",
			label: "Central",
			assumptionLabel: "Embedded central assumptions",
			assumptions: {},
		},
	);

	const parameters = PARAMETER_DEFINITIONS.map((definition) => {
		const lowCase = buildCase(
			result,
			baseline,
			centralComparison,
			centralProjectionFinal,
			{
				id: `${definition.id}-low`,
				parameterId: definition.id,
				parameterLabel: definition.label,
				label: definition.lowLabel,
				assumptionLabel: definition.unitLabel,
				assumptions: definition.lowAssumptions,
			},
		);
		const highCase = buildCase(
			result,
			baseline,
			centralComparison,
			centralProjectionFinal,
			{
				id: `${definition.id}-high`,
				parameterId: definition.id,
				parameterLabel: definition.label,
				label: definition.highLabel,
				assumptionLabel: definition.unitLabel,
				assumptions: definition.highAssumptions,
			},
		);
		const downsideCase =
			lowCase.adjustedHeadroomGbp <= highCase.adjustedHeadroomGbp
				? lowCase
				: highCase;
		const upsideCase =
			lowCase.adjustedHeadroomGbp > highCase.adjustedHeadroomGbp
				? lowCase
				: highCase;
		return {
			id: definition.id,
			label: definition.label,
			unitLabel: definition.unitLabel,
			lowCase,
			highCase,
			downsideCase,
			upsideCase,
			headroomRangeGbp: Math.abs(
				highCase.adjustedHeadroomGbp - lowCase.adjustedHeadroomGbp,
			),
			worstHeadroomDeltaGbp: downsideCase.headroomDeltaGbp,
		};
	});
	const largestDownside = parameters.reduce((worst, parameter) =>
		parameter.worstHeadroomDeltaGbp < worst.worstHeadroomDeltaGbp
			? parameter
			: worst,
	);
	const largestSwing = parameters.reduce((largest, parameter) =>
		parameter.headroomRangeGbp > largest.headroomRangeGbp
			? parameter
			: largest,
	);
	return {
		ruleYear: baseline.stabilityRuleAt,
		central: {
			...central,
			adjustedHeadroomGbp: centralComparison.adjustedStabilityHeadroom,
			ruleYearPsnbGbp:
				centralComparison.ruleYear?.adjustedPsnb ??
				centralComparison.years.at(-1)?.adjustedPsnb ??
				0,
			ruleYearDebtGdpPct:
				centralComparison.ruleYear?.adjustedDebtGdp ??
				centralComparison.years.at(-1)?.adjustedDebtGdp ??
				0,
			finalNetGbp: centralProjectionFinal?.net ?? 0,
			finalDebtInterestGbp: centralProjectionFinal?.debtInterestGbp ?? 0,
			riskRating: centralComparison.diagnostics.riskRating,
			consolidationRequiredGbp:
				centralComparison.diagnostics.consolidationRequiredGbp,
		},
		parameters,
		largestDownsideParameterLabel: largestDownside.label,
		largestSwingParameterLabel: largestSwing.label,
	};
};

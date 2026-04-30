import { getBorrowingStrategy } from "@/data/levers/borrowing";
import { getTaxLever } from "@/data/levers/tax-rates";
import { getProgramme } from "@/data/levers/uk-spending";
import {
	describeBorrowingContext,
	isBorrowingContextEmpty,
} from "./borrowing-context";
import { estimateBorrowingStressRegime } from "./borrowing-regime";
import { describeBehaviouralModel } from "./elasticity";
import {
	evaluateLineDynamic,
	evaluateLineMacro,
	evaluateScenario,
	projectScenarioWithGEFeedback,
	type LineEvaluation,
	type ScenarioResult,
} from "./scenario";

export interface ProvenanceLedgerRow {
	lineId: string;
	lineType: LineEvaluation["line"]["type"];
	leverId: string;
	leverLabel: string;
	description: string;
	sourceLabel: string;
	sourceUrl: string;
	methodologyAsOf: string;
	methodologyMeasure: string;
	methodologyCaveat: string | null;
	methodologyRangeLowGbp: number | null;
	methodologyRangeHighGbp: number | null;
	methodologyRangeNote: string | null;
	staticDeltaGbp: number;
	dynamicDeltaGbp: number;
	behaviouralAdjustmentGbp: number;
	behaviouralAdjustmentFraction: number;
	outputEffectGbp: number;
	workerCevGbp: number;
	behaviouralModelLabel: string | null;
	behaviouralModelSourceLabel: string | null;
	macroFeedbackGbp: number;
	macroAdjustedDeltaGbp: number;
	yearOneGeNetGbp: number;
	finalYearGeNetGbp: number;
	finalYearPsnbShiftGbp: number;
	finalYearDebtInterestGbp: number;
	finalYearDebtStockDeltaGbp: number;
	geAdjustmentGbp: number;
	uncertaintyBasis: string;
	riskContributionLabel: string;
	borrowingStrategyLabel: string | null;
	borrowingContextLabel: string | null;
	borrowingRegimeLabel: string | null;
	borrowingRegimeProbability: number | null;
	borrowingExpectedPeakPressureBp: number | null;
}

export interface ProvenanceLedger {
	rows: readonly ProvenanceLedgerRow[];
	sourceLinkedRows: number;
	rangeBackedRows: number;
	behaviouralRows: number;
	totalStaticDeltaGbp: number;
	totalDynamicDeltaGbp: number;
	totalBehaviouralAdjustmentGbp: number;
	totalMacroFeedbackGbp: number;
	totalFinalYearGeNetGbp: number;
	totalFinalYearDebtInterestGbp: number;
}

const leverLabelFor = (evaluation: LineEvaluation): string => {
	const { line } = evaluation;
	if (line.type === "borrow") return "Borrowing";
	if (line.type === "tax") return getTaxLever(line.leverId).name;
	return getProgramme(line.leverId).name;
};

const uncertaintyBasisFor = (evaluation: LineEvaluation): string => {
	if (evaluation.line.type === "borrow") return "Borrowing regime model";
	if (evaluation.methodology.range) return "Methodology range";
	return "Central estimate";
};

const riskContributionFor = (
	evaluation: LineEvaluation,
	row: {
		behaviouralAdjustmentFraction: number;
		macroFeedbackGbp: number;
		borrowingRegimeLabel: string | null;
		borrowingExpectedPeakPressureBp: number | null;
	},
): string => {
	if (evaluation.line.type === "borrow") {
		return row.borrowingRegimeLabel
			? `${row.borrowingRegimeLabel}; expected peak pressure ${Math.round(
					row.borrowingExpectedPeakPressureBp ?? 0,
				)}bp`
			: "Debt-interest and market-regime risk";
	}
	if (row.behaviouralAdjustmentFraction > 0.005) {
		return `Behavioural adjustment ${Math.round(
			row.behaviouralAdjustmentFraction * 100,
		)}%`;
	}
	if (Math.abs(row.macroFeedbackGbp) > 1_000_000) {
		return "Macro-feedback contribution";
	}
	if (evaluation.methodology.range) return "Range-backed fiscal estimate";
	return "No material modelled adjustment";
};

const buildRow = (
	evaluation: LineEvaluation,
	years: number,
): ProvenanceLedgerRow => {
	const dynamic = evaluateLineDynamic(evaluation);
	const macro = evaluateLineMacro(evaluation);
	const singleLineResult = evaluateScenario([evaluation.line]);
	const projection = projectScenarioWithGEFeedback(singleLineResult, years)
		.withFeedback;
	const yearOne = projection[0];
	const finalYear = projection.at(-1);
	const behaviouralSummary =
		evaluation.line.type === "tax"
			? describeBehaviouralModel(
					getTaxLever(evaluation.line.leverId).behaviour,
					evaluation.line.magnitude,
				)
			: null;
	const borrowingRegime =
		evaluation.line.type === "borrow" && evaluation.line.magnitude > 0
			? estimateBorrowingStressRegime(evaluation.line.magnitude, years, {
					strategyId: evaluation.line.borrowingStrategyId,
					portfolio: evaluation.line.borrowingPortfolio,
					context: evaluation.line.borrowingContext,
				})
			: null;
	const borrowingStrategyLabel =
		evaluation.line.type === "borrow"
			? evaluation.line.borrowingPortfolio
				? "Custom portfolio"
				: getBorrowingStrategy(evaluation.line.borrowingStrategyId).label
			: null;
	const borrowingContextLabel =
		evaluation.line.type === "borrow" &&
		!isBorrowingContextEmpty(evaluation.line.borrowingContext)
			? describeBorrowingContext(evaluation.line.borrowingContext)
			: evaluation.line.type === "borrow"
				? "Inferred from market features"
				: null;
	const range = evaluation.methodology.range;
	const partial = {
		behaviouralAdjustmentFraction: dynamic.behaviouralAdjustmentFraction,
		macroFeedbackGbp: macro.macroFeedbackGbp,
		borrowingRegimeLabel: borrowingRegime?.topRegime.label ?? null,
		borrowingExpectedPeakPressureBp:
			borrowingRegime?.expectedPeakPressureBp ?? null,
	};
	return {
		lineId: evaluation.line.id,
		lineType: evaluation.line.type,
		leverId: evaluation.line.leverId,
		leverLabel: leverLabelFor(evaluation),
		description: evaluation.description,
		sourceLabel: evaluation.source.label,
		sourceUrl: evaluation.source.url,
		methodologyAsOf: evaluation.methodology.asOf,
		methodologyMeasure: evaluation.methodology.measure,
		methodologyCaveat: evaluation.methodology.caveat ?? null,
		methodologyRangeLowGbp: range?.low ?? null,
		methodologyRangeHighGbp: range?.high ?? null,
		methodologyRangeNote: range?.note ?? null,
		staticDeltaGbp: dynamic.staticDelta,
		dynamicDeltaGbp: dynamic.dynamicDelta,
		behaviouralAdjustmentGbp: dynamic.behaviouralAdjustmentGbp,
		behaviouralAdjustmentFraction: dynamic.behaviouralAdjustmentFraction,
		outputEffectGbp: dynamic.outputEffectGbp,
		workerCevGbp: dynamic.workerCevGbp,
		behaviouralModelLabel: behaviouralSummary?.title ?? null,
		behaviouralModelSourceLabel: behaviouralSummary?.source?.label ?? null,
		macroFeedbackGbp: macro.macroFeedbackGbp,
		macroAdjustedDeltaGbp: macro.secondRoundDelta,
		yearOneGeNetGbp: yearOne?.net ?? 0,
		finalYearGeNetGbp: finalYear?.net ?? 0,
		finalYearPsnbShiftGbp: finalYear?.psnbShift ?? 0,
		finalYearDebtInterestGbp: finalYear?.debtInterestGbp ?? 0,
		finalYearDebtStockDeltaGbp: finalYear?.debtStockDeltaGbp ?? 0,
		geAdjustmentGbp: (yearOne?.net ?? 0) - macro.secondRoundDelta,
		uncertaintyBasis: uncertaintyBasisFor(evaluation),
		riskContributionLabel: riskContributionFor(evaluation, partial),
		borrowingStrategyLabel,
		borrowingContextLabel,
		borrowingRegimeLabel: borrowingRegime?.topRegime.label ?? null,
		borrowingRegimeProbability: borrowingRegime?.topRegime.probability ?? null,
		borrowingExpectedPeakPressureBp:
			borrowingRegime?.expectedPeakPressureBp ?? null,
	};
};

export const buildProvenanceLedger = (
	result: ScenarioResult,
	years: number,
): ProvenanceLedger => {
	const rows = result.lines.map((evaluation) => buildRow(evaluation, years));
	return {
		rows,
		sourceLinkedRows: rows.filter((row) => row.sourceUrl.length > 0).length,
		rangeBackedRows: rows.filter(
			(row) =>
				row.methodologyRangeLowGbp !== null &&
				row.methodologyRangeHighGbp !== null,
		).length,
		behaviouralRows: rows.filter(
			(row) => Math.abs(row.behaviouralAdjustmentGbp) > 1_000_000,
		).length,
		totalStaticDeltaGbp: rows.reduce(
			(sum, row) => sum + row.staticDeltaGbp,
			0,
		),
		totalDynamicDeltaGbp: rows.reduce(
			(sum, row) => sum + row.dynamicDeltaGbp,
			0,
		),
		totalBehaviouralAdjustmentGbp: rows.reduce(
			(sum, row) => sum + row.behaviouralAdjustmentGbp,
			0,
		),
		totalMacroFeedbackGbp: rows.reduce(
			(sum, row) => sum + row.macroFeedbackGbp,
			0,
		),
		totalFinalYearGeNetGbp: rows.reduce(
			(sum, row) => sum + row.finalYearGeNetGbp,
			0,
		),
		totalFinalYearDebtInterestGbp: rows.reduce(
			(sum, row) => sum + row.finalYearDebtInterestGbp,
			0,
		),
	};
};

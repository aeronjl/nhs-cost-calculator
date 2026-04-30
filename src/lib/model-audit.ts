import auctionDemandCalibration from "@/data/generated/auction-demand-calibration.json";
import { BORROWING } from "@/data/levers/borrowing";
import { TAX_LEVERS, getTaxLever } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import {
	auditBorrowingRegimeCalibration,
	summarizeBorrowingBacktests,
} from "./borrowing-backtest";
import {
	estimateBorrowingStressRegime,
	type BorrowingRegimeEstimate,
} from "./borrowing-regime";
import { auditFiscalReactionBacktests } from "./fiscal-reaction-backtest";
import type {
	FiscalRuleFan,
	FiscalRulePriorSensitivity,
	FiscalRuleUncertaintyDecomposition,
} from "./baseline-projection";
import type { ScenarioResult } from "./scenario";

export interface ModelAuditCalibrationItem {
	label: string;
	asOf: string;
	coverage: string;
	sourceLabel: string;
}

export interface ModelAuditBacktestSummary {
	borrowingCentralFit: string;
	borrowingOverlayFit: string;
	borrowingMeanOverlayMissBp: number;
	borrowingRegimeClassifierFit: string;
	borrowingRegimeMeanLabelProbability: number;
	fiscalReactionRuleOnlyFit: string;
	fiscalReactionPriorFit: string;
	fiscalReactionPriorChangedRows: number;
}

export interface ModelAuditScenarioSummary {
	lineCount: number;
	taxLineCount: number;
	programmeLineCount: number;
	borrowingLineCount: number;
	overriddenLineCount: number;
	borrowingAmountGbp: number;
	methodologyRangeCoverage: string;
	behaviouralTaxLines: number;
	baselineAsOf: string;
	stabilityRuleAt: string;
}

export interface ModelAuditRegimeProbability {
	id: string;
	label: string;
	probability: number;
	expectedOverlayBp: number;
	nearestEpisode: string;
}

export interface ModelAuditLiveRiskSummary {
	breachProbability: number | null;
	postReactionBreachProbability: number | null;
	topReactionPackageLabel: string | null;
	borrowingRegimeLabel: string | null;
	borrowingStressRating: BorrowingRegimeEstimate["stressRating"] | null;
	borrowingExpectedPeakPressureBp: number | null;
	regimeProbabilities: readonly ModelAuditRegimeProbability[];
	priorSensitivityRows: readonly {
		label: string;
		dominantPackageLabel: string | null;
		triggerProbability: number;
		postReactionBreachProbability: number;
		p95GrossActionGbp: number;
	}[];
	uncertaintyLayers: readonly {
		label: string;
		breachProbability: number;
		p5HeadroomGbp: number;
		p50HeadroomGbp: number;
		p5MoveGbp: number;
	}[];
	largestDownsideLayerLabel: string | null;
}

export interface ModelAuditEvidencePack {
	scenario: ModelAuditScenarioSummary;
	calibration: readonly ModelAuditCalibrationItem[];
	backtests: ModelAuditBacktestSummary;
	liveRisk: ModelAuditLiveRiskSummary;
	limitations: readonly string[];
}

const auctionCalibration = auctionDemandCalibration as {
	asOf: string;
	source: { label: string };
	curves: Record<string, unknown>;
};

const rangeCoverage = (result: ScenarioResult): string => {
	const covered = result.lines.filter((line) => line.methodology.range).length;
	return `${covered}/${Math.max(1, result.lines.length)}`;
};

const borrowingAmountFor = (result: ScenarioResult): number =>
	result.lines
		.filter((line) => line.line.type === "borrow" && line.line.magnitude > 0)
		.reduce((sum, line) => sum + line.line.magnitude, 0);

const borrowingRegimeFor = (
	result: ScenarioResult,
	years: number,
): BorrowingRegimeEstimate | null => {
	const borrowingLines = result.lines
		.filter((line) => line.line.type === "borrow" && line.line.magnitude > 0)
		.sort((a, b) => b.line.magnitude - a.line.magnitude);
	const amountGbp = borrowingAmountFor(result);
	const largest = borrowingLines[0];
	if (amountGbp <= 0 || !largest) return null;
	return estimateBorrowingStressRegime(amountGbp, years, {
		strategyId: largest.line.borrowingStrategyId,
		portfolio: largest.line.borrowingPortfolio,
		context: largest.line.borrowingContext,
	});
};

const topReactionPackageLabel = (
	fan: FiscalRuleFan | undefined,
): string | null =>
	fan?.reactionPackageMix
		.filter((row) => row.count > 0)
		.slice()
		.sort((a, b) => b.probability - a.probability)[0]?.label ?? null;

const largestDownsideLayerLabel = (
	decomposition: FiscalRuleUncertaintyDecomposition | undefined,
): string | null => {
	const layer = decomposition?.layers
		.filter((row) => row.id !== "central")
		.slice()
		.sort((a, b) => a.p5DeltaFromPreviousGbp - b.p5DeltaFromPreviousGbp)[0];
	return layer && layer.p5DeltaFromPreviousGbp < 0 ? layer.label : null;
};

export const buildModelAuditEvidencePack = ({
	result,
	baseline,
	fiscalRuleFan,
	fiscalRulePriorSensitivity,
	fiscalRuleUncertaintyDecomposition,
}: {
	result: ScenarioResult;
	baseline: OBRBaseline;
	fiscalRuleFan?: FiscalRuleFan;
	fiscalRulePriorSensitivity?: FiscalRulePriorSensitivity;
	fiscalRuleUncertaintyDecomposition?: FiscalRuleUncertaintyDecomposition;
}): ModelAuditEvidencePack => {
	const borrowingSummary = summarizeBorrowingBacktests();
	const borrowingAudit = auditBorrowingRegimeCalibration();
	const fiscalReactionAudit = auditFiscalReactionBacktests();
	const borrowingRegime = borrowingRegimeFor(result, baseline.years.length);
	const behaviouralTaxLines = result.lines.filter(
		(line) =>
			line.line.type === "tax" && Boolean(getTaxLever(line.line.leverId).behaviour),
	).length;
	const incidenceTaxLevers = TAX_LEVERS.filter((lever) => lever.incidence).length;
	const incidenceProgrammes = UK_SPENDING_PROGRAMMES.filter(
		(programme) => programme.incidence,
	).length;

	return {
		scenario: {
			lineCount: result.lines.length,
			taxLineCount: result.lines.filter((line) => line.line.type === "tax")
				.length,
			programmeLineCount: result.lines.filter(
				(line) => line.line.type === "programme",
			).length,
			borrowingLineCount: result.lines.filter(
				(line) => line.line.type === "borrow",
			).length,
			overriddenLineCount: result.lines.filter((line) => line.line.overridden)
				.length,
			borrowingAmountGbp: borrowingAmountFor(result),
			methodologyRangeCoverage: rangeCoverage(result),
			behaviouralTaxLines,
			baselineAsOf: baseline.asOf,
			stabilityRuleAt: baseline.stabilityRuleAt,
		},
		calibration: [
			{
				label: "Borrowing balance-sheet calibration",
				asOf: BORROWING.asOf,
				coverage: `${BORROWING.portfolio.length} debt instruments`,
				sourceLabel: BORROWING.source.label,
			},
			{
				label: "Auction demand calibration",
				asOf: auctionCalibration.asOf,
				coverage: `${Object.keys(auctionCalibration.curves).length} curves`,
				sourceLabel: auctionCalibration.source.label,
			},
			{
				label: "Tax lever calibration",
				asOf: "mixed",
				coverage: `${TAX_LEVERS.length} levers; ${TAX_LEVERS.filter((lever) => lever.behaviour).length} behavioural models; ${incidenceTaxLevers} incidence vectors`,
				sourceLabel: "HMRC / OBR / HMT sources",
			},
			{
				label: "Programme calibration",
				asOf: "mixed",
				coverage: `${UK_SPENDING_PROGRAMMES.length} programmes; ${incidenceProgrammes} incidence vectors`,
				sourceLabel: "HMT PESA and departmental sources",
			},
		],
		backtests: {
			borrowingCentralFit: `${borrowingSummary.centralPasses}/${borrowingSummary.results.length}`,
			borrowingOverlayFit: `${borrowingSummary.overlayPasses}/${borrowingSummary.results.length}`,
			borrowingMeanOverlayMissBp: borrowingSummary.meanOverlayAbsMissBp,
			borrowingRegimeClassifierFit: `${borrowingAudit.classifierMatches}/${borrowingAudit.rows.length}`,
			borrowingRegimeMeanLabelProbability:
				borrowingAudit.meanLabelProbability,
			fiscalReactionRuleOnlyFit: `${fiscalReactionAudit.mechanicalMatches}/${fiscalReactionAudit.rows.length}`,
			fiscalReactionPriorFit: `${fiscalReactionAudit.matches}/${fiscalReactionAudit.rows.length}`,
			fiscalReactionPriorChangedRows: fiscalReactionAudit.priorChangedRows,
		},
		liveRisk: {
			breachProbability: fiscalRuleFan?.breachProbability ?? null,
			postReactionBreachProbability:
				fiscalRuleFan?.postReactionBreachProbability ?? null,
			topReactionPackageLabel: topReactionPackageLabel(fiscalRuleFan),
			borrowingRegimeLabel: borrowingRegime?.topRegime.label ?? null,
			borrowingStressRating: borrowingRegime?.stressRating ?? null,
			borrowingExpectedPeakPressureBp:
				borrowingRegime?.expectedPeakPressureBp ?? null,
			regimeProbabilities:
				borrowingRegime?.probabilities.map((probability) => ({
					id: probability.id,
					label: probability.label,
					probability: probability.probability,
					expectedOverlayBp: probability.expectedOverlayBp,
					nearestEpisode: probability.nearestEpisode,
				})) ?? [],
			priorSensitivityRows:
				fiscalRulePriorSensitivity?.rows.map((row) => ({
					label: row.label,
					dominantPackageLabel: row.dominantPackage?.label ?? null,
					triggerProbability: row.fan.policyReactionTriggeredProbability,
					postReactionBreachProbability:
						row.fan.postReactionBreachProbability,
					p95GrossActionGbp: row.fan.endogenousReactionGrossBand.p95,
				})) ?? [],
			uncertaintyLayers:
				fiscalRuleUncertaintyDecomposition?.layers.map((layer) => ({
					label: layer.label,
					breachProbability: layer.breachProbability,
					p5HeadroomGbp: layer.headroomBand.p5,
					p50HeadroomGbp: layer.headroomBand.p50,
					p5MoveGbp: layer.p5DeltaFromPreviousGbp,
				})) ?? [],
			largestDownsideLayerLabel: largestDownsideLayerLabel(
				fiscalRuleUncertaintyDecomposition,
			),
		},
		limitations: [
			"Reduced-form macro-fiscal model, not a full OBR economy forecast.",
			"Borrowing-regime classifier is calibrated on a deliberately small historical episode set.",
			"Policy-reaction priors are transparent judgement weights, not estimated political probabilities.",
			"Distributional incidence is explicit where available; unmodelled lines are left out rather than allocated arbitrarily.",
		],
	};
};

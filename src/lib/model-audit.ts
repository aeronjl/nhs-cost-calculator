import auctionDemandCalibration from "@/data/generated/auction-demand-calibration.json";
import {
	BORROWING,
	type BorrowingStrategyId,
	getBorrowingStrategy,
} from "@/data/levers/borrowing";
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
	BaselineComparison,
	FiscalRuleFan,
	FiscalRulePriorSensitivity,
	FiscalRuleUncertaintyDecomposition,
} from "./baseline-projection";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
} from "./baseline-projection";
import {
	evaluateScenario,
	projectScenarioWithGEFeedback,
	type ScenarioLine,
	type ScenarioResult,
} from "./scenario";
import {
	describeBorrowingContext,
	type BorrowingScenarioContext,
} from "./borrowing-context";
import type { MacroStressLab } from "./macro-stress-lab";

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

export interface ModelAuditBaselineComparisonYear {
	fiscalYear: string;
	baselinePsnbGbp: number;
	scenarioPsnbShiftGbp: number;
	adjustedPsnbGbp: number;
	baselinePsnbPctGdp: number;
	adjustedPsnbPctGdp: number;
	baselineDebtGdpPct: number;
	adjustedDebtGdpPct: number;
	debtStockDeltaGbp: number;
}

export interface ModelAuditFiscalRuleComparison {
	stabilityRuleAt: string;
	baselineHeadroomGbp: number;
	adjustedHeadroomGbp: number;
	consolidationRequiredGbp: number;
	riskRating: BaselineComparison["diagnostics"]["riskRating"];
	debtProxyRisingAtHorizon: boolean;
	debtProxyShiftPpAtHorizon: number;
	policyReactionGbp: number;
}

export interface ModelAuditBaselineComparison {
	years: readonly ModelAuditBaselineComparisonYear[];
	rule: ModelAuditFiscalRuleComparison;
}

export interface ModelAuditBorrowingScenarioComparisonRow {
	id: string;
	label: string;
	description: string;
	strategyLabel: string;
	contextLabel: string;
	borrowingAmountGbp: number;
	finalYearInterestGbp: number;
	cumulativeInterestGbp: number;
	finalDebtStockDeltaGbp: number;
	adjustedHeadroomGbp: number;
	consolidationRequiredGbp: number;
	riskRating: BaselineComparison["diagnostics"]["riskRating"];
	breachProbability: number;
	postReactionBreachProbability: number;
	topReactionPackageLabel: string | null;
	topRegimeLabel: string | null;
	topRegimeProbability: number | null;
	expectedPeakPressureBp: number | null;
}

export interface ModelAuditBorrowingScenarioComparison {
	amountGbp: number;
	years: number;
	rows: readonly ModelAuditBorrowingScenarioComparisonRow[];
	bestHeadroomRowLabel: string;
	worstBreachRowLabel: string;
	highestInterestRowLabel: string;
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
	baselineComparison: ModelAuditBaselineComparison | null;
	borrowingScenarioComparison: ModelAuditBorrowingScenarioComparison | null;
	macroStressLab: MacroStressLab | null;
	calibration: readonly ModelAuditCalibrationItem[];
	backtests: ModelAuditBacktestSummary;
	liveRisk: ModelAuditLiveRiskSummary;
	limitations: readonly string[];
}

export interface ModelAuditExportOptions {
	generatedAt?: string;
	shareUrl?: string;
	title?: string;
}

export interface ModelAuditExportBundle {
	schemaVersion: 1;
	generatedAt: string;
	shareUrl?: string;
	audit: ModelAuditEvidencePack;
}

const auctionCalibration = auctionDemandCalibration as {
	asOf: string;
	source: { label: string };
	curves: Record<string, unknown>;
};

const SCENARIO_COMPARISON_FISCAL_SAMPLES = 48;
const SCENARIO_COMPARISON_SEED = 71;

const rangeCoverage = (result: ScenarioResult): string => {
	const covered = result.lines.filter((line) => line.methodology.range).length;
	return `${covered}/${Math.max(1, result.lines.length)}`;
};

const borrowingAmountFor = (result: ScenarioResult): number =>
	result.lines
		.filter((line) => line.line.type === "borrow" && line.line.magnitude > 0)
		.reduce((sum, line) => sum + line.line.magnitude, 0);

const positiveBorrowingLinesFor = (
	result: ScenarioResult,
): readonly ScenarioLine[] =>
	result.lines
		.filter((line) => line.line.type === "borrow" && line.line.magnitude > 0)
		.map((line) => line.line);

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

const buildBaselineComparisonSummary = (
	comparison: BaselineComparison | undefined,
): ModelAuditBaselineComparison | null => {
	if (!comparison) return null;
	return {
		years: comparison.years.map((year) => ({
			fiscalYear: year.fiscalYear,
			baselinePsnbGbp: year.baselinePsnb,
			scenarioPsnbShiftGbp: year.psnbShift,
			adjustedPsnbGbp: year.adjustedPsnb,
			baselinePsnbPctGdp: year.baselinePsnbPctGdp,
			adjustedPsnbPctGdp: year.adjustedPsnbPctGdp,
			baselineDebtGdpPct: year.baselineDebtGdp,
			adjustedDebtGdpPct: year.adjustedDebtGdp,
			debtStockDeltaGbp: year.debtStockDeltaGbp,
		})),
		rule: {
			stabilityRuleAt: comparison.baseline.stabilityRuleAt,
			baselineHeadroomGbp: comparison.baseline.stabilityRuleHeadroom,
			adjustedHeadroomGbp: comparison.adjustedStabilityHeadroom,
			consolidationRequiredGbp:
				comparison.diagnostics.consolidationRequiredGbp,
			riskRating: comparison.diagnostics.riskRating,
			debtProxyRisingAtHorizon:
				comparison.diagnostics.debtProxyRisingAtHorizon,
			debtProxyShiftPpAtHorizon:
				comparison.diagnostics.debtProxyShiftPpAtHorizon,
			policyReactionGbp: comparison.diagnostics.policyReactionGbp,
		},
	};
};

type BorrowingScenarioVariant = {
	id: string;
	label: string;
	description: string;
	strategyId?: BorrowingStrategyId;
	context?: BorrowingScenarioContext;
	useCurrentLines?: boolean;
};

const BORROWING_SCENARIO_VARIANTS: readonly BorrowingScenarioVariant[] = [
	{
		id: "current",
		label: "Current assumptions",
		description: "Borrowing lines exactly as entered in the scenario.",
		useCurrentLines: true,
	},
	{
		id: "obr-scored-dmo",
		label: "OBR-scored DMO blend",
		description: "Central institutional case with normal remit-style issuance.",
		strategyId: "dmo-remit",
		context: {
			fiscalEvent: "obr-scored",
			monetaryBackstop: "none",
			duration: "persistent",
		},
	},
	{
		id: "unscored-persistent",
		label: "Unscored persistent",
		description: "Credibility-stress case: persistent borrowing outside OBR scoring.",
		strategyId: "dmo-remit",
		context: {
			fiscalEvent: "unscored",
			monetaryBackstop: "none",
			duration: "persistent",
		},
	},
	{
		id: "emergency-backstop",
		label: "Emergency backstop",
		description: "Temporary emergency borrowing with monetary-policy backstop.",
		strategyId: "dmo-remit",
		context: {
			fiscalEvent: "emergency",
			monetaryBackstop: "qe-backstopped",
			duration: "temporary",
		},
	},
	{
		id: "short-funded-unscored",
		label: "Short-funded stress",
		description: "Unscored persistent borrowing funded with bills and short gilts.",
		strategyId: "short-funded",
		context: {
			fiscalEvent: "unscored",
			monetaryBackstop: "none",
			duration: "persistent",
		},
	},
	{
		id: "long-funded-scored",
		label: "Long-funded scored",
		description: "OBR-scored borrowing with longer-duration issuance.",
		strategyId: "long-funded",
		context: {
			fiscalEvent: "obr-scored",
			monetaryBackstop: "none",
			duration: "persistent",
		},
	},
];

const withBorrowingVariant = (
	lines: readonly ScenarioLine[],
	variant: BorrowingScenarioVariant,
): ScenarioLine[] =>
	lines.map((line) => {
		if (line.type !== "borrow" || line.magnitude <= 0 || variant.useCurrentLines) {
			return { ...line };
		}
		const { borrowingPortfolio: _portfolio, ...rest } = line;
		return {
			...rest,
			borrowingStrategyId: variant.strategyId,
			borrowingContext: variant.context,
		};
	});

const currentStrategyLabel = (lines: readonly ScenarioLine[]): string => {
	const positiveBorrowingLines = lines.filter(
		(line) => line.type === "borrow" && line.magnitude > 0,
	);
	const customCount = positiveBorrowingLines.filter(
		(line) => line.borrowingPortfolio,
	).length;
	const strategyLabels = Array.from(
		new Set(
			positiveBorrowingLines
				.filter((line) => !line.borrowingPortfolio)
				.map((line) => getBorrowingStrategy(line.borrowingStrategyId).label),
		),
	);
	if (customCount > 0 && strategyLabels.length > 0) {
		return `Mixed: custom + ${strategyLabels.join(", ")}`;
	}
	if (customCount > 0) return "Custom portfolio";
	return strategyLabels.length === 1 ? strategyLabels[0]! : "Mixed strategies";
};

const currentContextLabel = (lines: readonly ScenarioLine[]): string => {
	const labels = Array.from(
		new Set(
			lines
				.filter((line) => line.type === "borrow" && line.magnitude > 0)
				.map((line) => describeBorrowingContext(line.borrowingContext)),
		),
	);
	return labels.length === 1 ? labels[0]! : "Mixed context metadata";
};

const rowForBorrowingScenarioVariant = (
	lines: readonly ScenarioLine[],
	baseline: OBRBaseline,
	variant: BorrowingScenarioVariant,
	options: {
		currentFiscalRuleFan?: FiscalRuleFan;
		currentBaselineComparison?: BaselineComparison;
	} = {},
): ModelAuditBorrowingScenarioComparisonRow => {
	const scenarioLines = withBorrowingVariant(lines, variant);
	const variantResult = evaluateScenario(scenarioLines);
	const ge = projectScenarioWithGEFeedback(variantResult, baseline.years.length);
	const comparison =
		variant.useCurrentLines && options.currentBaselineComparison
			? options.currentBaselineComparison
			: projectAgainstBaseline(ge.withFeedback, baseline);
	const fiscalRuleFan =
		variant.useCurrentLines && options.currentFiscalRuleFan
			? options.currentFiscalRuleFan
			: projectFiscalRuleFan(
					variantResult,
					baseline,
					SCENARIO_COMPARISON_FISCAL_SAMPLES,
					SCENARIO_COMPARISON_SEED,
				);
	const borrowingRegime = borrowingRegimeFor(
		variantResult,
		baseline.years.length,
	);
	const finalProjection = ge.withFeedback.at(-1);
	const cumulativeInterestGbp = ge.withFeedback.reduce(
		(sum, year) => sum + year.debtInterestGbp,
		0,
	);
	const strategyLabel = variant.useCurrentLines
		? currentStrategyLabel(lines)
		: getBorrowingStrategy(variant.strategyId).label;
	const contextLabel = variant.useCurrentLines
		? currentContextLabel(lines)
		: describeBorrowingContext(variant.context);

	return {
		id: variant.id,
		label: variant.label,
		description: variant.description,
		strategyLabel,
		contextLabel,
		borrowingAmountGbp: borrowingAmountFor(variantResult),
		finalYearInterestGbp: finalProjection?.debtInterestGbp ?? 0,
		cumulativeInterestGbp,
		finalDebtStockDeltaGbp: finalProjection?.debtStockDeltaGbp ?? 0,
		adjustedHeadroomGbp: comparison.adjustedStabilityHeadroom,
		consolidationRequiredGbp: comparison.diagnostics.consolidationRequiredGbp,
		riskRating: comparison.diagnostics.riskRating,
		breachProbability: fiscalRuleFan.breachProbability,
		postReactionBreachProbability:
			fiscalRuleFan.postReactionBreachProbability,
		topReactionPackageLabel: topReactionPackageLabel(fiscalRuleFan),
		topRegimeLabel: borrowingRegime?.topRegime.label ?? null,
		topRegimeProbability: borrowingRegime?.topRegime.probability ?? null,
		expectedPeakPressureBp: borrowingRegime?.expectedPeakPressureBp ?? null,
	};
};

const buildBorrowingScenarioComparison = (
	result: ScenarioResult,
	baseline: OBRBaseline,
	options: {
		currentFiscalRuleFan?: FiscalRuleFan;
		currentBaselineComparison?: BaselineComparison;
	} = {},
): ModelAuditBorrowingScenarioComparison | null => {
	const lines = result.lines.map((line) => line.line);
	const amountGbp = borrowingAmountFor(result);
	if (amountGbp <= 0 || positiveBorrowingLinesFor(result).length === 0) {
		return null;
	}
	const rows = BORROWING_SCENARIO_VARIANTS.map((variant) =>
		rowForBorrowingScenarioVariant(lines, baseline, variant, options),
	);
	const bestHeadroomRow = rows.reduce((best, row) =>
		row.adjustedHeadroomGbp > best.adjustedHeadroomGbp ? row : best,
	);
	const worstBreachRow = rows.reduce((worst, row) =>
		row.breachProbability > worst.breachProbability ? row : worst,
	);
	const highestInterestRow = rows.reduce((highest, row) =>
		row.finalYearInterestGbp > highest.finalYearInterestGbp ? row : highest,
	);
	return {
		amountGbp,
		years: baseline.years.length,
		rows,
		bestHeadroomRowLabel: bestHeadroomRow.label,
		worstBreachRowLabel: worstBreachRow.label,
		highestInterestRowLabel: highestInterestRow.label,
	};
};

export const buildModelAuditEvidencePack = ({
	result,
	baseline,
	baselineComparison,
	macroStressLab,
	fiscalRuleFan,
	fiscalRulePriorSensitivity,
	fiscalRuleUncertaintyDecomposition,
}: {
	result: ScenarioResult;
	baseline: OBRBaseline;
	baselineComparison?: BaselineComparison;
	macroStressLab?: MacroStressLab;
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
		baselineComparison: buildBaselineComparisonSummary(baselineComparison),
		borrowingScenarioComparison: buildBorrowingScenarioComparison(
			result,
			baseline,
			{
				currentFiscalRuleFan: fiscalRuleFan,
				currentBaselineComparison: baselineComparison,
			},
		),
		macroStressLab: macroStressLab ?? null,
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

const formatGbp = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "-" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatSignedGbp = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	return `${sign}${formatGbp(Math.abs(n))}`;
};

const formatProbability = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n * 100)}%`;

const formatPct = (n: number): string => `${n.toFixed(1)}%`;

const formatSignedPp = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

const formatBp = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n)}bp`;

const md = (value: string | number | boolean | null): string =>
	String(value ?? "n/a").replace(/\|/g, "\\|");

const markdownTable = (
	headers: readonly string[],
	rows: readonly (readonly (string | number | boolean | null)[])[],
): string => {
	const header = `| ${headers.map(md).join(" | ")} |`;
	const divider = `| ${headers.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${row.map(md).join(" | ")} |`);
	return [header, divider, ...body].join("\n");
};

export const buildModelAuditExportBundle = (
	audit: ModelAuditEvidencePack,
	options: ModelAuditExportOptions = {},
): ModelAuditExportBundle => {
	const generatedAt = options.generatedAt ?? new Date().toISOString();
	return {
		schemaVersion: 1,
		generatedAt,
		...(options.shareUrl ? { shareUrl: options.shareUrl } : {}),
		audit,
	};
};

export const buildModelAuditJsonExport = (
	audit: ModelAuditEvidencePack,
	options: ModelAuditExportOptions = {},
): string => JSON.stringify(buildModelAuditExportBundle(audit, options), null, 2);

export const buildModelAuditMarkdownAppendix = (
	audit: ModelAuditEvidencePack,
	options: ModelAuditExportOptions = {},
): string => {
	const bundle = buildModelAuditExportBundle(audit, options);
	const title = options.title ?? "Model Audit Research Appendix";
	const scenario = audit.scenario;
	const liveRisk = audit.liveRisk;
	const sections: string[] = [
		`# ${title}`,
		`Generated: ${bundle.generatedAt}`,
	];

	if (bundle.shareUrl) sections.push(`Share URL: ${bundle.shareUrl}`);

	sections.push(
		"## Scenario",
		markdownTable(
			["Metric", "Value"],
			[
				["Scenario lines", scenario.lineCount],
				[
					"Composition",
					`${scenario.taxLineCount} tax / ${scenario.programmeLineCount} programme / ${scenario.borrowingLineCount} borrowing`,
				],
				["Borrowing amount", formatGbp(scenario.borrowingAmountGbp)],
				["Methodology range coverage", scenario.methodologyRangeCoverage],
				["Behavioural tax lines", scenario.behaviouralTaxLines],
				["Overridden lines", scenario.overriddenLineCount],
				["Baseline", `${scenario.baselineAsOf} EFO`],
				["Stability-rule year", scenario.stabilityRuleAt],
			],
		),
	);

	if (audit.baselineComparison) {
		const { years, rule } = audit.baselineComparison;
		sections.push(
			"## Baseline vs Scenario",
			markdownTable(
				[
					"Fiscal year",
					"Baseline PSNB",
					"Scenario shift",
					"Adjusted PSNB",
					"Baseline debt/GDP",
					"Adjusted debt/GDP",
				],
				years.map((year) => [
					year.fiscalYear,
					formatGbp(year.baselinePsnbGbp),
					formatSignedGbp(year.scenarioPsnbShiftGbp),
					formatGbp(year.adjustedPsnbGbp),
					formatPct(year.baselineDebtGdpPct),
					formatPct(year.adjustedDebtGdpPct),
				]),
			),
			markdownTable(
				["Fiscal-rule check", "Value"],
				[
					["Rule year", rule.stabilityRuleAt],
					["Baseline headroom", formatGbp(rule.baselineHeadroomGbp)],
					["Adjusted headroom", formatGbp(rule.adjustedHeadroomGbp)],
					[
						"Consolidation required",
						formatGbp(rule.consolidationRequiredGbp),
					],
					["Risk rating", rule.riskRating],
					["Debt proxy rising", rule.debtProxyRisingAtHorizon],
					[
						"Debt proxy shift",
						formatSignedPp(rule.debtProxyShiftPpAtHorizon),
					],
					["Policy reaction", formatGbp(rule.policyReactionGbp)],
				],
			),
		);
	}

	if (audit.borrowingScenarioComparison) {
		const comparison = audit.borrowingScenarioComparison;
		sections.push(
			"## Borrowing Scenario Matrix",
			`Amount compared: ${formatGbp(comparison.amountGbp)} over ${comparison.years} years.`,
			markdownTable(
				[
					"Variant",
					"Strategy",
					"Context",
					"Y5 interest",
					"Rule headroom",
					"Breach",
					"Post-reaction breach",
					"Regime",
					"Peak pressure",
				],
				comparison.rows.map((row) => [
					row.label,
					row.strategyLabel,
					row.contextLabel,
					formatGbp(row.finalYearInterestGbp),
					formatGbp(row.adjustedHeadroomGbp),
					formatProbability(row.breachProbability),
					formatProbability(row.postReactionBreachProbability),
					row.topRegimeLabel
						? `${row.topRegimeLabel} (${formatProbability(
								row.topRegimeProbability,
							)})`
						: "n/a",
					formatBp(row.expectedPeakPressureBp),
				]),
			),
			markdownTable(
				["Scenario comparison diagnostic", "Variant"],
				[
					["Best headroom", comparison.bestHeadroomRowLabel],
					["Worst breach probability", comparison.worstBreachRowLabel],
					["Highest final-year interest", comparison.highestInterestRowLabel],
				],
			),
		);
	}

	if (audit.macroStressLab) {
		const lab = audit.macroStressLab;
		sections.push(
			"## Macro Stress Lab",
			markdownTable(
				["Metric", "Value"],
				[
					["Rule year", lab.ruleYear],
					["Central headroom", formatGbp(lab.central.adjustedHeadroomGbp)],
					["Central PSNB", formatGbp(lab.central.ruleYearPsnbGbp)],
					["Central debt/GDP", formatPct(lab.central.ruleYearDebtGdpPct)],
					["Largest downside", lab.largestDownsideParameterLabel],
					["Largest swing", lab.largestSwingParameterLabel],
				],
			),
			markdownTable(
				[
					"Assumption",
					"Low case",
					"Low headroom move",
					"High case",
					"High headroom move",
					"Worst headroom",
					"PSNB move",
					"Debt/GDP move",
					"Y5 interest move",
				],
				lab.parameters.map((parameter) => [
					parameter.label,
					parameter.lowCase.label,
					formatSignedGbp(parameter.lowCase.headroomDeltaGbp),
					parameter.highCase.label,
					formatSignedGbp(parameter.highCase.headroomDeltaGbp),
					formatGbp(parameter.downsideCase.adjustedHeadroomGbp),
					formatSignedGbp(parameter.downsideCase.ruleYearPsnbDeltaGbp),
					formatSignedPp(parameter.downsideCase.ruleYearDebtGdpDeltaPp),
					formatSignedGbp(parameter.downsideCase.finalDebtInterestDeltaGbp),
				]),
			),
			markdownTable(
				["Macro stress diagnostic", "Assumption"],
				[
					["Largest downside", lab.largestDownsideParameterLabel],
					["Largest headroom range", lab.largestSwingParameterLabel],
				],
			),
		);
	}

	sections.push(
		"## Calibration Evidence",
		markdownTable(
			["Calibration", "As of", "Coverage", "Source"],
			audit.calibration.map((item) => [
				item.label,
				item.asOf,
				item.coverage,
				item.sourceLabel,
			]),
		),
		"## Historical Backtests",
		markdownTable(
			["Metric", "Result"],
			[
				["Borrowing central fit", audit.backtests.borrowingCentralFit],
				[
					"Borrowing overlay fit",
					`${audit.backtests.borrowingOverlayFit}; mean miss ${formatBp(
						audit.backtests.borrowingMeanOverlayMissBp,
					)}`,
				],
				[
					"Borrowing regime classifier",
					`${audit.backtests.borrowingRegimeClassifierFit}; mean labelled probability ${formatProbability(
						audit.backtests.borrowingRegimeMeanLabelProbability,
					)}`,
				],
				[
					"Fiscal reaction fit",
					`${audit.backtests.fiscalReactionPriorFit}; rule-only ${audit.backtests.fiscalReactionRuleOnlyFit}`,
				],
				[
					"Prior changed rows",
					audit.backtests.fiscalReactionPriorChangedRows,
				],
			],
		),
		"## Live Risk",
		markdownTable(
			["Metric", "Value"],
			[
				["Raw breach risk", formatProbability(liveRisk.breachProbability)],
				[
					"Post-reaction breach risk",
					formatProbability(liveRisk.postReactionBreachProbability),
				],
				["Top reaction package", liveRisk.topReactionPackageLabel],
				["Borrowing regime", liveRisk.borrowingRegimeLabel],
				["Borrowing stress rating", liveRisk.borrowingStressRating],
				[
					"Expected peak borrowing pressure",
					formatBp(liveRisk.borrowingExpectedPeakPressureBp),
				],
				["Largest downside layer", liveRisk.largestDownsideLayerLabel],
			],
		),
	);

	if (liveRisk.regimeProbabilities.length > 0) {
		sections.push(
			"### Borrowing Regime Probabilities",
			markdownTable(
				["Regime", "Probability", "Overlay", "Nearest episode"],
				liveRisk.regimeProbabilities.map((row) => [
					row.label,
					formatProbability(row.probability),
					formatBp(row.expectedOverlayBp),
					row.nearestEpisode,
				]),
			),
		);
	}

	if (liveRisk.priorSensitivityRows.length > 0) {
		sections.push(
			"### Prior Sensitivity",
			markdownTable(
				["Prior", "Dominant package", "Trigger", "Post-breach", "p95 action"],
				liveRisk.priorSensitivityRows.map((row) => [
					row.label,
					row.dominantPackageLabel,
					formatProbability(row.triggerProbability),
					formatProbability(row.postReactionBreachProbability),
					formatGbp(row.p95GrossActionGbp),
				]),
			),
		);
	}

	if (liveRisk.uncertaintyLayers.length > 0) {
		sections.push(
			"### Uncertainty Decomposition",
			markdownTable(
				["Layer", "Breach", "p5 headroom", "p50 headroom", "p5 move"],
				liveRisk.uncertaintyLayers.map((row) => [
					row.label,
					formatProbability(row.breachProbability),
					formatGbp(row.p5HeadroomGbp),
					formatGbp(row.p50HeadroomGbp),
					row.label === "Central path" ? "base" : formatSignedGbp(row.p5MoveGbp),
				]),
			),
		);
	}

	sections.push(
		"## Limitations",
		audit.limitations.map((limitation) => `- ${limitation}`).join("\n"),
	);

	return `${sections.join("\n\n")}\n`;
};

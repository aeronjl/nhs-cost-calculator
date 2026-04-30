import {
	BORROWING_STRATEGIES,
	type BorrowingStrategyId,
	type DebtInstrument,
} from "@/data/levers/borrowing";
import {
	type BorrowingPathAssumptions,
	optimiseBorrowingStrategy,
	projectBorrowingMarketReactionPath,
	projectBorrowingPath,
	projectBorrowingStrategyFrontier,
	projectBorrowingStressCases,
} from "@/lib/borrowing";
import {
	decomposeBorrowingFan,
	estimateBorrowingStressRegime,
} from "@/lib/borrowing-regime";
import { projectFiscalRuleFan } from "@/lib/baseline-projection";
import { evaluateScenario, type ScenarioLine } from "@/lib/scenario";

export type BorrowingStrategyComparisonId = BorrowingStrategyId | "optimised";

export interface BorrowingStrategyComparisonRow {
	id: BorrowingStrategyComparisonId;
	label: string;
	description: string;
	portfolio: readonly DebtInstrument[];
	averageMaturityYears: number;
	treasuryBillShare: number;
	indexLinkedShare: number;
	objectiveGbp: number;
	centralFinalInterestGbp: number;
	centralCumulativeInterestGbp: number;
	centralFinalDebtStockGbp: number;
	worstStressLabel: string;
	worstStressFinalInterestGbp: number;
	regimeTopLabel: string;
	regimeTopProbability: number;
	expectedRegimeOverlayBp: number;
	regimeInterestP95Gbp: number;
	regimeInterestTailGbp: number;
	continuousInterestTailGbp: number;
	fiscalBreachProbability: number;
	fiscalTightOrBreachProbability: number;
	fiscalHeadroomP5Gbp: number;
	fiscalPolicyReactionP95Gbp: number;
	peakMarketPressureBp: number;
	peakAbsorptionStressIndex: number;
	bottleneckInstrumentLabel: string;
	investorBottleneckLabel: string;
	isOptimised: boolean;
}

export interface BorrowingStrategyComparison {
	amountGbp: number;
	years: number;
	rows: BorrowingStrategyComparisonRow[];
	optimisedRow: BorrowingStrategyComparisonRow;
	bestNamedRow: BorrowingStrategyComparisonRow;
}

const DEFAULT_AMOUNT_GBP = 50_000_000_000;
const DEFAULT_YEARS = 5;
const DEFAULT_FAN_SAMPLES = 300;
const DEFAULT_FISCAL_SAMPLES = 250;
const DEFAULT_SEED = 31;

const cumulativeInterest = (
	path: readonly { interestCostGbp: number }[],
): number => path.reduce((sum, year) => sum + year.interestCostGbp, 0);

const peakPressureBp = (
	path: ReturnType<typeof projectBorrowingMarketReactionPath>,
): number =>
	Math.max(
		0,
		...path.map(
			(year) =>
				(year.riskPremium +
					year.absorptionPremium +
					year.marketReactionPremium) *
				10_000,
		),
	);

const portfolioLabel = (
	portfolio: readonly DebtInstrument[],
	id: BorrowingStrategyComparisonId,
): string => {
	const named = BORROWING_STRATEGIES.find((strategy) => strategy.id === id);
	if (named) return named.description;
	const material = portfolio
		.filter((instrument) => instrument.share >= 0.025)
		.map(
			(instrument) =>
				`${instrument.label.replace(" conventional gilts", "")} ${Math.round(
					instrument.share * 100,
				)}%`,
		)
		.join(", ");
	return `Grid-searched least-cost-risk mix under the borrowing optimiser constraints: ${material}.`;
};

const scenarioLineFor = (
	id: BorrowingStrategyComparisonId,
	amountGbp: number,
	portfolio: readonly DebtInstrument[],
): ScenarioLine => ({
	id: `borrow-${id}`,
	type: "borrow",
	leverId: "",
	magnitude: amountGbp,
	...(id === "optimised"
		? { borrowingPortfolio: portfolio }
		: { borrowingStrategyId: id }),
});

const rowFor = (
	input: {
		id: BorrowingStrategyComparisonId;
		label: string;
		portfolio: readonly DebtInstrument[];
		averageMaturityYears: number;
		treasuryBillShare: number;
		indexLinkedShare: number;
		objectiveGbp: number;
	},
	amountGbp: number,
	years: number,
	fanSamples: number,
	fiscalSamples: number,
	seed: number,
): BorrowingStrategyComparisonRow => {
	const assumptions: Partial<BorrowingPathAssumptions> =
		input.id === "optimised"
			? { portfolio: input.portfolio }
			: { strategyId: input.id };
	const centralPath = projectBorrowingPath(amountGbp, years, assumptions);
	const finalCentral = centralPath.at(-1)!;
	const stressCases = projectBorrowingStressCases(amountGbp, years, assumptions);
	const worstStress = stressCases.slice(1).reduce((worst, item) => {
		const itemFinal = item.path.at(-1)!;
		const worstFinal = worst.path.at(-1)!;
		return itemFinal.interestCostGbp > worstFinal.interestCostGbp
			? item
			: worst;
	}, stressCases[1]!);
	const worstStressFinal = worstStress.path.at(-1)!;
	const regime = estimateBorrowingStressRegime(amountGbp, years, assumptions);
	const fan = decomposeBorrowingFan(
		amountGbp,
		years,
		assumptions,
		fanSamples,
		seed,
	);
	const marketReaction = projectBorrowingMarketReactionPath(
		amountGbp,
		years,
		assumptions,
	);
	const peakMarketYear = marketReaction.reduce((peak, year) =>
		year.absorptionStressIndex > peak.absorptionStressIndex ? year : peak,
	);
	const bottleneck =
		peakMarketYear.instruments.find(
			(instrument) => instrument.id === peakMarketYear.absorptionBottleneck,
		) ?? null;
	const investorBottleneck =
		bottleneck?.investorDemandBreakdown.find(
			(item) => item.id === bottleneck.investorBottleneck,
		) ?? null;
	const fiscalFan = projectFiscalRuleFan(
		evaluateScenario([scenarioLineFor(input.id, amountGbp, input.portfolio)]),
		undefined,
		fiscalSamples,
		seed,
	);

	return {
		id: input.id,
		label: input.label,
		description: portfolioLabel(input.portfolio, input.id),
		portfolio: input.portfolio,
		averageMaturityYears: input.averageMaturityYears,
		treasuryBillShare: input.treasuryBillShare,
		indexLinkedShare: input.indexLinkedShare,
		objectiveGbp: input.objectiveGbp,
		centralFinalInterestGbp: finalCentral.interestCostGbp,
		centralCumulativeInterestGbp: cumulativeInterest(centralPath),
		centralFinalDebtStockGbp: finalCentral.debtStockDeltaGbp,
		worstStressLabel: worstStress.label,
		worstStressFinalInterestGbp: worstStressFinal.interestCostGbp,
		regimeTopLabel: regime.topRegime.label,
		regimeTopProbability: regime.topRegime.probability,
		expectedRegimeOverlayBp: regime.expectedOverlayBp,
		regimeInterestP95Gbp: fan.finalYear.regimeInterestP95Gbp,
		regimeInterestTailGbp: fan.finalYear.regimeInterestTailGbp,
		continuousInterestTailGbp: fan.finalYear.continuousInterestTailGbp,
		fiscalBreachProbability: fiscalFan.breachProbability,
		fiscalTightOrBreachProbability: fiscalFan.tightOrBreachProbability,
		fiscalHeadroomP5Gbp: fiscalFan.headroomBand.p5,
		fiscalPolicyReactionP95Gbp: fiscalFan.policyReactionBand.p95,
		peakMarketPressureBp: peakPressureBp(marketReaction),
		peakAbsorptionStressIndex: peakMarketYear.absorptionStressIndex,
		bottleneckInstrumentLabel: bottleneck?.label ?? "none",
		investorBottleneckLabel: investorBottleneck?.label ?? "none",
		isOptimised: input.id === "optimised",
	};
};

export const compareBorrowingStrategies = (
	amountGbp = DEFAULT_AMOUNT_GBP,
	years = DEFAULT_YEARS,
	options: {
		fanSamples?: number;
		fiscalSamples?: number;
		seed?: number;
	} = {},
): BorrowingStrategyComparison => {
	const fanSamples = options.fanSamples ?? DEFAULT_FAN_SAMPLES;
	const fiscalSamples = options.fiscalSamples ?? DEFAULT_FISCAL_SAMPLES;
	const seed = options.seed ?? DEFAULT_SEED;
	const frontier = projectBorrowingStrategyFrontier(amountGbp, years);
	const optimisation = optimiseBorrowingStrategy(amountGbp, years);
	const namedInputs = frontier.cases.map((item) => ({
		id: item.id,
		label: item.label,
		portfolio: item.portfolio,
		averageMaturityYears: item.averageMaturityYears,
		treasuryBillShare: item.treasuryBillShare,
		indexLinkedShare: item.indexLinkedShare,
		objectiveGbp: item.objectiveGbp,
	}));
	const optimisedInput = {
		id: "optimised" as const,
		label: "Optimised mix",
		portfolio: optimisation.optimum.portfolio,
		averageMaturityYears: optimisation.optimum.averageMaturityYears,
		treasuryBillShare: optimisation.optimum.treasuryBillShare,
		indexLinkedShare: optimisation.optimum.indexLinkedShare,
		objectiveGbp: optimisation.optimum.objectiveGbp,
	};
	const rows = [...namedInputs, optimisedInput].map((input) =>
		rowFor(input, amountGbp, years, fanSamples, fiscalSamples, seed),
	);
	const optimisedRow = rows.find((row) => row.id === "optimised")!;
	const bestNamedRow = rows
		.filter((row) => !row.isOptimised)
		.reduce((best, row) => (row.objectiveGbp < best.objectiveGbp ? row : best));
	return {
		amountGbp,
		years,
		rows,
		optimisedRow,
		bestNamedRow,
	};
};

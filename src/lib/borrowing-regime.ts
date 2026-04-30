import { BORROWING_BACKTEST_EPISODES } from "@/data/borrowing-backtests";
import { BORROWING } from "@/data/levers/borrowing";
import {
	type BorrowingFanYear,
	type BorrowingMarketReactionYear,
	type BorrowingPathAssumptions,
	projectBorrowingFan,
	projectBorrowingPath,
	projectBorrowingMarketReactionPath,
} from "@/lib/borrowing";
import type { BorrowingScenarioContext } from "@/lib/borrowing-context";
import {
	computeBand,
	sampleNormal,
	seededRng,
} from "@/lib/uncertainty";

export type BorrowingStressRegimeId =
	| "normal"
	| "credibility-shock"
	| "monetary-backstop";

export interface BorrowingStressRegimeDefinition {
	id: BorrowingStressRegimeId;
	label: string;
	expectedOverlayBp: number;
	description: string;
}

export interface BorrowingRegimeFeatures {
	amountGbp: number;
	issuanceShareOfGfr: number;
	finalDebtGdpDeltaPp: number;
	centralPeakPressureBp: number;
	peakAbsorptionConcessionBp: number;
	peakAbsorptionStressIndex: number;
	peakMarketReactionBp: number;
}

export interface BorrowingRegimeProbability {
	id: BorrowingStressRegimeId;
	label: string;
	probability: number;
	expectedOverlayBp: number;
	nearestEpisode: string;
}

export interface BorrowingRegimeEstimate {
	features: BorrowingRegimeFeatures;
	context: BorrowingScenarioContext;
	contextLogitAdjustments: Record<BorrowingStressRegimeId, number>;
	probabilities: readonly BorrowingRegimeProbability[];
	topRegime: BorrowingRegimeProbability;
	expectedOverlayBp: number;
	expectedPeakPressureBp: number;
	stressRating: "low" | "watch" | "stress";
}

export interface BorrowingRegimeDraw {
	id: BorrowingStressRegimeId;
	label: string;
	overlayBp: number;
	probability: number;
}

export interface BorrowingFanDecompositionYear {
	year: number;
	centralInterestCostGbp: number;
	continuousInterestP95Gbp: number;
	regimeInterestP95Gbp: number;
	continuousInterestTailGbp: number;
	regimeInterestTailGbp: number;
	regimeShareOfInterestTail: number;
	continuousDebtP95Gbp: number;
	regimeDebtP95Gbp: number;
	regimeDebtTailGbp: number;
	continuousPsnbP5Gbp: number;
	regimePsnbP5Gbp: number;
	regimePsnbDownsideGbp: number;
}

export interface BorrowingFanDecomposition {
	continuousFan: BorrowingFanYear[];
	regimeFan: BorrowingFanYear[];
	years: BorrowingFanDecompositionYear[];
	finalYear: BorrowingFanDecompositionYear;
}

export interface BorrowingRegimeAssumptions
	extends Partial<BorrowingPathAssumptions> {
	context?: BorrowingScenarioContext;
}

export const BORROWING_STRESS_REGIMES: readonly BorrowingStressRegimeDefinition[] =
	[
		{
			id: "normal",
			label: "Normal absorption",
			expectedOverlayBp: 0,
			description:
				"OBR-scored or otherwise credible borrowing absorbed through ordinary gilt-market depth.",
		},
		{
			id: "credibility-shock",
			label: "Credibility shock",
			expectedOverlayBp: 110,
			description:
				"Unscored or institutionally weak fiscal event where term premia jump beyond issuance arithmetic.",
		},
		{
			id: "monetary-backstop",
			label: "Monetary backstop",
			expectedOverlayBp: -330,
			description:
				"Emergency or global shock where central-bank purchases and safe-asset demand suppress gilt stress.",
		},
	];

const REGIME_LABELS = BORROWING_STRESS_REGIMES.reduce<
	Record<BorrowingStressRegimeId, string>
>((labels, regime) => {
	labels[regime.id] = regime.label;
	return labels;
}, {} as Record<BorrowingStressRegimeId, string>);

const REGIME_OVERLAY_BP = BORROWING_STRESS_REGIMES.reduce<
	Record<BorrowingStressRegimeId, number>
>((overlays, regime) => {
	overlays[regime.id] = regime.expectedOverlayBp;
	return overlays;
}, {} as Record<BorrowingStressRegimeId, number>);

const FEATURE_SCALE: Record<keyof BorrowingRegimeFeatures, number> = {
	amountGbp: 80_000_000_000,
	issuanceShareOfGfr: 0.25,
	finalDebtGdpDeltaPp: 3,
	centralPeakPressureBp: 80,
	peakAbsorptionConcessionBp: 35,
	peakAbsorptionStressIndex: 1.5,
	peakMarketReactionBp: 60,
};

const SOFTMAX_TEMPERATURE = 0.4;

const emptyLogitAdjustments = (): Record<BorrowingStressRegimeId, number> => ({
	normal: 0,
	"credibility-shock": 0,
	"monetary-backstop": 0,
});

const contextLogitAdjustmentsFor = (
	context: BorrowingScenarioContext = {},
): Record<BorrowingStressRegimeId, number> => {
	const adjustment = emptyLogitAdjustments();
	switch (context.fiscalEvent) {
		case "obr-scored":
			adjustment.normal += 1.2;
			adjustment["credibility-shock"] -= 1.3;
			adjustment["monetary-backstop"] -= 0.3;
			break;
		case "unscored":
			adjustment["credibility-shock"] += 1.4;
			adjustment.normal -= 0.5;
			adjustment["monetary-backstop"] -= 0.3;
			break;
		case "emergency":
			adjustment["monetary-backstop"] += 0.8;
			adjustment["credibility-shock"] += 0.3;
			adjustment.normal -= 0.6;
			break;
	}
	switch (context.monetaryBackstop) {
		case "qe-backstopped":
			adjustment["monetary-backstop"] += 3.5;
			adjustment["credibility-shock"] -= 1.2;
			adjustment.normal -= 0.8;
			break;
		case "none":
			adjustment["monetary-backstop"] -= 1.4;
			break;
	}
	switch (context.duration) {
		case "temporary":
			adjustment["monetary-backstop"] += 0.4;
			adjustment.normal += 0.25;
			adjustment["credibility-shock"] -= 0.25;
			break;
		case "persistent":
			adjustment["credibility-shock"] += 0.55;
			adjustment.normal -= 0.15;
			adjustment["monetary-backstop"] -= 0.55;
			break;
	}
	return adjustment;
};

const centralPeakPressureBp = (
	path: readonly BorrowingMarketReactionYear[],
): number =>
	Math.max(
		0,
		...path.map(
			(row) =>
				(row.riskPremium +
					row.absorptionPremium +
					row.marketReactionPremium) *
				10_000,
		),
	);

const featuresForPath = (
	amountGbp: number,
	path: readonly BorrowingMarketReactionYear[],
): BorrowingRegimeFeatures => {
	const finalYear = path.at(-1)!;
	return {
		amountGbp,
		issuanceShareOfGfr:
			BORROWING.grossFinancingRequirement > 0
				? amountGbp / BORROWING.grossFinancingRequirement
				: 0,
		finalDebtGdpDeltaPp: finalYear.debtGdpDeltaPp,
		centralPeakPressureBp: centralPeakPressureBp(path),
		peakAbsorptionConcessionBp: Math.max(
			0,
			...path.flatMap((row) =>
				row.instruments.map(
					(instrument) => instrument.auctionClearingConcessionBp,
				),
			),
		),
		peakAbsorptionStressIndex: Math.max(
			0,
			...path.map((row) => row.absorptionStressIndex),
		),
		peakMarketReactionBp: Math.max(
			0,
			...path.map((row) => row.marketReactionPremium * 10_000),
		),
	};
};

const featureDistance = (
	a: BorrowingRegimeFeatures,
	b: BorrowingRegimeFeatures,
): number => {
	const keys = Object.keys(FEATURE_SCALE) as (keyof BorrowingRegimeFeatures)[];
	return Math.sqrt(
		keys.reduce((sum, key) => {
			const scaled = (a[key] - b[key]) / FEATURE_SCALE[key];
			return sum + scaled * scaled;
		}, 0),
	);
};

const labelledEpisodeFeatures = () =>
	BORROWING_BACKTEST_EPISODES.map((episode) => {
		const path = projectBorrowingMarketReactionPath(
			episode.amountGbp,
			episode.years,
			{ strategyId: episode.strategyId ?? "dmo-remit" },
		);
		return {
			episode,
			features: featuresForPath(episode.amountGbp, path),
		};
	});

const stressRatingFor = (
	expectedPeakPressureBp: number,
	topRegime: BorrowingStressRegimeId,
): BorrowingRegimeEstimate["stressRating"] => {
	if (topRegime === "credibility-shock" || expectedPeakPressureBp >= 100) {
		return "stress";
	}
	if (expectedPeakPressureBp >= 35 || topRegime === "monetary-backstop") {
		return "watch";
	}
	return "low";
};

export const estimateBorrowingStressRegime = (
	amountGbp: number,
	years: number,
	assumptions: BorrowingRegimeAssumptions = {},
): BorrowingRegimeEstimate => {
	const path = projectBorrowingMarketReactionPath(amountGbp, years, {
		strategyId: assumptions.strategyId ?? "dmo-remit",
		portfolio: assumptions.portfolio,
	});
	const features = featuresForPath(amountGbp, path);
	const context = assumptions.context ?? {};
	const contextLogitAdjustments = contextLogitAdjustmentsFor(context);
	const calibration = labelledEpisodeFeatures().map((item) => ({
		...item,
		distance: featureDistance(features, item.features),
	}));
	const weights = calibration.map((item) =>
		Math.exp(
			-item.distance / SOFTMAX_TEMPERATURE +
				contextLogitAdjustments[item.episode.regime],
		),
	);
	const weightTotal = weights.reduce((sum, value) => sum + value, 0);
	const probabilities = calibration
		.map<BorrowingRegimeProbability>((item, index) => {
			const id = item.episode.regime;
			return {
				id,
				label: REGIME_LABELS[id],
				probability: weightTotal > 0 ? weights[index]! / weightTotal : 0,
				expectedOverlayBp: REGIME_OVERLAY_BP[id],
				nearestEpisode: item.episode.name,
			};
		})
		.sort((a, b) => b.probability - a.probability);
	const expectedOverlayBp = probabilities.reduce(
		(sum, item) => sum + item.probability * item.expectedOverlayBp,
		0,
	);
	const expectedPeakPressureBp = Math.max(
		0,
		features.centralPeakPressureBp + expectedOverlayBp,
	);
	const topRegime = probabilities[0]!;

	return {
		features,
		context,
		contextLogitAdjustments,
		probabilities,
		topRegime,
		expectedOverlayBp,
		expectedPeakPressureBp,
		stressRating: stressRatingFor(expectedPeakPressureBp, topRegime.id),
	};
};

export const drawBorrowingStressRegime = (
	estimate: BorrowingRegimeEstimate,
	rng: () => number,
): BorrowingRegimeDraw => {
	const threshold = rng();
	let cumulative = 0;
	for (const regime of estimate.probabilities) {
		cumulative += regime.probability;
		if (threshold <= cumulative) {
			return {
				id: regime.id,
				label: regime.label,
				overlayBp: regime.expectedOverlayBp,
				probability: regime.probability,
			};
		}
	}
	const fallback = estimate.probabilities.at(-1)!;
	return {
		id: fallback.id,
		label: fallback.label,
		overlayBp: fallback.expectedOverlayBp,
		probability: fallback.probability,
	};
};

export const sampleBorrowingRegimeOverlayBp = (
	estimate: BorrowingRegimeEstimate,
	rng: () => number,
): number => drawBorrowingStressRegime(estimate, rng).overlayBp;

export const projectBorrowingRegimeFan = (
	amount: number,
	years: number,
	assumptions: BorrowingRegimeAssumptions = {},
	samples = 1000,
	seed = 73,
): BorrowingFanYear[] => {
	const centralPath = projectBorrowingPath(amount, years, assumptions);
	const regimeEstimate = estimateBorrowingStressRegime(amount, years, {
		strategyId: assumptions.strategyId,
		portfolio: assumptions.portfolio,
		context: assumptions.context,
	});
	const rng = seededRng(seed);
	const regimeRng = seededRng(seed + 7_919);
	const interestByYear: number[][] = Array.from({ length: years }, () => []);
	const debtByYear: number[][] = Array.from({ length: years }, () => []);
	const psnbByYear: number[][] = Array.from({ length: years }, () => []);

	for (let sample = 0; sample < samples; sample++) {
		const commonShock = sampleNormal(rng, { mean: 0, sd: 1 });
		const bankRateShock =
			commonShock * 0.0055 + sampleNormal(rng, { mean: 0, sd: 0.0045 });
		const inflationShock =
			commonShock * 0.009 + sampleNormal(rng, { mean: 0, sd: 0.006 });
		const giltShock =
			commonShock * 0.008 + sampleNormal(rng, { mean: 0, sd: 0.0055 });
		const growthShock =
			commonShock * -0.004 + sampleNormal(rng, { mean: 0, sd: 0.006 });
		const regimeOverlay =
			sampleBorrowingRegimeOverlayBp(regimeEstimate, regimeRng) / 10_000;
		const path = projectBorrowingPath(amount, years, {
			...assumptions,
			bankRate: Math.max(
				-0.005,
				(assumptions.bankRate ?? BORROWING.bankRate) + bankRateShock,
			),
			inflation: Math.max(
				-0.01,
				(assumptions.inflation ?? BORROWING.inflation) + inflationShock,
			),
			nominalGrowth: Math.max(
				0,
				(assumptions.nominalGrowth ?? 0.04) + growthShock,
			),
			yieldCurveShift:
				(assumptions.yieldCurveShift ?? 0) + giltShock + regimeOverlay,
			cpiDeviationPp: (assumptions.cpiDeviationPp ?? 0) + inflationShock * 100,
		});
		for (let i = 0; i < years; i++) {
			const row = path[i]!;
			interestByYear[i]!.push(row.interestCostGbp);
			debtByYear[i]!.push(row.debtStockDeltaGbp);
			psnbByYear[i]!.push(row.psnbShiftGbp);
		}
	}

	return centralPath.map((row, index) => ({
		year: row.year,
		centralInterestCostGbp: row.interestCostGbp,
		interestCostBand: computeBand(interestByYear[index]!),
		centralDebtStockGbp: row.debtStockDeltaGbp,
		debtStockBand: computeBand(debtByYear[index]!),
		centralPsnbShiftGbp: row.psnbShiftGbp,
		psnbShiftBand: computeBand(psnbByYear[index]!),
	}));
};

export const decomposeBorrowingFan = (
	amount: number,
	years: number,
	assumptions: BorrowingRegimeAssumptions = {},
	samples = 1000,
	seed = 73,
): BorrowingFanDecomposition => {
	const continuousFan = projectBorrowingFan(
		amount,
		years,
		assumptions,
		samples,
		seed,
	);
	const regimeFan = projectBorrowingRegimeFan(
		amount,
		years,
		assumptions,
		samples,
		seed,
	);
	const rows = regimeFan.map<BorrowingFanDecompositionYear>((regimeYear, index) => {
		const continuousYear = continuousFan[index]!;
		const continuousInterestTailGbp = Math.max(
			0,
			continuousYear.interestCostBand.p95 -
				continuousYear.centralInterestCostGbp,
		);
		const regimeInterestTailGbp =
			regimeYear.interestCostBand.p95 -
			continuousYear.interestCostBand.p95;
		const totalInterestTailGbp =
			continuousInterestTailGbp + Math.max(0, regimeInterestTailGbp);
		return {
			year: regimeYear.year,
			centralInterestCostGbp: regimeYear.centralInterestCostGbp,
			continuousInterestP95Gbp: continuousYear.interestCostBand.p95,
			regimeInterestP95Gbp: regimeYear.interestCostBand.p95,
			continuousInterestTailGbp,
			regimeInterestTailGbp,
			regimeShareOfInterestTail:
				totalInterestTailGbp > 0
					? Math.max(0, regimeInterestTailGbp) / totalInterestTailGbp
					: 0,
			continuousDebtP95Gbp: continuousYear.debtStockBand.p95,
			regimeDebtP95Gbp: regimeYear.debtStockBand.p95,
			regimeDebtTailGbp:
				regimeYear.debtStockBand.p95 - continuousYear.debtStockBand.p95,
			continuousPsnbP5Gbp: continuousYear.psnbShiftBand.p5,
			regimePsnbP5Gbp: regimeYear.psnbShiftBand.p5,
			regimePsnbDownsideGbp: Math.max(
				0,
				continuousYear.psnbShiftBand.p5 - regimeYear.psnbShiftBand.p5,
			),
		};
	});

	return {
		continuousFan,
		regimeFan,
		years: rows,
		finalYear: rows.at(-1)!,
	};
};

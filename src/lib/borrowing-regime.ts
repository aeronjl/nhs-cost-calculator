import { BORROWING_BACKTEST_EPISODES } from "@/data/borrowing-backtests";
import { BORROWING, type BorrowingStrategyId } from "@/data/levers/borrowing";
import {
	type BorrowingMarketReactionYear,
	projectBorrowingMarketReactionPath,
} from "@/lib/borrowing";

export type BorrowingStressRegimeId =
	| "normal"
	| "credibility-shock"
	| "monetary-backstop";

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
	probabilities: readonly BorrowingRegimeProbability[];
	topRegime: BorrowingRegimeProbability;
	expectedOverlayBp: number;
	expectedPeakPressureBp: number;
	stressRating: "low" | "watch" | "stress";
}

const REGIME_LABELS: Record<BorrowingStressRegimeId, string> = {
	normal: "Normal absorption",
	"credibility-shock": "Credibility shock",
	"monetary-backstop": "Monetary backstop",
};

const REGIME_OVERLAY_BP: Record<BorrowingStressRegimeId, number> = {
	normal: 0,
	"credibility-shock": 110,
	"monetary-backstop": -260,
};

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
	assumptions: { strategyId?: BorrowingStrategyId } = {},
): BorrowingRegimeEstimate => {
	const path = projectBorrowingMarketReactionPath(amountGbp, years, {
		strategyId: assumptions.strategyId ?? "dmo-remit",
	});
	const features = featuresForPath(amountGbp, path);
	const calibration = labelledEpisodeFeatures().map((item) => ({
		...item,
		distance: featureDistance(features, item.features),
	}));
	const weights = calibration.map((item) =>
		Math.exp(-item.distance / SOFTMAX_TEMPERATURE),
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
		probabilities,
		topRegime,
		expectedOverlayBp,
		expectedPeakPressureBp,
		stressRating: stressRatingFor(expectedPeakPressureBp, topRegime.id),
	};
};

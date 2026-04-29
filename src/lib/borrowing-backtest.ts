import {
	BORROWING_BACKTEST_EPISODES,
	type BorrowingBacktestEpisode,
	type BorrowingBacktestRange,
} from "@/data/borrowing-backtests";
import {
	type BorrowingMarketReactionYear,
	projectBorrowingMarketReactionPath,
} from "@/lib/borrowing";

export type BorrowingBacktestDiagnosis =
	| "tracks"
	| "understates"
	| "overstates";

export type BorrowingBacktestStatus = "pass" | "overlay" | "fail";

export interface BorrowingBacktestResult {
	episode: BorrowingBacktestEpisode;
	centralPeakPressureBp: number;
	overlayPeakPressureBp: number | null;
	centralCumulativeInterestGbp: number;
	overlayCumulativeInterestGbp: number | null;
	centralMissBp: number;
	overlayMissBp: number | null;
	centralDiagnosis: BorrowingBacktestDiagnosis;
	status: BorrowingBacktestStatus;
	finalDebtGdpDeltaPp: number;
	peakAbsorptionConcessionBp: number;
	peakMarketReactionBp: number;
}

export interface BorrowingBacktestSummary {
	results: BorrowingBacktestResult[];
	centralPasses: number;
	overlayPasses: number;
	meanCentralAbsMissBp: number;
	meanOverlayAbsMissBp: number;
	largestMiss: BorrowingBacktestResult | null;
}

const rangeMidpoint = (range: BorrowingBacktestRange): number =>
	(range.low + range.high) / 2;

const missAgainstRange = (
	value: number,
	range: BorrowingBacktestRange,
): number => {
	if (value < range.low) return value - range.low;
	if (value > range.high) return value - range.high;
	return 0;
};

const diagnosisFor = (
	value: number,
	range: BorrowingBacktestRange,
): BorrowingBacktestDiagnosis => {
	if (value < range.low) return "understates";
	if (value > range.high) return "overstates";
	return "tracks";
};

const peakPressureBp = (
	path: readonly BorrowingMarketReactionYear[],
	overlayBp = 0,
): number =>
	Math.max(
		0,
		...path.map(
			(row) =>
				(row.riskPremium +
					row.absorptionPremium +
					row.marketReactionPremium) *
					10_000 +
				overlayBp,
		),
	);

const cumulativeInterestGbp = (
	path: readonly BorrowingMarketReactionYear[],
): number => path.reduce((sum, row) => sum + row.interestCostGbp, 0);

export const evaluateBorrowingBacktestEpisode = (
	episode: BorrowingBacktestEpisode,
): BorrowingBacktestResult => {
	const centralPath = projectBorrowingMarketReactionPath(
		episode.amountGbp,
		episode.years,
		{ strategyId: episode.strategyId ?? "dmo-remit" },
	);
	const centralPeakPressureBp = peakPressureBp(centralPath);
	const centralMissBp = missAgainstRange(
		centralPeakPressureBp,
		episode.observedPeakGiltMoveBp,
	);
	const overlayPath =
		episode.modelOverlayBp === undefined
			? null
			: projectBorrowingMarketReactionPath(episode.amountGbp, episode.years, {
					strategyId: episode.strategyId ?? "dmo-remit",
					yieldCurveShift: episode.modelOverlayBp / 10_000,
				});
	const overlayPeakPressureBp =
		episode.modelOverlayBp === undefined
			? null
			: peakPressureBp(overlayPath ?? centralPath, episode.modelOverlayBp);
	const overlayMissBp =
		overlayPeakPressureBp === null
			? null
			: missAgainstRange(overlayPeakPressureBp, episode.observedPeakGiltMoveBp);
	const centralDiagnosis = diagnosisFor(
		centralPeakPressureBp,
		episode.observedPeakGiltMoveBp,
	);
	const overlayFits = overlayMissBp !== null && overlayMissBp === 0;
	const centralFits = centralMissBp === 0;
	const finalYear = centralPath.at(-1)!;

	return {
		episode,
		centralPeakPressureBp,
		overlayPeakPressureBp,
		centralCumulativeInterestGbp: cumulativeInterestGbp(centralPath),
		overlayCumulativeInterestGbp: overlayPath
			? cumulativeInterestGbp(overlayPath)
			: null,
		centralMissBp,
		overlayMissBp,
		centralDiagnosis,
		status: centralFits ? "pass" : overlayFits ? "overlay" : "fail",
		finalDebtGdpDeltaPp: finalYear.debtGdpDeltaPp,
		peakAbsorptionConcessionBp: Math.max(
			0,
			...centralPath.flatMap((row) =>
				row.instruments.map(
					(instrument) => instrument.auctionClearingConcessionBp,
				),
			),
		),
		peakMarketReactionBp: Math.max(
			0,
			...centralPath.map((row) => row.marketReactionPremium * 10_000),
		),
	};
};

export const evaluateBorrowingBacktests = (
	episodes: readonly BorrowingBacktestEpisode[] = BORROWING_BACKTEST_EPISODES,
): BorrowingBacktestResult[] =>
	episodes.map((episode) => evaluateBorrowingBacktestEpisode(episode));

export const summarizeBorrowingBacktests = (
	episodes: readonly BorrowingBacktestEpisode[] = BORROWING_BACKTEST_EPISODES,
): BorrowingBacktestSummary => {
	const results = evaluateBorrowingBacktests(episodes);
	const centralMisses = results.map((result) => Math.abs(result.centralMissBp));
	const overlayMisses = results.map((result) =>
		result.overlayMissBp === null
			? Math.abs(result.centralMissBp)
			: Math.abs(result.overlayMissBp),
	);
	const largestMiss =
		results.reduce<BorrowingBacktestResult | null>(
			(largest, result) =>
				!largest ||
				Math.abs(result.centralMissBp) > Math.abs(largest.centralMissBp)
					? result
					: largest,
			null,
		) ?? null;
	return {
		results,
		centralPasses: results.filter((result) => result.status === "pass").length,
		overlayPasses: results.filter((result) => result.status !== "fail").length,
		meanCentralAbsMissBp:
			centralMisses.reduce((sum, miss) => sum + miss, 0) /
			Math.max(1, centralMisses.length),
		meanOverlayAbsMissBp:
			overlayMisses.reduce((sum, miss) => sum + miss, 0) /
			Math.max(1, overlayMisses.length),
		largestMiss,
	};
};

export const observedRangeLabel = (range: BorrowingBacktestRange): string =>
	`${Math.round(range.low)}-${Math.round(range.high)}bp`;

export const centralErrorVsMidpointBp = (
	result: BorrowingBacktestResult,
): number =>
	result.centralPeakPressureBp -
	rangeMidpoint(result.episode.observedPeakGiltMoveBp);

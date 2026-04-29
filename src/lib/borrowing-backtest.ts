import {
	BORROWING_BACKTEST_EPISODES,
	type BorrowingBacktestEpisode,
	type BorrowingBacktestRange,
} from "@/data/borrowing-backtests";
import {
	type BorrowingMarketReactionYear,
	projectBorrowingMarketReactionPath,
} from "@/lib/borrowing";
import {
	BORROWING_STRESS_REGIMES,
	estimateBorrowingStressRegime,
	type BorrowingRegimeEstimate,
	type BorrowingStressRegimeId,
} from "@/lib/borrowing-regime";

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

export interface BorrowingRegimeCalibrationRow {
	result: BorrowingBacktestResult;
	estimate: BorrowingRegimeEstimate;
	labelledRegime: BorrowingStressRegimeId;
	labelledRegimeLabel: string;
	classifierMatchesLabel: boolean;
	labelledRegimeProbability: number;
	regimeProbabilities: Record<BorrowingStressRegimeId, number>;
}

export interface BorrowingCalibrationRange {
	low: number;
	high: number;
}

export interface BorrowingRegimeTriggerWindow {
	id: BorrowingStressRegimeId;
	label: string;
	description: string;
	expectedOverlayBp: number;
	episodeCount: number;
	sourceEpisodes: string[];
	amountGbp: BorrowingCalibrationRange;
	issuanceShareOfGfr: BorrowingCalibrationRange;
	observedPeakGiltMoveBp: BorrowingCalibrationRange;
	centralPeakPressureBp: BorrowingCalibrationRange;
	finalDebtGdpDeltaPp: BorrowingCalibrationRange;
	absorptionStressIndex: BorrowingCalibrationRange;
	marketReactionBp: BorrowingCalibrationRange;
}

export interface BorrowingRegimeCalibrationAudit {
	rows: BorrowingRegimeCalibrationRow[];
	triggerWindows: BorrowingRegimeTriggerWindow[];
	classifierMatches: number;
	meanLabelProbability: number;
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

const regimeProbabilityMap = (
	estimate: BorrowingRegimeEstimate,
): Record<BorrowingStressRegimeId, number> =>
	BORROWING_STRESS_REGIMES.reduce<Record<BorrowingStressRegimeId, number>>(
		(probabilities, regime) => {
			probabilities[regime.id] =
				estimate.probabilities.find((item) => item.id === regime.id)
					?.probability ?? 0;
			return probabilities;
		},
		{} as Record<BorrowingStressRegimeId, number>,
	);

const rangeFrom = <T>(
	items: readonly T[],
	getter: (item: T) => number,
): BorrowingCalibrationRange => ({
	low: Math.min(...items.map(getter)),
	high: Math.max(...items.map(getter)),
});

export const auditBorrowingRegimeCalibration = (
	episodes: readonly BorrowingBacktestEpisode[] = BORROWING_BACKTEST_EPISODES,
): BorrowingRegimeCalibrationAudit => {
	const rows = evaluateBorrowingBacktests(episodes).map<BorrowingRegimeCalibrationRow>(
		(result) => {
			const estimate = estimateBorrowingStressRegime(
				result.episode.amountGbp,
				result.episode.years,
				{ strategyId: result.episode.strategyId ?? "dmo-remit" },
			);
			const probabilities = regimeProbabilityMap(estimate);
			const definition = BORROWING_STRESS_REGIMES.find(
				(regime) => regime.id === result.episode.regime,
			)!;
			return {
				result,
				estimate,
				labelledRegime: result.episode.regime,
				labelledRegimeLabel: definition.label,
				classifierMatchesLabel:
					estimate.topRegime.id === result.episode.regime,
				labelledRegimeProbability: probabilities[result.episode.regime],
				regimeProbabilities: probabilities,
			};
		},
	);
	const triggerWindows =
		BORROWING_STRESS_REGIMES.map<BorrowingRegimeTriggerWindow | null>(
			(regime) => {
				const regimeRows = rows.filter(
					(row) => row.labelledRegime === regime.id,
				);
				if (regimeRows.length === 0) return null;
				return {
					id: regime.id,
					label: regime.label,
					description: regime.description,
					expectedOverlayBp: regime.expectedOverlayBp,
					episodeCount: regimeRows.length,
					sourceEpisodes: regimeRows.map((row) => row.result.episode.name),
					amountGbp: rangeFrom(
						regimeRows,
						(row) => row.result.episode.amountGbp,
					),
					issuanceShareOfGfr: rangeFrom(
						regimeRows,
						(row) => row.estimate.features.issuanceShareOfGfr,
					),
					observedPeakGiltMoveBp: {
						low: Math.min(
							...regimeRows.map(
								(row) => row.result.episode.observedPeakGiltMoveBp.low,
							),
						),
						high: Math.max(
							...regimeRows.map(
								(row) => row.result.episode.observedPeakGiltMoveBp.high,
							),
						),
					},
					centralPeakPressureBp: rangeFrom(
						regimeRows,
						(row) => row.result.centralPeakPressureBp,
					),
					finalDebtGdpDeltaPp: rangeFrom(
						regimeRows,
						(row) => row.result.finalDebtGdpDeltaPp,
					),
					absorptionStressIndex: rangeFrom(
						regimeRows,
						(row) => row.estimate.features.peakAbsorptionStressIndex,
					),
					marketReactionBp: rangeFrom(
						regimeRows,
						(row) => row.result.peakMarketReactionBp,
					),
				};
			},
		).filter(
			(window): window is BorrowingRegimeTriggerWindow => window !== null,
		);
	const classifierMatches = rows.filter(
		(row) => row.classifierMatchesLabel,
	).length;

	return {
		rows,
		triggerWindows,
		classifierMatches,
		meanLabelProbability:
			rows.reduce((sum, row) => sum + row.labelledRegimeProbability, 0) /
			Math.max(1, rows.length),
	};
};

export const observedRangeLabel = (range: BorrowingBacktestRange): string =>
	`${Math.round(range.low)}-${Math.round(range.high)}bp`;

export const centralErrorVsMidpointBp = (
	result: BorrowingBacktestResult,
): number =>
	result.centralPeakPressureBp -
	rangeMidpoint(result.episode.observedPeakGiltMoveBp);

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	auditBorrowingRegimeCalibration,
	type BorrowingCalibrationRange,
	type BorrowingBacktestResult,
	type BorrowingRegimeCalibrationRow,
	observedRangeLabel,
	summarizeBorrowingBacktests,
} from "@/lib/borrowing-backtest";
import { compareBorrowingStrategies } from "@/lib/borrowing-strategy-comparison";
import type { BorrowingStressRegimeId } from "@/lib/borrowing-regime";
import { cn } from "@/lib/utils";

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatBp = (n: number): string => `${Math.round(n)}bp`;

const formatSignedBn = (n: number): string =>
	`${n >= 0 ? "+" : "-"}${formatBn(Math.abs(n))}`;

const formatSignedBp = (n: number): string =>
	`${n > 0 ? "+" : ""}${Math.round(n)}bp`;

const formatPct = (n: number): string => `${(n * 100).toFixed(0)}%`;

const formatPp = (n: number): string => `${n.toFixed(1)}pp`;

const formatIndex = (n: number): string => n.toFixed(2);

const formatProbability = (n: number): string => `${Math.round(n * 100)}%`;

const formatRange = (
	range: BorrowingCalibrationRange,
	formatter: (value: number) => string,
): string =>
	Math.abs(range.high - range.low) < 0.0001
		? formatter(range.low)
		: `${formatter(range.low)}-${formatter(range.high)}`;

const formatMiss = (n: number | null): string => {
	if (n === null) return "n/a";
	if (Math.abs(n) < 0.5) return "inside range";
	return `${n > 0 ? "+" : ""}${Math.round(n)}bp`;
};

const statusLabel = (result: BorrowingBacktestResult): string => {
	if (result.status === "pass") return "central fit";
	if (result.status === "overlay") return "overlay fit";
	return "miss";
};

const statusClass = (result: BorrowingBacktestResult): string =>
	result.status === "pass"
		? "bg-blue-50 text-blue-800 border-blue-200"
		: result.status === "overlay"
			? "bg-amber-50 text-amber-800 border-amber-200"
			: "bg-red-50 text-red-800 border-red-200";

const probabilityFor = (
	row: BorrowingRegimeCalibrationRow,
	id: BorrowingStressRegimeId,
): string => formatProbability(row.regimeProbabilities[id]);

const balanceSheetPressureBp = (result: BorrowingBacktestResult): number =>
	Math.max(
		0,
		result.centralPeakPressureBp -
			result.peakAbsorptionConcessionBp -
			result.peakMarketReactionBp,
	);

export function BorrowingBacktestSection() {
	const summary = summarizeBorrowingBacktests();
	const calibrationAudit = auditBorrowingRegimeCalibration();
	const strategyComparison = compareBorrowingStrategies();
	const { results } = summary;
	if (results.length === 0) return null;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light">
					Borrowing stress backtests
					<br />
					<span className="text-base text-muted-foreground font-normal">
						Historical gilt-market episodes against the borrowing model
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg bg-muted/40 p-4 text-sm leading-snug">
					<p>
						The central borrowing model fits{" "}
						<strong>
							{summary.centralPasses}/{results.length}
						</strong>{" "}
						episodes without extra judgement. Adding documented regime overlays
						raises that to{" "}
						<strong>
							{summary.overlayPasses}/{results.length}
						</strong>{" "}
						and cuts mean absolute miss from{" "}
						<span className="tabular-nums">
							{formatBp(summary.meanCentralAbsMissBp)}
						</span>{" "}
						to{" "}
						<span className="tabular-nums">
							{formatBp(summary.meanOverlayAbsMissBp)}
						</span>
						.
					</p>
					<p className="text-xs text-muted-foreground mt-2">
						Overlays are not hidden calibration fudge factors. They name the
						historical regime the central model cannot infer from issuance size
						alone: credibility loss in 2022, or monetary-policy backstop in
						2020.
					</p>
				</div>

				<div className="space-y-3">
					<div>
						<h3 className="text-sm font-semibold">
							Strategy comparison
						</h3>
						<p className="text-xs text-muted-foreground mt-1">
							Illustrative {formatBn(strategyComparison.amountGbp)} borrowing
							package over {strategyComparison.years} years. The optimised mix is
							compared with named financing strategies across central costs,
							stress cases, regime fans, and fiscal-rule tails.
						</p>
					</div>
					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full min-w-[980px] text-xs">
							<thead className="bg-muted/50 text-muted-foreground">
								<tr className="text-left">
									<th className="px-3 py-2 font-medium">Strategy</th>
									<th className="px-3 py-2 font-medium">Portfolio</th>
									<th className="px-3 py-2 font-medium">Central cost</th>
									<th className="px-3 py-2 font-medium">Stress / regime tail</th>
									<th className="px-3 py-2 font-medium">Fiscal-rule tail</th>
									<th className="px-3 py-2 font-medium">Market bottleneck</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{strategyComparison.rows.map((row) => (
									<tr
										key={row.id}
										className={cn(
											"align-top",
											row.isOptimised && "bg-blue-50/50",
										)}
									>
										<td className="px-3 py-2">
											<div className="font-semibold">
												{row.label}
												{row.isOptimised && (
													<span className="ml-2 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-800">
														optimised
													</span>
												)}
											</div>
											<div className="text-muted-foreground leading-snug">
												{row.description}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>{row.averageMaturityYears.toFixed(1)}y avg</div>
											<div className="text-muted-foreground">
												bills {formatPct(row.treasuryBillShare)}
											</div>
											<div className="text-muted-foreground">
												index-linked {formatPct(row.indexLinkedShare)}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>
												Y{strategyComparison.years}{" "}
												{formatBn(row.centralFinalInterestGbp)}
											</div>
											<div className="text-muted-foreground">
												cumulative {formatBn(row.centralCumulativeInterestGbp)}
											</div>
											<div className="text-muted-foreground">
												objective {formatBn(row.objectiveGbp)}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>
												{row.worstStressLabel}{" "}
												{formatBn(row.worstStressFinalInterestGbp)}
											</div>
											<div className="text-muted-foreground">
												regime p95 {formatBn(row.regimeInterestP95Gbp)}
											</div>
											<div className="text-muted-foreground">
												{row.regimeTopLabel}{" "}
												{formatProbability(row.regimeTopProbability)} ·{" "}
												{formatSignedBp(row.expectedRegimeOverlayBp)}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>
												breach {formatProbability(row.fiscalBreachProbability)}
											</div>
											<div className="text-muted-foreground">
												tight/breach{" "}
												{formatProbability(row.fiscalTightOrBreachProbability)}
											</div>
											<div className="text-muted-foreground">
												p5 headroom {formatSignedBn(row.fiscalHeadroomP5Gbp)}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>{formatBp(row.peakMarketPressureBp)} peak</div>
											<div className="text-muted-foreground">
												{row.peakAbsorptionStressIndex.toFixed(1)}x{" "}
												{row.bottleneckInstrumentLabel}
											</div>
											<div className="text-muted-foreground">
												{row.investorBottleneckLabel}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div className="space-y-3">
					<div>
						<h3 className="text-sm font-semibold">
							Regime calibration audit
						</h3>
						<p className="text-xs text-muted-foreground mt-1">
							The classifier re-identifies{" "}
							<strong>
								{calibrationAudit.classifierMatches}/
								{calibrationAudit.rows.length}
							</strong>{" "}
							labelled episodes; mean probability assigned to the historical
							label is{" "}
							<strong>
								{formatProbability(calibrationAudit.meanLabelProbability)}
							</strong>
							.
						</p>
					</div>

					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full min-w-[760px] text-xs">
							<thead className="bg-muted/50 text-muted-foreground">
								<tr className="text-left">
									<th className="px-3 py-2 font-medium">Regime</th>
									<th className="px-3 py-2 font-medium">Historical window</th>
									<th className="px-3 py-2 font-medium">Observed move</th>
									<th className="px-3 py-2 font-medium">Model triggers</th>
									<th className="px-3 py-2 font-medium">Overlay</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{calibrationAudit.triggerWindows.map((window) => (
									<tr key={window.id} className="align-top">
										<td className="px-3 py-2">
											<div className="font-semibold">{window.label}</div>
											<div className="text-muted-foreground leading-snug">
												{window.description}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>
												{formatRange(window.amountGbp, formatBn)} borrowing
											</div>
											<div className="text-muted-foreground">
												{formatRange(window.issuanceShareOfGfr, formatPct)} of
												GFR
											</div>
											<div className="text-muted-foreground">
												{window.sourceEpisodes.join(", ")}
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											{formatRange(window.observedPeakGiltMoveBp, formatBp)}
										</td>
										<td className="px-3 py-2 tabular-nums">
											<div>
												{formatRange(window.centralPeakPressureBp, formatBp)}{" "}
												central
											</div>
											<div className="text-muted-foreground">
												{formatRange(
													window.absorptionStressIndex,
													formatIndex,
												)}{" "}
												auction stress
											</div>
											<div className="text-muted-foreground">
												{formatRange(window.marketReactionBp, formatBp)} market
												reaction
											</div>
										</td>
										<td className="px-3 py-2 tabular-nums">
											{formatSignedBp(window.expectedOverlayBp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full min-w-[900px] text-xs">
							<thead className="bg-muted/50 text-muted-foreground">
								<tr className="text-left">
									<th className="px-3 py-2 font-medium">Episode</th>
									<th className="px-3 py-2 font-medium">Label / classifier</th>
									<th className="px-3 py-2 font-medium">
										Estimated transition probabilities
									</th>
									<th className="px-3 py-2 font-medium">Backtest fit</th>
									<th className="px-3 py-2 font-medium">Pressure attribution</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{calibrationAudit.rows.map((row) => {
									const result = row.result;
									const episode = result.episode;
									return (
										<tr key={episode.id} className="align-top">
											<td className="px-3 py-2">
												<div className="font-semibold">{episode.name}</div>
												<div className="text-muted-foreground tabular-nums">
													{episode.date.slice(0, 7)} ·{" "}
													{formatBn(episode.amountGbp)}
												</div>
											</td>
											<td className="px-3 py-2">
												<div>{row.labelledRegimeLabel}</div>
												<div className="text-muted-foreground">
													top: {row.estimate.topRegime.label} (
													{formatProbability(row.estimate.topRegime.probability)}
													)
												</div>
											</td>
											<td className="px-3 py-2 tabular-nums">
												<div>Normal {probabilityFor(row, "normal")}</div>
												<div>
													Credibility{" "}
													{probabilityFor(row, "credibility-shock")}
												</div>
												<div>
													Backstop {probabilityFor(row, "monetary-backstop")}
												</div>
											</td>
											<td className="px-3 py-2 tabular-nums">
												<div>
													observed{" "}
													{observedRangeLabel(episode.observedPeakGiltMoveBp)}
												</div>
												<div className="text-muted-foreground">
													central {formatBp(result.centralPeakPressureBp)} ·{" "}
													{formatMiss(result.centralMissBp)}
												</div>
												<div className="text-muted-foreground">
													overlay{" "}
													{result.overlayPeakPressureBp === null
														? "none"
														: `${formatBp(result.overlayPeakPressureBp)} · ${formatMiss(
																result.overlayMissBp,
															)}`}
												</div>
											</td>
											<td className="px-3 py-2 tabular-nums">
												<div>
													{formatBp(balanceSheetPressureBp(result))} debt/risk
												</div>
												<div className="text-muted-foreground">
													{formatBp(result.peakAbsorptionConcessionBp)} auction
												</div>
												<div className="text-muted-foreground">
													{formatBp(result.peakMarketReactionBp)} reaction ·{" "}
													{formatPp(result.finalDebtGdpDeltaPp)} debt/GDP
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>

				<ul className="space-y-3">
					{results.map((result) => {
						const { episode } = result;
						return (
							<li key={episode.id} className="rounded-lg border bg-card p-4">
								<div className="flex items-start justify-between gap-3 flex-wrap">
									<div className="min-w-[220px] flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<h3 className="font-semibold">{episode.name}</h3>
											<span className="text-xs text-muted-foreground tabular-nums">
												{episode.date.slice(0, 7)}
											</span>
											<span
												className={cn(
													"text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
													statusClass(result),
												)}
											>
												{statusLabel(result)}
											</span>
										</div>
										<p className="text-xs text-muted-foreground mt-1">
											{episode.summary}
										</p>
									</div>
									<div className="text-right text-xs tabular-nums">
										<div className="font-medium">
											{formatBn(episode.amountGbp)}
										</div>
										<div className="text-muted-foreground">borrowing shock</div>
									</div>
								</div>

								<div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Observed gilt move
										</div>
										<div className="font-semibold tabular-nums">
											{observedRangeLabel(episode.observedPeakGiltMoveBp)}
										</div>
									</div>
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Central model
										</div>
										<div className="font-semibold tabular-nums">
											{formatBp(result.centralPeakPressureBp)}
										</div>
										<div className="text-[10px] text-muted-foreground">
											{formatMiss(result.centralMissBp)}
										</div>
									</div>
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Regime overlay
										</div>
										<div className="font-semibold tabular-nums">
											{result.overlayPeakPressureBp === null
												? "none"
												: formatBp(result.overlayPeakPressureBp)}
										</div>
										<div className="text-[10px] text-muted-foreground">
											{episode.modelOverlayLabel ?? "not required"}
										</div>
									</div>
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Risk mechanics
										</div>
										<div className="font-semibold tabular-nums">
											{formatBp(result.peakAbsorptionConcessionBp)} auction
										</div>
										<div className="text-[10px] text-muted-foreground">
											{formatBp(result.peakMarketReactionBp)} reaction
										</div>
									</div>
								</div>

								<details className="text-xs text-muted-foreground mt-3">
									<summary className="cursor-pointer hover:text-foreground">
										Backtest note
									</summary>
									<div className="mt-2 space-y-2 leading-snug">
										<p>{episode.observedNote}</p>
										<p>{episode.lesson}</p>
										<p>
											<a
												href={episode.source.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 hover:underline"
											>
												{episode.source.label}
											</a>
										</p>
									</div>
								</details>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	type BorrowingBacktestResult,
	observedRangeLabel,
	summarizeBorrowingBacktests,
} from "@/lib/borrowing-backtest";
import { cn } from "@/lib/utils";

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatBp = (n: number): string => `${Math.round(n)}bp`;

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

export function BorrowingBacktestSection() {
	const summary = summarizeBorrowingBacktests();
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

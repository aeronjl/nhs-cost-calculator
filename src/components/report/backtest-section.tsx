"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ANNOTATED_BUDGETS } from "@/data/budgets/annotated";

// Renders a backtest of UK fiscal-policy forecasts against realised
// outturn — taking entries from the annotated-budgets corpus that have a
// `realised` field and showing announced vs realised £ delta side by side.
//
// Purpose: the calculator's levers are calibrated to the same HMRC ready-
// reckoner figures and OBR-style methodology Treasury uses. Showing where
// those forecasts have diverged from reality is the most credibility-
// building thing we can do for a public-facing model — making the limits of
// static fiscal scoring legible rather than hiding them.

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatDivergence = (predicted: number, realised: number): string => {
	if (predicted === 0) {
		return realised === 0 ? "0%" : "n/a";
	}
	const pct = ((realised - predicted) / Math.abs(predicted)) * 100;
	const sign = pct >= 0 ? "+" : "";
	return `${sign}${pct.toFixed(0)}%`;
};

const PARTY_COLOURS: Record<string, string> = {
	Labour: "bg-red-50 text-red-800 border-red-200",
	Conservative: "bg-blue-50 text-blue-800 border-blue-200",
	"Lib Dem": "bg-amber-50 text-amber-800 border-amber-200",
	SNP: "bg-yellow-50 text-yellow-800 border-yellow-200",
	Coalition: "bg-purple-50 text-purple-800 border-purple-200",
	Other: "bg-neutral-50 text-neutral-800 border-neutral-200",
};

export function BacktestSection() {
	const withRealised = ANNOTATED_BUDGETS.filter((b) => b.realised);
	if (withRealised.length === 0) return null;

	const totalPredicted = withRealised.reduce(
		(sum, b) => sum + Math.abs(b.realised!.predictedDelta),
		0,
	);
	const totalRealised = withRealised.reduce(
		(sum, b) => sum + Math.abs(b.realised!.realisedDelta),
		0,
	);
	const overallDivergence =
		totalPredicted > 0
			? ((totalRealised - totalPredicted) / totalPredicted) * 100
			: 0;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light">
					Forecast vs reality
					<br />
					<span className="text-base text-muted-foreground font-normal">
						How {withRealised.length} historical UK budgets have diverged from
						their announced impact
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg bg-muted/40 p-4 text-sm leading-snug">
					<p>
						<strong>Across {withRealised.length} budgets with documented
						outturn data</strong>, the absolute scale of realised impact is{" "}
						<span
							className={cn(
								"font-semibold tabular-nums",
								Math.abs(overallDivergence) > 25
									? "text-amber-700"
									: "text-foreground",
							)}
						>
							{overallDivergence >= 0 ? "+" : ""}
							{overallDivergence.toFixed(0)}%
						</span>{" "}
						vs the original forecast. The divergences run in both directions —
						some measures dramatically over-deliver (frozen thresholds in a
						high-inflation environment), others fail completely (politically
						reversed packages, behaviourally elastic taxes).
					</p>
					<p className="text-xs text-muted-foreground mt-2">
						The lesson: static fiscal projections — including those used by
						this calculator — should be read as approximations conditional on
						policy persistence and macro stability, not as predictions. Every
						lever's methodology popover names the elasticities and political
						risks the static figure ignores.
					</p>
				</div>

				<ul className="space-y-3">
					{withRealised.map((budget) => {
						const r = budget.realised!;
						const divergence = formatDivergence(
							r.predictedDelta,
							r.realisedDelta,
						);
						const overDelivered = r.realisedDelta > r.predictedDelta;
						const underDelivered = r.realisedDelta < r.predictedDelta;
						const gapBig =
							r.predictedDelta !== 0 &&
							Math.abs(
								(r.realisedDelta - r.predictedDelta) / r.predictedDelta,
							) > 0.25;

						return (
							<li
								key={budget.id}
								className="rounded-lg border bg-card p-4"
							>
								<div className="flex items-start justify-between gap-3 flex-wrap mb-2">
									<div className="flex-1 min-w-[200px]">
										<div className="flex items-center gap-2 flex-wrap">
											<h3 className="font-semibold">{budget.name}</h3>
											<span className="text-xs text-muted-foreground tabular-nums">
												{budget.date.slice(0, 7)}
											</span>
											<span
												className={cn(
													"text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
													PARTY_COLOURS[budget.party] ??
														PARTY_COLOURS.Other,
												)}
											>
												{budget.party}
											</span>
										</div>
										<p className="text-xs text-muted-foreground mt-0.5">
											{budget.chancellor}
										</p>
									</div>
								</div>

								<p className="text-sm font-medium mb-3">{r.headline}</p>

								<div className="grid grid-cols-3 gap-3 text-sm mb-3">
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Forecast at announcement
										</div>
										<div className="font-semibold tabular-nums">
											{formatBn(r.predictedDelta)}/yr
										</div>
										<div className="text-[10px] text-muted-foreground">
											at {r.horizonYears}-yr horizon
										</div>
									</div>
									<div className="rounded-md border bg-muted/30 p-2">
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Realised
										</div>
										<div className="font-semibold tabular-nums">
											{formatBn(r.realisedDelta)}/yr
										</div>
										<div className="text-[10px] text-muted-foreground">
											as of {r.asOf}
										</div>
									</div>
									<div
										className={cn(
											"rounded-md border p-2",
											gapBig
												? "bg-amber-50 border-amber-200"
												: "bg-muted/30",
										)}
									>
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
											Divergence
										</div>
										<div
											className={cn(
												"font-semibold tabular-nums",
												overDelivered && gapBig && "text-blue-700",
												underDelivered && gapBig && "text-amber-700",
											)}
										>
											{divergence}
										</div>
										<div className="text-[10px] text-muted-foreground">
											{overDelivered ? "over-delivered" : underDelivered ? "under-delivered" : "on target"}
										</div>
									</div>
								</div>

								<details className="text-xs text-muted-foreground">
									<summary className="cursor-pointer hover:text-foreground">
										Why the divergence
									</summary>
									<div className="mt-2 space-y-2 leading-snug">
										<p>{r.note}</p>
										<p>
											<a
												href={r.source.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-blue-600 hover:underline"
											>
												{r.source.label} →
											</a>
										</p>
									</div>
								</details>
							</li>
						);
					})}
				</ul>

				<p className="text-xs text-muted-foreground pt-2 border-t leading-snug">
					Outturn data drawn from OBR Forecast Evaluation Reports, HMRC outturn
					tables, and IFS analysis. Only budgets with well-documented realised
					figures are included; recent budgets (2024 onward) are absent until
					their first 1–2 years of outturn data become available. Editorial
					selection bias should be assumed — these are budgets where the
					divergence is interesting enough to document.
				</p>
			</CardContent>
		</Card>
	);
}

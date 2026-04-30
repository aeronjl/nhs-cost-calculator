"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { ResolvedComparison } from "@/data/comparisons";
import type { CounterfactualComparison } from "@/lib/counterfactual";
import type {
	ScenarioDistribution,
	ScenarioDynamic,
	ScenarioResult,
	YearProjection,
} from "@/lib/scenario";
import type { MicrosimAggregate } from "@/lib/microsim/impact";
import { formatCount } from "@/app/utils/formatters";

// "Top zone" — the always-visible essential-info summary at the top of the
// output rail. ~6 lines. Anyone scanning the page should be able to answer
// "what does this scenario do?" from this zone alone, without expanding any
// sections.
//
// Layered detail (multi-year, baseline, distributional breakdown, microsim,
// macro state, assumptions) lives in collapsible sections below.

interface Props {
	result: ScenarioResult;
	dynamic: ScenarioDynamic;
	dynamicGapSignificant: boolean;
	items: readonly CounterfactualComparison[];
	distribution: ScenarioDistribution;
	microsim?: MicrosimAggregate;
	year1Projection: YearProjection | undefined;
	year5Projection: YearProjection | undefined;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatPct = (n: number, digits = 0): string =>
	`${Math.round(n * 100)}%`;

const formatDelta = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}${formatBn(Math.abs(n))}`;
};

export function TopZone({
	result,
	dynamic,
	dynamicGapSignificant,
	items,
	distribution,
	microsim,
	year1Projection,
	year5Projection,
}: Props) {
	const direction =
		result.net > 0 ? "freed" : result.net < 0 ? "shortfall" : "balanced";
	const colour =
		result.net > 0
			? "text-blue-700"
			: result.net < 0
				? "text-amber-700"
				: "text-muted-foreground";

	// Distributional headline: bottom decile + top decile impact.
	const bottom = distribution.perDecile[0] ?? 0;
	const top = distribution.perDecile[9] ?? 0;
	const HOUSEHOLDS_PER_DECILE = 2_800_000;
	const bottomPerHh = bottom / HOUSEHOLDS_PER_DECILE;
	const topPerHh = top / HOUSEHOLDS_PER_DECILE;
	const distrSignificant =
		distribution.modelledLines > 0 &&
		(Math.abs(bottomPerHh) > 1 || Math.abs(topPerHh) > 1);
	const psnbDiverges =
		year1Projection &&
		Math.abs(year1Projection.psnbShift - year1Projection.net) > 1_000_000;
	const topComparison = items[0];
	const trend =
		year5Projection && year1Projection
			? year5Projection.net > year1Projection.net
				? "growing"
				: year5Projection.net < year1Projection.net
					? "fading"
					: "steady"
			: null;

	return (
		<section className="rounded-lg border bg-background shadow-sm overflow-hidden">
			<div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
				<div className="p-4 sm:p-5 space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
							Executive summary
						</span>
						<span
							className={cn(
								"rounded-full border px-2 py-0.5 text-[10px] capitalize",
								result.net > 0
									? "border-blue-200 bg-blue-50 text-blue-700"
									: result.net < 0
										? "border-amber-200 bg-amber-50 text-amber-800"
										: "border-input bg-muted/40 text-muted-foreground",
							)}
						>
							{direction}
						</span>
					</div>
					<div
						className={cn(
							"text-4xl sm:text-5xl font-semibold tabular-nums leading-none",
							colour,
						)}
					>
						£<AnimatedNumber value={Math.abs(Math.round(result.net))} />
					</div>
					<div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
						{dynamicGapSignificant && (
							<div>
								<span className="font-medium text-foreground">
									{formatDelta(dynamic.dynamicNet)}
								</span>{" "}
								after behavioural response
							</div>
						)}
						{psnbDiverges && year1Projection && (
							<div>
								<span className="font-medium text-foreground">
									{formatDelta(year1Projection.psnbShift)}
								</span>{" "}
								PSNB shift in year 1
							</div>
						)}
						{year5Projection && (
							<div>
								<span className="font-medium text-foreground">
									{formatBn(year5Projection.net)}
								</span>{" "}
								by year 5{trend ? `, ${trend}` : ""}
							</div>
						)}
						{topComparison && (
							<div>
								<span aria-hidden="true" className="mr-1">
									{topComparison.comparison.emoji}
								</span>
								<span className="font-medium text-foreground tabular-nums">
									{formatCount(topComparison.count)}
								</span>{" "}
								{topComparison.count === 1
									? topComparison.comparison.name
									: topComparison.comparison.pluralName}
							</div>
						)}
					</div>
				</div>

				<div className="border-t bg-muted/10 p-4 sm:p-5 lg:border-l lg:border-t-0">
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
						{items.length > 0 && (
							<div className="space-y-2">
								<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									{result.net > 0 ? "Could fund" : "Equivalent cost"}
								</div>
								<ul className="space-y-1.5">
									{items.slice(0, 3).map(({ comparison, count }) => (
										<li
											key={comparison.id}
											className="flex items-center text-xs gap-2"
										>
											<span aria-hidden="true">{comparison.emoji}</span>
											<span className="font-semibold tabular-nums">
												{formatCount(count)}
											</span>
											<span className="text-muted-foreground">
												{count === 1 ? comparison.name : comparison.pluralName}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						{(distrSignificant || microsim) && (
							<div className="space-y-2">
								<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									Household effect
								</div>
								{distrSignificant && (
									<div className="text-xs leading-snug">
										<span className="text-muted-foreground">Bottom 10% </span>
										<span
											className={cn(
												"tabular-nums font-medium",
												bottomPerHh > 0
													? "text-amber-700"
													: bottomPerHh < 0
														? "text-blue-700"
														: "",
											)}
										>
											{bottomPerHh > 0 ? "−" : "+"}£
											{Math.round(Math.abs(bottomPerHh)).toLocaleString()}
										</span>
										<span className="text-muted-foreground"> · Top 10% </span>
										<span
											className={cn(
												"tabular-nums font-medium",
												topPerHh > 0
													? "text-amber-700"
													: topPerHh < 0
														? "text-blue-700"
														: "",
											)}
										>
											{topPerHh > 0 ? "−" : "+"}£
											{Math.round(Math.abs(topPerHh)).toLocaleString()}
										</span>
									</div>
								)}
								{microsim &&
									microsim.winners + microsim.losers + microsim.unaffected >
										0 && (
										<div className="text-xs text-muted-foreground leading-snug">
											<span className="text-blue-700 font-medium">
												{formatPct(microsim.winners)}
											</span>{" "}
											better off ·{" "}
											<span className="text-amber-700 font-medium">
												{formatPct(microsim.losers)}
											</span>{" "}
											worse off · {formatPct(microsim.unaffected)} unaffected
										</div>
									)}
							</div>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

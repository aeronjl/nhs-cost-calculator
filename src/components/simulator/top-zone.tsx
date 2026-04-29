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

	return (
		<div className="space-y-3">
			{/* Net effect headline */}
			<div className="rounded-lg border bg-background p-3 space-y-1.5">
				<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Net effect
				</div>
				<div
					className={cn(
						"text-3xl font-semibold tabular-nums leading-tight",
						colour,
					)}
				>
					£<AnimatedNumber value={Math.abs(Math.round(result.net))} />
					<span className="text-sm font-normal text-muted-foreground ml-2">
						{direction}
					</span>
				</div>
				{dynamicGapSignificant && (
					<div className="text-[10px] text-muted-foreground">
						after behavioural responses: £
						{Math.round(dynamic.dynamicNet).toLocaleString()}
					</div>
				)}
				{year5Projection && year1Projection && (
					<div className="text-[10px] text-muted-foreground">
						by year 5: {formatBn(year5Projection.net)}{" "}
						<span className="opacity-70">
							(
							{year5Projection.net > year1Projection.net
								? "growing"
								: year5Projection.net < year1Projection.net
									? "fading"
									: "steady"}
							)
						</span>
					</div>
				)}
			</div>

			{/* Top 3 comparisons */}
			{items.length > 0 && (
				<div className="rounded-md border bg-background/40 p-3 space-y-1.5">
					<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						{result.net > 0 ? "What this could fund" : "What this would cost"}
					</div>
					<ul className="space-y-1">
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

			{/* Distributional + household one-liners */}
			{(distrSignificant || microsim) && (
				<div className="rounded-md border bg-background/40 p-3 space-y-1">
					<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						Who pays
					</div>
					{distrSignificant && (
						<div className="text-xs">
							<span className="text-muted-foreground">Bottom 10%: </span>
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
							<span className="text-muted-foreground"> · Top 10%: </span>
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
							<span className="text-muted-foreground"> per household, per year</span>
						</div>
					)}
					{microsim &&
						microsim.winners + microsim.losers + microsim.unaffected > 0 && (
							<div className="text-xs text-muted-foreground">
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
	);
}

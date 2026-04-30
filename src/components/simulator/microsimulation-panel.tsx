"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	type ScenarioResult,
} from "@/lib/scenario";
import { generatePopulation } from "@/lib/microsim/population";
import {
	type MicrosimAggregate,
	evaluateMicrosim,
} from "@/lib/microsim/impact";

// Microsimulation panel. Shows decile-by-decile mean impact + within-decile
// spread, demographic cross-cuts, and winners/losers headline. Computed from
// a synthetic 1000-household population.
//
// Lives between the existing DistributionalImpact (10-decile bar chart at the
// scenario aggregate level) and HouseholdImpact (9 named archetypes). The
// microsim adds:
//   - Within-decile heterogeneity (p10/p50/p90 within each decile)
//   - Winners/losers headline (% of households gaining vs losing)
//   - Demographic cross-cuts (single parent / pensioner / dual-earner etc.)
//
// Performance: ~1000 households × ~10 lines per scenario change. Memoised
// per population seed (deterministic) and per scenario.

interface Props {
	result: ScenarioResult;
}

const formatGbp = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${Math.round(abs).toLocaleString()}`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}`;
	if (abs > 0) return `${sign}£${abs.toFixed(1)}`;
	return "£0";
};

const formatPct = (n: number): string => {
	const abs = Math.abs(n) * 100;
	if (abs >= 0.005) return `${(n >= 0 ? "" : "-")}${(n * 100).toFixed(2)}%`;
	return "0%";
};

const formatPctRound = (n: number): string => `${Math.round(n * 100)}%`;

const HOUSEHOLD_TYPE_LABELS: Record<string, string> = {
	"single-pensioner": "Single pensioner",
	"pensioner-couple": "Pensioner couple",
	"single-no-children": "Single, no children",
	"single-parent": "Single parent",
	"couple-no-children": "Couple, no children",
	"couple-with-children": "Couple, with children",
};

export function MicrosimulationPanel({ result }: Props) {
	// Generate population once — deterministic for a given seed. Memoising on
	// `[]` is fine because we never change the seed at runtime.
	const population = useMemo(() => generatePopulation(1000, 42), []);

	// Recompute microsim on every scenario change. With 1000 households this
	// takes ~50–200ms in dev; acceptable per scenario edit.
	const { agg } = useMemo(
		() => evaluateMicrosim(population, result),
		[population, result],
	);

	if (result.lines.length === 0) return null;

	const hasImpact =
		agg.decileMean.some((v) => Math.abs(v) >= 1) ||
		agg.byType.size > 0;
	if (!hasImpact) return null;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Microsimulation
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{agg.sampleSize} households · synthetic
				</span>
			</div>

			<div className="rounded-md border bg-background/60 p-3 space-y-3">
				<HeadlineWinnersLosers agg={agg} />
				<DecileTable agg={agg} />
				<TypeBreakdown agg={agg} />
			</div>

			<p className="text-[10px] text-muted-foreground leading-snug">
				Synthetic population calibrated to ASHE 2024 earnings + ONS family
				composition + DWP UC/CB rules. <strong>Direct calculation</strong> for
				IT/NICs/VAT/dividend/state pension/working-age welfare;{" "}
				<strong>decile fallback</strong> for public-good levers (NHS, defence).
				No real microdata — closer to "credible synthetic" than full FRS-grade
				rigour. Within-decile p10/p90 captures the heterogeneity the 9-archetype
				panel can't.
			</p>
		</div>
	);
}

function HeadlineWinnersLosers({ agg }: { agg: MicrosimAggregate }) {
	const total = agg.winners + agg.losers + agg.unaffected;
	if (total === 0) return null;
	return (
		<div className="text-xs">
			<div className="flex items-baseline justify-between gap-2 font-medium mb-1">
				<span>Winners + losers</span>
				<span className="text-[10px] font-normal text-muted-foreground">
					vs current-policy baseline
				</span>
			</div>
			<div className="flex h-2 rounded-sm overflow-hidden bg-muted/40 mb-1.5">
				<div
					className="bg-blue-500 transition-[width] duration-300 ease-out"
					style={{ width: `${agg.winners * 100}%` }}
					aria-label={`${formatPctRound(agg.winners)} households gain`}
				/>
				<div
					className="bg-muted-foreground/30 transition-[width] duration-300 ease-out"
					style={{ width: `${agg.unaffected * 100}%` }}
					aria-label={`${formatPctRound(agg.unaffected)} unaffected`}
				/>
				<div
					className="bg-amber-500 transition-[width] duration-300 ease-out"
					style={{ width: `${agg.losers * 100}%` }}
					aria-label={`${formatPctRound(agg.losers)} households lose`}
				/>
			</div>
			<div className="flex justify-between text-[10px] tabular-nums">
				<span className="text-blue-700">
					{formatPctRound(agg.winners)} gain
				</span>
				<span className="text-muted-foreground">
					{formatPctRound(agg.unaffected)} unaffected
				</span>
				<span className="text-amber-700">
					{formatPctRound(agg.losers)} lose
				</span>
			</div>
		</div>
	);
}

function DecileTable({ agg }: { agg: MicrosimAggregate }) {
	const maxAbs = Math.max(
		...agg.decileMean.map(Math.abs),
		...agg.decileP10.map(Math.abs),
		...agg.decileP90.map(Math.abs),
		1,
	);
	return (
		<div>
			<div className="mb-1 flex items-baseline justify-between gap-2">
				<div className="text-xs font-medium">By income decile</div>
				<div className="text-[10px] text-muted-foreground">
					baseline = £0/yr
				</div>
			</div>
			<div className="space-y-0.5">
				{agg.decileMean.map((mean, i) => {
					const decile = i + 1;
					const p10 = agg.decileP10[i] ?? 0;
					const p90 = agg.decileP90[i] ?? 0;
					const meanWidth = (Math.abs(mean) / maxAbs) * 50;
					const meanColour = mean > 0 ? "bg-amber-500" : "bg-blue-500";
					const meanColourText =
						mean > 0
							? "text-amber-700"
							: mean < 0
								? "text-blue-700"
								: "text-muted-foreground";
					return (
						<div
							key={decile}
							className="flex items-center gap-2 text-[10px] tabular-nums"
						>
							<span className="w-6 text-right text-muted-foreground">
								{decile}
							</span>
							<div className="flex-1 h-3 relative bg-muted/30 rounded-sm overflow-hidden">
								<div
									className={cn(
										"absolute top-0 bottom-0 transition-[width] duration-300 ease-out",
										mean > 0 ? "left-1/2" : "right-1/2",
										meanColour,
									)}
									style={{ width: `${meanWidth}%` }}
									aria-hidden="true"
								/>
								<div
									className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/20"
									aria-hidden="true"
								/>
							</div>
							<span className={cn("w-16 text-right", meanColourText)}>
								{formatGbp(mean)}
							</span>
							<span className="w-24 text-right text-muted-foreground text-[9px]">
								p10–p90: {formatGbp(p10)} to {formatGbp(p90)}
							</span>
						</div>
					);
				})}
			</div>
			<p className="text-[10px] text-muted-foreground mt-2 leading-snug">
				Bars show mean £/yr impact per decile (amber = loss, blue = gain). The
				p10–p90 column shows within-decile spread — wide spreads indicate the
				lever hits some households in the decile much harder than others.
			</p>
		</div>
	);
}

function TypeBreakdown({ agg }: { agg: MicrosimAggregate }) {
	const sortedTypes = [...agg.byType.entries()].sort(
		(a, b) => b[1].mean - a[1].mean,
	);
	return (
		<div className="border-t pt-3">
			<div className="text-xs font-medium mb-1">By household type</div>
			<table className="w-full text-[10px] tabular-nums">
				<thead>
					<tr className="text-muted-foreground">
						<th className="text-left">Type</th>
						<th className="text-right">Mean £/yr</th>
						<th className="text-right">% of net</th>
						<th className="text-right">N</th>
					</tr>
				</thead>
				<tbody>
					{sortedTypes.map(([type, stats]) => {
						const colour =
							stats.mean > 1
								? "text-amber-700"
								: stats.mean < -1
									? "text-blue-700"
									: "text-muted-foreground";
						return (
							<tr key={type} className="border-t">
								<td className="py-0.5">
									{HOUSEHOLD_TYPE_LABELS[type] ?? type}
								</td>
								<td className={cn("text-right py-0.5", colour)}>
									{formatGbp(stats.mean)}
								</td>
								<td className={cn("text-right py-0.5", colour)}>
									{formatPct(stats.meanPctIncome)}
								</td>
								<td className="text-right py-0.5 text-muted-foreground">
									{stats.count}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

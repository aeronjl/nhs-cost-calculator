"use client";

import { cn } from "@/lib/utils";
import {
	DECILE_DISPOSABLE_INCOME,
	asShareOfIncome,
} from "@/lib/distribution";
import type { ScenarioDistribution } from "@/lib/scenario";

// Renders the scenario's distributional impact as a 10-decile horizontal
// bar chart. Lossy bars (decile loses £) extend right in amber; gainy bars
// extend left in blue. Each row also shows the £/year impact and the impact
// as % of disposable income — the latter being far more meaningful than £
// alone when comparing burdens across deciles.
//
// Below the chart: a "modelled coverage" line (e.g. "8 of 9 lines have
// incidence data; £2bn of the scenario £ delta is unmodelled"). When some
// lines lack incidence, the chart shows the partial picture and explicitly
// flags the gap rather than fudging.

interface Props {
	distribution: ScenarioDistribution;
}

export function DistributionalImpact({ distribution }: Props) {
	const { perDecile, modelledLines, totalLines, modelledDelta, totalDelta } =
		distribution;

	if (modelledLines === 0) {
		return null;
	}

	const incomeShares = asShareOfIncome(perDecile);
	const maxAbs = Math.max(...perDecile.map((v) => Math.abs(v)), 1);
	const unmodelledDelta = Math.abs(totalDelta) - Math.abs(modelledDelta);
	const allUnmodelled = totalLines > 0 && modelledLines === 0;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					By income decile
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{modelledLines} of {totalLines} lines modelled
				</span>
			</div>

			<DecileChart perDecile={perDecile} maxAbs={maxAbs} />

			<DecileTable perDecile={perDecile} incomeShares={incomeShares} />

			{!allUnmodelled && unmodelledDelta > 100_000_000 && (
				<p className="text-[10px] text-amber-700 leading-snug">
					£{(unmodelledDelta / 1_000_000_000).toFixed(1)}bn of this scenario's
					incidence basis has no distributional model — tax-other measures and
					other unallocated lines are excluded.
				</p>
			)}

			<p className="text-[10px] text-muted-foreground leading-snug">
				Economic incidence per HMRC / OBR / IFS conventions. Bars represent
				absolute £; the "% of income" column shows the same impact relative to
				each decile's median disposable income — the better measure for
				comparing burdens across deciles. Borrowing, where present, is shown as
				year-5 annual debt service rather than year-1 financing.
			</p>
		</div>
	);
}

function DecileChart({
	perDecile,
	maxAbs,
}: {
	perDecile: number[];
	maxAbs: number;
}) {
	return (
		<div
			className="rounded-md border bg-background/60 p-2"
			role="img"
			aria-label="Per-decile distributional impact versus current-policy baseline"
		>
			<div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
				<span className="inline-flex items-center gap-1">
					<span className="h-2 w-2 rounded-sm bg-blue-500" aria-hidden="true" />
					gain vs baseline
				</span>
				<span className="tabular-nums">current-policy baseline = £0</span>
				<span className="inline-flex items-center gap-1">
					loss vs baseline
					<span className="h-2 w-2 rounded-sm bg-amber-500" aria-hidden="true" />
				</span>
			</div>
			<div className="space-y-0.5">
				{perDecile.map((amount, i) => {
					const widthPct = (Math.abs(amount) / maxAbs) * 50;
					const isLoss = amount > 0;
					return (
						<div
							key={i}
							className="flex items-center gap-1 text-[10px] tabular-nums"
						>
							<span className="w-6 text-right text-muted-foreground">
								D{i + 1}
							</span>
							<div className="flex-1 h-3.5 relative bg-muted/30 rounded-sm overflow-hidden">
								<div
									className={cn(
										"absolute top-0 bottom-0",
										isLoss
											? "left-1/2 bg-amber-500"
											: "right-1/2 bg-blue-500",
									)}
									style={{ width: `${widthPct}%` }}
									aria-hidden="true"
								/>
								<div
									className="absolute top-0 bottom-0 left-1/2 w-px bg-foreground/40"
									aria-hidden="true"
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function DecileTable({
	perDecile,
	incomeShares,
}: {
	perDecile: number[];
	incomeShares: number[];
}) {
	const formatPerCapita = (totalForDecile: number): string => {
		// Total scenario impact for this decile in £, divided across
		// roughly 2.8M households per decile (UK ~28M households / 10).
		const perHouseholdPerYear = totalForDecile / 2_800_000;
		return formatPerHousehold(perHouseholdPerYear);
	};

	return (
		<div className="border-t pt-2 space-y-0.5 text-[10px] tabular-nums">
			<div className="grid grid-cols-[2rem_1fr_1fr_1fr] text-muted-foreground">
				<span className="text-right pr-1">Dec.</span>
				<span className="text-right">Income</span>
				<span className="text-right">£/hh/yr</span>
				<span className="text-right">% of inc.</span>
			</div>
			{perDecile.map((amount, i) => {
				const sign = amount > 0 ? "−" : amount < 0 ? "+" : "";
				const colour =
					amount > 0
						? "text-amber-700"
						: amount < 0
							? "text-blue-700"
							: "text-muted-foreground";
				const incomeShare = (incomeShares[i] ?? 0) * 100; // signed
				return (
					<div
						key={i}
						className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-1"
					>
						<span className="text-right text-muted-foreground pr-1">
							{i + 1}
						</span>
						<span className="text-right text-muted-foreground">
							£{(DECILE_DISPOSABLE_INCOME[i] ?? 0).toLocaleString()}
						</span>
						<span className={cn("text-right", colour)}>
							{sign}
							{formatPerCapita(Math.abs(amount))}
						</span>
						<span className={cn("text-right", colour)}>
							{sign}
							{Math.abs(incomeShare).toFixed(2)}%
						</span>
					</div>
				);
			})}
		</div>
	);
}

const formatPerHousehold = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1000) return `£${(abs / 1000).toFixed(1)}k`;
	if (abs >= 100) return `£${Math.round(abs)}`;
	if (abs >= 1) return `£${abs.toFixed(0)}`;
	return `£${abs.toFixed(2)}`;
};

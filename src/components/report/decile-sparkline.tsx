"use client";

import { cn } from "@/lib/utils";
import type { ScenarioDistribution } from "@/lib/scenario";

// Compact per-decile incidence sparkline. Ten thin vertical bars, signed
// per the codebase convention: positive perDecile = decile *loses* income,
// negative = decile *gains* income.  Bars rise above the zero line for
// losses (amber) and drop below for gains (blue), so the silhouette tells
// you the scenario's distributional shape at a glance — progressive,
// regressive, or middle-loaded.
//
// Sized for the wizard HUD (full column width × 32px tall). Returns null
// if no decile carries a meaningful per-household impact, so empty
// scenarios don't render an empty stripe.

const HOUSEHOLDS_PER_DECILE = 2_800_000;
const SIGNIFICANCE_PER_HH = 1; // £1/yr threshold to render at all

const formatStylePct = (n: number): string =>
	`${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

interface Props {
	distribution: ScenarioDistribution;
	height?: number;
	className?: string;
}

export function DecileSparkline({
	distribution,
	height = 32,
	className,
}: Props) {
	const perHh = distribution.perDecile.map(
		(value) => value / HOUSEHOLDS_PER_DECILE,
	);
	const maxAbs = Math.max(...perHh.map((v) => Math.abs(v)), 0);
	if (maxAbs < SIGNIFICANCE_PER_HH) return null;

	return (
		<div
			role="img"
			aria-label="Per-decile incidence sparkline"
			className={cn(
				"rounded-md border bg-background/60 p-2",
				className,
			)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Decile incidence
				</span>
				<span className="text-[9px] text-muted-foreground">
					£/hh/yr · loss up · gain down
				</span>
			</div>
			<div
				className="relative mt-1 grid grid-cols-10 gap-px"
				style={{ height: `${height}px` }}
			>
				<span
					aria-hidden="true"
					className="absolute inset-x-0 top-1/2 h-px bg-foreground/40"
				/>
				{perHh.map((value, idx) => {
					const isLoss = value > 0;
					const heightPct = (Math.abs(value) / maxAbs) * 50;
					return (
						<span
							key={idx}
							className="relative"
							title={`D${idx + 1}: ${
								value > 0
									? `−£${Math.round(Math.abs(value)).toLocaleString()}/hh/yr`
									: value < 0
										? `+£${Math.round(Math.abs(value)).toLocaleString()}/hh/yr`
										: "£0/hh/yr"
							}`}
						>
							<span
								aria-hidden="true"
								className={cn(
									"absolute left-0 right-0 rounded-sm",
									isLoss
										? "bottom-1/2 bg-amber-500"
										: "top-1/2 bg-blue-500",
								)}
								style={{ height: formatStylePct(heightPct) }}
							/>
						</span>
					);
				})}
			</div>
			<div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground">
				<span>D1</span>
				<span>D5</span>
				<span>D10</span>
			</div>
		</div>
	);
}

"use client";

import { cn } from "@/lib/utils";
import type { PercentileBand } from "@/lib/uncertainty";
import type { YearProjection } from "@/lib/scenario";

// Compact multi-year projection display. Shows year-1 / year-N net + a
// fan-chart sparkline with 50% and 90% confidence bands when available
// (from `projectScenarioBandsByYear`). Surfaces the difference between
// announcement-year scoring and steady-state impact, plus the parameter-
// uncertainty range that a single-line presentation hides.
//
// Year-1 figures already carry behavioural and macro feedback adjustments
// set in projectScenarioOverYears.

interface Props {
	projection: readonly YearProjection[];
	bands?: readonly { year: number; central: number; band: PercentileBand }[];
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatDelta = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n >= 0 ? "+" : "−";
	if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatPp = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

export function MultiYearProjection({ projection, bands }: Props) {
	if (projection.length === 0) return null;

	const year1 = projection[0]!;
	const yearN = projection[projection.length - 1]!;
	const trajectory = yearN.net - year1.net;
	const significant = Math.abs(trajectory) > Math.abs(year1.net) * 0.1;

	const yearNBand = bands?.[bands.length - 1]?.band;
	const hasBorrowingEffects =
		projection.some((p) => Math.abs(p.debtInterestGbp) > 1_000_000) ||
		projection.some((p) => Math.abs(p.net - p.psnbShift) > 1_000_000);
	const bandWidthSignificant =
		yearNBand &&
		Math.abs(yearN.net) > 0 &&
		Math.abs(yearNBand.p95 - yearNBand.p5) / Math.abs(yearN.net) > 0.05;

	// Max abs across all percentile values, not just centrals — so the band
	// fits in the sparkline viewbox.
	const allValues = bands
		? bands.flatMap((b) => [b.band.p5, b.band.p95, b.central])
		: projection.map((p) => p.net);
	const maxAbs = Math.max(...allValues.map(Math.abs), 1);

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{projection.length}-year projection
				</h3>
				{significant && (
					<span
						className={cn(
							"text-[10px] tabular-nums",
							trajectory > 0 ? "text-blue-700" : "text-amber-700",
						)}
					>
						{formatDelta(trajectory)} by year {projection.length}
					</span>
				)}
			</div>

			<div className="rounded-md border bg-background/60 p-2 space-y-1.5">
				<Sparkline projection={projection} bands={bands} maxAbs={maxAbs} />
				<div className="flex items-baseline justify-between text-[10px] tabular-nums">
					<span>
						<span className="text-muted-foreground">Year 1: </span>
						<span className="font-medium">{formatBn(year1.net)}</span>
					</span>
					<span>
						<span className="text-muted-foreground">
							Year {projection.length}:{" "}
						</span>
						<span className="font-medium">{formatBn(yearN.net)}</span>
					</span>
				</div>
				{hasBorrowingEffects && (
					<div className="grid grid-cols-2 gap-2 text-[10px] tabular-nums text-muted-foreground border-t pt-1.5">
						<div>
							<span>Year {projection.length} debt interest: </span>
							<span className="font-medium text-foreground">
								{formatDelta(-yearN.debtInterestGbp)}
							</span>
						</div>
						<div className="text-right">
							<span>PSNB shift: </span>
							<span className="font-medium text-foreground">
								{formatDelta(yearN.psnbShift)}
							</span>
						</div>
						<div>
							<span>Debt/GDP shift: </span>
							<span className="font-medium text-foreground">
								{formatPp(yearN.debtGdpDeltaPp)}
							</span>
						</div>
						<div className="text-right">
							<span>Debt stock: </span>
							<span className="font-medium text-foreground">
								{formatDelta(yearN.debtStockDeltaGbp)}
							</span>
						</div>
					</div>
				)}
				{bandWidthSignificant && yearNBand && (
					<div className="text-[10px] tabular-nums text-muted-foreground border-t pt-1.5">
						Year {projection.length} 90% CI: {formatBn(yearNBand.p5)} —{" "}
						{formatBn(yearNBand.p95)}
					</div>
				)}
			</div>

			<p className="text-[10px] text-muted-foreground leading-snug">
				4% nominal growth assumed; rate-style tax + spend lines scale with the
				base. Borrow lines are year-1 financing, then debt-interest and
				refinancing exposure. Threshold-freeze yield ramps over the freeze
				window then plateaus.
				{bands &&
					" Bands sample 1000 draws from per-lever yield distributions (HMRC ranges where stated, ±10% otherwise) — parameter uncertainty only, not stochastic year-to-year shocks."}{" "}
				Multi-year is a forecast envelope, not a prediction — see Forecast vs
				reality on /reference for how previous projections diverged.
			</p>
		</div>
	);
}

function Sparkline({
	projection,
	bands,
	maxAbs,
}: {
	projection: readonly YearProjection[];
	bands?: readonly { year: number; central: number; band: PercentileBand }[];
	maxAbs: number;
}) {
	const width = 100; // arbitrary viewBox width
	const height = 36; // taller to fit the band
	const baseY = height / 2;
	const dx = width / Math.max(1, projection.length - 1);

	// Map net £ → y coordinate (positive = up = blue/freed).
	const toY = (n: number): number => baseY - (n / maxAbs) * (baseY * 0.85);

	// Build polygon paths for the bands (90% and 50%).
	const buildBandPath = (
		hi: (i: number) => number,
		lo: (i: number) => number,
	): string => {
		if (!bands || bands.length === 0) return "";
		const top = bands.map((b, i) => `${i * dx},${toY(hi(i))}`).join(" ");
		const bot = [...bands]
			.reverse()
			.map((b, ri) => {
				const i = bands.length - 1 - ri;
				return `${i * dx},${toY(lo(i))}`;
			})
			.join(" ");
		return `${top} ${bot}`;
	};

	const band90Path = buildBandPath(
		(i) => bands![i]!.band.p95,
		(i) => bands![i]!.band.p5,
	);
	const band50Path = buildBandPath(
		(i) => bands![i]!.band.p75,
		(i) => bands![i]!.band.p25,
	);

	const points = projection
		.map((p, i) => `${i * dx},${toY(p.net)}`)
		.join(" ");

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className="w-full h-10"
			preserveAspectRatio="none"
			role="img"
			aria-label={`Net projection over ${projection.length} years${bands ? " with confidence bands" : ""}`}
		>
			{bands && band90Path && (
				<polygon
					points={band90Path}
					className="fill-blue-200/40"
				/>
			)}
			{bands && band50Path && (
				<polygon
					points={band50Path}
					className="fill-blue-300/50"
				/>
			)}
			<line
				x1="0"
				y1={baseY}
				x2={width}
				y2={baseY}
				stroke="currentColor"
				strokeWidth="0.3"
				className="text-muted-foreground/40"
			/>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinejoin="round"
				strokeLinecap="round"
				className="text-blue-600"
			/>
			{projection.map((p, i) => (
				<circle
					key={i}
					cx={i * dx}
					cy={toY(p.net)}
					r="1.2"
					className={p.net >= 0 ? "fill-blue-600" : "fill-amber-600"}
				/>
			))}
		</svg>
	);
}

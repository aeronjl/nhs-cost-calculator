"use client";

import { type PointerEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import type { PercentileBand } from "@/lib/uncertainty";
import type { YearProjection } from "@/lib/scenario";
import { pointerToYearIndex, useYearFocus } from "@/lib/year-focus";

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

const valueToneClassName = (n: number): string =>
	n > 0 ? "text-blue-700" : n < 0 ? "text-amber-700" : "text-muted-foreground";

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
				<ProjectionFanChart
					projection={projection}
					bands={bands}
					maxAbs={maxAbs}
				/>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-1.5 text-[10px] text-muted-foreground">
					<ProjectionLegendItem color="#64748b" label="no-policy baseline" />
					<ProjectionLegendItem color="#2563eb" label="central scenario path" />
					{bands && (
						<>
							<ProjectionLegendItem
								color="#93c5fd"
								label="90% parameter fan"
								filled
							/>
							<ProjectionLegendItem
								color="#60a5fa"
								label="50% parameter fan"
								filled
							/>
						</>
					)}
				</div>
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
				<div className="grid grid-cols-3 gap-2 border-t pt-1.5 text-[10px]">
					<ProjectionMetric
						label="No-policy baseline"
						value="£0"
						detail="scenario effect"
						tone="muted"
					/>
					<ProjectionMetric
						label={`Year ${projection.length} central`}
						value={formatBn(yearN.net)}
						detail={`${formatDelta(trajectory)} from year 1`}
						tone={yearN.net > 0 ? "blue" : yearN.net < 0 ? "amber" : "muted"}
					/>
					<ProjectionMetric
						label="Fan width"
						value={
							yearNBand
								? formatBn(yearNBand.p95 - yearNBand.p5)
								: "not sampled"
						}
						detail={bands ? "90% parameter range" : "central only"}
						tone={yearNBand ? "blue" : "muted"}
					/>
				</div>
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

function ProjectionFanChart({
	projection,
	bands,
	maxAbs,
}: {
	projection: readonly YearProjection[];
	bands?: readonly { year: number; central: number; band: PercentileBand }[];
	maxAbs: number;
}) {
	const width = 100; // arbitrary viewBox width
	const height = 48; // taller to fit baseline, fan, and central path
	const baseY = height / 2;
	const dx = width / Math.max(1, projection.length - 1);

	const { year: focusedYear, setYear, clear } = useYearFocus();
	const svgRef = useRef<SVGSVGElement | null>(null);
	const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const next = pointerToYearIndex({
			clientX: event.clientX,
			rect: svg.getBoundingClientRect(),
			years: projection.length,
			padX: 0,
			innerWidth: width,
			viewBoxWidth: width,
		});
		if (next !== null) setYear(next);
	};

	const focusedIndex =
		focusedYear !== null && focusedYear >= 1 && focusedYear <= projection.length
			? focusedYear - 1
			: null;
	const focusedProjection =
		focusedIndex !== null ? projection[focusedIndex] ?? null : null;
	const focusedBand =
		focusedIndex !== null && bands ? bands[focusedIndex]?.band ?? null : null;
	const focusedX = focusedIndex !== null ? focusedIndex * dx : null;

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

	const headlineYear = focusedProjection ?? projection.at(-1) ?? null;
	const headlineLabel = focusedProjection
		? `Y${focusedProjection.year}`
		: `Y${projection.at(-1)?.year ?? projection.length}`;

	return (
		<div className="rounded-sm border bg-background/80 p-2">
			<div className="flex items-baseline justify-between gap-2">
				<div>
					<div className="text-xs font-medium">Scenario effect fan</div>
					<div className="text-[10px] text-muted-foreground">
						{focusedProjection
							? `Hovering year ${focusedProjection.year} — release to follow the cursor.`
							: "Net effect versus the no-policy baseline. Hover to scrub years."}
					</div>
				</div>
				<div
					className={cn(
						"text-right text-xs font-semibold tabular-nums",
						valueToneClassName(headlineYear?.net ?? 0),
					)}
				>
					<span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-1">
						{headlineLabel}
					</span>
					{formatBn(headlineYear?.net ?? 0)}
				</div>
			</div>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				className="mt-2 h-16 w-full touch-none"
				preserveAspectRatio="none"
				role="img"
				aria-label="Scenario effect fan chart versus no-policy baseline"
				onPointerMove={handlePointerMove}
				onPointerLeave={clear}
				onPointerDown={handlePointerMove}
			>
				<title>Scenario effect fan chart versus no-policy baseline</title>
				{bands && band90Path && (
					<polygon points={band90Path} className="fill-blue-200/40">
						<title>90% parameter fan</title>
					</polygon>
				)}
				{bands && band50Path && (
					<polygon points={band50Path} className="fill-blue-300/50">
						<title>50% parameter fan</title>
					</polygon>
				)}
				<line
					x1="0"
					y1={baseY}
					x2={width}
					y2={baseY}
					stroke="currentColor"
					strokeWidth="0.45"
					vectorEffect="non-scaling-stroke"
					className="text-slate-500/70"
				>
					<title>No-policy baseline: £0 scenario effect</title>
				</line>
				<polyline
					points={points}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.4"
					strokeLinejoin="round"
					strokeLinecap="round"
					vectorEffect="non-scaling-stroke"
					className="text-blue-600"
				>
					<title>central scenario path</title>
				</polyline>
				{focusedX !== null && (
					<line
						x1={focusedX}
						x2={focusedX}
						y1={0}
						y2={height}
						stroke="currentColor"
						strokeDasharray="2 2"
						strokeWidth="0.6"
						vectorEffect="non-scaling-stroke"
						className="text-foreground/60 pointer-events-none"
					/>
				)}
				{projection.map((p, i) => {
					const isFocused = focusedIndex === i;
					return (
						<circle
							key={p.year}
							cx={i * dx}
							cy={toY(p.net)}
							r={isFocused ? 2.6 : 1.4}
							className={cn(
								p.net >= 0 ? "fill-blue-600" : "fill-amber-600",
								isFocused && "stroke-background",
							)}
							strokeWidth={isFocused ? 0.8 : 0}
							vectorEffect="non-scaling-stroke"
						>
							<title>{`Year ${p.year}: ${formatBn(
								p.net,
							)} versus no-policy baseline`}</title>
						</circle>
					);
				})}
			</svg>
			<div
				className="mt-1 grid gap-1 text-[9px] tabular-nums text-muted-foreground"
				style={{
					gridTemplateColumns: `repeat(${projection.length}, minmax(0, 1fr))`,
				}}
			>
				{projection.map((p, index) => {
					const isFocused = focusedIndex === index;
					return (
						<span
							key={p.year}
							className={cn(
								"min-w-0 truncate",
								index === 0
									? "text-left"
									: index === projection.length - 1
										? "text-right"
										: "text-center",
								isFocused && "font-semibold text-foreground",
							)}
						>
							Y{p.year}
						</span>
					);
				})}
			</div>
			{focusedProjection ? (
				<div className="mt-1 flex items-baseline justify-between gap-2 text-[9px] tabular-nums">
					<span className="text-muted-foreground">
						Y{focusedProjection.year} central{" "}
						<span className="font-medium text-foreground">
							{formatBn(focusedProjection.net)}
						</span>
					</span>
					{focusedBand ? (
						<span className="text-muted-foreground">
							90% {formatBn(focusedBand.p5)} – {formatBn(focusedBand.p95)}
						</span>
					) : (
						<span className="text-muted-foreground">central only</span>
					)}
				</div>
			) : (
				<div className="mt-1 text-[9px] text-muted-foreground">
					baseline = £0
				</div>
			)}
		</div>
	);
}

function ProjectionLegendItem({
	color,
	label,
	filled = false,
}: {
	color: string;
	label: string;
	filled?: boolean;
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<span
				className={cn(
					"inline-block w-4",
					filled ? "h-2 rounded-sm border" : "h-0 border-t-2",
				)}
				style={{
					backgroundColor: filled ? color : undefined,
					borderColor: color,
					opacity: filled ? 0.42 : 1,
				}}
			/>
			{label}
		</span>
	);
}

function ProjectionMetric({
	label,
	value,
	detail,
	tone,
}: {
	label: string;
	value: string;
	detail: string;
	tone: "blue" | "amber" | "muted";
}) {
	return (
		<div className="min-w-0 rounded-sm bg-muted/30 p-1.5">
			<div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 truncate text-xs font-semibold tabular-nums",
					tone === "blue"
						? "text-blue-700"
						: tone === "amber"
							? "text-amber-700"
							: "text-muted-foreground",
				)}
			>
				{value}
			</div>
			<div className="truncate text-[9px] text-muted-foreground">
				{detail}
			</div>
		</div>
	);
}

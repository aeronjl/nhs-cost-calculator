"use client";

import { type PointerEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import type { LineEvaluation, YearProjection } from "@/lib/scenario";
import { pointerToYearIndex, useYearFocus } from "@/lib/year-focus";

// Per-lever composition view of the multi-year trajectory. Sits beneath the
// uncertainty fan and answers "which lever is doing the work in year N?".
//
// Each scenario line is projected in isolation (no GE feedback — the fan
// chart already shows the GE-adjusted central line). Lines are then stacked:
// revenue-raisers above the £0 baseline, costs below. Colour rotates through
// a categorical palette so each lever is identifiable across both this
// chart and the per-lever decile breakdown.
//
// The static stack will not exactly match the fan's central line — the
// difference is macro / GE feedback, which is a feature, not a bug. The
// callout under the chart names the gap explicitly.

interface LineProjection {
	line: LineEvaluation;
	values: readonly number[];
}

interface Props {
	projection: readonly YearProjection[];
	lineProjections: readonly LineProjection[];
}

const PER_LEVER_PALETTE: readonly string[] = [
	"#2563eb", // blue-600
	"#d97706", // amber-600
	"#0891b2", // cyan-600
	"#be185d", // pink-700
	"#7c3aed", // violet-600
	"#15803d", // green-700
	"#c2410c", // orange-700
	"#4f46e5", // indigo-600
];

const fallbackColor = "#475569"; // slate-600

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

export function PerLeverComposition({ projection, lineProjections }: Props) {
	const yearCount = projection.length;
	if (yearCount === 0 || lineProjections.length === 0) return null;

	// Classify each line by its overall (year-1) sign. Lines that flip sign
	// year-over-year (rare — borrowing's interest tail) get clamped so the
	// stack stays read‑able; the discontinuity is an honest visual cue
	// rather than a fabricated continuity.
	const stackable = lineProjections.map((lp, idx) => {
		const isPositive = lp.line.deltaGbp >= 0;
		const clamped = lp.values.map((v) =>
			isPositive ? Math.max(0, v) : Math.min(0, v),
		);
		return {
			id: lp.line.line.id,
			description: lp.line.description,
			color: PER_LEVER_PALETTE[idx % PER_LEVER_PALETTE.length] ?? fallbackColor,
			isPositive,
			values: clamped,
		};
	});

	const positiveLines = stackable.filter((s) => s.isPositive);
	const negativeLines = stackable.filter((s) => !s.isPositive);

	// Compute per-line, per-year [bottom, top] in £ (positive lines stack
	// upward from £0; negative downward from £0).
	const buildBands = (
		group: typeof stackable,
		direction: "up" | "down",
	): { line: (typeof stackable)[number]; band: { bottom: number[]; top: number[] } }[] => {
		const out: ReturnType<typeof buildBands> = [];
		const cursor = new Array(yearCount).fill(0);
		for (const line of group) {
			const bottom = [...cursor];
			const top = bottom.map((b, y) =>
				direction === "up" ? b + line.values[y]! : b + line.values[y]!,
			);
			out.push({ line, band: { bottom, top } });
			for (let y = 0; y < yearCount; y++) {
				cursor[y] = top[y]!;
			}
		}
		return out;
	};

	const positiveBands = buildBands(positiveLines, "up");
	const negativeBands = buildBands(negativeLines, "down");

	// y-range: symmetric so positive and negative stacks share a £/px scale.
	let maxAbs = 0;
	for (let y = 0; y < yearCount; y++) {
		const posSum = positiveLines.reduce((s, l) => s + (l.values[y] ?? 0), 0);
		const negSum = negativeLines.reduce(
			(s, l) => s + Math.abs(l.values[y] ?? 0),
			0,
		);
		maxAbs = Math.max(maxAbs, posSum, negSum);
	}
	if (maxAbs <= 0) return null;

	const width = 100;
	const height = 48;
	const baseY = height / 2;
	const padX = 0;
	const innerWidth = width - padX * 2;
	const dx = innerWidth / Math.max(1, yearCount - 1);
	const xAt = (idx: number): number => padX + idx * dx;
	const toY = (n: number): number => baseY - (n / maxAbs) * (baseY * 0.85);

	const buildPolygon = (band: {
		bottom: readonly number[];
		top: readonly number[];
	}): string => {
		const top = band.top.map((v, i) => `${xAt(i)},${toY(v)}`).join(" ");
		const bot = [...band.bottom]
			.map((v, i) => ({ v, i }))
			.reverse()
			.map(({ v, i }) => `${xAt(i)},${toY(v)}`)
			.join(" ");
		return `${top} ${bot}`;
	};

	const { year: focusedYear, setYear, clear } = useYearFocus();
	const svgRef = useRef<SVGSVGElement | null>(null);
	const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const next = pointerToYearIndex({
			clientX: event.clientX,
			rect: svg.getBoundingClientRect(),
			years: yearCount,
			padX,
			innerWidth,
			viewBoxWidth: width,
		});
		if (next !== null) setYear(next);
	};
	const focusedIndex =
		focusedYear !== null && focusedYear >= 1 && focusedYear <= yearCount
			? focusedYear - 1
			: null;

	const focusedYearProjection =
		focusedIndex !== null ? projection[focusedIndex] : null;
	const focusedStaticSum =
		focusedIndex !== null
			? stackable.reduce((s, l) => s + (l.values[focusedIndex] ?? 0), 0)
			: null;
	const focusedFeedback =
		focusedIndex !== null && focusedYearProjection && focusedStaticSum !== null
			? focusedYearProjection.net - focusedStaticSum
			: null;

	const finalYearProjection = projection[yearCount - 1] ?? null;
	const finalStaticSum = stackable.reduce(
		(s, l) => s + (l.values[yearCount - 1] ?? 0),
		0,
	);
	const finalFeedback = finalYearProjection
		? finalYearProjection.net - finalStaticSum
		: 0;

	return (
		<div className="rounded-sm border bg-background/80 p-2">
			<div className="flex items-baseline justify-between gap-2">
				<div>
					<div className="text-xs font-medium">Composition by lever</div>
					<div className="text-[10px] text-muted-foreground">
						{focusedIndex !== null
							? `Year ${focusedIndex + 1} static composition — feedback gap shown below.`
							: "Static per-lever contribution. Hover to inspect a year."}
					</div>
				</div>
				<div className="text-right text-[10px] tabular-nums text-muted-foreground">
					<span className="mr-1 uppercase tracking-wider">
						{focusedIndex !== null ? `Y${focusedIndex + 1}` : `Y${yearCount}`}
					</span>
					<span className="font-medium text-foreground">
						{focusedIndex !== null && focusedStaticSum !== null
							? formatBn(focusedStaticSum)
							: formatBn(finalStaticSum)}
					</span>
				</div>
			</div>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				className="mt-2 h-16 w-full touch-none"
				preserveAspectRatio="none"
				role="img"
				aria-label="Per-lever composition stacked area"
				onPointerMove={handlePointerMove}
				onPointerLeave={clear}
				onPointerDown={handlePointerMove}
			>
				<title>Per-lever composition stacked area</title>
				{[...positiveBands, ...negativeBands].map(({ line, band }) => (
					<polygon
						key={line.id}
						points={buildPolygon(band)}
						fill={line.color}
						opacity="0.55"
					>
						<title>{line.description}</title>
					</polygon>
				))}
				<line
					x1={padX}
					y1={baseY}
					x2={width - padX}
					y2={baseY}
					stroke="currentColor"
					strokeWidth="0.45"
					vectorEffect="non-scaling-stroke"
					className="text-foreground/60"
				/>
				{focusedIndex !== null && (
					<line
						x1={xAt(focusedIndex)}
						x2={xAt(focusedIndex)}
						y1={0}
						y2={height}
						stroke="currentColor"
						strokeDasharray="2 2"
						strokeWidth="0.6"
						vectorEffect="non-scaling-stroke"
						className="text-foreground/60 pointer-events-none"
					/>
				)}
			</svg>
			<div
				className="mt-1 grid gap-1 text-[9px] tabular-nums text-muted-foreground"
				style={{
					gridTemplateColumns: `repeat(${yearCount}, minmax(0, 1fr))`,
				}}
			>
				{projection.map((p, index) => (
					<span
						key={p.year}
						className={cn(
							"min-w-0 truncate",
							index === 0
								? "text-left"
								: index === yearCount - 1
									? "text-right"
									: "text-center",
							focusedIndex === index && "font-semibold text-foreground",
						)}
					>
						Y{p.year}
					</span>
				))}
			</div>
			<FeedbackGapRow
				focusedFeedback={focusedFeedback}
				finalFeedback={finalFeedback}
				focusedIndex={focusedIndex}
				yearCount={yearCount}
			/>
			<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
				{stackable.map((line) => (
					<span key={line.id} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="inline-block h-2 w-2 rounded-sm"
							style={{ backgroundColor: line.color }}
						/>
						<span className="text-muted-foreground">{line.description}</span>
					</span>
				))}
			</div>
		</div>
	);
}

function FeedbackGapRow({
	focusedFeedback,
	finalFeedback,
	focusedIndex,
	yearCount,
}: {
	focusedFeedback: number | null;
	finalFeedback: number;
	focusedIndex: number | null;
	yearCount: number;
}) {
	const value = focusedFeedback ?? finalFeedback;
	if (Math.abs(value) < 100_000_000) return null;
	const label = focusedIndex !== null ? `Y${focusedIndex + 1}` : `Y${yearCount}`;
	return (
		<div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-[9px] tabular-nums text-muted-foreground">
			<span>
				{label} static stack vs GE-adjusted central
			</span>
			<span
				className={cn(
					"font-medium",
					value > 0
						? "text-blue-700"
						: value < 0
							? "text-amber-700"
							: "text-foreground",
				)}
			>
				{formatBn(value)}
			</span>
		</div>
	);
}

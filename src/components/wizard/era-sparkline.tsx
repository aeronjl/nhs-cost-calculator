"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useIsomorphicLayoutEffect } from "@/lib/use-isomorphic-layout-effect";
import { useDismissManager } from "./sparkline-dismiss-manager";

// Compact SVG sparkline rendering the year-by-year shape of the era's
// fiscal trajectory: forecast (gray, what the Chancellor expected),
// outturn (amber, what ONS PSF actually recorded), and the user's
// scenario projected against both baselines (light + dark blue). Sits
// beneath the year-N tile in the HUD.

interface Series {
	label: string;
	values: number[]; // £ PSNB per year, parallel to baseline.years
	color: string; // tailwind/HEX
	dashed?: boolean;
	width?: number;
}

interface Props {
	series: readonly Series[];
	// Per-year labels (e.g. fiscalYear strings) used in tooltips. Length
	// should match each series's values array. When omitted, tooltips
	// fall back to "Year N".
	xLabels?: readonly string[];
	height?: number;
	// Compact variant for the mobile sticky banner: hides legend + range
	// labels, smaller default height. Tooltips remain (essential for
	// inspecting values).
	compact?: boolean;
	// When true, this sparkline opts out of the cross-sparkline dismiss
	// registry. Its tooltip persists when other sparklines on the page
	// show theirs, and showing this sparkline's tooltip doesn't dismiss
	// others'. Useful for side-by-side independent visualisations where
	// the user expects to compare two states. Default false (cross-
	// dismiss participating, "one tooltip globally" behaviour).
	isolated?: boolean;
	// Stable identity for cross-mount tooltip persistence. When set, the
	// active tooltip is saved into the dismiss manager on show and
	// restored on remount — letting a user navigate away and back
	// without losing their visible tooltip. Without an id, sparklines
	// behave per-mount (default).
	id?: string;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(0)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n)}`;
};

interface ActiveTooltip {
	x: number;
	y: number;
	text: string;
}

const TOOLTIP_AUTO_DISMISS_MS = 3000;
// Heuristic char width at the SVG's 9px font (proportional). Used for
// the initial-render rect width — refined to a precise getBBox
// measurement on the next paint via useEffect.
const HEURISTIC_CHAR_WIDTH_PX = 5.5;
const TOOLTIP_PADDING_PX = 8;

export function EraSparkline({
	series,
	xLabels,
	height,
	compact = false,
	isolated = false,
	id,
}: Props) {
	const effectiveHeight = height ?? (compact ? 24 : 60);

	// Tap-to-reveal tooltip for touch devices (where native <title> hover
	// doesn't work). Auto-dismisses after 3s; tapping outside the SVG or
	// on another point also dismisses.
	const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(
		null,
	);
	const svgRef = useRef<SVGSVGElement>(null);
	const tooltipTextRef = useRef<SVGTextElement>(null);
	// Measured text width refined from getBBox after first paint of the
	// tooltip. null until measured; rect uses heuristic until then.
	const [measuredTextWidth, setMeasuredTextWidth] = useState<number | null>(
		null,
	);
	useIsomorphicLayoutEffect(() => {
		if (!activeTooltip) {
			setMeasuredTextWidth(null);
			return;
		}
		if (tooltipTextRef.current) {
			try {
				const bbox = tooltipTextRef.current.getBBox();
				setMeasuredTextWidth(bbox.width);
			} catch {
				// Not in a real DOM (SSR / jsdom) — heuristic stays in use.
			}
		}
	}, [activeTooltip]);

	// Cross-sparkline coordination: register this instance's dismiss
	// callback with the active manager (default: module singleton; can be
	// overridden by wrapping in <DismissManagerContext.Provider>). When
	// another sparkline shows its tooltip in the same scope, it dismisses
	// ours; conversely, when we show ours, we dismiss everyone else's.
	// `isolated` opts out at the instance level.
	const dismissManager = useDismissManager();
	const dismissThis = useCallback(() => {
		setActiveTooltip(null);
		if (id) dismissManager.setTooltip(id, null);
	}, [id, dismissManager]);
	useEffect(() => {
		if (isolated) return;
		dismissManager.register(dismissThis);
		return () => {
			dismissManager.deregister(dismissThis);
		};
	}, [dismissManager, dismissThis, isolated]);
	// Restore persisted tooltip on mount when the sparkline has a stable
	// id. Lets the user navigate away and back without losing the
	// visible tooltip — the manager remembers per id across mounts.
	useEffect(() => {
		if (!id) return;
		const restored = dismissManager.getTooltip(id);
		if (restored) setActiveTooltip(restored);
		// Mount-only restore; don't fight subsequent state changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const showTooltip = useCallback(
		(next: ActiveTooltip) => {
			if (!isolated) {
				dismissManager.dismissAllExcept(dismissThis);
			}
			setActiveTooltip(next);
			if (id) dismissManager.setTooltip(id, next);
		},
		[dismissManager, dismissThis, isolated, id],
	);
	useEffect(() => {
		if (!activeTooltip) return;
		const handle = setTimeout(
			() => setActiveTooltip(null),
			TOOLTIP_AUTO_DISMISS_MS,
		);
		return () => clearTimeout(handle);
	}, [activeTooltip]);
	useEffect(() => {
		if (!activeTooltip) return;
		// Document-level pointerdown: dismiss when the tap lands outside
		// our SVG. Taps on circles inside our SVG are handled by the
		// circle's own onClick (which replaces the tooltip).
		const handler = (e: PointerEvent) => {
			if (!svgRef.current) return;
			if (svgRef.current.contains(e.target as Node)) return;
			setActiveTooltip(null);
		};
		document.addEventListener("pointerdown", handler);
		return () => document.removeEventListener("pointerdown", handler);
	}, [activeTooltip]);
	if (series.length === 0 || series[0]!.values.length === 0) return null;

	// All series share the year axis. Use the first series's length.
	const yearCount = series[0]!.values.length;
	const allValues = series.flatMap((s) => s.values);
	const min = Math.min(...allValues);
	const max = Math.max(...allValues);
	const range = max - min || 1;

	// Layout: full-width SVG, padding for axis values
	const width = compact ? 160 : 240;
	const padX = compact ? 4 : 8;
	const padY = compact ? 3 : 6;
	const innerWidth = width - 2 * padX;
	const innerHeight = effectiveHeight - 2 * padY;

	const xAt = (i: number): number =>
		padX + (innerWidth * i) / Math.max(1, yearCount - 1);
	const yAt = (v: number): number =>
		padY + innerHeight - (innerHeight * (v - min)) / range;

	// Zero baseline if range crosses zero
	const zeroY = min < 0 && max > 0 ? yAt(0) : null;

	// In compact mode we drop the legend + min/max labels but keep one
	// absolute reference — the last year's value of the first (active)
	// series — inline beside the SVG. Tooltip-less devices still see at
	// least one £ anchor.
	const compactAnchor =
		compact && series[0]
			? {
					value: series[0].values[series[0].values.length - 1] ?? 0,
					label: xLabels?.[series[0].values.length - 1] ?? "",
				}
			: null;

	return (
		<div className={compact ? "flex items-center gap-2" : "space-y-1"}>
			<svg
				ref={svgRef}
				width="100%"
				height={effectiveHeight}
				viewBox={`0 0 ${width} ${effectiveHeight}`}
				preserveAspectRatio="none"
				className="rounded-sm"
				role="img"
				aria-label={`Sparkline: ${series.map((s) => s.label).join(", ")}`}
			>
				{/* Zero baseline if visible */}
				{zeroY !== null && (
					<line
						x1={padX}
						x2={width - padX}
						y1={zeroY}
						y2={zeroY}
						stroke="rgb(229 231 235)"
						strokeDasharray="2 2"
						strokeWidth="1"
					/>
				)}
				{series.map((s) => {
					const path = s.values
						.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`)
						.join(" ");
					return (
						<path
							key={s.label}
							d={path}
							fill="none"
							stroke={s.color}
							strokeWidth={s.width ?? 1.5}
							strokeDasharray={s.dashed ? "3 2" : undefined}
							strokeLinejoin="round"
							strokeLinecap="round"
						/>
					);
				})}
				{/* Per-year hover targets with native <title> tooltips +
				    touch-aware tap-to-reveal. End points are visible
				    (small filled circles); intermediate points use a
				    larger transparent radius for hover/tap target
				    legibility without visual clutter. */}
				{series.flatMap((s) =>
					s.values.map((v, i) => {
						const yearLabel = xLabels?.[i] ?? `Year ${i + 1}`;
						const isEnd = i === s.values.length - 1;
						const text = `${s.label} · ${yearLabel}: ${formatBn(v)}`;
						return (
							<circle
								key={`${s.label}-${i}`}
								cx={xAt(i)}
								cy={yAt(v)}
								r={isEnd ? 2 : 4}
								fill={isEnd ? s.color : "transparent"}
								className="cursor-pointer"
								onClick={() =>
									showTooltip({ x: xAt(i), y: yAt(v), text })
								}
							>
								<title>{text}</title>
							</circle>
						);
					}),
				)}
				{/* Tap-revealed tooltip (touch devices). Renders in-SVG so
				    coordinates align with the point. Width sized to fit
				    the text content + padding; horizontal position clamped
				    to viewbox edges so long tooltips at extremes stay
				    in-frame. Approximation: 5.5px per char at 9px font is
				    close enough for our short labels. */}
				{activeTooltip &&
					(() => {
						// Heuristic on first render (text not yet in DOM); precise
						// getBBox measurement on the second render once the text
						// element exists. The state-driven update produces a brief
						// (single-frame) imprecise rect that resizes — barely
						// perceptible at 9px font sizes.
						const heuristicTextWidth =
							activeTooltip.text.length * HEURISTIC_CHAR_WIDTH_PX;
						const textWidth = measuredTextWidth ?? heuristicTextWidth;
						const tooltipWidth = Math.min(
							width - 4,
							Math.max(60, textWidth + TOOLTIP_PADDING_PX),
						);
						const halfWidth = tooltipWidth / 2;
						const clampedX = Math.max(
							halfWidth + 2,
							Math.min(width - halfWidth - 2, activeTooltip.x),
						);
						return (
							<g
								transform={`translate(${clampedX} ${activeTooltip.y - 14})`}
								style={{ pointerEvents: "none" }}
							>
								<rect
									x={-halfWidth}
									y={-10}
									width={tooltipWidth}
									height={14}
									rx={3}
									fill="rgb(17 24 39)"
									opacity={0.92}
								/>
								<text
									ref={tooltipTextRef}
									x={0}
									y={0}
									fill="white"
									fontSize="9"
									textAnchor="middle"
								>
									{activeTooltip.text}
								</text>
							</g>
						);
					})()}
			</svg>
			{!compact && (
				<>
					{/* Compact legend */}
					<div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground">
						{series.map((s) => (
							<span key={s.label} className="flex items-center gap-1">
								<span
									className="inline-block w-2.5 h-0.5"
									style={{
										backgroundColor: s.color,
										borderTop: s.dashed
											? `1px dashed ${s.color}`
											: undefined,
									}}
								/>
								{s.label}
							</span>
						))}
					</div>
					{/* Range labels */}
					<div className="flex justify-between text-[8px] text-muted-foreground tabular-nums">
						<span>{formatBn(min)}</span>
						<span>{formatBn(max)}</span>
					</div>
				</>
			)}
			{compactAnchor && (
				<span
					className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap"
					title={
						compactAnchor.label
							? `${series[0]?.label} at ${compactAnchor.label}`
							: undefined
					}
				>
					{formatBn(compactAnchor.value)}
				</span>
			)}
		</div>
	);
}

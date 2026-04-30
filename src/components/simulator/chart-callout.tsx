"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Floating-tooltip primitive for charts that respect the year-of-focus
// state. Sits inside a `relative` chart container at the top edge,
// horizontally anchored at the focused-year x position. Anchor flips at
// the chart extremes so the callout stays inside the container instead of
// overflowing right when focused on the last year (or left when focused
// on the first).
//
// Pointer-events are off so the callout never gets in the way of the
// pointer-tracking handlers on the SVG underneath.

const formatStylePct = (n: number): string =>
	`${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

interface Props {
	// Horizontal position as a percentage along the chart's plotting area.
	xPct: number;
	// Pick the appropriate horizontal anchor so the callout stays inside
	// the chart's bounds at the extremes.
	anchor: "start" | "middle" | "end";
	// Where to render the callout vertically relative to the chart.
	side?: "above" | "below";
	className?: string;
	children: ReactNode;
}

export function ChartCallout({
	xPct,
	anchor,
	side = "above",
	className,
	children,
}: Props) {
	const xTransform =
		anchor === "start"
			? "translateX(0)"
			: anchor === "end"
				? "translateX(-100%)"
				: "translateX(-50%)";

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"absolute pointer-events-none z-10 rounded-md border bg-background/95 px-2 py-1 text-[10px] leading-snug tabular-nums shadow-md whitespace-nowrap",
				side === "above" ? "top-1" : "bottom-1",
				className,
			)}
			style={{
				left: formatStylePct(xPct),
				transform: xTransform,
			}}
		>
			{children}
		</div>
	);
}

// Helper for picking the right anchor given a focused index and the total
// number of slots. Centres the callout for every interior position; flips
// to start/end at the extremes.
export function calloutAnchor(
	focusedIndex: number,
	count: number,
): "start" | "middle" | "end" {
	if (count <= 1) return "middle";
	if (focusedIndex <= 0) return "start";
	if (focusedIndex >= count - 1) return "end";
	return "middle";
}

export function calloutXPct(focusedIndex: number, count: number): number {
	if (count <= 1) return 50;
	return (focusedIndex / (count - 1)) * 100;
}

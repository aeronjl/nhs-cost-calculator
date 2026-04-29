"use client";

import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { cn } from "@/lib/utils";
import {
	type LineEvaluation,
	evaluateLineDynamic,
} from "@/lib/scenario";

// Renders a compact "Assumptions" section in the output rail. Each scenario
// line gets a short caveat (the "what would a domain expert object to first"
// line from its methodology) plus a popover trigger for the full alternatives
// / range / source.
//
// Lives next to the comparisons-afforded list in the right rail so the
// "lead with the headline, expose assumptions on demand" principle is
// always visible — assumptions are not behind a tab the user has to find.

interface Props {
	lines: readonly LineEvaluation[];
}

export function ScenarioAssumptions({ lines }: Props) {
	if (lines.length === 0) return null;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Assumptions
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{lines.length} line{lines.length === 1 ? "" : "s"}
				</span>
			</div>

			<ul className="space-y-2">
				{lines.map((ev) => (
					<AssumptionItem key={ev.line.id} evaluation={ev} />
				))}
			</ul>

			<p className="text-[10px] text-muted-foreground pt-1 border-t leading-snug">
				Tap ⓘ on any line for alternatives, plausible range, and source. Every
				calibration is HMRC ready-reckoner / IFS / OBR; figures are first-order
				static estimates.
			</p>
		</div>
	);
}

function AssumptionItem({ evaluation }: { evaluation: LineEvaluation }) {
	const { line, deltaGbp, description, methodology } = evaluation;
	const dynamic = evaluateLineDynamic(evaluation);
	const haircutPct = Math.round(dynamic.haircutFraction * 100);
	const haircutSignificant = dynamic.haircutFraction > 0.05;

	const sign = deltaGbp >= 0 ? "+" : "−";
	const formatted = formatBn(Math.abs(deltaGbp));
	const colour =
		deltaGbp > 0
			? "text-blue-700"
			: deltaGbp < 0
				? "text-amber-700"
				: "text-muted-foreground";

	return (
		<li className="rounded-md border bg-background/60 p-2 space-y-1">
			<div className="flex items-start gap-2">
				<span aria-hidden="true" className="text-sm leading-tight">
					{line.type === "tax" ? "💰" : line.type === "programme" ? "✂️" : "🏦"}
				</span>
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline justify-between gap-2">
						<span className="text-xs font-medium leading-snug">
							{description}
						</span>
						<span
							className={cn(
								"text-xs tabular-nums font-medium shrink-0",
								colour,
							)}
						>
							{sign}£{formatted}
						</span>
					</div>
					{haircutSignificant && (
						<div className="text-[10px] text-amber-700 leading-snug mt-0.5">
							Dynamic: {sign}£
							{formatBn(Math.abs(dynamic.dynamicDelta))} ({haircutPct}%
							behavioural haircut at this magnitude)
						</div>
					)}
				</div>
			</div>

			{methodology.caveat && (
				<p className="text-[11px] text-muted-foreground leading-snug pl-6">
					<span className="font-medium text-foreground/70">Caveat: </span>
					{methodology.caveat}
				</p>
			)}

			<div className="pl-6">
				<MethodologyPopover methodology={methodology} label="full methodology" />
			</div>
		</li>
	);
}

const formatBn = (n: number): string => {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}bn`;
	if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}m`;
	return Math.round(n).toLocaleString();
};

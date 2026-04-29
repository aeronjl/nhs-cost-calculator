"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { LegislativeMeta } from "@/data/legislation";
import type { ScenarioLine } from "@/lib/scenario";

// 60ms is a perceptual sweet spot: long enough that brushing past a card
// while moving the cursor doesn't fire its preview, short enough that an
// intentional hover feels instant.
const PREVIEW_HOVER_DELAY_MS = 60;

// Choice card: a single fiscal-policy option presented in the wizard.
// Title + quick numbers (typical revenue / cost), legislation badge,
// hover/tap preview, click to commit. Disabled cards (when the rule
// makes the choice unavailable) show the WHY explainer in place of
// the commit action.

export type ChoiceState = "available" | "preview" | "committed" | "disabled";

interface Props {
	title: string;
	subtitle?: string; // e.g. "+1pp basic rate · ~£6bn"
	context?: string; // 1-2 sentences shown below the headline
	legislation: LegislativeMeta;
	// The scenario line(s) this choice represents. Passed back on
	// hover/commit.
	lines: ScenarioLine[];
	committed: boolean; // is this choice already in the committed scenario?
	// Whether the committed line was forced through against a rule. Drives
	// the red-ring + "OVERRIDDEN" treatment.
	committedOverridden?: boolean;
	onPreview: (lines: ScenarioLine[]) => void;
	onClearPreview: () => void;
	onCommit: (lines: ScenarioLine[]) => void;
	// Break-the-rules: invoked from the explainer popover on hard-disabled
	// cards that have a `relaxation` cost. Commits the line with the
	// `overridden` flag so the evaluator applies a yield haircut + risk
	// premium.
	onOverride?: (lines: ScenarioLine[]) => void;
	onUncommit?: () => void;
	disabled?: boolean; // override-capable; ignored if status forces disable
}

const STATUS_BADGE: Record<
	LegislativeMeta["status"],
	{ colour: string; abbr: string }
> = {
	available: {
		colour: "bg-blue-50 text-blue-800 border-blue-200",
		abbr: "Available",
	},
	devolved: {
		colour: "bg-amber-50 text-amber-800 border-amber-200",
		abbr: "Partly devolved",
	},
	"new-legislation": {
		colour: "bg-red-50 text-red-800 border-red-200",
		abbr: "New legislation",
	},
	"statutorily-protected": {
		colour: "bg-purple-50 text-purple-800 border-purple-200",
		abbr: "Statute",
	},
};

export function ChoiceCard({
	title,
	subtitle,
	context,
	legislation,
	lines,
	committed,
	committedOverridden,
	onPreview,
	onClearPreview,
	onCommit,
	onOverride,
	onUncommit,
	disabled,
}: Props) {
	const [showExplainer, setShowExplainer] = useState(false);
	const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const isHardDisabled =
		disabled ||
		legislation.status === "new-legislation" ||
		legislation.status === "statutorily-protected";

	const badge = STATUS_BADGE[legislation.status];

	useEffect(() => {
		return () => {
			if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
		};
	}, []);

	const cancelPendingPreview = () => {
		if (previewTimerRef.current) {
			clearTimeout(previewTimerRef.current);
			previewTimerRef.current = null;
		}
	};

	const handleMouseEnter = () => {
		// Hard-disabled cards don't auto-expand on hover — that was noisy
		// when scanning the grid. Click to expand instead (handleClick).
		// They also don't fire scenario preview (the lines aren't valid
		// to commit anyway).
		if (isHardDisabled) return;
		if (committed) return;
		cancelPendingPreview();
		previewTimerRef.current = setTimeout(() => {
			previewTimerRef.current = null;
			onPreview(lines);
		}, PREVIEW_HOVER_DELAY_MS);
	};

	const handleMouseLeave = () => {
		// Don't collapse the explainer on mouse-leave — once the user
		// clicks to expand a disabled card they probably want it open
		// while they read. Click again to collapse (handleClick toggles).
		cancelPendingPreview();
		if (!committed) onClearPreview();
	};

	const handleClick = () => {
		if (isHardDisabled) {
			setShowExplainer((s) => !s);
			return;
		}
		if (committed && onUncommit) {
			onUncommit();
			return;
		}
		onCommit(lines);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			className={cn(
				"w-full text-left rounded-lg border p-3 transition-all",
				"flex flex-col gap-2",
				committed && committedOverridden
					? "bg-red-50 border-red-300 ring-1 ring-red-400"
					: committed
						? "bg-blue-50 border-blue-300 ring-1 ring-blue-300"
						: isHardDisabled
							? "bg-muted/30 border-muted opacity-70 cursor-help"
							: "bg-card hover:bg-accent/40 hover:border-foreground/20 cursor-pointer",
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold leading-snug">{title}</div>
					{subtitle && (
						<div className="text-xs text-muted-foreground tabular-nums mt-0.5">
							{subtitle}
						</div>
					)}
				</div>
				<span
					className={cn(
						"text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap",
						badge.colour,
					)}
				>
					{badge.abbr}
				</span>
			</div>

			{context && (
				<div className="text-xs text-muted-foreground leading-snug">
					{context}
				</div>
			)}

			{showExplainer && (
				<div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground leading-snug border-t mt-1">
					<div className="font-medium text-foreground/80 mb-1">
						Why this is constrained
					</div>
					{legislation.explainer}
					{legislation.source && (
						<a
							href={legislation.source.url}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="block mt-1 text-blue-600 hover:underline"
						>
							{legislation.source.label} →
						</a>
					)}
					{legislation.relaxation && (
						<div className="mt-1.5 pt-1.5 border-t border-muted-foreground/20">
							<span className="text-foreground/70 font-medium">
								Override hypothetical:
							</span>{" "}
							{legislation.relaxation.implementationMonths > 0 &&
								legislation.relaxation.implementationMonths < 999 &&
								`~${legislation.relaxation.implementationMonths}mo to implement; `}
							<span className="italic">{legislation.relaxation.risk}</span>
							{onOverride && lines.length > 0 && legislation.relaxation.implementationMonths < 999 && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onOverride(lines);
									}}
									className="block mt-2 px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
								>
									🔓 Force this through
								</button>
							)}
							{(!onOverride || lines.length === 0 || legislation.relaxation.implementationMonths >= 999) && (
								<span className="block text-[10px] mt-1 text-foreground/50">
									{lines.length === 0
										? "(New legislation — override not yet supported)"
										: legislation.relaxation.implementationMonths >= 999
											? "(Override impossible — instrument doesn't exist or default is sovereign-debt crisis)"
											: ""}
								</span>
							)}
						</div>
					)}
				</div>
			)}

			{committed && (
				<div className={cn(
					"text-[10px] font-medium uppercase tracking-wider",
					committedOverridden ? "text-red-700" : "text-blue-700",
				)}>
					{committedOverridden ? "🔓 Overridden · " : "✓ Committed · "}
					click to remove
				</div>
			)}
		</button>
	);
}

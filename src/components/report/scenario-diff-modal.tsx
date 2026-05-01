"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	type ScenarioDiff,
	type ScenarioLine,
	evaluateLine,
} from "@/lib/scenario";

// Modal shown when the user loads a budget over an existing non-empty
// scenario. Renders a compact diff (added / modified / removed / unchanged)
// and offers Replace / Cancel buttons.
//
// Modal kept lightweight and dependency-free — uses portal-less position-
// fixed to avoid pulling Radix Dialog when MethodologyPopover already covers
// the heavy popover use case.

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	budgetName: string;
	diff: ScenarioDiff;
	onConfirm: () => void;
}

export function ScenarioDiffModal({
	open,
	onOpenChange,
	budgetName,
	diff,
	onConfirm,
}: Props) {
	// Close on Escape.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	if (!open) return null;

	const totalChanges =
		diff.added.length + diff.removed.length + diff.modified.length;

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="diff-title"
		>
			<button
				type="button"
				className="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default"
				onClick={() => onOpenChange(false)}
				aria-label="Close diff"
			/>

			<div className="relative bg-background border rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
				<div className="px-5 py-4 border-b">
					<h2 id="diff-title" className="font-semibold text-lg">
						Replace your scenario with {budgetName}?
					</h2>
					<p className="text-sm text-muted-foreground mt-0.5">
						{totalChanges === 0
							? "Your current scenario already matches this budget."
							: `${totalChanges} change${totalChanges === 1 ? "" : "s"} to your scenario.`}
					</p>
				</div>

				<div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
					{diff.added.length > 0 && (
						<DiffSection
							heading="Added"
							colour="text-blue-700"
							sign="+"
						>
							{diff.added.map((line) => (
								<LinePreview key={line.id} line={line} />
							))}
						</DiffSection>
					)}
					{diff.modified.length > 0 && (
						<DiffSection
							heading="Modified"
							colour="text-amber-700"
							sign="~"
						>
							{diff.modified.map(({ from, to }) => (
								<ModifiedPreview
									key={`${from.type}:${from.leverId}`}
									from={from}
									to={to}
								/>
							))}
						</DiffSection>
					)}
					{diff.removed.length > 0 && (
						<DiffSection
							heading="Removed"
							colour="text-red-700"
							sign="−"
						>
							{diff.removed.map((line) => (
								<LinePreview key={line.id} line={line} />
							))}
						</DiffSection>
					)}
					{diff.unchanged.length > 0 && (
						<DiffSection
							heading="Unchanged"
							colour="text-muted-foreground"
							sign="="
						>
							{diff.unchanged.map((line) => (
								<LinePreview key={line.id} line={line} faded />
							))}
						</DiffSection>
					)}
				</div>

				<div className="px-5 py-3 border-t flex justify-end gap-2 bg-muted/30">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button size="sm" onClick={onConfirm}>
						Replace scenario
					</Button>
				</div>
			</div>
		</div>
	);
}

function DiffSection({
	heading,
	colour,
	sign,
	children,
}: {
	heading: string;
	colour: string;
	sign: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<h3
				className={cn(
					"text-xs font-semibold uppercase tracking-wider mb-1.5",
					colour,
				)}
			>
				{sign} {heading}
			</h3>
			<ul className="space-y-1">{children}</ul>
		</div>
	);
}

function LinePreview({
	line,
	faded = false,
}: { line: ScenarioLine; faded?: boolean }) {
	const ev = evaluateLine(line);
	return (
		<li
			className={cn(
				"text-xs flex items-baseline justify-between gap-3 py-1 px-2 rounded bg-muted/30",
				faded && "opacity-60",
			)}
		>
			<span className="flex items-baseline gap-2 min-w-0">
				<span aria-hidden="true">
					{line.type === "tax" ? "💰" : line.type === "programme" ? "✂️" : "🏦"}
				</span>
				<span className="truncate">{ev.description}</span>
			</span>
			<span className="text-muted-foreground tabular-nums shrink-0">
				{ev.deltaGbp >= 0 ? "+" : "−"}£
				{Math.abs(ev.deltaGbp) >= 1_000_000_000
					? `${(Math.abs(ev.deltaGbp) / 1_000_000_000).toFixed(1)}bn`
					: `${Math.round(Math.abs(ev.deltaGbp) / 1_000_000)}m`}
			</span>
		</li>
	);
}

function ModifiedPreview({
	from,
	to,
}: {
	from: ScenarioLine;
	to: ScenarioLine;
}) {
	const fromEv = evaluateLine(from);
	const toEv = evaluateLine(to);
	const delta = toEv.deltaGbp - fromEv.deltaGbp;
	return (
		<li className="text-xs py-1 px-2 rounded bg-muted/30 space-y-0.5">
			<div className="flex items-baseline justify-between gap-3">
				<span className="flex items-baseline gap-2 min-w-0">
					<span aria-hidden="true">
						{from.type === "tax"
							? "💰"
							: from.type === "programme"
								? "✂️"
								: "🏦"}
					</span>
					<span className="truncate">{toEv.description}</span>
				</span>
				<span className="text-amber-700 tabular-nums shrink-0">
					{delta >= 0 ? "+" : "−"}£
					{Math.abs(delta) >= 1_000_000_000
						? `${(Math.abs(delta) / 1_000_000_000).toFixed(1)}bn`
						: `${Math.round(Math.abs(delta) / 1_000_000)}m`}
				</span>
			</div>
			<div className="text-[10px] text-muted-foreground pl-6">
				was: {fromEv.description}
			</div>
		</li>
	);
}

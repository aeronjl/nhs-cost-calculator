"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	type EditorMode,
	SIMULATOR_OWNED_PARAMS,
	buildUrl,
} from "@/lib/url-write";

// Tab control for switching between the three editor modes. The active mode
// is stored in `?editor=`; switching tabs writes that param without altering
// the scenario lines. Each editor (TradeOffEngine / ScenarioBuilder /
// CounterfactualPanel) reads its own state from the URL on mount, so tab
// switches feel like view changes without losing user work.
//
// Callers render the tab control above the editor body and supply the body
// itself via `children` (typically a switch on `currentMode`).

interface Props {
	currentMode: EditorMode;
	children: ReactNode;
}

interface ModeOption {
	value: EditorMode;
	label: string;
	hint: string;
}

const MODES: readonly ModeOption[] = [
	{
		value: "triptych",
		label: "Trade-off",
		hint: "Three sliders sum to a target",
	},
	{
		value: "stack",
		label: "Stack",
		hint: "Free-form list of any levers",
	},
	{
		value: "single",
		label: "Vary one",
		hint: "Move one lever, see effects",
	},
];

export function EditorTabs({ currentMode, children }: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const setMode = useCallback(
		(mode: EditorMode) => {
			if (mode === currentMode) return;
			const url = buildUrl(
				new URLSearchParams(searchParams.toString()),
				SIMULATOR_OWNED_PARAMS,
				{
					// Preserve the scenario across switches by reading it from the
					// current URL.
					scenario: searchParams.get("scenario") ?? undefined,
					editor: mode === "stack" ? undefined : mode,
					g: searchParams.get("g") ?? undefined,
					gq: searchParams.get("gq") ?? undefined,
					ga: searchParams.get("ga") ?? undefined,
				},
			);
			router.push(url, { scroll: false });
		},
		[currentMode, router, searchParams],
	);

	return (
		<div className="space-y-4">
			<div
				role="tablist"
				aria-label="Editor mode"
				className="inline-flex rounded-lg bg-muted p-1 gap-1 w-full sm:w-auto"
			>
				{MODES.map((m) => (
					<button
						key={m.value}
						type="button"
						role="tab"
						aria-selected={currentMode === m.value}
						onClick={() => setMode(m.value)}
						title={m.hint}
						className={cn(
							"flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
							currentMode === m.value
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{m.label}
					</button>
				))}
			</div>
			<div>{children}</div>
		</div>
	);
}

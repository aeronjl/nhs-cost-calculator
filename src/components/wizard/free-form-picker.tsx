"use client";

import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { type ScenarioLine } from "@/lib/scenario";
import { wizardLineId } from "@/lib/wizard-state";
import { cn } from "@/lib/utils";
import { LeverRail, type PickerLever } from "./lever-rail";

// Free-form lever picker for the wizard's per-step pages. Sits beneath the
// curated <ChoiceCard>s and lets users skip the guided cards entirely if
// they want to pick a lever the cards don't surface (e.g. a smaller pp
// move, a non-headline programme, a custom borrow size). Click-to-add uses
// a sensible default magnitude per unit kind; users refine via the result-
// step <RefineScenarioPanel> if they want to retune precisely.
//
// Collapsed by default so the curated path remains the primary affordance —
// expand reveals the categorised <LeverRail> filtered to the step's kind(s).

const DEFAULT_TAX_MAGNITUDE_BY_UNIT: Record<string, number> = {
	pp: 1,
	yr: 2,
	k: 1,
	bn: 5,
	"p-per-litre": 1,
};

const defaultMagnitudeFor = (lever: PickerLever): number => {
	if (lever.type === "borrow") return 20_000_000_000;
	if (lever.type === "programme") return -5; // sensible default: 5% cut
	const tax = TAX_LEVERS.find((l) => l.id === lever.id);
	if (!tax) return 1;
	return DEFAULT_TAX_MAGNITUDE_BY_UNIT[tax.unit] ?? 1;
};

export const pickerLeverToScenarioLine = (
	lever: PickerLever,
): ScenarioLine => ({
	id: wizardLineId(),
	type: lever.type,
	leverId: lever.id,
	magnitude: defaultMagnitudeFor(lever),
});

interface Props {
	kinds: readonly ("tax" | "programme" | "borrow")[];
	label: string;
	helpText?: string;
	searchPlaceholder?: string;
	onAdd: (line: ScenarioLine) => void;
	defaultOpen?: boolean;
}

export function FreeFormPicker({
	kinds,
	label,
	helpText,
	searchPlaceholder,
	onAdd,
	defaultOpen = false,
}: Props) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section className="rounded-md border bg-background/70">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
			>
				<div className="flex items-center gap-2 text-sm font-medium text-foreground">
					<Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
					{label}
				</div>
				<ChevronDown
					aria-hidden="true"
					className={cn(
						"size-4 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>
			{open && (
				<div className="border-t">
					{helpText && (
						<p className="px-3 pt-2 text-[11px] leading-snug text-muted-foreground">
							{helpText}
						</p>
					)}
					<div className="max-h-[420px] overflow-hidden">
						<LeverRail
							kinds={kinds}
							searchPlaceholder={searchPlaceholder}
							onAdd={(lever) => onAdd(pickerLeverToScenarioLine(lever))}
						/>
					</div>
				</div>
			)}
		</section>
	);
}

"use client";

import { ArrowLeft, ChevronDown, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { type ScenarioLine } from "@/lib/scenario";
import { wizardLineId } from "@/lib/wizard-state";
import { cn } from "@/lib/utils";
import { LeverRail, type PickerLever } from "./lever-rail";

// Free-form lever picker for the wizard's per-step pages. Sits beneath the
// curated <ChoiceCard>s and lets users skip the guided cards entirely if
// they want to pick a lever the cards don't surface (e.g. a smaller pp
// move, a non-headline programme, a custom borrow size).
//
// Click in the picker selects a lever and reveals an inline magnitude
// editor — slider with a sensible range + step per unit kind, plus
// Add / Cancel. Commit pushes a ScenarioLine via onAdd; cancel returns
// to the picker. Curated cards remain the default affordance; the picker
// is collapsed by default.

const DEFAULT_TAX_MAGNITUDE_BY_UNIT: Record<string, number> = {
	pp: 1,
	yr: 2,
	k: 1,
	bn: 5,
	"p-per-litre": 1,
};

interface MagnitudeRange {
	min: number;
	max: number;
	step: number;
	suffix: string;
	display: (n: number) => string;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const TAX_RANGE_BY_UNIT: Record<string, MagnitudeRange> = {
	pp: {
		min: -5,
		max: 5,
		step: 0.25,
		suffix: "pp",
		display: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}pp`,
	},
	yr: {
		min: 1,
		max: 10,
		step: 1,
		suffix: "yr",
		display: (n) =>
			`${Math.round(n)} year${Math.round(n) === 1 ? "" : "s"}`,
	},
	k: {
		min: -10,
		max: 10,
		step: 0.5,
		suffix: "£k",
		display: (n) => `${n >= 0 ? "+" : ""}£${n.toFixed(1)}k`,
	},
	bn: {
		min: -50,
		max: 50,
		step: 1,
		suffix: "£bn",
		display: (n) => `${n >= 0 ? "+" : ""}£${n.toFixed(0)}bn`,
	},
	"p-per-litre": {
		min: -10,
		max: 10,
		step: 0.5,
		suffix: "p/litre",
		display: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}p/litre`,
	},
};

const PROGRAMME_RANGE: MagnitudeRange = {
	min: -25,
	max: 25,
	step: 1,
	suffix: "%",
	display: (n) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`,
};

const BORROW_RANGE: MagnitudeRange = {
	min: -100_000_000_000,
	max: 100_000_000_000,
	step: 5_000_000_000,
	suffix: "£",
	display: (n) => formatBn(n),
};

const rangeFor = (lever: PickerLever): MagnitudeRange => {
	if (lever.type === "borrow") return BORROW_RANGE;
	if (lever.type === "programme") return PROGRAMME_RANGE;
	const tax = TAX_LEVERS.find((l) => l.id === lever.id);
	if (!tax) return TAX_RANGE_BY_UNIT.pp!;
	return TAX_RANGE_BY_UNIT[tax.unit] ?? TAX_RANGE_BY_UNIT.pp!;
};

const defaultMagnitudeFor = (lever: PickerLever): number => {
	if (lever.type === "borrow") return 20_000_000_000;
	if (lever.type === "programme") return -5;
	const tax = TAX_LEVERS.find((l) => l.id === lever.id);
	if (!tax) return 1;
	return DEFAULT_TAX_MAGNITUDE_BY_UNIT[tax.unit] ?? 1;
};

export const pickerLeverToScenarioLine = (
	lever: PickerLever,
	magnitude: number = defaultMagnitudeFor(lever),
): ScenarioLine => ({
	id: wizardLineId(),
	type: lever.type,
	leverId: lever.id,
	magnitude,
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
	const [selected, setSelected] = useState<PickerLever | null>(null);
	const [magnitude, setMagnitude] = useState<number>(0);

	const handlePick = (lever: PickerLever) => {
		setSelected(lever);
		setMagnitude(defaultMagnitudeFor(lever));
	};

	const handleCommit = () => {
		if (!selected) return;
		onAdd(pickerLeverToScenarioLine(selected, magnitude));
		setSelected(null);
	};

	const handleCancel = () => setSelected(null);

	return (
		<section className="rounded-md border bg-background/70">
			<button
				type="button"
				onClick={() => {
					setOpen((o) => !o);
					if (open) setSelected(null);
				}}
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
					{selected ? (
						<MagnitudeEditor
							lever={selected}
							magnitude={magnitude}
							onChange={setMagnitude}
							onCommit={handleCommit}
							onCancel={handleCancel}
						/>
					) : (
						<>
							{helpText && (
								<p className="px-3 pt-2 text-[11px] leading-snug text-muted-foreground">
									{helpText}
								</p>
							)}
							<div className="max-h-[420px] overflow-hidden">
								<LeverRail
									kinds={kinds}
									searchPlaceholder={searchPlaceholder}
									onAdd={handlePick}
								/>
							</div>
						</>
					)}
				</div>
			)}
		</section>
	);
}

function MagnitudeEditor({
	lever,
	magnitude,
	onChange,
	onCommit,
	onCancel,
}: {
	lever: PickerLever;
	magnitude: number;
	onChange: (n: number) => void;
	onCommit: () => void;
	onCancel: () => void;
}) {
	const range = rangeFor(lever);
	const value = Math.max(range.min, Math.min(range.max, magnitude));
	return (
		<div className="space-y-3 px-3 py-3">
			<div className="flex items-baseline justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-foreground">
						{lever.label}
					</div>
					{lever.sublabel && (
						<div className="truncate text-[11px] text-muted-foreground">
							{lever.sublabel}
						</div>
					)}
				</div>
				<button
					type="button"
					onClick={onCancel}
					className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
					aria-label="Back to lever picker"
				>
					<ArrowLeft aria-hidden="true" className="size-3" />
					Pick another
				</button>
			</div>
			<div className="space-y-1.5">
				<div className="flex items-baseline justify-between text-[11px] tabular-nums">
					<span className="text-muted-foreground">Magnitude</span>
					<span className="font-semibold text-foreground">
						{range.display(value)}
					</span>
				</div>
				<input
					type="range"
					min={range.min}
					max={range.max}
					step={range.step}
					value={value}
					onChange={(e) => onChange(Number(e.target.value))}
					aria-label={`Magnitude for ${lever.label}`}
					className="w-full accent-blue-600"
				/>
				<div className="flex justify-between text-[10px] tabular-nums text-muted-foreground">
					<span>{range.display(range.min)}</span>
					<span>{range.display(range.max)}</span>
				</div>
			</div>
			<Button
				type="button"
				size="sm"
				onClick={onCommit}
				className="w-full"
			>
				<Plus aria-hidden="true" className="mr-1.5 size-3.5" />
				Add to scenario
			</Button>
		</div>
	);
}

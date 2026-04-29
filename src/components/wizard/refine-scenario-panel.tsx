"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
	LeverRail,
	type PickerLever,
} from "@/components/simulator/lever-rail";
import { getTaxLever } from "@/data/levers/tax-rates";
import { type ScenarioLine, evaluateScenario } from "@/lib/scenario";

// Per-line magnitude unit metadata. The Refine panel's inline editor
// uses this to render the right input step + suffix label, and to
// translate the stored magnitude into a user-facing display value.
//
// `kind` is a structural discriminator — pattern-match on it when a
// caller needs unit-specific behaviour beyond the divisor + suffix
// (e.g. country-aware bound presets, lever-specific validation, etc.).
// `displayDivisor` is the per-unit conversion factor from stored
// magnitude to user-facing value:
//   displayValue   = magnitude / displayDivisor
//   storedValue    = inputValue * displayDivisor
//
// Today only the `rawPounds` kind (borrow) uses a non-identity divisor:
// its magnitude is stored as raw £ but the user edits in £bn (1e9). All
// other kinds (percent / pp / yr / k / bn / p-per-litre) store and
// display the same number. A future raw-£ lever sets kind: "rawPounds"
// and the divisor follows.
//
// Bounds calibrated against UK fiscal-policy norms. Other-country
// support would need country-keyed bound presets (parallel to
// PLAUSIBILITY_BOUNDS_BY_COUNTRY in src/data/sources/ons-psf-historical.ts);
// since the wizard is UK-active, the current bounds suffice.
type LineUnitKind =
	| "rawPounds"
	| "percent"
	| "pp"
	| "yr"
	| "k"
	| "bn"
	| "p-per-litre"
	| "unknown";

interface LineUnit {
	kind: LineUnitKind;
	step: number;
	min?: number;
	max?: number;
	suffix: string;
	displayDivisor: number;
}

const getLineUnit = (line: ScenarioLine): LineUnit => {
	// Bounds calibrated to typical UK fiscal-policy ranges. Loose enough
	// to allow educational extremes (e.g. +20pp basic IT for "what if")
	// but tight enough to reject fat-finger entries (+999pp, etc.) that
	// would produce nonsense yields.
	if (line.type === "borrow") {
		return {
			kind: "rawPounds",
			step: 1,
			suffix: "£bn",
			displayDivisor: 1_000_000_000,
			min: -200, // £200bn debt repayment
			max: 200, // £200bn additional borrowing
		};
	}
	if (line.type === "programme") {
		return {
			kind: "percent",
			step: 1,
			suffix: "%",
			displayDivisor: 1,
			min: -100, // -100% = abolish (extreme but not nonsense)
			max: 100, // +100% = double the programme
		};
	}
	const lever = getTaxLever(line.leverId);
	if (lever.unit === "pp") {
		// Income tax / VAT / NICs / corp tax. -10 covers a 10pp cut from
		// any current rate; +20 covers a +20pp rise (additional rate could
		// hit 65% from 45%, hypothetical but bounded).
		return {
			kind: "pp",
			step: 0.5,
			suffix: "pp",
			displayDivisor: 1,
			min: -10,
			max: 20,
		};
	}
	if (lever.unit === "yr") {
		return {
			kind: "yr",
			step: 1,
			suffix: " yr",
			displayDivisor: 1,
			min: -5,
			max: 10,
		};
	}
	if (lever.unit === "k") {
		// Threshold raise/lower in £k. ±£50k captures realistic moves.
		return {
			kind: "k",
			step: 1,
			suffix: "£k",
			displayDivisor: 1,
			min: -50,
			max: 50,
		};
	}
	if (lever.unit === "bn") {
		// Direct £bn lever (asset taxes, sundry measures, hypotheticals).
		// ±£100bn captures even an LVT-scale revenue raiser.
		return {
			kind: "bn",
			step: 1,
			suffix: "£bn",
			displayDivisor: 1,
			min: -100,
			max: 100,
		};
	}
	if (lever.unit === "p-per-litre") {
		return {
			kind: "p-per-litre",
			step: 1,
			suffix: "p/L",
			displayDivisor: 1,
			min: -50,
			max: 50,
		};
	}
	return { kind: "unknown", step: 1, suffix: "", displayDivisor: 1 };
};

const clamp = (value: number, min?: number, max?: number): number => {
	let result = value;
	if (min !== undefined && result < min) result = min;
	if (max !== undefined && result > max) result = max;
	return result;
};

const MAGNITUDE_DEBOUNCE_MS = 250;

interface MagnitudeInputProps {
	value: number; // raw magnitude (already × displayDivisor)
	unit: LineUnit;
	ariaLabel: string;
	onCommit: (rawMagnitude: number) => void;
}

// Inline magnitude editor for a single scenario line. Uses local draft
// state for typing responsiveness and debounces commits to wizard
// state, plus flushes on blur (so a user editing then clicking elsewhere
// doesn't lose the edit). Clamps to per-unit bounds at commit time.
//
// External re-sync only fires when the input is unfocused — while the
// user is editing, their draft is the source of truth and parent state
// updates don't fight their keystrokes. After blur, parent state wins
// (so a budget load or a remove+re-add naturally re-syncs).
function MagnitudeInput({
	value,
	unit,
	ariaLabel,
	onCommit,
}: MagnitudeInputProps) {
	const initialDisplay = value / unit.displayDivisor;
	const [draft, setDraft] = useState<string>(String(initialDisplay));
	const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isFocused = useRef(false);
	// De-dupe consecutive commits with identical values — onBlur and the
	// debounced flush can both fire for the same value (idempotent but
	// redundant rerenders downstream).
	const lastCommittedRaw = useRef<number>(value);

	// External re-sync: parent state changed (budget load, programmatic
	// update). If the user isn't currently editing this input, mirror
	// their draft to the new external value.
	useEffect(() => {
		if (isFocused.current) return;
		setDraft(String(value / unit.displayDivisor));
		lastCommittedRaw.current = value;
	}, [value, unit.displayDivisor]);

	useEffect(() => {
		return () => {
			if (flushTimer.current) clearTimeout(flushTimer.current);
		};
	}, []);

	const flush = (nextDisplay: number) => {
		const clamped = clamp(nextDisplay, unit.min, unit.max);
		const rawMagnitude = clamped * unit.displayDivisor;
		// Skip if identical to the most recent commit. Idempotent
		// downstream but saves a state update + render cycle.
		if (rawMagnitude === lastCommittedRaw.current) return;
		lastCommittedRaw.current = rawMagnitude;
		onCommit(rawMagnitude);
	};

	const scheduleFlush = (nextDisplay: number) => {
		if (flushTimer.current) clearTimeout(flushTimer.current);
		flushTimer.current = setTimeout(() => {
			flush(nextDisplay);
		}, MAGNITUDE_DEBOUNCE_MS);
	};

	return (
		<input
			type="number"
			value={draft}
			step={unit.step}
			min={unit.min}
			max={unit.max}
			onFocus={() => {
				isFocused.current = true;
			}}
			onChange={(e) => {
				setDraft(e.target.value);
				const next = Number(e.target.value);
				if (Number.isFinite(next)) scheduleFlush(next);
			}}
			onBlur={() => {
				isFocused.current = false;
				if (flushTimer.current) {
					clearTimeout(flushTimer.current);
					flushTimer.current = null;
				}
				const next = Number(draft);
				if (Number.isFinite(next)) flush(next);
				else setDraft(String(value / unit.displayDivisor));
			}}
			aria-label={ariaLabel}
			className="w-16 text-right tabular-nums border rounded-sm px-1 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-300"
		/>
	);
}

// Refine panel rendered on the wizard's Result step. Two halves:
//
//   1. Lever picker — the full simulator lever rail (25+ taxes, 10
//      programmes, borrowing) so the user can add levers the wizard's
//      curated cards didn't surface (dividend allowance, fuel duty,
//      bank surcharge, etc.).
//   2. Current basket — committed scenario lines with remove buttons.
//
// Collapsed by default; opening reveals both halves stacked. Adding or
// removing a line re-renders the analytics report below — no navigation.

let nextLocalId = 1;
const newLocalId = () => `wzr${nextLocalId++}`;

const defaultLineForLever = (lever: PickerLever): ScenarioLine => {
	if (lever.type === "borrow") {
		return {
			id: newLocalId(),
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
		};
	}
	if (lever.type === "programme") {
		return {
			id: newLocalId(),
			type: "programme",
			leverId: lever.id,
			magnitude: -5,
		};
	}
	return {
		id: newLocalId(),
		type: "tax",
		leverId: lever.id,
		magnitude: 1,
	};
};

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

interface Props {
	committedScenario: readonly ScenarioLine[];
	onAdd: (line: ScenarioLine) => void;
	onRemove: (id: string) => void;
	onUpdateMagnitude: (id: string, magnitude: number) => void;
}

export function RefineScenarioPanel({
	committedScenario,
	onAdd,
	onRemove,
	onUpdateMagnitude,
}: Props) {
	const [open, setOpen] = useState(false);

	const editableCount = committedScenario.length;

	return (
		<section className="rounded-md border bg-background/40 overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className={cn(
					"w-full flex items-center justify-between gap-2 px-3 py-2",
					"text-left hover:bg-accent/40 transition-colors",
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold text-foreground leading-tight">
						Refine scenario
					</div>
					<div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
						Full lever catalog · {editableCount}{" "}
						{editableCount === 1 ? "line" : "lines"} editable
					</div>
				</div>
				<motion.span
					aria-hidden="true"
					className="text-muted-foreground text-sm shrink-0"
					animate={{ rotate: open ? 90 : 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
				>
					▸
				</motion.span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="body"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
							opacity: { duration: 0.18, delay: 0.04 },
						}}
						className="overflow-hidden"
					>
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-3 px-3 pb-3 pt-1">
							{/* Lever picker (left on desktop) */}
							{/* Lever picker height grows with the viewport — comfy
							    on tablets / desktop (up to 60vh, ~480px on an
							    800px window), still usable on small phones
							    (min ~5 lever cards visible). */}
							<div className="rounded-md border bg-background overflow-hidden min-h-[280px] lg:min-h-[360px] max-h-[60vh]">
								<LeverRail onAdd={(l) => onAdd(defaultLineForLever(l))} />
							</div>
							{/* Current basket (right on desktop) */}
							{/* Current basket — same height envelope so the two
							    halves stay visually aligned on desktop. */}
							<div className="rounded-md border bg-background p-3 space-y-2 min-h-[280px] lg:min-h-[360px] max-h-[60vh] overflow-y-auto">
								<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
									Your scenario
								</div>
								{committedScenario.length === 0 ? (
									<p className="text-[11px] text-muted-foreground italic">
										No editable lines yet. The implicit goal action (e.g.
										NHS expansion for fund-NHS) is included in the report
										but is not editable here.
									</p>
								) : (
									<ul className="space-y-2">
										{committedScenario.map((line) => {
											const ev = evaluateScenario([line]);
											const lineDelta = ev.net;
											const evLine = ev.lines[0];
											const unit = getLineUnit(line);
											return (
												<li
													key={line.id}
													className="flex items-center gap-1.5 text-[11px]"
												>
													<span className="truncate flex-1 min-w-0">
														{evLine?.description ?? line.leverId}
													</span>
													<span className="flex items-center gap-0.5 shrink-0">
														<MagnitudeInput
															value={line.magnitude}
															unit={unit}
															ariaLabel={`Magnitude for ${evLine?.description ?? line.leverId}`}
															onCommit={(rawMagnitude) =>
																onUpdateMagnitude(line.id, rawMagnitude)
															}
														/>
														<span className="text-[9px] text-muted-foreground tabular-nums w-7">
															{unit.suffix}
														</span>
													</span>
													<span
														className={cn(
															"tabular-nums shrink-0 w-14 text-right",
															lineDelta > 0
																? "text-blue-700"
																: lineDelta < 0
																	? "text-amber-700"
																	: "",
														)}
													>
														{lineDelta >= 0 ? "+" : "−"}
														{formatBn(Math.abs(lineDelta))}
													</span>
													<button
														type="button"
														onClick={() => onRemove(line.id)}
														aria-label={`Remove ${evLine?.description ?? line.leverId}`}
														className="text-muted-foreground hover:text-foreground text-xs leading-none px-1 shrink-0"
													>
														×
													</button>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { ScenarioDiffModal } from "@/components/report/scenario-diff-modal";
import {
	LeverRail,
	type PickerLever,
} from "./lever-rail";
import { BORROWING_STRATEGIES } from "@/data/levers/borrowing";
import { TAX_LEVERS, getTaxLever } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import {
	BORROWING_DURATION_OPTIONS,
	BORROWING_FISCAL_EVENT_OPTIONS,
	BORROWING_MONETARY_BACKSTOP_OPTIONS,
	isBorrowingContextEmpty,
	type BorrowingScenarioContext,
} from "@/lib/borrowing-context";
import {
	type LineEvaluation,
	type ScenarioDiff,
	type ScenarioLine,
	deserializeScenario,
	diffScenarios,
	evaluateScenario,
	serializeScenario,
} from "@/lib/scenario";
import {
	type SavedScenario,
	deleteSavedScenario,
	listSavedScenarios,
	saveScenario,
} from "@/lib/saved-scenarios";
import { cn } from "@/lib/utils";

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
	if (line.type === "borrow") {
		return {
			kind: "rawPounds",
			step: 1,
			suffix: "£bn",
			displayDivisor: 1_000_000_000,
			min: -200,
			max: 200,
		};
	}
	if (line.type === "programme") {
		return {
			kind: "percent",
			step: 1,
			suffix: "%",
			displayDivisor: 1,
			min: -100,
			max: 100,
		};
	}
	const lever = getTaxLever(line.leverId);
	if (lever.unit === "pp") {
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
			suffix: "yr",
			displayDivisor: 1,
			min: -5,
			max: 10,
		};
	}
	if (lever.unit === "k") {
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

const UNIT_INPUT: Record<
	"pp" | "yr" | "k" | "bn" | "p-per-litre",
	{
		defaultMag: number;
	}
> = {
	pp: { defaultMag: 1 },
	yr: { defaultMag: 1 },
	k: { defaultMag: 1 },
	bn: { defaultMag: 1 },
	"p-per-litre": { defaultMag: 1 },
};

const clamp = (value: number, min?: number, max?: number): number => {
	let result = value;
	if (min !== undefined && result < min) result = min;
	if (max !== undefined && result > max) result = max;
	return result;
};

const MAGNITUDE_DEBOUNCE_MS = 250;

interface MagnitudeInputProps {
	value: number;
	unit: LineUnit;
	ariaLabel: string;
	onCommit: (rawMagnitude: number) => void;
}

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
	const lastCommittedRaw = useRef<number>(value);

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
			className="w-20 text-right tabular-nums border rounded-sm px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
		/>
	);
}

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

const defaultLineForType = (type: ScenarioLine["type"]): ScenarioLine => {
	if (type === "borrow") {
		return defaultLineForLever({ type: "borrow", id: "borrow", label: "Borrow" });
	}
	if (type === "programme") {
		return defaultLineForLever({
			type: "programme",
			id: "defence",
			label: "Defence",
		});
	}
	return defaultLineForLever({
		type: "tax",
		id: "basic-rate-income-tax",
		label: "Basic-rate income tax",
	});
};

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const defaultScenarioName = (
	result: ReturnType<typeof evaluateScenario>,
): string => {
	const lines = result.lines.length;
	if (result.net > 0) {
		return `Net £${(result.net / 1_000_000_000).toFixed(1)}bn freed (${lines} line${lines === 1 ? "" : "s"})`;
	}
	if (result.net < 0) {
		return `Net £${(Math.abs(result.net) / 1_000_000_000).toFixed(1)}bn shortfall (${lines} line${lines === 1 ? "" : "s"})`;
	}
	return `Balanced (${lines} line${lines === 1 ? "" : "s"})`;
};

interface PendingSavedLoad {
	saved: SavedScenario;
	diff: ScenarioDiff;
}

export interface RefineScenarioPanelProps {
	committedScenario: readonly ScenarioLine[];
	onAdd: (line: ScenarioLine) => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, patch: Partial<ScenarioLine>) => void;
	onReplace: (lines: ScenarioLine[]) => void;
}

export function RefineScenarioPanel({
	committedScenario,
	onAdd,
	onRemove,
	onUpdate,
	onReplace,
}: RefineScenarioPanelProps) {
	const [open, setOpen] = useState(committedScenario.length === 0);
	const [saved, setSaved] = useState<SavedScenario[]>([]);
	const [pendingLoad, setPendingLoad] = useState<PendingSavedLoad | null>(null);

	useEffect(() => {
		setSaved(listSavedScenarios());
	}, []);

	const result = useMemo(
		() => evaluateScenario([...committedScenario]),
		[committedScenario],
	);
	const editableCount = committedScenario.length;
	const lineCounts = useMemo(
		() => ({
			tax: committedScenario.filter((line) => line.type === "tax").length,
			spending: committedScenario.filter((line) => line.type === "programme")
				.length,
			borrowing: committedScenario.filter((line) => line.type === "borrow")
				.length,
		}),
		[committedScenario],
	);
	const serializedScenario = useMemo(
		() => serializeScenario([...committedScenario]),
		[committedScenario],
	);

	const handleSave = () => {
		if (!serializedScenario) return;
		const name = window.prompt("Name this scenario:", defaultScenarioName(result));
		if (name === null) return;
		saveScenario(name, serializedScenario);
		setSaved(listSavedScenarios());
	};

	const loadSaved = (entry: SavedScenario) => {
		const incoming = deserializeScenario(entry.scenario);
		if (committedScenario.length === 0) {
			onReplace(incoming);
			return;
		}
		setPendingLoad({
			saved: entry,
			diff: diffScenarios([...committedScenario], incoming),
		});
	};

	const deleteSaved = (id: string) => {
		deleteSavedScenario(id);
		setSaved(listSavedScenarios());
	};

	return (
		<section className="rounded-lg border bg-background shadow-sm overflow-hidden">
			<div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					className="min-w-0 flex items-start gap-2 text-left"
				>
					<motion.span
						aria-hidden="true"
						className="text-muted-foreground text-sm shrink-0 mt-0.5"
						animate={{ rotate: open ? 90 : 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
					>
						▸
					</motion.span>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-semibold leading-tight">
								Report inputs
							</h2>
							<span
								className={cn(
									"rounded-full border px-2 py-0.5 text-[10px] tabular-nums",
									result.net > 0
										? "border-blue-200 bg-blue-50 text-blue-700"
										: result.net < 0
											? "border-amber-200 bg-amber-50 text-amber-800"
											: "border-input bg-muted/40 text-muted-foreground",
								)}
							>
								{result.net > 0 ? "+" : result.net < 0 ? "-" : ""}
								{formatBn(Math.abs(result.net))}
							</span>
						</div>
						<div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
							<span>{editableCount} editable</span>
							<span aria-hidden="true">·</span>
							<span>{lineCounts.tax} tax</span>
							<span aria-hidden="true">·</span>
							<span>{lineCounts.spending} spending</span>
							<span aria-hidden="true">·</span>
							<span>{lineCounts.borrowing} borrowing</span>
						</div>
					</div>
				</button>
				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onAdd(defaultLineForType("tax"))}
					>
						+ Tax
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onAdd(defaultLineForType("programme"))}
					>
						+ Spending
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onAdd(defaultLineForType("borrow"))}
					>
						+ Borrow
					</Button>
					<Button
						type="button"
						variant="default"
						size="sm"
						disabled={!serializedScenario}
						onClick={handleSave}
					>
						Save
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setOpen((value) => !value)}
					>
						{open ? "Close" : "Edit"}
					</Button>
				</div>
			</div>

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
						<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]">
							<div className="min-w-0 border-b xl:border-b-0 xl:border-r">
								<div className="p-4 space-y-3">
									<div className="flex items-center justify-between gap-2">
										<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Current package
										</h3>
										<div className="flex items-center gap-2">
											<span className="text-[10px] text-muted-foreground">
												{saved.length} saved
											</span>
											{editableCount > 0 && (
												<button
													type="button"
													onClick={() => onReplace([])}
													className="text-[10px] text-muted-foreground hover:text-foreground"
												>
													Clear
												</button>
											)}
										</div>
									</div>
									{result.lines.length === 0 ? (
										<p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
											No editable lines yet.
										</p>
									) : (
										<ul className="space-y-2">
											{result.lines.map((evaluation) => (
												<LineRow
													key={evaluation.line.id}
													evaluation={evaluation}
													onUpdate={(patch) =>
														onUpdate(evaluation.line.id, patch)
													}
													onRemove={() => onRemove(evaluation.line.id)}
												/>
											))}
										</ul>
									)}

									<div className="border-t pt-3 space-y-2">
										<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Saved scenarios
										</h3>
										{saved.length === 0 ? (
											<p className="text-xs text-muted-foreground">
												No saved scenarios on this device.
											</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{saved.map((entry) => (
													<div
														key={entry.id}
														className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-muted/20 px-2 py-1 text-xs"
													>
														<button
															type="button"
															onClick={() => loadSaved(entry)}
															className="truncate max-w-[240px] hover:underline"
															title={entry.name}
														>
															{entry.name}
														</button>
														{committedScenario.length > 0 && (
															<button
																type="button"
																onClick={() =>
																	setPendingLoad({
																		saved: entry,
																		diff: diffScenarios(
																			[...committedScenario],
																			deserializeScenario(entry.scenario),
																		),
																	})
																}
																aria-label={`Compare ${entry.name} with current`}
																className="text-muted-foreground hover:text-foreground rounded leading-none px-1"
															>
																⇄
															</button>
														)}
														<button
															type="button"
															onClick={() => deleteSaved(entry.id)}
															aria-label={`Delete ${entry.name}`}
															className="text-muted-foreground hover:text-foreground rounded leading-none px-1"
														>
															×
														</button>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							</div>

							<div className="min-h-[320px] max-h-[64vh] overflow-hidden">
								<div className="border-b bg-muted/20 px-3 py-2">
									<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
										Add a lever
									</h3>
								</div>
								<div className="h-[calc(64vh-37px)] min-h-[280px]">
									<LeverRail
										onAdd={(lever) => onAdd(defaultLineForLever(lever))}
									/>
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			<ScenarioDiffModal
				open={pendingLoad !== null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setPendingLoad(null);
				}}
				budgetName={pendingLoad?.saved.name ?? ""}
				diff={
					pendingLoad?.diff ?? {
						removed: [],
						added: [],
						modified: [],
						unchanged: [],
					}
				}
				onConfirm={() => {
					if (!pendingLoad) return;
					onReplace(deserializeScenario(pendingLoad.saved.scenario));
					setPendingLoad(null);
				}}
			/>
		</section>
	);
}

function LineRow({
	evaluation,
	onUpdate,
	onRemove,
}: {
	evaluation: LineEvaluation;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
	onRemove: () => void;
}) {
	const { line, deltaGbp, methodology } = evaluation;
	const unit = getLineUnit(line);
	const lineType =
		line.type === "tax" ? "Tax" : line.type === "programme" ? "Spending" : "Borrowing";
	const isFreed = deltaGbp > 0;

	let cuttableWarning: string | null = null;
	if (line.type === "programme" && line.magnitude < 0) {
		const prog = UK_SPENDING_PROGRAMMES.find((p) => p.id === line.leverId);
		const cuttable = prog?.cuttableFraction;
		const cutFrac = Math.abs(line.magnitude / 100);
		if (
			prog &&
			cuttable !== undefined &&
			cuttable < 1 &&
			cutFrac > cuttable
		) {
			cuttableWarning = `Exceeds ${(cuttable * 100).toFixed(0)}% realistic cut`;
		}
	}

	return (
		<li
			className={cn(
				"rounded-md border bg-card p-2.5 space-y-2",
				cuttableWarning && "border-amber-400 bg-amber-50",
			)}
		>
			<div className="grid grid-cols-1 lg:grid-cols-[74px_minmax(0,1fr)_auto] gap-2 lg:items-center">
				<span className="inline-flex w-fit rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
					{lineType}
				</span>
				<div className="min-w-0">
					{line.type === "programme" && (
						<ProgrammeLineControls line={line} onUpdate={onUpdate} />
					)}
					{line.type === "tax" && (
						<TaxLineControls line={line} onUpdate={onUpdate} />
					)}
					{line.type === "borrow" && (
						<BorrowLineControls line={line} onUpdate={onUpdate} />
					)}
				</div>
				<div className="flex items-center justify-end gap-2">
					<span
						className={cn(
							"text-xs tabular-nums font-medium min-w-20 text-right",
							isFreed ? "text-blue-700" : "text-amber-700",
						)}
					>
						{isFreed ? "+" : "-"}
						{formatBn(Math.abs(deltaGbp))}
					</span>
					<MethodologyPopover methodology={methodology} />
					<button
						type="button"
						onClick={onRemove}
						aria-label="Remove line"
						className="text-muted-foreground hover:text-foreground rounded px-1 text-lg leading-none"
					>
						×
					</button>
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<MagnitudeInput
					value={line.magnitude}
					unit={unit}
					ariaLabel={`Magnitude for ${evaluation.description}`}
					onCommit={(rawMagnitude) => onUpdate({ magnitude: rawMagnitude })}
				/>
				<span className="text-[10px] text-muted-foreground tabular-nums">
					{unit.suffix}
				</span>
				<span className="text-[10px] text-muted-foreground truncate">
					{evaluation.description}
				</span>
			</div>
			{cuttableWarning && (
				<p className="text-[11px] text-amber-800">{cuttableWarning}</p>
			)}
		</li>
	);
}

function ProgrammeLineControls({
	line,
	onUpdate,
}: {
	line: ScenarioLine;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
}) {
	return (
		<select
			value={line.leverId}
			onChange={(e) => onUpdate({ leverId: e.target.value })}
			className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
			aria-label="Spending programme"
		>
			{UK_SPENDING_PROGRAMMES.map((programme) => (
				<option key={programme.id} value={programme.id}>
					{programme.name}
				</option>
			))}
		</select>
	);
}

function TaxLineControls({
	line,
	onUpdate,
}: {
	line: ScenarioLine;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
}) {
	const lever = TAX_LEVERS.find((l) => l.id === line.leverId);
	return (
		<select
			value={line.leverId}
			onChange={(e) => {
				const next = TAX_LEVERS.find((l) => l.id === e.target.value);
				const switching = lever && next && lever.unit !== next.unit;
				onUpdate({
					leverId: e.target.value,
					...(switching && next
						? { magnitude: UNIT_INPUT[next.unit].defaultMag }
						: {}),
				});
			}}
			className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
			aria-label="Tax lever"
		>
			{TAX_LEVERS.map((tax) => (
				<option key={tax.id} value={tax.id}>
					{tax.name}
				</option>
			))}
		</select>
	);
}

function BorrowLineControls({
	line,
	onUpdate,
}: {
	line: ScenarioLine;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
}) {
	const updateContext = (patch: Partial<BorrowingScenarioContext>) => {
		const next = { ...line.borrowingContext, ...patch };
		onUpdate({
			borrowingContext: isBorrowingContextEmpty(next) ? undefined : next,
		});
	};

	return (
		<div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
			<select
				value={line.borrowingStrategyId ?? "dmo-remit"}
				onChange={(e) =>
					onUpdate({
						borrowingStrategyId: e.target
							.value as ScenarioLine["borrowingStrategyId"],
						borrowingPortfolio: undefined,
					})
				}
				className="rounded border border-input bg-background px-2 py-1 text-xs"
				aria-label="Borrowing financing strategy"
			>
				{BORROWING_STRATEGIES.map((strategy) => (
					<option key={strategy.id} value={strategy.id}>
						{strategy.label}
					</option>
				))}
			</select>
			<select
				value={line.borrowingContext?.fiscalEvent ?? ""}
				onChange={(e) =>
					updateContext({
						fiscalEvent:
							(e.target.value as BorrowingScenarioContext["fiscalEvent"]) ||
							undefined,
					})
				}
				className="rounded border border-input bg-background px-2 py-1 text-xs"
				aria-label="Borrowing fiscal event context"
			>
				<option value="">Event inferred</option>
				{BORROWING_FISCAL_EVENT_OPTIONS.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
			<select
				value={line.borrowingContext?.duration ?? ""}
				onChange={(e) =>
					updateContext({
						duration:
							(e.target.value as BorrowingScenarioContext["duration"]) ||
							undefined,
					})
				}
				className="rounded border border-input bg-background px-2 py-1 text-xs"
				aria-label="Borrowing duration context"
			>
				<option value="">Duration inferred</option>
				{BORROWING_DURATION_OPTIONS.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
			<select
				value={line.borrowingContext?.monetaryBackstop ?? ""}
				onChange={(e) =>
					updateContext({
						monetaryBackstop:
							(e.target.value as BorrowingScenarioContext["monetaryBackstop"]) ||
							undefined,
					})
				}
				className="rounded border border-input bg-background px-2 py-1 text-xs sm:col-span-3"
				aria-label="Borrowing monetary backstop context"
			>
				<option value="">Backstop inferred</option>
				{BORROWING_MONETARY_BACKSTOP_OPTIONS.map((option) => (
					<option key={option.id} value={option.id}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	);
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ComparisonsAffordedList } from "@/components/ui/comparisons-afforded-list";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { cn } from "@/lib/utils";
import type { ResolvedComparison } from "@/data/comparisons";
import { BORROWING_STRATEGIES } from "@/data/levers/borrowing";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import { comparisonsCovered } from "@/lib/counterfactual";
import {
	BORROWING_DURATION_OPTIONS,
	BORROWING_FISCAL_EVENT_OPTIONS,
	BORROWING_MONETARY_BACKSTOP_OPTIONS,
	isBorrowingContextEmpty,
	type BorrowingScenarioContext,
} from "@/lib/borrowing-context";
import {
	type LineEvaluation,
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
import { SCENARIO_PARAMS, buildUrl } from "@/lib/url-write";
import { ScenarioDiffModal } from "@/components/simulator/scenario-diff-modal";

interface Props {
	comparisons: readonly ResolvedComparison[];
	usdPerGbp: number;
	initialScenario: string;
}

let nextLocalId = 1;
const newLocalId = () => `cl${nextLocalId++}`;

export default function ScenarioBuilder({
	comparisons,
	usdPerGbp,
	initialScenario,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [lines, setLines] = useState<ScenarioLine[]>(() => {
		const initial = deserializeScenario(initialScenario);
		return initial.length > 0
			? initial
			: [
					{
						id: newLocalId(),
						type: "tax",
						leverId: "basic-rate-income-tax",
						magnitude: 1,
					},
					{
						id: newLocalId(),
						type: "programme",
						leverId: "international-aid",
						magnitude: -25,
					},
				];
	});

	const result = evaluateScenario(lines);
	const items = comparisonsCovered(result.net, comparisons, usdPerGbp, 4);

	// Saved scenarios (localStorage). Loaded post-mount to avoid SSR mismatch.
	const [saved, setSaved] = useState<SavedScenario[]>([]);
	useEffect(() => {
		setSaved(listSavedScenarios());
	}, []);

	// External URL changes (e.g. clicking "Replay a budget" elsewhere on the
	// page) should flow into the scenario builder's state. Avoids feedback
	// loops by only re-deriving when the URL's scenario differs from the
	// serialized form of our current lines.
	useEffect(() => {
		const incoming = searchParams.get("scenario") ?? "";
		if (incoming !== serializeScenario(lines)) {
			setLines(deserializeScenario(incoming));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchParams]);

	const handleSave = () => {
		const serialized = serializeScenario(lines);
		if (!serialized) return;
		const defaultName =
			result.net > 0
				? `Net £${(result.net / 1_000_000_000).toFixed(1)}bn freed (${lines.length} line${lines.length === 1 ? "" : "s"})`
				: result.net < 0
					? `Net £${(Math.abs(result.net) / 1_000_000_000).toFixed(1)}bn shortfall (${lines.length} line${lines.length === 1 ? "" : "s"})`
					: `Balanced (${lines.length} lines)`;
		const name = window.prompt("Name this scenario:", defaultName);
		if (name === null) return;
		saveScenario(name, serialized);
		setSaved(listSavedScenarios());
	};

	const handleLoad = (s: SavedScenario) => {
		setLines(deserializeScenario(s.scenario));
	};

	const handleDelete = (id: string) => {
		deleteSavedScenario(id);
		setSaved(listSavedScenarios());
	};

	const [compareTarget, setCompareTarget] = useState<SavedScenario | null>(
		null,
	);
	const compareDiff = compareTarget
		? diffScenarios(lines, deserializeScenario(compareTarget.scenario))
		: null;

	// Mirror state to URL.
	useEffect(() => {
		const handle = setTimeout(() => {
			const serialized = serializeScenario(lines);
			const url = buildUrl(
				new URLSearchParams(window.location.search),
				SCENARIO_PARAMS,
				{ scenario: serialized || undefined },
			);
			router.replace(url, { scroll: false });
		}, 250);
		return () => clearTimeout(handle);
	}, [lines, router]);

	const updateLine = (id: string, patch: Partial<ScenarioLine>) => {
		setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
	};

	const removeLine = (id: string) => {
		setLines((ls) => ls.filter((l) => l.id !== id));
	};

	const addLine = (type: ScenarioLine["type"]) => {
		const defaults: Record<ScenarioLine["type"], ScenarioLine> = {
			programme: {
				id: newLocalId(),
				type: "programme",
				leverId: "defence",
				magnitude: -5,
			},
			tax: {
				id: newLocalId(),
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
			borrow: {
				id: newLocalId(),
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		};
		setLines((ls) => [...ls, defaults[type]]);
	};

	return (
		<Card id="scenario-builder" className="mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl sm:text-3xl font-light text-center">
					Build a fiscal scenario
					<br />
					<span className="text-base text-muted-foreground font-normal">
						Stack lever changes; see the net effect.
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Lines */}
				<div className="space-y-2">
					{result.lines.map((evaluation) => (
						<LineRow
							key={evaluation.line.id}
							evaluation={evaluation}
							onUpdate={(patch) => updateLine(evaluation.line.id, patch)}
							onRemove={() => removeLine(evaluation.line.id)}
						/>
					))}
					{lines.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-4">
							Empty scenario. Add a line below.
						</p>
					)}
				</div>

				{/* Add buttons + Save */}
				<div className="flex flex-wrap gap-2 justify-center pt-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addLine("tax")}
					>
						+ Tax change
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addLine("programme")}
					>
						+ Spending change
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addLine("borrow")}
					>
						+ Borrow / repay
					</Button>
					{lines.length > 0 && (
						<Button
							type="button"
							variant="default"
							size="sm"
							onClick={handleSave}
						>
							Save scenario
						</Button>
					)}
				</div>

				{/* Saved scenarios */}
				{saved.length > 0 && (
					<div className="rounded-md border bg-muted/30 p-3">
						<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
							Saved scenarios
						</div>
						<div className="flex flex-wrap gap-2">
							{saved.map((s) => (
								<div
									key={s.id}
									className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs"
								>
									<button
										type="button"
										onClick={() => handleLoad(s)}
										className="hover:underline truncate max-w-[260px]"
										title={s.name}
									>
										{s.name}
									</button>
									{lines.length > 0 && (
										<button
											type="button"
											onClick={() => setCompareTarget(s)}
											aria-label={`Compare ${s.name} with current`}
											title="Compare with current scenario"
											className="text-muted-foreground hover:text-foreground rounded leading-none px-1"
										>
											⇄
										</button>
									)}
									<button
										type="button"
										onClick={() => handleDelete(s.id)}
										aria-label={`Delete ${s.name}`}
										className="text-muted-foreground hover:text-foreground rounded leading-none"
									>
										×
									</button>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Net summary */}
				<div className="rounded-lg bg-blue-50 px-4 py-3 text-sm space-y-1.5">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Revenue freed</span>
						<span className="tabular-nums font-medium text-blue-700">
							£<AnimatedNumber value={Math.round(result.freed)} />
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Revenue required</span>
						<span className="tabular-nums font-medium text-amber-700">
							£<AnimatedNumber value={Math.round(result.required)} />
						</span>
					</div>
					<div className="flex justify-between text-base pt-1.5 border-t border-blue-200">
						<span className="font-semibold">Net effect</span>
						<span
							className={cn(
								"tabular-nums font-semibold",
								result.net > 0
									? "text-blue-700"
									: result.net < 0
										? "text-amber-700"
										: "",
							)}
						>
							£<AnimatedNumber value={Math.abs(Math.round(result.net))} />{" "}
							{result.net > 0 ? "freed" : result.net < 0 ? "shortfall" : "balanced"}
						</span>
					</div>
				</div>

				<ComparisonsAffordedList
					items={items}
					caption={
						result.net > 0
							? "Net surplus is enough to fund any one of:"
							: "Net shortfall is the cost of any one of:"
					}
					emptyMessage={null}
				/>

				<p className="text-xs text-muted-foreground text-center pt-2 border-t">
					Each line is modelled through the scenario engine. Tax levers use
					marginal-rate behavioural response; programme cuttability constraints
					are flagged in each methodology popover; borrowing is financing plus
					debt-service over time.
				</p>
			</CardContent>
			<ScenarioDiffModal
				open={compareTarget !== null}
				onOpenChange={(o) => {
					if (!o) setCompareTarget(null);
				}}
				budgetName={compareTarget?.name ?? ""}
				diff={
					compareDiff ?? {
						removed: [],
						added: [],
						modified: [],
						unchanged: [],
					}
				}
				onConfirm={() => {
					if (compareTarget) {
						setLines(deserializeScenario(compareTarget.scenario));
						setCompareTarget(null);
					}
				}}
			/>
		</Card>
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
	const isFreed = deltaGbp > 0;

	// Cuttability warning: a programme line cutting more than the
	// programme's "cuttable fraction" gets an inline amber warning.
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
		<div
			className={cn(
				"rounded-md border bg-card p-3",
				cuttableWarning && "border-amber-400 bg-amber-50",
			)}
		>
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-lg" aria-hidden="true">
					{line.type === "tax"
						? "💰"
						: line.type === "programme"
							? "✂️"
							: "🏦"}
				</span>
				{line.type === "programme" && (
					<ProgrammeLineControls line={line} onUpdate={onUpdate} />
				)}
				{line.type === "tax" && <TaxLineControls line={line} onUpdate={onUpdate} />}
				{line.type === "borrow" && (
					<BorrowLineControls line={line} onUpdate={onUpdate} />
				)}
				<div className="ml-auto flex items-center gap-2">
					<span
						className={cn(
							"text-sm tabular-nums font-medium",
							isFreed ? "text-blue-700" : "text-amber-700",
						)}
					>
						{isFreed ? "+" : "−"}£
						{Math.abs(Math.round(deltaGbp)).toLocaleString()}
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
			{cuttableWarning && (
				<p className="mt-1.5 text-xs text-amber-800">
					⚠ {cuttableWarning} — see methodology for political/legal floors.
				</p>
			)}
		</div>
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
		<>
			<select
				value={line.leverId}
				onChange={(e) => onUpdate({ leverId: e.target.value })}
				className="rounded border border-input bg-background px-2 py-1 text-sm"
			>
				{UK_SPENDING_PROGRAMMES.map((p) => (
					<option key={p.id} value={p.id}>
						{p.name}
					</option>
				))}
			</select>
			<span className="text-xs text-muted-foreground">by</span>
			<Input
				type="number"
				inputMode="numeric"
				value={line.magnitude}
				onChange={(e) =>
					onUpdate({ magnitude: Number(e.target.value) || 0 })
				}
				step={0.5}
				min={-50}
				max={50}
				className="w-20 text-sm"
				aria-label="Percentage change"
			/>
			<span className="text-xs text-muted-foreground">%</span>
		</>
	);
}

// Unit-aware input config so the same component can edit any tax-lever unit.
const UNIT_INPUT: Record<
	"pp" | "yr" | "k" | "bn" | "p-per-litre",
	{ verb: string; suffix: string; step: number; min: number; max: number; defaultMag: number }
> = {
	pp: { verb: "by", suffix: "pp", step: 0.1, min: -5, max: 5, defaultMag: 1 },
	yr: { verb: "for", suffix: "yr", step: 1, min: -10, max: 10, defaultMag: 1 },
	k: { verb: "by £", suffix: "k", step: 0.5, min: -10, max: 10, defaultMag: 1 },
	bn: { verb: "of £", suffix: "bn", step: 0.5, min: -50, max: 50, defaultMag: 1 },
	"p-per-litre": { verb: "by", suffix: "p/L", step: 0.5, min: -10, max: 10, defaultMag: 1 },
};

function TaxLineControls({
	line,
	onUpdate,
}: {
	line: ScenarioLine;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
}) {
	const lever = TAX_LEVERS.find((l) => l.id === line.leverId);
	const cfg = UNIT_INPUT[
		(lever?.unit ?? "pp") as "pp" | "yr" | "k" | "bn" | "p-per-litre"
	];
	return (
		<>
			<select
				value={line.leverId}
				onChange={(e) => {
					const next = TAX_LEVERS.find((l) => l.id === e.target.value);
					// When switching units, reset magnitude to the new unit's sensible default.
					const switching = lever && next && lever.unit !== next.unit;
					onUpdate({
						leverId: e.target.value,
						...(switching && next
							? { magnitude: UNIT_INPUT[next.unit].defaultMag }
							: {}),
					});
				}}
				className="rounded border border-input bg-background px-2 py-1 text-sm"
			>
				{TAX_LEVERS.map((l) => (
					<option key={l.id} value={l.id}>
						{l.name}
					</option>
				))}
			</select>
			<span className="text-xs text-muted-foreground">{cfg.verb}</span>
			<Input
				type="number"
				inputMode="numeric"
				value={line.magnitude}
				onChange={(e) =>
					onUpdate({ magnitude: Number(e.target.value) || 0 })
				}
				step={cfg.step}
				min={cfg.min}
				max={cfg.max}
				className="w-20 text-sm"
				aria-label={`${lever?.unitLabel ?? "magnitude"}`}
			/>
			<span className="text-xs text-muted-foreground">{cfg.suffix}</span>
		</>
	);
}

function BorrowLineControls({
	line,
	onUpdate,
}: {
	line: ScenarioLine;
	onUpdate: (patch: Partial<ScenarioLine>) => void;
}) {
	const billions = line.magnitude / 1_000_000_000;
	const updateContext = (patch: Partial<BorrowingScenarioContext>) => {
		const next = { ...line.borrowingContext, ...patch };
		onUpdate({
			borrowingContext: isBorrowingContextEmpty(next) ? undefined : next,
		});
	};
	return (
		<>
			<span className="text-sm font-medium">Borrow</span>
			<span className="text-xs text-muted-foreground">£</span>
			<Input
				type="number"
				inputMode="numeric"
				value={billions}
				onChange={(e) =>
					onUpdate({
						magnitude: (Number(e.target.value) || 0) * 1_000_000_000,
					})
				}
				step={1}
				className="w-20 text-sm"
				aria-label="Billions to borrow"
			/>
			<span className="text-xs text-muted-foreground">bn</span>
			<select
				value={line.borrowingStrategyId ?? "dmo-remit"}
				onChange={(e) =>
					onUpdate({
						borrowingStrategyId: e.target
							.value as ScenarioLine["borrowingStrategyId"],
					})
				}
				className="rounded border border-input bg-background px-2 py-1 text-sm"
				aria-label="Borrowing financing strategy"
			>
				{BORROWING_STRATEGIES.map((strategy) => (
					<option key={strategy.id} value={strategy.id}>
						{strategy.label}
					</option>
				))}
			</select>
			<div className="basis-full flex flex-wrap items-center gap-2 pl-7 pt-1">
				<span className="text-xs font-medium text-muted-foreground">
					Context
				</span>
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
					<option value="">Inferred event</option>
					{BORROWING_FISCAL_EVENT_OPTIONS.map((option) => (
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
					className="rounded border border-input bg-background px-2 py-1 text-xs"
					aria-label="Borrowing monetary backstop context"
				>
					<option value="">Backstop inferred</option>
					{BORROWING_MONETARY_BACKSTOP_OPTIONS.map((option) => (
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
			</div>
		</>
	);
}

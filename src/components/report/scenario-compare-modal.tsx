"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ANNOTATED_BUDGETS } from "@/data/budgets/annotated";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import {
	deserializeScenario,
	evaluateScenario,
	evaluateScenarioDistribution,
	projectScenarioOverYears,
	type ScenarioLine,
	type ScenarioResult,
	type YearProjection,
} from "@/lib/scenario";
import {
	listSavedScenarios,
	type SavedScenario,
} from "@/lib/saved-scenarios";
import {
	computeScenarioSignature,
	type ScenarioSignature,
} from "@/lib/scenario-signature";
import { cn } from "@/lib/utils";
import { ScenarioSignatureRadar } from "./scenario-signature";

// Side-by-side scenario diff modal. Pulls Scenario A from the user's
// active report and lets them pick Scenario B from saved scenarios or
// annotated UK budgets, then renders the headline, signature, year-1 /
// year-5 figures, decile incidence, and the top per-line differences in
// two columns. Designed for journalists or researchers who want to put
// "your scenario" next to "Hunt's Spring Statement 2024" in a single
// glance, with a hard delta column.

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scenarioA: readonly ScenarioLine[];
	labelA?: string;
	baseline: OBRBaseline;
}

interface Candidate {
	id: string;
	name: string;
	scenario: string;
	source: "saved" | "budget";
}

interface ScenarioReadout {
	lines: readonly ScenarioLine[];
	result: ScenarioResult;
	signature: ScenarioSignature | null;
	year1: YearProjection | undefined;
	year5: YearProjection | undefined;
	bottomDecile: number;
	topDecile: number;
}

const HOUSEHOLDS_PER_DECILE = 2_800_000;

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatPerHousehold = (totalForDecile: number): string => {
	const perHh = totalForDecile / HOUSEHOLDS_PER_DECILE;
	const abs = Math.abs(perHh);
	const sign = perHh > 0 ? "−" : perHh < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(1)}k`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}`;
	if (abs >= 1) return `${sign}£${abs.toFixed(1)}`;
	return "£0";
};

const buildCandidates = (saved: readonly SavedScenario[]): Candidate[] => {
	const annotated: Candidate[] = ANNOTATED_BUDGETS.filter(
		(b) => !b.placeholder && b.scenario,
	).map((b) => ({
		id: `budget:${b.id}`,
		name: b.name,
		scenario: b.scenario,
		source: "budget",
	}));
	const userSaved: Candidate[] = saved
		.filter((s) => s.scenario)
		.map((s) => ({
			id: `saved:${s.id}`,
			name: s.name,
			scenario: s.scenario,
			source: "saved",
		}));
	return [...userSaved, ...annotated];
};

const buildReadout = (
	lines: readonly ScenarioLine[],
	baseline: OBRBaseline,
): ScenarioReadout => {
	const result = evaluateScenario(lines as ScenarioLine[]);
	const projection =
		lines.length > 0
			? projectScenarioOverYears(result, baseline.years.length)
			: [];
	const distribution = evaluateScenarioDistribution(result);
	const signature = computeScenarioSignature({
		result,
		distribution,
		year1: projection[0],
		year5: projection[projection.length - 1],
	});
	return {
		lines,
		result,
		signature,
		year1: projection[0],
		year5: projection[projection.length - 1],
		bottomDecile: distribution.perDecile[0] ?? 0,
		topDecile: distribution.perDecile[9] ?? 0,
	};
};

const valueToneClassName = (n: number): string =>
	n > 0
		? "text-blue-700"
		: n < 0
			? "text-amber-700"
			: "text-muted-foreground";

const burdenToneClassName = (n: number): string =>
	n > 0
		? "text-amber-700"
		: n < 0
			? "text-blue-700"
			: "text-muted-foreground";

interface LineDelta {
	id: string;
	description: string;
	a: number;
	b: number;
	delta: number;
}

const buildLineDeltas = (
	a: ScenarioReadout,
	b: ScenarioReadout,
): LineDelta[] => {
	const aById = new Map(a.result.lines.map((ev) => [ev.line.id, ev]));
	const bById = new Map(b.result.lines.map((ev) => [ev.line.id, ev]));
	const ids = new Set<string>([...aById.keys(), ...bById.keys()]);
	const rows: LineDelta[] = [];
	for (const id of ids) {
		const aLine = aById.get(id);
		const bLine = bById.get(id);
		const aValue = aLine?.deltaGbp ?? 0;
		const bValue = bLine?.deltaGbp ?? 0;
		const delta = bValue - aValue;
		if (Math.abs(delta) < 100_000_000) continue;
		rows.push({
			id,
			description:
				aLine?.description ?? bLine?.description ?? id,
			a: aValue,
			b: bValue,
			delta,
		});
	}
	rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
	return rows.slice(0, 6);
};

export function ScenarioCompareModal({
	open,
	onOpenChange,
	scenarioA,
	labelA = "Your scenario",
	baseline,
}: Props) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	const [savedScenarios, setSavedScenarios] = useState<readonly SavedScenario[]>(
		[],
	);
	useEffect(() => {
		if (!open) return;
		setSavedScenarios(listSavedScenarios());
	}, [open]);

	const candidates = useMemo(
		() => buildCandidates(savedScenarios),
		[savedScenarios],
	);
	const [candidateId, setCandidateId] = useState<string>("");

	const a = useMemo(
		() => buildReadout(scenarioA, baseline),
		[scenarioA, baseline],
	);
	const b = useMemo(() => {
		if (!candidateId) return null;
		const candidate = candidates.find((c) => c.id === candidateId);
		if (!candidate) return null;
		const lines = deserializeScenario(candidate.scenario);
		if (lines.length === 0) return null;
		return { readout: buildReadout(lines, baseline), label: candidate.name };
	}, [candidateId, candidates, baseline]);

	const lineDeltas = b ? buildLineDeltas(a, b.readout) : [];

	const annotated = candidates.filter((c) => c.source === "budget");
	const userSaved = candidates.filter((c) => c.source === "saved");

	if (!open) return null;

	const netDelta = b ? b.readout.result.net - a.result.net : 0;
	const year5Delta =
		b && a.year5 && b.readout.year5
			? b.readout.year5.net - a.year5.net
			: 0;

	return (
		<div
			className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="compare-title"
		>
			<button
				type="button"
				className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-sm"
				onClick={() => onOpenChange(false)}
				aria-label="Close compare"
			/>

			<div className="relative my-8 flex w-full max-w-4xl flex-col rounded-lg border bg-background shadow-xl">
				<div className="flex items-start justify-between gap-3 border-b px-5 py-4">
					<div>
						<h2 id="compare-title" className="text-lg font-semibold">
							Side-by-side scenario comparison
						</h2>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Compare your active scenario with a saved scenario or an
							annotated UK budget.
						</p>
					</div>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="rounded-md p-1 text-muted-foreground hover:text-foreground"
						aria-label="Close"
					>
						<X aria-hidden="true" className="size-4" />
					</button>
				</div>

				<div className="space-y-4 px-5 py-4">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
						<label
							htmlFor="compare-modal-pick"
							className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
						>
							Compare with
						</label>
						<select
							id="compare-modal-pick"
							value={candidateId}
							onChange={(e) => setCandidateId(e.target.value)}
							className="flex-1 rounded-sm border bg-background px-2 py-1 text-sm"
						>
							<option value="">— pick a scenario —</option>
							{userSaved.length > 0 && (
								<optgroup label="Your saved scenarios">
									{userSaved.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
										</option>
									))}
								</optgroup>
							)}
							<optgroup label="Annotated UK budgets">
								{annotated.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</optgroup>
						</select>
					</div>

					{!b && (
						<div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
							Pick a scenario above to see the diff.
						</div>
					)}

					{b && (
						<div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
							<HeadlineCard
								label={labelA}
								net={a.result.net}
								year1Net={a.year1?.net ?? 0}
								year5Net={a.year5?.net ?? 0}
								lineCount={a.result.lines.length}
							/>
							<HeadlineCard
								label={b.label}
								net={b.readout.result.net}
								year1Net={b.readout.year1?.net ?? 0}
								year5Net={b.readout.year5?.net ?? 0}
								lineCount={b.readout.result.lines.length}
							/>
							<div className="rounded-md border bg-muted/20 p-3">
								<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									Δ vs A
								</div>
								<div
									className={cn(
										"mt-1 text-sm font-semibold tabular-nums",
										valueToneClassName(netDelta),
									)}
								>
									Net {formatBn(netDelta)}
								</div>
								<div
									className={cn(
										"mt-1 text-xs tabular-nums",
										valueToneClassName(year5Delta),
									)}
								>
									Y5 {formatBn(year5Delta)}
								</div>
							</div>

							{a.signature && (
								<div className="rounded-md border bg-background/70 p-2">
									<div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
										{labelA}
									</div>
									<ScenarioSignatureRadar signature={a.signature} />
								</div>
							)}
							{b.readout.signature && (
								<div className="rounded-md border bg-background/70 p-2">
									<div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
										{b.label}
									</div>
									<ScenarioSignatureRadar signature={b.readout.signature} />
								</div>
							)}
							<div className="rounded-md border bg-muted/20 p-3 text-[10px] text-muted-foreground">
								<div className="font-medium uppercase tracking-wider">
									Decile incidence
								</div>
								<dl className="mt-2 space-y-2">
									<DecileRow
										label="Bottom 10%"
										a={a.bottomDecile}
										b={b.readout.bottomDecile}
									/>
									<DecileRow
										label="Top 10%"
										a={a.topDecile}
										b={b.readout.topDecile}
									/>
								</dl>
							</div>
						</div>
					)}

					{b && lineDeltas.length > 0 && (
						<section className="rounded-md border bg-background/70 p-3">
							<div className="mb-2 flex items-baseline justify-between gap-2">
								<h3 className="text-xs font-semibold">
									Largest per-line differences
								</h3>
								<span className="text-[10px] text-muted-foreground">
									top {lineDeltas.length} by |Δ|
								</span>
							</div>
							<ul className="space-y-1.5 text-[11px]">
								{lineDeltas.map((row) => (
									<li
										key={row.id}
										className="grid grid-cols-[minmax(0,1fr)_88px_88px_88px] items-baseline gap-2"
									>
										<span className="truncate text-foreground">
											{row.description}
										</span>
										<span
											className={cn(
												"text-right tabular-nums",
												valueToneClassName(row.a),
											)}
										>
											{formatBn(row.a)}
										</span>
										<span
											className={cn(
												"text-right tabular-nums",
												valueToneClassName(row.b),
											)}
										>
											{formatBn(row.b)}
										</span>
										<span
											className={cn(
												"text-right font-medium tabular-nums",
												valueToneClassName(row.delta),
											)}
										>
											{formatBn(row.delta)}
										</span>
									</li>
								))}
								<li className="grid grid-cols-[minmax(0,1fr)_88px_88px_88px] gap-2 border-t pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
									<span />
									<span className="text-right">{labelA}</span>
									<span className="text-right">{b.label}</span>
									<span className="text-right">Δ</span>
								</li>
							</ul>
						</section>
					)}
				</div>
			</div>
		</div>
	);
}

function HeadlineCard({
	label,
	net,
	year1Net,
	year5Net,
	lineCount,
}: {
	label: string;
	net: number;
	year1Net: number;
	year5Net: number;
	lineCount: number;
}) {
	return (
		<div className="rounded-md border bg-background/70 p-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 text-2xl font-semibold tabular-nums",
					valueToneClassName(net),
				)}
			>
				£{Math.abs(Math.round(net)).toLocaleString()}
			</div>
			<div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
				Y1 {formatBn(year1Net)} · Y5 {formatBn(year5Net)}
			</div>
			<div className="mt-1 text-[10px] text-muted-foreground">
				{lineCount} line{lineCount === 1 ? "" : "s"}
			</div>
		</div>
	);
}

function DecileRow({
	label,
	a,
	b,
}: {
	label: string;
	a: number;
	b: number;
}) {
	const delta = b - a;
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_70px_70px_70px] gap-2 text-[10px]">
			<dt className="text-muted-foreground">{label}</dt>
			<dd
				className={cn(
					"text-right tabular-nums",
					burdenToneClassName(a),
				)}
			>
				{formatPerHousehold(a)}
			</dd>
			<dd
				className={cn(
					"text-right tabular-nums",
					burdenToneClassName(b),
				)}
			>
				{formatPerHousehold(b)}
			</dd>
			<dd
				className={cn(
					"text-right font-medium tabular-nums",
					burdenToneClassName(delta),
				)}
			>
				{formatPerHousehold(delta)}
			</dd>
		</div>
	);
}

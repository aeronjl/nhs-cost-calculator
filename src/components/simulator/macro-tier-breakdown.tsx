"use client";

import { cn } from "@/lib/utils";
import type {
	ScenarioDynamic,
	ScenarioMacro,
} from "@/lib/scenario";

// Layered tier display for the macro feedback section: ready-reckoner →
// dynamic → macro-adjusted (Scope A) → GE-adjusted (Scope C). Each tier
// shown only when it differs meaningfully from the previous one.
//
// Lives inside the "Macro feedback" report tab — surfaces the scoring
// layers that economists care about without overwhelming the summary view.

interface Props {
	staticNet: number;
	dynamic: ScenarioDynamic;
	dynamicGapSignificant: boolean;
	macro: ScenarioMacro;
	macroGapSignificant: boolean;
	macroYear1: number;
	geYear1: number;
	geGap: number;
	geGapSignificant: boolean;
}

const fmt = (n: number): string =>
	`£${Math.round(n).toLocaleString()}`;

const fmtSigned = (n: number): string =>
	`${n >= 0 ? "+" : "−"}£${Math.abs(Math.round(n)).toLocaleString()}`;

const fmtBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	if (abs >= 1_000_000_000) {
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	}
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const fmtSignedBn = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	return `${sign}${fmtBn(Math.abs(n))}`;
};

const valueToneClassName = (n: number): string =>
	n > 0 ? "text-blue-700" : n < 0 ? "text-amber-700" : "text-muted-foreground";

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? n.toFixed(4) : "0.0000"}%`;

export function MacroTierBreakdown({
	staticNet,
	dynamic,
	dynamicGapSignificant,
	macro,
	macroGapSignificant,
	macroYear1,
	geYear1,
	geGap,
	geGapSignificant,
}: Props) {
	const behaviouralDelta = dynamic.dynamicNet - staticNet;
	const macroDelta = macroYear1 - dynamic.dynamicNet;
	const geDelta = geYear1 - macroYear1;
	const totalModelDelta = geYear1 - staticNet;

	return (
		<div className="space-y-3">
			<div>
				<div className="text-xs font-medium">Macro scoring bridge</div>
				<p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
					How the headline moves from a static ready-reckoner estimate to the
					GE-adjusted year-1 result.
				</p>
			</div>

			<MacroBridgeChart
				staticNet={staticNet}
				dynamicNet={dynamic.dynamicNet}
				macroNet={macroYear1}
				geNet={geYear1}
			/>

			<div className="grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
				<BridgeMetric
					label="Behaviour"
					value={fmtSignedBn(behaviouralDelta)}
					tone={behaviouralDelta >= 0 ? "blue" : "amber"}
				/>
				<BridgeMetric
					label="Macro"
					value={fmtSignedBn(macroDelta)}
					tone={macroDelta >= 0 ? "blue" : "amber"}
				/>
				<BridgeMetric
					label="GE loop"
					value={fmtSignedBn(geDelta)}
					tone={geDelta >= 0 ? "blue" : "amber"}
				/>
				<BridgeMetric
					label="Total adjustment"
					value={fmtSignedBn(totalModelDelta)}
					tone={totalModelDelta >= 0 ? "blue" : "amber"}
				/>
			</div>

			<div className="text-[10px] text-muted-foreground leading-snug border-t pt-2">
				Each tier deepens the rigour: ready-reckoner is linear in the selected
				magnitude, dynamic applies marginal-rate behavioural response, macro
				adds first-round demand feedback (Scope A), GE closes the loop with
				CPI/gilt-yield knock-on (Scope C, single-pass).
				{dynamicGapSignificant && (
					<>
						{" "}
						Behavioural adjustment:{" "}
						<span className="tabular-nums">
							{fmtSigned(dynamic.dynamicNet - staticNet)}
						</span>
						.
					</>
				)}
				{Math.abs(dynamic.outputEffectGbp) > 1_000_000 && (
					<>
						{" "}
						Output effect:{" "}
						<span className="tabular-nums">
							{fmtSigned(dynamic.outputEffectGbp)}
						</span>
						.
					</>
				)}
				{Math.abs(dynamic.workerCevGbp) > 1_000_000 && (
					<>
						{" "}
						Worker CEV:{" "}
						<span className="tabular-nums">
							{fmtSigned(dynamic.workerCevGbp)}
						</span>
						.
					</>
				)}
				{macroGapSignificant && (
					<>
						{" "}
						Macro feedback:{" "}
						<span className="tabular-nums">
							{fmtSigned(macro.macroFeedbackGbp)}
						</span>
						.
					</>
				)}
				{geGapSignificant && (
					<>
						{" "}
						GE feedback:{" "}
						<span className="tabular-nums">{fmtSigned(geGap)}</span>.
					</>
				)}
			</div>
		</div>
	);
}

function MacroBridgeChart({
	staticNet,
	dynamicNet,
	macroNet,
	geNet,
}: {
	staticNet: number;
	dynamicNet: number;
	macroNet: number;
	geNet: number;
}) {
	const rows = [
		{
			id: "static",
			label: "Ready-reckoner",
			detail: "linear static score",
			from: 0,
			to: staticNet,
			value: staticNet,
			delta: staticNet,
			absolute: true,
		},
		{
			id: "dynamic",
			label: "Behavioural response",
			detail: "marginal-rate elasticities",
			from: staticNet,
			to: dynamicNet,
			value: dynamicNet,
			delta: dynamicNet - staticNet,
		},
		{
			id: "macro",
			label: "Scope B macro",
			detail: "GDP, CPI, rates, debt path",
			from: dynamicNet,
			to: macroNet,
			value: macroNet,
			delta: macroNet - dynamicNet,
		},
		{
			id: "ge",
			label: "Scope C GE",
			detail: "feedback into yields/costs",
			from: macroNet,
			to: geNet,
			value: geNet,
			delta: geNet - macroNet,
		},
	] as const;
	const values = rows.flatMap((row) => [row.from, row.to, 0]);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const pct = (value: number): number => ((value - min) / range) * 100;
	const zeroPct = pct(0);

	return (
		<div
			className="rounded-md border bg-background/60 p-3"
			aria-label="Macro scoring bridge from static estimate to GE-adjusted result"
		>
			<div className="space-y-2">
				{rows.map((row) => {
					const isAbsolute = row.id === "static";
					const left = pct(Math.min(row.from, row.to));
					const right = pct(Math.max(row.from, row.to));
					const width = Math.max(1, right - left);
					const deltaTone = isAbsolute
						? row.value >= 0
							? "bg-blue-500"
							: "bg-amber-500"
						: row.delta >= 0
							? "bg-blue-500"
							: "bg-amber-500";
					return (
						<div
							key={row.id}
							className="grid gap-1 sm:grid-cols-[130px_minmax(0,1fr)_98px] sm:items-center"
						>
							<div className="min-w-0">
								<div className="truncate text-[10px] font-medium text-foreground">
									{row.label}
								</div>
								<div className="truncate text-[9px] text-muted-foreground">
									{row.detail}
								</div>
							</div>
							<div className="relative h-7 rounded-sm bg-muted/30">
								<div
									className="absolute inset-y-0 border-l border-dashed border-foreground/40"
									style={{ left: formatStylePct(zeroPct) }}
									aria-hidden="true"
								/>
								<div
									className={cn(
										"absolute top-2 h-3 rounded-sm",
										deltaTone,
									)}
									style={{
										left: formatStylePct(left),
										width: formatStylePct(width),
										opacity: isAbsolute ? 0.35 : 0.75,
									}}
								>
									<span className="sr-only">
										{row.label}: {fmtBn(row.value)}
										{!isAbsolute && `, ${fmtSignedBn(row.delta)} change`}
									</span>
								</div>
								<div
									className="absolute top-1 h-5 w-px bg-foreground/50"
									style={{ left: formatStylePct(pct(row.to)) }}
									aria-hidden="true"
								/>
							</div>
							<div className="flex items-baseline justify-between gap-2 text-[10px] tabular-nums sm:block sm:text-right">
								<span className={cn("font-semibold", valueToneClassName(row.value))}>
									{fmtBn(row.value)}
								</span>
								{!isAbsolute && (
									<span
										className={cn(
											"sm:block",
											row.delta >= 0 ? "text-blue-700" : "text-amber-700",
										)}
									>
										{fmtSignedBn(row.delta)}
									</span>
								)}
							</div>
						</div>
					);
				})}
			</div>
			<div className="mt-2 flex justify-between text-[9px] tabular-nums text-muted-foreground">
				<span>{fmtBn(min)}</span>
				<span>£0</span>
				<span>{fmtBn(max)}</span>
			</div>
		</div>
	);
}

function BridgeMetric({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone: "blue" | "amber";
}) {
	return (
		<div className="rounded-sm border bg-background/60 p-2">
			<div className="text-[9px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 text-xs font-semibold tabular-nums",
					tone === "blue" ? "text-blue-700" : "text-amber-700",
				)}
			>
				{value}
			</div>
		</div>
	);
}

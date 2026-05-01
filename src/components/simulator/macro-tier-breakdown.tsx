"use client";

import { cn } from "@/lib/utils";
import { useAnimatedValues } from "@/lib/use-animated-values";
import type {
	ScenarioDynamic,
	ScenarioMacro,
	ScenarioTieredYear,
} from "@/lib/scenario";
import { useYearFocus } from "@/lib/year-focus";

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
	tiered?: readonly ScenarioTieredYear[];
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
	tiered,
}: Props) {
	const { year: focusedYear } = useYearFocus();
	const focusedIndex =
		focusedYear !== null && tiered && focusedYear >= 1 && focusedYear <= tiered.length
			? focusedYear - 1
			: null;
	const focusedTier = focusedIndex !== null && tiered ? tiered[focusedIndex] : null;
	const yearLabel = focusedTier ? `Y${focusedTier.year}` : "Y1";
	const isYearOne = !focusedTier || focusedTier.year === 1;

	const bridgeStatic = focusedTier?.staticNet ?? staticNet;
	const bridgeDynamic = focusedTier?.dynamicNet ?? dynamic.dynamicNet;
	const bridgeMacro = focusedTier?.macroNet ?? macroYear1;
	const bridgeGe = focusedTier?.geNet ?? geYear1;

	const behaviouralDelta = bridgeDynamic - bridgeStatic;
	const macroDelta = bridgeMacro - bridgeDynamic;
	const geDelta = bridgeGe - bridgeMacro;
	const totalModelDelta = bridgeGe - bridgeStatic;

	return (
		<div className="space-y-3">
			<div className="flex items-baseline justify-between gap-2">
				<div className="text-xs font-medium">Macro scoring bridge</div>
				<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
					{yearLabel}
					{!isYearOne && (
						<span className="ml-1 normal-case text-muted-foreground/80">
							· focus year
						</span>
					)}
				</div>
			</div>
			<div>
				<p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
					How the headline moves from a static ready-reckoner estimate to the
					GE-adjusted result for {yearLabel}
					{!isYearOne ? " (drag the year scrubber to change focus)" : ""}.
				</p>
			</div>

			<MacroBridgeChart
				staticNet={bridgeStatic}
				dynamicNet={bridgeDynamic}
				macroNet={bridgeMacro}
				geNet={bridgeGe}
			/>

			{tiered && tiered.length > 1 && (
				<MacroTierSparkline tiered={tiered} focusedIndex={focusedIndex} />
			)}

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
	const targetValues = [staticNet, dynamicNet, macroNet, geNet];
	const animatedStageValues = useAnimatedValues(targetValues);
	const stageValueAt = (i: number, fallback: number): number =>
		animatedStageValues[i] ?? fallback;
	const stages = [
		{
			id: "static",
			label: "Ready-reckoner",
			detail: "linear static score",
			targetValue: staticNet,
			value: stageValueAt(0, staticNet),
		},
		{
			id: "dynamic",
			label: "Behavioural response",
			detail: "marginal-rate elasticities",
			targetValue: dynamicNet,
			value: stageValueAt(1, dynamicNet),
		},
		{
			id: "macro",
			label: "Scope B macro",
			detail: "GDP, CPI, rates, debt",
			targetValue: macroNet,
			value: stageValueAt(2, macroNet),
		},
		{
			id: "ge",
			label: "Scope C GE",
			detail: "feedback loop",
			targetValue: geNet,
			value: stageValueAt(3, geNet),
		},
	] as const;

	const values = stages.flatMap((s) => [s.value, 0]);
	const minVal = Math.min(...values);
	const maxVal = Math.max(...values);
	const range = maxVal - minVal || 1;

	// SVG layout: stages distributed along the x-axis, value mapped to y.
	// Connectors between adjacent stages are filled regions whose top
	// edge follows the value path — readers see flow direction (down =
	// loss, up = gain) and magnitude (steepness × width) at a glance.
	const width = 320;
	const height = 110;
	const padX = 24;
	const padY = 18;
	const innerWidth = width - padX * 2;
	const innerHeight = height - padY * 2;
	const xAt = (idx: number): number =>
		padX + (innerWidth * idx) / (stages.length - 1);
	const yAt = (value: number): number =>
		padY + innerHeight - ((value - minVal) / range) * innerHeight;
	const zeroY = yAt(0);

	// Build a connector polygon between stage i and stage i+1: fills from
	// the value path down to the zero line, coloured by direction of the
	// transition (gain = blue, loss = amber).
	const connectors = stages.slice(0, -1).map((stage, i) => {
		const next = stages[i + 1]!;
		const xLeft = xAt(i);
		const xRight = xAt(i + 1);
		const yLeft = yAt(stage.value);
		const yRight = yAt(next.value);
		const points = `${xLeft},${yLeft} ${xRight},${yRight} ${xRight},${zeroY} ${xLeft},${zeroY}`;
		const delta = next.value - stage.value;
		const tone =
			Math.abs(delta) < 1
				? "neutral"
				: delta > 0
					? "blue"
					: "amber";
		return { id: `${stage.id}-${next.id}`, points, tone, delta };
	});

	return (
		<div
			className="rounded-md border bg-background/60 p-3"
			aria-label="Macro scoring bridge from static estimate to GE-adjusted result"
		>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="w-full h-28"
				role="img"
				aria-label="Macro scoring bridge flow"
				preserveAspectRatio="none"
			>
				<title>Macro scoring bridge: ready-reckoner to GE-adjusted</title>
				{/* Zero-line baseline */}
				<line
					x1={padX}
					x2={width - padX}
					y1={zeroY}
					y2={zeroY}
					stroke="currentColor"
					strokeWidth="0.6"
					strokeDasharray="3 3"
					vectorEffect="non-scaling-stroke"
					className="text-foreground/40"
				/>
				{/* Connectors */}
				{connectors.map((c) => (
					<polygon
						key={c.id}
						points={c.points}
						fill={
							c.tone === "blue"
								? "#2563eb"
								: c.tone === "amber"
									? "#d97706"
									: "#94a3b8"
						}
						opacity={c.tone === "neutral" ? 0.15 : 0.35}
					>
						<title>{`${fmtSignedBn(c.delta)} flow`}</title>
					</polygon>
				))}
				{/* Stage value path on top of connectors */}
				<polyline
					points={stages.map((s, i) => `${xAt(i)},${yAt(s.value)}`).join(" ")}
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
					className="text-foreground/70"
				/>
				{/* Stage nodes */}
				{stages.map((stage, i) => (
					<g key={stage.id}>
						<circle
							cx={xAt(i)}
							cy={yAt(stage.value)}
							r="3.4"
							fill={
								stage.value >= 0 ? "#2563eb" : "#d97706"
							}
							stroke="white"
							strokeWidth="1"
						>
							<title>{`${stage.label}: ${fmtBn(stage.value)}`}</title>
						</circle>
					</g>
				))}
			</svg>
			<div
				className="mt-1 grid gap-1 text-[9px] tabular-nums"
				style={{
					gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
				}}
			>
				{stages.map((stage, idx) => (
					<div
						key={stage.id}
						className={cn(
							"min-w-0 truncate",
							idx === 0
								? "text-left"
								: idx === stages.length - 1
									? "text-right"
									: "text-center",
						)}
					>
						<div className="truncate font-medium text-foreground">
							{stage.label}
						</div>
						<div
							className={cn(
								"truncate font-semibold tabular-nums",
								valueToneClassName(stage.value),
							)}
						>
							{fmtBn(stage.value)}
						</div>
						<div className="truncate text-muted-foreground">
							{stage.detail}
						</div>
					</div>
				))}
			</div>
			<div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
				<span className="inline-flex items-center gap-1">
					<span
						aria-hidden="true"
						className="inline-block h-2 w-3 rounded-sm bg-blue-500/35"
					/>
					gain between stages
				</span>
				<span className="inline-flex items-center gap-1">
					<span
						aria-hidden="true"
						className="inline-block h-2 w-3 rounded-sm bg-amber-500/35"
					/>
					loss between stages
				</span>
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

const TIER_LINES = [
	{ key: "staticNet", label: "Static", color: "#94a3b8", strokeWidth: 1.4 },
	{ key: "dynamicNet", label: "Dynamic", color: "#60a5fa", strokeWidth: 1.4 },
	{ key: "macroNet", label: "Macro", color: "#2563eb", strokeWidth: 1.6 },
	{ key: "geNet", label: "GE", color: "#1e3a8a", strokeWidth: 1.8 },
] as const;

function MacroTierSparkline({
	tiered,
	focusedIndex,
}: {
	tiered: readonly ScenarioTieredYear[];
	focusedIndex: number | null;
}) {
	const width = 220;
	const height = 64;
	const padX = 8;
	const padY = 6;
	const innerWidth = width - padX * 2;
	const innerHeight = height - padY * 2;
	const dx = innerWidth / Math.max(1, tiered.length - 1);

	const allValues = tiered.flatMap((row) => [
		row.staticNet,
		row.dynamicNet,
		row.macroNet,
		row.geNet,
		0,
	]);
	const min = Math.min(...allValues);
	const max = Math.max(...allValues);
	const range = max - min || 1;
	const yAt = (v: number): number =>
		padY + innerHeight - ((v - min) / range) * innerHeight;
	const zeroY = yAt(0);
	const xAt = (i: number): number => padX + i * dx;

	const lineFor = (key: (typeof TIER_LINES)[number]["key"]): string =>
		tiered.map((row, i) => `${xAt(i)},${yAt(row[key])}`).join(" ");

	return (
		<div className="rounded-md border bg-background/60 p-2">
			<div className="flex items-baseline justify-between gap-2">
				<div className="text-xs font-medium">Tier paths across {tiered.length} years</div>
				<div className="text-[9px] text-muted-foreground">
					static → dynamic → macro → GE per year
				</div>
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="mt-2 h-16 w-full"
				preserveAspectRatio="none"
				role="img"
				aria-label="Macro scoring tiers across the projection horizon"
			>
				<title>Macro scoring tiers across the projection horizon</title>
				<line
					x1={padX}
					x2={width - padX}
					y1={zeroY}
					y2={zeroY}
					stroke="currentColor"
					strokeWidth="0.4"
					strokeDasharray="3 3"
					vectorEffect="non-scaling-stroke"
					className="text-foreground/30"
				/>
				{focusedIndex !== null &&
					focusedIndex >= 0 &&
					focusedIndex < tiered.length && (
						<line
							x1={xAt(focusedIndex)}
							x2={xAt(focusedIndex)}
							y1={padY}
							y2={height - padY}
							stroke="currentColor"
							strokeWidth="0.6"
							strokeDasharray="2 2"
							vectorEffect="non-scaling-stroke"
							className="text-foreground/50 pointer-events-none"
						/>
					)}
				{TIER_LINES.map((line) => (
					<polyline
						key={line.key}
						points={lineFor(line.key)}
						fill="none"
						stroke={line.color}
						strokeWidth={line.strokeWidth}
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					>
						<title>{line.label}</title>
					</polyline>
				))}
				{TIER_LINES.flatMap((line) =>
					tiered.map((row, i) => (
						<circle
							key={`${line.key}-${row.year}`}
							cx={xAt(i)}
							cy={yAt(row[line.key])}
							r={focusedIndex === i ? 1.8 : 1.1}
							fill={line.color}
							vectorEffect="non-scaling-stroke"
						/>
					)),
				)}
			</svg>
			<div
				className="mt-1 grid gap-1 text-[9px] tabular-nums text-muted-foreground"
				style={{
					gridTemplateColumns: `repeat(${tiered.length}, minmax(0, 1fr))`,
				}}
			>
				{tiered.map((row, i) => (
					<span
						key={row.year}
						className={cn(
							"min-w-0 truncate",
							i === 0
								? "text-left"
								: i === tiered.length - 1
									? "text-right"
									: "text-center",
							focusedIndex === i && "font-semibold text-foreground",
						)}
					>
						Y{row.year}
					</span>
				))}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
				{TIER_LINES.map((line) => (
					<span key={line.key} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="inline-block h-0.5 w-3"
							style={{ backgroundColor: line.color }}
						/>
						<span>{line.label}</span>
					</span>
				))}
			</div>
		</div>
	);
}

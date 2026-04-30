"use client";

import { cn } from "@/lib/utils";
import type {
	MacroState,
	ScenarioDynamic,
	ScenarioMacro,
} from "@/lib/scenario";

interface Props {
	staticNet: number;
	dynamic: ScenarioDynamic;
	macro: ScenarioMacro;
	macroPath: readonly MacroState[];
	macroYear1: number;
	geYear1: number;
	geGap: number;
	convergence: {
		iterations: number;
		converged: boolean;
		maxChangeGbp: number;
	};
}

type Tone = "blue" | "amber" | "slate";

const fmtBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "-" : "";
	if (abs >= 1_000_000_000) {
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	}
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const fmtSignedBn = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	return `${sign}${fmtBn(Math.abs(n))}`;
};

const fmtPp = (n: number, digits = 2): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	if (abs < 0.005) return "0pp";
	return `${sign}${abs.toFixed(digits)}pp`;
};

const fmtPct = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "-" : "";
	if (abs < 0.005) return "0%";
	return `${sign}${abs.toFixed(2)}%`;
};

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? n.toFixed(4) : "0.0000"}%`;

const toneForValue = (value: number, positiveTone: Tone = "blue"): Tone => {
	if (Math.abs(value) < 1) return "slate";
	if (value > 0) return positiveTone;
	return positiveTone === "blue" ? "amber" : "blue";
};

const toneTextClassName = (tone: Tone): string =>
	tone === "blue"
		? "text-blue-700"
		: tone === "amber"
			? "text-amber-700"
			: "text-muted-foreground";

const toneBgClassName = (tone: Tone): string =>
	tone === "blue"
		? "bg-blue-600"
		: tone === "amber"
			? "bg-amber-500"
			: "bg-slate-400";

export function MacroCausalOverview({
	staticNet,
	dynamic,
	macro,
	macroPath,
	macroYear1,
	geYear1,
	geGap,
	convergence,
}: Props) {
	const behaviouralDelta = dynamic.dynamicNet - staticNet;
	const macroDelta = macroYear1 - dynamic.dynamicNet;
	const finalState = macroPath.at(-1);
	const maxChannelAbs = finalState
		? Math.max(
				Math.abs(finalState.gdpDeviationPct),
				Math.abs(finalState.cpiDeviationPp),
				Math.abs(finalState.debtGdpDeviationPp),
				Math.abs(finalState.bankRateDeviationPp),
				Math.abs(finalState.giltYieldDeviationPp),
				0.01,
			)
		: 0.01;
	const channelScale = (value: number): number =>
		Math.min(1, Math.abs(value) / maxChannelAbs);

	const stages = [
		{
			id: "static",
			label: "Ready-reckoner",
			value: staticNet,
			deltaLabel: "starting score",
			detail: "Linear static yield before behavioural or macro effects.",
			tone: toneForValue(staticNet),
		},
		{
			id: "dynamic",
			label: "Behavioural response",
			value: dynamic.dynamicNet,
			deltaLabel: `${fmtSignedBn(behaviouralDelta)} vs static`,
			detail: `Output ${fmtSignedBn(
				dynamic.outputEffectGbp,
			)}; worker CEV ${fmtSignedBn(dynamic.workerCevGbp)}.`,
			tone: toneForValue(behaviouralDelta),
		},
		{
			id: "macro",
			label: "Macro state",
			value: macroYear1,
			deltaLabel: `${fmtSignedBn(macroDelta)} vs dynamic`,
			detail: `Demand, CPI, debt, Bank Rate, and gilt channels; macro feedback ${fmtSignedBn(
				macro.macroFeedbackGbp,
			)}.`,
			tone: toneForValue(macroDelta),
		},
		{
			id: "ge",
			label: "GE loop",
			value: geYear1,
			deltaLabel: `${fmtSignedBn(geGap)} vs macro path`,
			detail: `${convergence.converged ? "Converged" : "Bounded stop"} after ${
				convergence.iterations
			} iteration${convergence.iterations === 1 ? "" : "s"}.`,
			tone: toneForValue(geGap),
		},
	] as const;

	const channels = finalState
		? [
				{
					id: "gdp",
					label: "GDP",
					value: finalState.gdpDeviationPct,
					formatted: fmtPct(finalState.gdpDeviationPct),
					tone: toneForValue(finalState.gdpDeviationPct, "blue"),
				},
				{
					id: "cpi",
					label: "CPI",
					value: finalState.cpiDeviationPp,
					formatted: fmtPp(finalState.cpiDeviationPp),
					tone: toneForValue(finalState.cpiDeviationPp, "amber"),
				},
				{
					id: "debt",
					label: "Debt:GDP",
					value: finalState.debtGdpDeviationPp,
					formatted: fmtPp(finalState.debtGdpDeviationPp),
					tone: toneForValue(finalState.debtGdpDeviationPp, "amber"),
				},
				{
					id: "bank",
					label: "Bank Rate",
					value: finalState.bankRateDeviationPp,
					formatted: fmtPp(finalState.bankRateDeviationPp, 3),
					tone: toneForValue(finalState.bankRateDeviationPp, "amber"),
				},
				{
					id: "gilt",
					label: "Gilt yield",
					value: finalState.giltYieldDeviationPp,
					formatted: fmtPp(finalState.giltYieldDeviationPp, 3),
					tone: toneForValue(finalState.giltYieldDeviationPp, "amber"),
				},
			]
		: [];

	return (
		<section
			aria-label="Macro causal overview"
			className="space-y-3 rounded-lg border bg-background/70 p-3"
		>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h4 className="text-sm font-semibold">Macro causal overview</h4>
					<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
						Static score -&gt; behavioural response -&gt; macro state -&gt; GE
						feedback, all versus baseline.
					</p>
				</div>
				<div className="text-[10px] text-muted-foreground">
					baseline = 0; Scope B state feeds Scope C GE loop
				</div>
			</div>

			<div className="grid gap-2 lg:grid-cols-4">
				{stages.map((stage, index) => (
					<div key={stage.id} className="min-w-0 rounded-md border bg-background p-2">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0">
								<div className="truncate text-[10px] font-medium text-muted-foreground">
									Step {index + 1}
								</div>
								<div className="truncate text-xs font-semibold">
									{stage.label}
								</div>
							</div>
							<div
								className={cn(
									"text-right text-sm font-semibold tabular-nums",
									toneTextClassName(stage.tone),
								)}
							>
								{fmtBn(stage.value)}
							</div>
						</div>
						<div
							className={cn(
								"mt-2 text-[10px] font-medium tabular-nums",
								toneTextClassName(stage.tone),
							)}
						>
							{stage.deltaLabel}
						</div>
						<p className="mt-1 text-[10px] leading-snug text-muted-foreground">
							{stage.detail}
						</p>
					</div>
				))}
			</div>

			<MacroCausalFlow stages={stages} />

			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
				<div
					className="rounded-md border bg-background p-3"
					aria-label="Macro state channel deviations versus baseline"
				>
					<div className="flex items-baseline justify-between gap-2">
						<div className="text-xs font-medium">State channels</div>
						<div className="text-[10px] text-muted-foreground">
							{finalState ? `Year ${finalState.year}` : "No macro state"}
						</div>
					</div>
					<div className="mt-3 grid gap-2 sm:grid-cols-5">
						{channels.map((channel) => (
							<div key={channel.id} className="min-w-0">
								<div className="flex items-baseline justify-between gap-1">
									<span className="truncate text-[10px] font-medium">
										{channel.label}
									</span>
									<span
										className={cn(
											"text-[10px] font-semibold tabular-nums",
											toneTextClassName(channel.tone),
										)}
									>
										{channel.formatted}
									</span>
								</div>
								<div className="mt-1 h-2 rounded-sm bg-muted/40">
									<div
										className={cn(
											"h-2 rounded-sm",
											toneBgClassName(channel.tone),
										)}
										style={{
											width: formatStylePct(channelScale(channel.value) * 100),
										}}
									>
										<span className="sr-only">
											{channel.label}: {channel.formatted} versus baseline
										</span>
									</div>
								</div>
								<div className="mt-1 text-[9px] text-muted-foreground">
									vs baseline
								</div>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-md border bg-background p-3">
					<div className="text-xs font-medium">Feedback loop</div>
					<p className="mt-1 text-[10px] leading-snug text-muted-foreground">
						CPI, Bank Rate, and gilt-yield deviations feed back into per-line
						yields and borrowing costs before the year-1 GE score is reported.
					</p>
					<div className="mt-2 text-[10px] tabular-nums text-muted-foreground">
						Residual change {fmtBn(convergence.maxChangeGbp)}
					</div>
				</div>
			</div>
		</section>
	);
}

function MacroCausalFlow({
	stages,
}: {
	stages: readonly {
		id: string;
		label: string;
		value: number;
		tone: Tone;
	}[];
}) {
	const values = stages.flatMap((stage) => [stage.value, 0]);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const position = (value: number): number => ((value - min) / range) * 100;
	const zero = position(0);

	return (
		<div
			className="rounded-md border bg-background p-3"
			aria-label="Macro causal scoring flow from static score to GE-adjusted result"
		>
			<div className="relative h-12 rounded-sm bg-muted/25">
				<div
					className="absolute inset-y-1 border-l border-dashed border-foreground/40"
					style={{ left: formatStylePct(zero) }}
					aria-hidden="true"
				/>
				{stages.map((stage, index) => {
					const left = position(index === 0 ? 0 : stages[index - 1]!.value);
					const right = position(stage.value);
					const start = Math.min(left, right);
					const width = Math.max(1.5, Math.abs(right - left));
					return (
						<div
							key={stage.id}
							className={cn(
								"absolute top-5 h-2 rounded-sm",
								toneBgClassName(stage.tone),
							)}
							style={{
								left: formatStylePct(start),
								width: formatStylePct(width),
								opacity: index === 0 ? 0.35 : 0.75,
							}}
						>
							<span className="sr-only">
								{stage.label}: {fmtBn(stage.value)}
							</span>
						</div>
					);
				})}
				{stages.map((stage) => (
					<div
						key={`${stage.id}-marker`}
						className="absolute top-3 h-6 w-px bg-foreground/50"
						style={{ left: formatStylePct(position(stage.value)) }}
						aria-hidden="true"
					/>
				))}
			</div>
			<div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-muted-foreground sm:grid-cols-4">
				{stages.map((stage) => (
					<div key={`${stage.id}-label`} className="min-w-0">
						<div className="truncate">{stage.label}</div>
						<div
							className={cn(
								"tabular-nums",
								toneTextClassName(stage.tone),
							)}
						>
							{fmtBn(stage.value)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

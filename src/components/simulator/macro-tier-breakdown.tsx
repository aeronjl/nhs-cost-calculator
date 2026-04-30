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
	geYear1: number;
	geGap: number;
	geGapSignificant: boolean;
}

const fmt = (n: number): string =>
	`£${Math.round(n).toLocaleString()}`;

const fmtSigned = (n: number): string =>
	`${n >= 0 ? "+" : "−"}£${Math.abs(Math.round(n)).toLocaleString()}`;

export function MacroTierBreakdown({
	staticNet,
	dynamic,
	dynamicGapSignificant,
	macro,
	macroGapSignificant,
	geYear1,
	geGap,
	geGapSignificant,
}: Props) {
	return (
		<div className="space-y-1.5">
			<div className="text-xs font-medium">Scoring layers</div>
			<ul className="space-y-1.5 text-[11px]">
				<li className="flex items-baseline justify-between gap-2 border-l-2 border-muted-foreground/30 pl-2">
					<span className="text-muted-foreground">
						Ready-reckoner linear
					</span>
					<span
						className={cn(
							"tabular-nums font-medium",
							staticNet > 0
								? "text-blue-700"
								: staticNet < 0
									? "text-amber-700"
									: "",
						)}
					>
						{fmt(staticNet)}
					</span>
				</li>
				{dynamicGapSignificant && (
					<li className="flex items-baseline justify-between gap-2 border-l-2 border-amber-300 pl-2">
						<span className="text-muted-foreground">
							Dynamic (marginal-rate)
						</span>
						<span className="tabular-nums font-medium text-amber-700">
							{fmt(dynamic.dynamicNet)}
						</span>
					</li>
				)}
				{macroGapSignificant && (
					<li className="flex items-baseline justify-between gap-2 border-l-2 border-amber-400 pl-2">
						<span className="text-muted-foreground">
							Macro-adjusted (Scope A)
						</span>
						<span
							className={cn(
								"tabular-nums font-medium",
								macro.secondRoundNet > 0
									? "text-blue-700"
									: macro.secondRoundNet < 0
										? "text-amber-700"
										: "",
							)}
						>
							{fmt(macro.secondRoundNet)}
						</span>
					</li>
				)}
				{geGapSignificant && (
					<li className="flex items-baseline justify-between gap-2 border-l-2 border-amber-500 pl-2">
						<span className="text-muted-foreground">
							GE-adjusted (Scope C)
						</span>
						<span
							className={cn(
								"tabular-nums font-medium",
								geYear1 > 0
									? "text-blue-700"
									: geYear1 < 0
										? "text-amber-700"
										: "",
							)}
						>
							{fmt(geYear1)}
						</span>
					</li>
				)}
			</ul>
			<div className="text-[10px] text-muted-foreground leading-snug pt-1.5 border-t">
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

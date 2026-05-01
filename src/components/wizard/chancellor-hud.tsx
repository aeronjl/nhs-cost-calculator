"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import { ERAS, type EraId } from "@/data/eras";
import {
	type BaselineMode,
	getEraBaseline,
} from "@/data/historical/era-baselines";
import {
	getProgrammeLegislation,
	getTaxLegislation,
} from "@/data/legislation";
import { projectAgainstBaseline } from "@/lib/baseline-projection";
import {
	type ScenarioLine,
	evaluateScenario,
	evaluateScenarioDistribution,
	evaluateScenarioDynamic,
	projectScenarioWithGEFeedback,
} from "@/lib/scenario";
import {
	GOAL_DEFINITIONS,
	type WizardGoal,
} from "@/lib/wizard-state";
import { generatePopulation } from "@/lib/microsim/population";
import { evaluateMicrosim } from "@/lib/microsim/impact";
import { computeScenarioSignature } from "@/lib/scenario-signature";
import { useMemo } from "react";
import { ScenarioSignatureRadar } from "@/components/report/scenario-signature";
import { DecileSparkline } from "@/components/report/decile-sparkline";
import { EraSparkline } from "./era-sparkline";

// Chancellor HUD — compact panel showing the live impact of the wizard's
// committed + previewed choices. Updates in real time as the user hovers
// over choices (preview) and clicks to commit (state shifts permanently).
//
// The HUD is the wizard's load-bearing UX feature: it gives every click
// immediate, visible consequence. Without it the wizard is just a
// multiple-choice quiz.

interface Props {
	committedScenario: readonly ScenarioLine[];
	previewLines: readonly ScenarioLine[];
	goal: WizardGoal | null;
	baseline?: OBRBaseline;
	// Alternate-mode baseline for in-era plan-vs-reality comparison. The
	// HUD's year-N tile shows the active baseline's PSNB and (when this is
	// provided + era != current) inlines the alternate's PSNB so the user
	// sees the divergence between forecast and outturn.
	alternateBaseline?: OBRBaseline;
	// Era controls the gdpScale applied to all £ figures so the HUD shows
	// era-appropriate magnitudes (e.g. 1pp basic-rate IT ≈ £470m in 1979).
	// When omitted or "current", figures use present-day calibration.
	era?: EraId;
	// Drives the alternate-baseline label ("vs outturn £71bn" when in
	// forecast mode; "vs forecast £45bn" when in outturn mode).
	baselineMode?: BaselineMode;
	// Mobile-only: state owned by wizard-state (URL + localStorage). When
	// undefined, defaults to false (sparkline visible).
	mobileSparklineCollapsed?: boolean;
	onToggleMobileSparkline?: () => void;
	onRemoveChoice: (id: string) => void;
	// When true (mobile or "compact" desktop), renders just the headline
	// banner suitable for stickying at the top of the screen.
	compact?: boolean;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatPp = (n: number): string => {
	const abs = Math.abs(n);
	if (abs < 0.05) return "0pp";
	const sign = n > 0 ? "+" : "−";
	return `${sign}${abs.toFixed(1)}pp`;
};

export function ChancellorHUD({
	committedScenario,
	previewLines,
	goal,
	baseline = OBR_BASELINE,
	alternateBaseline,
	era = "current",
	baselineMode = "forecast",
	mobileSparklineCollapsed = false,
	onToggleMobileSparkline,
	onRemoveChoice,
	compact = false,
}: Props) {
	const effectiveScenario = useMemo(
		() => [...committedScenario, ...previewLines],
		[committedScenario, previewLines],
	);

	// Mobile sparkline collapse — owned by wizard state (URL + localStorage
	// persisted there). HUD reads via prop and toggles via callback.
	const toggleMobileSparkline = () => {
		onToggleMobileSparkline?.();
	};

	const gdpScale = ERAS[era].gdpScale;
	const isEraScaled = gdpScale !== 1;
	// Pass era through evaluator so per-era programme values flow into the
	// math (NHS £8.4bn in 1979 instead of gdpScale-weighted £12.5bn). For
	// taxes, gbpPerUnit × gdpScale still applies (no per-era lever yields).
	const result = evaluateScenario(effectiveScenario, { era });
	const dynamic = evaluateScenarioDynamic(result);
	// Pass era through projection assumptions so multi-year macro feedback
	// uses the era's regime-level multiplier adjust (e.g. 1979 high-
	// inflation transmission damped to 70% of current).
	const ge = projectScenarioWithGEFeedback(
		result,
		baseline.years.length,
		{ era },
	);
	const projection = ge.withFeedback;
	const baselineComparison = projectAgainstBaseline(projection, baseline);
	// For the three-way sparkline: also project against the alternate
	// baseline (forecast vs outturn). Same scenario impact, different
	// counterfactual. Lets the user see "what would my scenario have
	// done under either reality."
	const alternateComparison =
		era !== "current" && alternateBaseline
			? projectAgainstBaseline(projection, alternateBaseline)
			: null;
	const distribution = evaluateScenarioDistribution(result, { era });
	const signature = useMemo(
		() =>
			result.lines.length > 0
				? computeScenarioSignature({
						result,
						distribution,
						year1: projection[0],
						year5: projection[projection.length - 1],
					})
				: null,
		[result, distribution, projection],
	);

	const goalDef = goal ? GOAL_DEFINITIONS[goal] : null;
	// Goal demand is defined in current pounds. Scale to era-pound basis so
	// the balance is denominated in the same units as result.net.
	const scaledDemand = goalDef ? goalDef.initialDemand * gdpScale : 0;
	const balance = scaledDemand - result.net;
	const balanceProgress =
		scaledDemand > 0
			? Math.max(0, Math.min(1, result.net / scaledDemand))
			: 0;

	// Microsim for winners/losers headline
	const population = useMemo(() => generatePopulation(500, 42), []);
	const microsim = useMemo(
		() =>
			effectiveScenario.length > 0
				? evaluateMicrosim(population, result).agg
				: null,
		[population, result, effectiveScenario.length],
	);

	// Per-household decile impact for the one-liner
	const HOUSEHOLDS_PER_DECILE = 2_800_000;
	const bottomPerHh = (distribution.perDecile[0] ?? 0) / HOUSEHOLDS_PER_DECILE;
	const topPerHh = (distribution.perDecile[9] ?? 0) / HOUSEHOLDS_PER_DECILE;

	const ruleYear = baselineComparison.ruleYear;
	const ruleHeadroom = baselineComparison.adjustedStabilityHeadroom;
	const ruleBroken = ruleHeadroom < 0;

	// Alternate-mode baseline year-N PSNB (for plan-vs-reality comparison).
	// Match by fiscal year so we compare like-for-like even when forecast
	// horizon differs slightly from outturn horizon.
	const alternateRuleYearPsnb =
		era !== "current" && alternateBaseline && ruleYear
			? alternateBaseline.years.find(
					(y) => y.fiscalYear === ruleYear.fiscalYear,
				)?.psnb
			: undefined;
	const alternateModeLabel = baselineMode === "forecast" ? "outturn" : "forecast";

	const isPreviewing = previewLines.length > 0;
	const netColour =
		result.net > 0
			? "text-blue-700"
			: result.net < 0
				? "text-amber-700"
				: "text-muted-foreground";

	if (compact) {
		// Mobile: one-line headline banner with optional mini-sparkline
		// row below for non-current eras. Sparkline collapse state is
		// persisted in localStorage so the user's choice survives reloads.
		const showMiniSparkline =
			era !== "current" &&
			alternateBaseline &&
			committedScenario.length > 0;
		const sparklineCollapsed = mobileSparklineCollapsed;
		return (
			<>
				<div className="flex items-center justify-between gap-3 text-xs px-3 py-1.5 bg-muted/50 border-y">
					<span className="flex items-center gap-2">
						<span className="text-muted-foreground">Net:</span>
						<span className={cn("tabular-nums font-semibold", netColour)}>
							{formatBn(result.net)}
						</span>
					</span>
					{ruleYear && (
						<span className="flex items-center gap-1">
							{ruleBroken ? "⚠️" : "✅"}
							<span className="tabular-nums">{formatBn(ruleHeadroom)}</span>
						</span>
					)}
					{microsim && (
						<span className="text-muted-foreground tabular-nums">
							{Math.round(microsim.losers * 100)}% lose
						</span>
					)}
					{showMiniSparkline && (
						<button
							type="button"
							onClick={toggleMobileSparkline}
							aria-label={sparklineCollapsed ? "Show sparkline" : "Hide sparkline"}
							className="text-muted-foreground hover:text-foreground text-xs leading-none px-1"
						>
							{sparklineCollapsed ? "▸" : "▾"}
						</button>
					)}
				</div>
				{showMiniSparkline && !sparklineCollapsed && (
					<div className="px-3 py-1 bg-muted/30 border-b">
						<EraSparkline
							compact
							xLabels={baseline.years.map((y) => y.fiscalYear)}
							series={[
								{
									label: baselineMode === "forecast" ? "Forecast" : "Outturn",
									values: baseline.years.map((y) => y.psnb),
									color: baselineMode === "forecast" ? "rgb(107 114 128)" : "rgb(217 119 6)",
									width: 1.5,
								},
								{
									label: "Scenario",
									values: baselineComparison.years.map((y) => y.adjustedPsnb),
									color: "rgb(37 99 235)",
									width: 1.5,
								},
							]}
						/>
					</div>
				)}
			</>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-baseline justify-between">
				<h2 className="text-sm font-semibold text-foreground">
					Chancellor HUD
				</h2>
				{isPreviewing && (
					<span className="text-[10px] uppercase tracking-wider text-blue-700 font-medium">
						Previewing
					</span>
				)}
			</div>

			{/* Net effect */}
			<div className="rounded-md border bg-background p-3 space-y-1">
				<div className="flex items-baseline justify-between">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Net effect
					</div>
					{isEraScaled && (
						<div
							className="text-[9px] uppercase tracking-wider text-amber-700 font-medium"
							title={`Lever yields scaled to ${ERAS[era].year} nominal-GDP basis (${(gdpScale * 100).toFixed(1)}% of today's pounds).`}
						>
							{ERAS[era].year} £
						</div>
					)}
				</div>
				<div
					className={cn(
						"text-2xl font-semibold tabular-nums leading-tight",
						netColour,
					)}
				>
					£<AnimatedNumber value={Math.abs(Math.round(result.net))} />
					<span className="text-xs font-normal text-muted-foreground ml-1.5">
						{result.net > 0
							? "freed"
							: result.net < 0
								? "shortfall"
								: ""}
					</span>
				</div>
				{/* Always render so layout doesn't shift when the dynamic gap
				    crosses the threshold mid-hover. Hide visually when the
				    behavioural adjustment is too small to be meaningful. */}
				<div
					className={cn(
						"text-[10px] text-muted-foreground",
						Math.abs(dynamic.dynamicNet - result.net) <= 1_000_000 &&
							"invisible",
					)}
				>
					after behavioural response: {formatBn(dynamic.dynamicNet)}
				</div>
			</div>

			{/* Scenario signature radar */}
			{signature && !compact && (
				<ScenarioSignatureRadar signature={signature} />
			)}

			{/* Per-decile incidence sparkline — auto-hides when no decile carries
			    a meaningful per-household impact (e.g. empty scenarios). */}
			{!compact && <DecileSparkline distribution={distribution} />}

			{/* Goal-progress bar */}
			{goalDef && goalDef.initialDemand > 0 && (
				<div className="rounded-md border bg-background/60 p-3 space-y-1.5">
					<div className="flex items-baseline justify-between text-xs">
						<span className="text-muted-foreground">Goal:</span>
						<span className="font-medium">
							{isEraScaled ? (
								<>
									Find {formatBn(scaledDemand)}
									<span className="text-[10px] text-muted-foreground ml-1">
										({ERAS[era].year} £)
									</span>
								</>
							) : (
								goalDef.hudLabel
							)}
						</span>
					</div>
					<div className="relative h-2 rounded-full bg-muted overflow-hidden">
						<div
							className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
							style={{ width: `${balanceProgress * 100}%` }}
						/>
					</div>
					<div className="text-[10px] text-muted-foreground tabular-nums">
						{balance > 0 ? (
							<>
								Still to find:{" "}
								<span className="text-amber-700 font-medium">
									{formatBn(balance)}
								</span>
							</>
						) : balance < 0 ? (
							<>
								Over-funded by{" "}
								<span className="text-blue-700 font-medium">
									{formatBn(Math.abs(balance))}
								</span>
							</>
						) : (
							<span className="text-blue-700 font-medium">
								Balanced!
							</span>
						)}
					</div>
				</div>
			)}

			{/* Year-5 PSNB */}
			{ruleYear && (
				<div className="rounded-md border bg-background/60 p-3 space-y-1">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Year {ruleYear.year} ({ruleYear.fiscalYear})
					</div>
					<div className="text-xs">
						<span className="text-muted-foreground">PSNB: </span>
						<span className="tabular-nums">
							{formatBn(ruleYear.baselinePsnb)}
						</span>
						<span className="text-muted-foreground"> → </span>
						<span
							className={cn(
								"tabular-nums font-medium",
								ruleYear.psnbShift > 0
									? "text-blue-700"
									: ruleYear.psnbShift < 0
										? "text-amber-700"
										: "",
							)}
						>
							{formatBn(ruleYear.adjustedPsnb)}
						</span>
					</div>
					{alternateRuleYearPsnb !== undefined && (
						<div className="text-[10px] text-muted-foreground italic">
							{alternateModeLabel === "outturn" ? "Reality:" : "Plan:"}{" "}
							<span className="tabular-nums">
								{formatBn(alternateRuleYearPsnb)}
							</span>{" "}
							<span className="text-[9px]">
								({alternateModeLabel} for {ruleYear.fiscalYear})
							</span>
						</div>
					)}
					<div className="text-xs">
						<span className="text-muted-foreground">Stability rule: </span>
						<span
							className={cn(
								"tabular-nums font-medium",
								ruleBroken
									? "text-red-700"
									: ruleHeadroom > baseline.stabilityRuleHeadroom
										? "text-blue-700"
										: "text-muted-foreground",
							)}
						>
							{ruleBroken ? "⚠️ broken" : "✅"} {formatBn(ruleHeadroom)}
						</span>
					</div>
					{/* Three-way sparkline: forecast / outturn / scenario-vs-each */}
					{!compact && era !== "current" && alternateBaseline && (
						<div className="pt-2 mt-1 border-t">
							<div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
								PSNB path · {ERAS[era].year}-era
							</div>
							<EraSparkline
								xLabels={baseline.years.map((y) => y.fiscalYear)}
								series={[
									{
										label: baselineMode === "forecast" ? "Forecast" : "Outturn",
										values: baseline.years.map((y) => y.psnb),
										color: baselineMode === "forecast" ? "rgb(107 114 128)" : "rgb(217 119 6)",
										width: 2,
									},
									{
										label: alternateModeLabel === "forecast" ? "Forecast" : "Outturn",
										values: alternateBaseline.years.map((y) => y.psnb),
										color: alternateModeLabel === "forecast" ? "rgb(107 114 128)" : "rgb(217 119 6)",
										dashed: true,
										width: 1.5,
									},
									...(committedScenario.length > 0
										? [
												{
													label: "Scenario",
													values: baselineComparison.years.map((y) => y.adjustedPsnb),
													color: "rgb(37 99 235)",
													width: 2,
												},
												...(alternateComparison
													? [
															{
																label: "Scenario (alt)",
																values: alternateComparison.years.map((y) => y.adjustedPsnb),
																color: "rgb(96 165 250)",
																dashed: true,
																width: 1.5,
															},
														]
													: []),
											]
										: []),
								]}
							/>
						</div>
					)}
				</div>
			)}

			{/* Distributional + winners/losers */}
			{(Math.abs(bottomPerHh) > 1 || Math.abs(topPerHh) > 1 || microsim) && (
				<div className="rounded-md border bg-background/60 p-3 space-y-1">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Who pays
					</div>
					<div className="text-xs">
						<span className="text-muted-foreground">Bottom 10%: </span>
						<span
							className={cn(
								"tabular-nums font-medium",
								bottomPerHh > 0
									? "text-amber-700"
									: bottomPerHh < 0
										? "text-blue-700"
										: "",
							)}
						>
							{bottomPerHh > 0 ? "−" : "+"}£
							{Math.round(Math.abs(bottomPerHh)).toLocaleString()}
						</span>
						<span className="text-muted-foreground"> · Top 10%: </span>
						<span
							className={cn(
								"tabular-nums font-medium",
								topPerHh > 0
									? "text-amber-700"
									: topPerHh < 0
										? "text-blue-700"
										: "",
							)}
						>
							{topPerHh > 0 ? "−" : "+"}£
							{Math.round(Math.abs(topPerHh)).toLocaleString()}
						</span>
					</div>
					{microsim && (
						<div className="text-[10px] text-muted-foreground">
							<span className="text-amber-700 font-medium">
								{Math.round(microsim.losers * 100)}%
							</span>{" "}
							worse off ·{" "}
							<span className="text-blue-700 font-medium">
								{Math.round(microsim.winners * 100)}%
							</span>{" "}
							better off
						</div>
					)}
				</div>
			)}

			{/* Choice basket */}
			{committedScenario.length > 0 && (
				<div className="rounded-md border bg-background/60 p-3 space-y-1.5">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Your choices
					</div>
					<ul className="space-y-1">
						{committedScenario.map((line) => {
							// Pass era to per-line evaluation so the basket figures
							// match the aggregated net effect above (era-£).
							const ev = evaluateScenario([line], { era });
							const lineDelta = ev.lines[0]?.deltaGbp ?? 0;
							const evLine = ev.lines[0];
							// For overridden lines with > 12mo implementation lag, the
							// year-1 figure is partial — surface this so the user
							// understands why the £ is smaller than the steady state.
							let rampHint: string | null = null;
							if (line.overridden && line.type !== "borrow") {
								const meta =
									line.type === "tax"
										? getTaxLegislation(line.leverId)
										: getProgrammeLegislation(line.leverId);
								const months = meta?.relaxation?.implementationMonths ?? 0;
								if (months > 12 && months < 999) {
									const fullYear = Math.ceil(months / 12);
									rampHint = `year 1 · full at year ${fullYear}`;
								}
							}
							return (
								<li
									key={line.id}
									className="flex flex-col gap-0 text-[11px]"
								>
									<div className="flex items-baseline justify-between gap-2">
										<span className="truncate flex-1 min-w-0">
											{evLine?.description ?? line.leverId}
										</span>
										<span
											className={cn(
												"tabular-nums shrink-0",
												lineDelta > 0
													? "text-blue-700"
													: lineDelta < 0
														? "text-amber-700"
														: "",
											)}
										>
											{lineDelta >= 0 ? "+" : "−"}
											{formatBn(Math.abs(lineDelta)).replace("£", "£")}
										</span>
										<button
											type="button"
											onClick={() => onRemoveChoice(line.id)}
											aria-label={`Remove ${evLine?.description ?? line.leverId}`}
											className="text-muted-foreground hover:text-foreground text-xs leading-none px-1 shrink-0"
										>
											×
										</button>
									</div>
									{rampHint && (
										<span className="text-[9px] text-amber-700 italic pl-2">
											{rampHint}
										</span>
									)}
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{committedScenario.length === 0 && !goalDef && (
				<p className="text-[11px] text-muted-foreground italic px-1">
					No choices yet. Pick a goal and start making decisions — the HUD
					updates in real time.
				</p>
			)}
		</div>
	);
}

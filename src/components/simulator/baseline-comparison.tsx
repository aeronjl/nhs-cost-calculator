"use client";

import { type PointerEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import type {
	BaselineComparison,
	FiscalRuleFan,
	FiscalRulePriorSensitivity,
	FiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import { policyReactionPackageSummary } from "@/lib/policy-reaction-packages";
import { pointerToYearIndex, useYearFocus } from "@/lib/year-focus";
import { FiscalRiskGauge } from "./fiscal-risk-gauge";

// Renders the scenario's impact against OBR's "do-nothing" baseline.
//
// The user already sees their scenario's net £ effect in the multi-year
// projection. This panel adds the layer Treasury, OBR, and IFS actually use:
// "where does this leave the country relative to current-policy?" — PSNB
// path, debt:GDP, fiscal-rule margin.
//
// The credibility move here is the framing. A scenario producing "+£30bn at
// year 5" is meaningless to a Treasury official without context. The same
// scenario reframed as "year-5 PSNB falls from £55bn to £25bn against the
// OBR central forecast, leaving £40bn headroom against the stability rule
// (vs £10bn baseline)" is the language of fiscal policy.

interface Props {
	comparison: BaselineComparison;
	fiscalRuleFan?: FiscalRuleFan;
	fiscalRulePriorSensitivity?: FiscalRulePriorSensitivity;
	fiscalRuleUncertaintyDecomposition?: FiscalRuleUncertaintyDecomposition;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n >= 0 ? "" : "−";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatBnDelta = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatPct = (n: number): string => `${n.toFixed(1)}%`;

const formatAxisBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	return `${sign}£${(abs / 1_000_000_000).toFixed(abs >= 100_000_000_000 ? 0 : 1)}bn`;
};

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? n.toFixed(4) : "0.0000"}%`;

const formatSignedPp = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

const formatProbability = (n: number): string => `${Math.round(n * 100)}%`;

const formatProbabilityDelta = (n: number): string => {
	const pp = n * 100;
	const sign = pp > 0 ? "+" : pp < 0 ? "−" : "";
	const abs = Math.abs(pp);
	return `${sign}${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}pp`;
};

const formatHouseholdGbp = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(1)}k/yr`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}/yr`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}/yr`;
	if (abs >= 1) return `${sign}£${abs.toFixed(1)}/yr`;
	return "£0/yr";
};

const formatImpactPct = (n: number): string => {
	const abs = Math.abs(n) * 100;
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 0.005) return `${sign}${abs.toFixed(2)}%`;
	return "0%";
};

const riskClassName = (
	risk: BaselineComparison["diagnostics"]["riskRating"],
): string =>
	risk === "breach"
		? "border-red-200 bg-red-50 text-red-800"
		: risk === "tight"
			? "border-amber-200 bg-amber-50 text-amber-900"
			: risk === "watch"
				? "border-yellow-200 bg-yellow-50 text-yellow-900"
				: "border-blue-200 bg-blue-50 text-blue-800";

const metricToneClassName = (
	tone: "blue" | "amber" | "red" | "muted",
): string =>
	tone === "blue"
		? "text-blue-700"
		: tone === "amber"
			? "text-amber-700"
			: tone === "red"
				? "text-red-700"
				: "text-muted-foreground";

export function BaselineComparisonPanel({
	comparison,
	fiscalRuleFan,
	fiscalRulePriorSensitivity,
	fiscalRuleUncertaintyDecomposition,
}: Props) {
	const {
		years,
		ruleYear,
		adjustedStabilityHeadroom,
		baseline,
		diagnostics,
		policyReactionPath,
		policyReactionOptions,
	} = comparison;
	if (years.length === 0) return null;

	const lastYear = years[years.length - 1]!;
	const ruleBroken = adjustedStabilityHeadroom < 0;
	const meaningfulShift =
		years.some((y) => Math.abs(y.psnbShift) > 1_000_000_000);
	const psnbDelta = lastYear.adjustedPsnb - lastYear.baselinePsnb;
	const headroomDelta =
		adjustedStabilityHeadroom - baseline.stabilityRuleHeadroom;
	const psnbTone =
		lastYear.psnbShift > 0
			? "blue"
			: lastYear.psnbShift < 0
				? "amber"
				: "muted";
	const headroomTone = ruleBroken
		? "red"
		: headroomDelta > 0
			? "blue"
			: headroomDelta < 0
				? "amber"
				: "muted";
	const psnbDirection =
		lastYear.psnbShift > 0
			? `improves final-year PSNB by ${formatBn(lastYear.psnbShift)}`
			: lastYear.psnbShift < 0
				? `worsens final-year PSNB by ${formatBn(Math.abs(lastYear.psnbShift))}`
				: "leaves final-year PSNB broadly unchanged";
	const headroomDirection = ruleYear
		? ruleBroken
			? `breaks the rule by ${formatBn(Math.abs(adjustedStabilityHeadroom))}`
			: `leaves ${formatBn(adjustedStabilityHeadroom)} of rule headroom`
		: "has no matched rule-year baseline";
	const topReactionPackage = fiscalRuleFan?.reactionPackageMix
		.filter((row) => row.count > 0)
		.slice()
		.sort((a, b) => b.count - a.count)[0];

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					vs OBR baseline
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{baseline.asOf} EFO
				</span>
			</div>

			<div className="rounded-md border bg-background/70 p-3">
				<div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start">
					<div>
						<div
							className={cn(
								"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
								riskClassName(diagnostics.riskRating),
							)}
						>
							{diagnostics.riskRating} fiscal risk
						</div>
						<p className="mt-2 text-sm leading-snug text-foreground">
							Against the {baseline.asOf} baseline, this scenario{" "}
							<span className={cn("font-medium", metricToneClassName(psnbTone))}>
								{psnbDirection}
							</span>{" "}
							and{" "}
							<span
								className={cn("font-medium", metricToneClassName(headroomTone))}
							>
								{headroomDirection}
							</span>
							.
						</p>
						<p className="mt-1 text-[11px] leading-snug text-muted-foreground">
							{diagnostics.note}
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<ExecutiveMetric
							label={`${lastYear.fiscalYear} PSNB move`}
							value={formatBnDelta(psnbDelta)}
							detail={`${formatPct(lastYear.baselinePsnbPctGdp)} → ${formatPct(
								lastYear.adjustedPsnbPctGdp,
							)} of GDP`}
							tone={psnbTone}
						/>
						<ExecutiveMetric
							label="Rule headroom"
							value={formatBn(adjustedStabilityHeadroom)}
							detail={`${formatBnDelta(headroomDelta)} vs baseline`}
							tone={headroomTone}
						/>
						<ExecutiveMetric
							label="Breach risk"
							value={
								fiscalRuleFan
									? formatProbability(fiscalRuleFan.breachProbability)
									: diagnostics.riskRating
							}
							detail={
								fiscalRuleFan
									? `${formatProbability(
											fiscalRuleFan.postReactionBreachProbability,
										)} after reaction`
									: "central case only"
							}
							tone={
								fiscalRuleFan && fiscalRuleFan.breachProbability > 0.25
									? "red"
									: fiscalRuleFan && fiscalRuleFan.breachProbability > 0.1
										? "amber"
										: diagnostics.riskRating === "breach"
											? "red"
											: diagnostics.riskRating === "tight"
												? "amber"
												: "blue"
							}
						/>
						<ExecutiveMetric
							label="Reaction need"
							value={
								diagnostics.policyReactionGbp > 0
									? formatBn(diagnostics.policyReactionGbp)
									: "none"
							}
							detail={
								topReactionPackage
									? `usually ${topReactionPackage.label}`
									: "no offset package triggered"
							}
							tone={diagnostics.policyReactionGbp > 0 ? "amber" : "blue"}
						/>
					</div>
				</div>
			</div>

			{fiscalRuleFan && (
				<FiscalRiskGauge
					fiscalRuleFan={fiscalRuleFan}
					fiscalRuleUncertaintyDecomposition={
						fiscalRuleUncertaintyDecomposition
					}
				/>
			)}

			<FiscalCounterfactualChart
				comparison={comparison}
				fiscalRuleFan={fiscalRuleFan}
				fiscalRuleUncertaintyDecomposition={
					fiscalRuleUncertaintyDecomposition
				}
			/>

			<div className="rounded-md border bg-background/60 p-3 space-y-3">
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
						{lastYear.fiscalYear} PSNB
					</div>
					<div className="flex items-baseline gap-2 text-sm">
						<span className="text-muted-foreground tabular-nums">
							baseline {formatBn(lastYear.baselinePsnb)}
						</span>
						<span className="text-muted-foreground">→</span>
						<span
							className={cn(
								"font-semibold tabular-nums",
								lastYear.psnbShift > 0
									? "text-blue-700"
									: lastYear.psnbShift < 0
										? "text-amber-700"
										: "",
							)}
						>
							{formatBn(lastYear.adjustedPsnb)}
						</span>
					</div>
					<div className="text-[10px] text-muted-foreground mt-0.5">
						{formatPct(lastYear.baselinePsnbPctGdp)} of GDP →{" "}
						{formatPct(lastYear.adjustedPsnbPctGdp)} of GDP
					</div>
				</div>

				{ruleYear && (
					<div className="border-t pt-2">
						<div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
							Stability rule margin ({baseline.stabilityRuleAt})
						</div>
						<div className="flex items-baseline gap-2 text-sm">
							<span className="text-muted-foreground tabular-nums">
								baseline {formatBn(baseline.stabilityRuleHeadroom)}
							</span>
							<span className="text-muted-foreground">→</span>
							<span
								className={cn(
									"font-semibold tabular-nums",
									ruleBroken
										? "text-red-700"
										: adjustedStabilityHeadroom >
												baseline.stabilityRuleHeadroom
											? "text-blue-700"
											: "text-amber-700",
								)}
							>
								{formatBn(adjustedStabilityHeadroom)}
							</span>
						</div>
						<div className="text-[10px] text-muted-foreground mt-0.5">
							{ruleBroken ? (
								<span className="text-red-700 font-medium">
									Rule broken: scenario takes margin below zero
								</span>
							) : (
								"Current expenditure must balance by year 5 + leave a buffer."
							)}
						</div>
						{fiscalRuleFan && (
							<div className="mt-1.5 rounded-sm bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
								Stochastic fan ({fiscalRuleFan.samples} draws):{" "}
								<span
									className={cn(
										"font-medium",
										fiscalRuleFan.breachProbability > 0.25
											? "text-red-700"
											: fiscalRuleFan.breachProbability > 0.1
												? "text-amber-700"
												: "text-foreground",
									)}
								>
									{formatProbability(fiscalRuleFan.breachProbability)}
								</span>{" "}
								breach risk; 90% headroom band{" "}
								<span className="font-medium text-foreground">
									{formatBn(fiscalRuleFan.headroomBand.p5)}
								</span>{" "}
								to{" "}
								<span className="font-medium text-foreground">
									{formatBn(fiscalRuleFan.headroomBand.p95)}
								</span>
								.
							</div>
						)}
						{fiscalRuleUncertaintyDecomposition &&
							fiscalRuleUncertaintyDecomposition.layers.length > 1 && (
								<details className="mt-1.5 rounded-sm border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
									<summary className="cursor-pointer list-none">
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-medium text-foreground">
												Show fiscal uncertainty decomposition
											</span>
											<span className="tabular-nums">
												{fiscalRuleUncertaintyDecomposition.samples} draws
											</span>
										</div>
									</summary>
									<div className="mt-2 mb-1 flex items-baseline justify-between gap-2">
										<span className="font-medium text-foreground">
											Uncertainty decomposition
										</span>
									</div>
									<div className="overflow-x-auto">
										<table className="w-full min-w-[560px] tabular-nums">
											<thead>
												<tr className="text-left">
													<th className="py-1 pr-2 font-medium">Layer</th>
													<th className="py-1 pr-2 font-medium">Breach</th>
													<th className="py-1 pr-2 font-medium">
														p5 headroom
													</th>
													<th className="py-1 pr-2 font-medium">
														p50 headroom
													</th>
													<th className="py-1 font-medium">p5 move</th>
												</tr>
											</thead>
											<tbody>
												{fiscalRuleUncertaintyDecomposition.layers.map(
													(row) => (
														<tr
															key={row.id}
															className="border-t border-border/60"
															title={row.description}
														>
															<td className="py-1 pr-2">
																<span className="font-medium text-foreground">
																	{row.label}
																</span>
															</td>
															<td className="py-1 pr-2">
																<span
																	className={cn(
																		row.breachProbability > 0.25
																			? "text-red-700"
																			: row.breachProbability > 0.1
																				? "text-amber-700"
																				: "text-foreground",
																	)}
																>
																	{formatProbability(
																		row.breachProbability,
																	)}
																</span>
															</td>
															<td className="py-1 pr-2 text-foreground">
																{formatBn(row.headroomBand.p5)}
															</td>
															<td className="py-1 pr-2 text-foreground">
																{formatBn(row.headroomBand.p50)}
															</td>
															<td
																className={cn(
																	"py-1",
																	row.p5DeltaFromPreviousGbp < -250_000_000
																		? "text-red-700"
																		: row.p5DeltaFromPreviousGbp >
																				250_000_000
																			? "text-blue-700"
																			: "text-muted-foreground",
																)}
															>
																{row.id === "central"
																	? "base"
																	: formatBnDelta(
																			row.p5DeltaFromPreviousGbp,
																		)}
															</td>
														</tr>
													),
												)}
											</tbody>
										</table>
									</div>
									<div className="mt-1 leading-snug">
										Negative p5 moves add downside headroom risk; positive
										moves show mitigation from the policy-reaction branch.
									</div>
								</details>
							)}
						{fiscalRuleFan &&
							fiscalRuleFan.policyReactionTriggeredProbability > 0 && (
								<div className="mt-1.5 rounded-sm bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
									Endogenous reaction branch:{" "}
									<span className="font-medium text-foreground">
										{formatProbability(
											fiscalRuleFan.policyReactionTriggeredProbability,
										)}
									</span>{" "}
									of draws trigger offsets
									{topReactionPackage
										? `, most often ${topReactionPackage.label}`
										: ""}
									. Post-reaction breach risk{" "}
									<span
										className={cn(
											"font-medium",
											fiscalRuleFan.postReactionBreachProbability > 0.25
												? "text-red-700"
												: fiscalRuleFan.postReactionBreachProbability > 0.1
													? "text-amber-700"
													: "text-foreground",
										)}
									>
										{formatProbability(
											fiscalRuleFan.postReactionBreachProbability,
										)}
									</span>
									; p95 gross action{" "}
									<span className="font-medium text-foreground">
										{formatBn(fiscalRuleFan.endogenousReactionGrossBand.p95)}
									</span>
									.
								</div>
							)}
						{fiscalRulePriorSensitivity &&
							fiscalRulePriorSensitivity.rows.length > 1 && (
								<details className="mt-1.5 rounded-sm border bg-muted/30 px-2 py-1.5 text-[10px] text-muted-foreground">
									<summary className="cursor-pointer list-none">
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-medium text-foreground">
												Show reaction-prior sensitivity
											</span>
											<span className="tabular-nums">
												{fiscalRulePriorSensitivity.samples} draws each
											</span>
										</div>
									</summary>
									<div className="mt-2 mb-1 flex items-baseline justify-between gap-2">
										<span className="font-medium text-foreground">
											Prior sensitivity
										</span>
									</div>
									<div className="overflow-x-auto">
										<table className="w-full min-w-[520px] tabular-nums">
											<thead>
												<tr className="text-left">
													<th className="py-1 pr-2 font-medium">Prior</th>
													<th className="py-1 pr-2 font-medium">
														Dominant offset
													</th>
													<th className="py-1 pr-2 font-medium">Trigger</th>
													<th className="py-1 pr-2 font-medium">
														Post-breach
													</th>
													<th className="py-1 font-medium">p95 action</th>
												</tr>
											</thead>
											<tbody>
												{fiscalRulePriorSensitivity.rows.map((row) => (
													<tr key={row.id} className="border-t border-border/60">
														<td className="py-1 pr-2">
															<span className="font-medium text-foreground">
																{row.label}
															</span>
														</td>
														<td className="py-1 pr-2">
															{row.dominantPackage ? (
																<>
																	<span className="text-foreground">
																		{row.dominantPackage.label}
																	</span>{" "}
																	{formatProbability(
																		row.dominantPackage.probability,
																	)}
																</>
															) : (
																"none"
															)}
														</td>
														<td className="py-1 pr-2">
															{formatProbability(
																row.fan
																	.policyReactionTriggeredProbability,
															)}
														</td>
														<td className="py-1 pr-2">
															<span
																className={cn(
																	row.fan
																		.postReactionBreachProbability >
																		0.25
																		? "text-red-700"
																		: row.fan
																				.postReactionBreachProbability >
																				0.1
																			? "text-amber-700"
																			: "text-foreground",
																)}
															>
																{formatProbability(
																	row.fan
																		.postReactionBreachProbability,
																)}
															</span>
															{row.id !== "neutral" && (
																<span className="text-muted-foreground">
																	{" "}
																	(
																	{formatProbabilityDelta(
																		row.postReactionBreachDeltaFromNeutral,
																	)}
																	)
																</span>
															)}
														</td>
														<td className="py-1">
															<span className="text-foreground">
																{formatBn(
																	row.fan
																		.endogenousReactionGrossBand.p95,
																)}
															</span>
															{row.id !== "neutral" && (
																<span className="text-muted-foreground">
																	{" "}
																	(
																	{formatBnDelta(
																		row.p95GrossActionDeltaFromNeutral,
																	)}
																	)
																</span>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<div className="mt-1 leading-snug">
										Priors change the reaction branch, not the raw
										pre-reaction fiscal-risk fan.
									</div>
								</details>
							)}
					</div>
				)}

				<div className="border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
						Fiscal reaction risk
					</div>
					<div className="flex items-baseline justify-between gap-2 text-sm">
						<span
							className={cn(
								"font-semibold uppercase tracking-wide text-[11px]",
								diagnostics.riskRating === "breach"
									? "text-red-700"
									: diagnostics.riskRating === "tight"
										? "text-amber-700"
										: diagnostics.riskRating === "watch"
											? "text-yellow-700"
											: "text-blue-700",
							)}
						>
							{diagnostics.riskRating}
						</span>
						<span className="text-[10px] text-muted-foreground tabular-nums">
							Debt proxy {formatSignedPp(diagnostics.debtProxyShiftPpAtHorizon)}
						</span>
					</div>
					{diagnostics.policyReactionGbp > 0 && (
						<div className="text-[10px] text-amber-700 mt-0.5">
							Implied consolidation need:{" "}
							{formatBn(diagnostics.policyReactionGbp)}
						</div>
					)}
					<div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
						{diagnostics.note}
					</div>
					{policyReactionPath.length > 0 && (
						<div className="mt-1.5 rounded-sm bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
							Rule-correction path:{" "}
							<span className="font-medium text-foreground">
								{formatBn(policyReactionPath.at(-1)!.correctionGbp)}
							</span>{" "}
							annual tightening by {policyReactionPath.at(-1)!.fiscalYear},
							leaving PSNB at{" "}
							<span className="font-medium text-foreground">
								{formatBn(policyReactionPath.at(-1)!.correctedPsnb)}
							</span>
							.
						</div>
					)}
					{policyReactionOptions.length > 0 && (
						<details className="mt-2 rounded-sm border bg-muted/30 p-2 text-[10px] text-muted-foreground">
							<summary className="cursor-pointer list-none">
								<div className="flex items-baseline justify-between gap-2">
									<span className="font-medium text-foreground">
										Show reaction package options
									</span>
									<span className="tabular-nums">
										{policyReactionOptions.length} options
									</span>
								</div>
							</summary>
							<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
								{policyReactionOptions.map((option) => (
									<div
										key={option.id}
										className="rounded-sm border bg-background/70 px-2 py-1.5 text-[10px]"
									>
										<div className="flex items-baseline justify-between gap-2">
											<span className="font-medium text-foreground">
												{option.label}
											</span>
											<span className="tabular-nums text-muted-foreground">
												{Math.round(option.taxShare * 100)}/
												{Math.round(option.spendingShare * 100)}
											</span>
										</div>
										<div className="mt-1 grid grid-cols-3 gap-1 tabular-nums text-muted-foreground">
											<div>
												<div className="uppercase tracking-wider">Action</div>
												<div className="font-medium text-foreground">
													{formatBn(option.annualGrossTighteningGbp)}
												</div>
											</div>
											<div>
												<div className="uppercase tracking-wider">GDP drag</div>
												<div className="font-medium text-foreground">
													{formatBn(option.horizonGdpDragGbp)}
												</div>
											</div>
											<div>
												<div className="uppercase tracking-wider">Debt</div>
												<div className="font-medium text-foreground">
													{formatPct(option.debtGdpAtHorizon)}
												</div>
											</div>
										</div>
										<div className="mt-1 text-muted-foreground leading-snug">
											<span className="font-medium text-foreground">
												Package:{" "}
											</span>
											{policyReactionPackageSummary(option.package)}
										</div>
										{option.package.residualGapGbp > 250_000_000 && (
											<div className="mt-1 text-red-700 leading-snug">
												Residual gap after plausible caps:{" "}
												{formatBn(option.package.residualGapGbp)}
											</div>
										)}
										<div className="mt-1 text-muted-foreground leading-snug">
											<span className="font-medium text-foreground">
												Who pays:{" "}
											</span>
											D1{" "}
											{formatHouseholdGbp(
												option.package.incidence.bottomDecile
													.perHouseholdGbp,
											)}{" "}
											· D5{" "}
											{formatHouseholdGbp(
												option.package.incidence.middleDecile
													.perHouseholdGbp,
											)}{" "}
											· D10{" "}
											{formatHouseholdGbp(
												option.package.incidence.topDecile
													.perHouseholdGbp,
											)}
											{" · "}
											{option.package.incidence.progressivity}
										</div>
										{option.package.incidence.hardestHitHousehold && (
											<div className="mt-1 text-muted-foreground leading-snug">
												Hardest archetype:{" "}
												<span className="font-medium text-foreground">
													{
														option.package.incidence
															.hardestHitHousehold.label
													}
												</span>{" "}
												{formatHouseholdGbp(
													option.package.incidence
														.hardestHitHousehold.impactGbp,
												)}{" "}
												(
												{formatImpactPct(
													option.package.incidence
														.hardestHitHousehold.incomeShare,
												)}
												)
											</div>
										)}
										<div className="mt-1 text-muted-foreground leading-snug">
											{option.description}
										</div>
									</div>
								))}
							</div>
						</details>
					)}
				</div>
			</div>

			{meaningfulShift && (
				<details className="text-[11px]">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
						Show year-by-year path
					</summary>
					<div className="mt-2 rounded-md border bg-background/60 overflow-hidden">
						<table className="w-full tabular-nums text-[10px]">
							<thead>
								<tr className="bg-muted/30 text-muted-foreground">
									<th className="text-left px-2 py-1">Year</th>
									<th className="text-right px-2 py-1">Baseline PSNB</th>
									<th className="text-right px-2 py-1">Adjusted</th>
									<th className="text-right px-2 py-1">Shift</th>
								</tr>
							</thead>
							<tbody>
								{years.map((y) => (
									<tr key={y.year} className="border-t">
										<td className="px-2 py-1">{y.fiscalYear}</td>
										<td className="text-right px-2 py-1 text-muted-foreground">
											{formatBn(y.baselinePsnb)}
										</td>
										<td className="text-right px-2 py-1 font-medium">
											{formatBn(y.adjustedPsnb)}
										</td>
										<td
											className={cn(
												"text-right px-2 py-1",
												y.psnbShift > 0
													? "text-blue-700"
													: y.psnbShift < 0
														? "text-amber-700"
														: "text-muted-foreground",
											)}
										>
											{y.psnbShift > 0 ? "−" : y.psnbShift < 0 ? "+" : ""}
											{formatBn(Math.abs(y.psnbShift))}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</details>
			)}

			<p className="text-[10px] text-muted-foreground leading-snug">
				Baseline figures from{" "}
				<a
					href={baseline.source.url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-blue-600 hover:underline"
				>
					{baseline.source.label}
				</a>
				. Scenario shifts are applied on top of the baseline, which already
				includes announced policy. Encoding a scenario that replays a budget
				already in the baseline would double-count.
			</p>
		</div>
	);
}

function FiscalCounterfactualChart({
	comparison,
	fiscalRuleFan,
	fiscalRuleUncertaintyDecomposition,
}: {
	comparison: BaselineComparison;
	fiscalRuleFan?: FiscalRuleFan;
	fiscalRuleUncertaintyDecomposition?: FiscalRuleUncertaintyDecomposition;
}) {
	const { years, policyReactionPath } = comparison;
	if (years.length === 0) return null;

	const finalYear = years[years.length - 1]!;
	const scenarioImprovesPsnb =
		finalYear.adjustedPsnb <= finalYear.baselinePsnb;
	const scenarioColour = scenarioImprovesPsnb ? "#2563eb" : "#d97706";
	const reactionByYear = new Map(
		policyReactionPath.map((year) => [year.fiscalYear, year]),
	);
	const hasReactionPath = policyReactionPath.length > 0;
	const hasPostReactionFan =
		!!fiscalRuleFan &&
		fiscalRuleFan.policyReactionTriggeredProbability > 0 &&
		fiscalRuleFan.pathBands.length === years.length;
	const ruleYear = comparison.ruleYear ?? years.at(-1)!;
	const ruleFiscalYear = ruleYear.fiscalYear;
	const rulePsnbDelta = ruleYear.adjustedPsnb - ruleYear.baselinePsnb;
	const ruleDebtDelta = ruleYear.adjustedDebtGdp - ruleYear.baselineDebtGdp;
	const psnbRuleTone =
		rulePsnbDelta < 0 ? "blue" : rulePsnbDelta > 0 ? "amber" : "muted";
	const debtRuleTone =
		ruleDebtDelta < 0 ? "blue" : ruleDebtDelta > 0 ? "amber" : "muted";
	const psnbSeries = [
		{
			label: "current-policy baseline",
			values: years.map((year) => year.baselinePsnb),
			color: "#6b7280",
		},
		{
			label: "policy scenario",
			values: years.map((year) => year.adjustedPsnb),
			color: scenarioColour,
		},
		...(hasReactionPath
			? [
					{
						label: "after modelled reaction",
						values: years.map(
							(year) =>
								reactionByYear.get(year.fiscalYear)?.correctedPsnb ??
								year.adjustedPsnb,
						),
						color: "#dc2626",
						dashed: true,
					},
				]
			: []),
	];
	const debtSeries = [
		{
			label: "OBR baseline debt:GDP",
			values: years.map((year) => year.baselineDebtGdp),
			color: "#6b7280",
		},
		{
			label: "policy scenario debt:GDP",
			values: years.map((year) => year.adjustedDebtGdp),
			color: scenarioColour,
		},
		...(hasReactionPath
			? [
					{
						label: "after modelled reaction",
						values: years.map(
							(year) =>
								reactionByYear.get(year.fiscalYear)?.correctedDebtGdp ??
								year.adjustedDebtGdp,
						),
						color: "#dc2626",
						dashed: true,
					},
				]
			: []),
	];

	return (
		<div className="rounded-md border bg-background/70 p-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Fiscal counterfactual paths
					</div>
					<p className="mt-1 text-xs leading-snug text-muted-foreground">
						Baseline is the OBR current-policy path; scenario lines show the
						counterfactual after applying the chosen policy package.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
					<ChartLegendItem color="#6b7280" label="current-policy baseline" />
					<ChartLegendItem color={scenarioColour} label="policy scenario" />
					<ChartLegendItem
						color={scenarioColour}
						label="scenario-vs-baseline gap"
						filled
					/>
					{hasReactionPath && (
						<ChartLegendItem
							color="#dc2626"
							label="after modelled reaction"
							dashed
						/>
					)}
					{fiscalRuleFan && (
						<ChartLegendItem
							color={scenarioColour}
							label="90% pre-reaction fan"
							filled
						/>
					)}
					{hasPostReactionFan && (
						<ChartLegendItem
							color="#dc2626"
							label="90% post-reaction fan"
							filled
						/>
					)}
					<span className="inline-flex items-center gap-1">
						<span className="h-3 border-l border-dashed border-foreground/50" />
						rule year
					</span>
				</div>
			</div>
			<div className="mt-3 grid gap-3 lg:grid-cols-2">
				<CounterfactualPathChart
					title="PSNB path"
					subtitle="Lower line means less borrowing."
					ariaLabel="PSNB baseline and scenario counterfactual path"
					years={years.map((year) => year.fiscalYear)}
					ruleFiscalYear={ruleFiscalYear}
					series={psnbSeries}
					gapColor={scenarioColour}
					fanBand={fiscalRuleFan?.pathBands.map((year) => year.psnbBand)}
					postReactionFanBand={
						hasPostReactionFan
							? fiscalRuleFan?.pathBands.map(
									(year) => year.postReactionPsnbBand,
								)
							: undefined
					}
					fanColor={scenarioColour}
					formatValue={formatAxisBn}
					formatDeltaValue={formatBnDelta}
					ruleCallout={{
						label: `${ruleFiscalYear} PSNB delta`,
						value: formatBnDelta(rulePsnbDelta),
						detail: `${formatBn(ruleYear.baselinePsnb)} baseline -> ${formatBn(
							ruleYear.adjustedPsnb,
						)} scenario`,
						tone: psnbRuleTone,
					}}
				/>
				<CounterfactualPathChart
					title="Debt:GDP path"
					subtitle="Scenario debt stock relative to the OBR path."
					ariaLabel="Debt to GDP baseline and scenario counterfactual path"
					years={years.map((year) => year.fiscalYear)}
					ruleFiscalYear={ruleFiscalYear}
					series={debtSeries}
					gapColor={scenarioColour}
					fanBand={fiscalRuleFan?.pathBands.map((year) => year.debtGdpBand)}
					postReactionFanBand={
						hasPostReactionFan
							? fiscalRuleFan?.pathBands.map(
									(year) => year.postReactionDebtGdpBand,
								)
							: undefined
					}
					fanColor={scenarioColour}
					formatValue={formatPct}
					formatDeltaValue={formatSignedPp}
					ruleCallout={{
						label: `${ruleFiscalYear} debt:GDP delta`,
						value: formatSignedPp(ruleDebtDelta),
						detail: `${formatPct(ruleYear.baselineDebtGdp)} baseline -> ${formatPct(
							ruleYear.adjustedDebtGdp,
						)} scenario`,
						tone: debtRuleTone,
					}}
				/>
			</div>
			{fiscalRuleUncertaintyDecomposition && (
				<RuleYearUncertaintyLayers
					decomposition={fiscalRuleUncertaintyDecomposition}
				/>
			)}
		</div>
	);
}

function ChartLegendItem({
	color,
	label,
	dashed = false,
	filled = false,
}: {
	color: string;
	label: string;
	dashed?: boolean;
	filled?: boolean;
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<span
				className={cn(
					"inline-block w-4",
					filled ? "h-2 rounded-sm border" : "h-0 border-t-2",
				)}
				style={{
					backgroundColor: filled ? color : undefined,
					borderColor: color,
					borderTopStyle: dashed ? "dashed" : "solid",
					opacity: filled ? 0.18 : 1,
				}}
			/>
			{label}
		</span>
	);
}

type CounterfactualPathSeries = {
	label: string;
	values: readonly number[];
	color: string;
	dashed?: boolean;
};

type CounterfactualPathBand = {
	p5: number;
	p25: number;
	p50: number;
	p75: number;
	p95: number;
};

type CounterfactualRuleCallout = {
	label: string;
	value: string;
	detail: string;
	tone: "blue" | "amber" | "red" | "muted";
};

function CounterfactualPathChart({
	title,
	subtitle,
	ariaLabel,
	years,
	ruleFiscalYear,
	series,
	gapColor,
	fanBand,
	postReactionFanBand,
	fanColor,
	formatValue,
	formatDeltaValue,
	ruleCallout,
}: {
	title: string;
	subtitle: string;
	ariaLabel: string;
	years: readonly string[];
	ruleFiscalYear: string;
	series: readonly CounterfactualPathSeries[];
	gapColor: string;
	fanBand?: readonly CounterfactualPathBand[];
	postReactionFanBand?: readonly CounterfactualPathBand[];
	fanColor: string;
	formatValue: (value: number) => string;
	formatDeltaValue: (value: number) => string;
	ruleCallout: CounterfactualRuleCallout;
}) {
	if (years.length === 0 || series.length === 0) return null;

	const width = 320;
	const height = 120;
	const padX = 12;
	const padY = 10;
	const innerWidth = width - padX * 2;
	const innerHeight = height - padY * 2;
	const bandValues = [...(fanBand ?? []), ...(postReactionFanBand ?? [])]
		.flatMap((band) => [band.p5, band.p25, band.p50, band.p75, band.p95]);
	const allValues = [
		...series.flatMap((item) => [...item.values]),
		...bandValues,
	];
	const rawMin = Math.min(...allValues);
	const rawMax = Math.max(...allValues);
	const rawRange = rawMax - rawMin;
	const padding = rawRange > 0 ? rawRange * 0.16 : Math.max(Math.abs(rawMax), 1) * 0.08;
	const min = rawMin - padding;
	const max = rawMax + padding;
	const range = max - min || 1;
	const xAt = (index: number): number =>
		padX + (innerWidth * index) / Math.max(1, years.length - 1);
	const yAt = (value: number): number =>
		padY + innerHeight - ((value - min) / range) * innerHeight;
	const pointsFor = (values: readonly number[]): string =>
		values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
	const reversePointsFor = (values: readonly number[]): string =>
		values
			.map((value, index) => ({ value, index }))
			.reverse()
			.map(({ value, index }) => `${xAt(index)},${yAt(value)}`)
			.join(" ");
	const linePath = (values: readonly number[]): string =>
		values
			.map(
				(value, index) =>
					`${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`,
			)
			.join(" ");
	const bandPolygon = (
		band: readonly CounterfactualPathBand[] | undefined,
		high: keyof CounterfactualPathBand,
		low: keyof CounterfactualPathBand,
	): string =>
		band && band.length === years.length
			? `${pointsFor(band.map((year) => year[high]))} ${reversePointsFor(
					band.map((year) => year[low]),
				)}`
			: "";
	const baselineValues = series[0]?.values ?? [];
	const scenarioValues = series[1]?.values ?? [];
	const gapPolygon =
		baselineValues.length === scenarioValues.length
			? `${pointsFor(baselineValues)} ${reversePointsFor(scenarioValues)}`
			: "";
	const fan90Polygon = bandPolygon(fanBand, "p95", "p5");
	const fan50Polygon = bandPolygon(fanBand, "p75", "p25");
	const postReactionFan90Polygon = bandPolygon(
		postReactionFanBand,
		"p95",
		"p5",
	);
	const ruleIndex = years.findIndex((year) => year === ruleFiscalYear);
	const ruleBaselineValue =
		ruleIndex >= 0 ? baselineValues[ruleIndex] : undefined;
	const ruleScenarioValue =
		ruleIndex >= 0 ? scenarioValues[ruleIndex] : undefined;
	const showRuleDeltaSegment =
		ruleBaselineValue !== undefined && ruleScenarioValue !== undefined;
	const tooltipFor = (
		item: CounterfactualPathSeries,
		value: number,
		index: number,
	): string => {
		const baselineValue = baselineValues[index];
		const delta =
			item === series[0] || baselineValue === undefined
				? ""
				: ` (${formatDeltaValue(value - baselineValue)} vs baseline)`;
		return `${item.label} · ${years[index]}: ${formatValue(value)}${delta}`;
	};

	const { year: focusedYear, setYear, clear } = useYearFocus();
	const svgRef = useRef<SVGSVGElement | null>(null);
	const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const next = pointerToYearIndex({
			clientX: event.clientX,
			rect: svg.getBoundingClientRect(),
			years: years.length,
			padX,
			innerWidth,
			viewBoxWidth: width,
		});
		if (next !== null) setYear(next);
	};
	const focusedIndex =
		focusedYear !== null && focusedYear >= 1 && focusedYear <= years.length
			? focusedYear - 1
			: null;
	const focusedFiscalYear =
		focusedIndex !== null ? years[focusedIndex] ?? null : null;
	const focusedBaseline =
		focusedIndex !== null ? baselineValues[focusedIndex] ?? null : null;
	const focusedScenario =
		focusedIndex !== null ? scenarioValues[focusedIndex] ?? null : null;
	const focusedDelta =
		focusedBaseline !== null && focusedScenario !== null
			? focusedScenario - focusedBaseline
			: null;

	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="flex items-start justify-between gap-2">
				<div>
					<div className="text-xs font-medium">{title}</div>
					<div className="text-[10px] text-muted-foreground">
						{subtitle}
					</div>
				</div>
				<div className="text-right text-[10px] tabular-nums text-muted-foreground">
					<div>{formatValue(rawMax)}</div>
					<div>{formatValue(rawMin)}</div>
				</div>
			</div>
			<div
				className="mt-2 flex flex-col gap-1 rounded-sm border bg-background/70 px-2 py-1.5 sm:flex-row sm:items-baseline sm:justify-between"
				aria-label={`${ruleCallout.label}: ${ruleCallout.value} versus baseline`}
			>
				<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
					{ruleCallout.label}
				</span>
				<span
					className={cn(
						"text-xs font-semibold tabular-nums",
						metricToneClassName(ruleCallout.tone),
					)}
				>
					{ruleCallout.value}
				</span>
				<span className="text-[10px] tabular-nums text-muted-foreground sm:text-right">
					{ruleCallout.detail}
				</span>
			</div>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				className="mt-2 h-36 w-full touch-none"
				preserveAspectRatio="none"
				role="img"
				aria-label={ariaLabel}
				onPointerMove={handlePointerMove}
				onPointerLeave={clear}
				onPointerDown={handlePointerMove}
			>
				<line
					x1={padX}
					x2={width - padX}
					y1={yAt(rawMax)}
					y2={yAt(rawMax)}
					stroke="currentColor"
					strokeWidth="0.6"
					vectorEffect="non-scaling-stroke"
					className="text-border"
				/>
				<line
					x1={padX}
					x2={width - padX}
					y1={yAt(rawMin)}
					y2={yAt(rawMin)}
					stroke="currentColor"
					strokeWidth="0.6"
					vectorEffect="non-scaling-stroke"
					className="text-border"
				/>
				{gapPolygon && (
					<polygon points={gapPolygon} fill={gapColor} opacity="0.1">
						<title>Scenario-vs-baseline gap</title>
					</polygon>
				)}
				{fan90Polygon && (
					<polygon points={fan90Polygon} fill={fanColor} opacity="0.08">
						<title>90% pre-reaction fan</title>
					</polygon>
				)}
				{fan50Polygon && (
					<polygon points={fan50Polygon} fill={fanColor} opacity="0.14">
						<title>50% pre-reaction fan</title>
					</polygon>
				)}
				{postReactionFan90Polygon && (
					<polygon
						points={postReactionFan90Polygon}
						fill="#dc2626"
						opacity="0.08"
					>
						<title>90% post-reaction fan</title>
					</polygon>
				)}
				{ruleIndex >= 0 && (
					<line
						x1={xAt(ruleIndex)}
						x2={xAt(ruleIndex)}
						y1={padY}
						y2={height - padY}
						stroke="currentColor"
						strokeDasharray="4 3"
						strokeWidth="0.8"
						vectorEffect="non-scaling-stroke"
						className="text-foreground/50"
					/>
				)}
				{showRuleDeltaSegment && (
					<line
						x1={xAt(ruleIndex)}
						x2={xAt(ruleIndex)}
						y1={yAt(ruleBaselineValue)}
						y2={yAt(ruleScenarioValue)}
						stroke={gapColor}
						strokeWidth="2.4"
						vectorEffect="non-scaling-stroke"
						strokeLinecap="round"
						opacity="0.8"
					>
						<title>{`${ruleFiscalYear} scenario delta: ${formatDeltaValue(
							ruleScenarioValue - ruleBaselineValue,
						)} vs baseline`}</title>
					</line>
				)}
				{series.map((item) => (
					<path
						key={item.label}
						d={linePath(item.values)}
						fill="none"
						stroke={item.color}
						strokeWidth={item.label.includes("baseline") ? 1.4 : 2}
						strokeDasharray={item.dashed ? "5 3" : undefined}
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				))}
				{series.flatMap((item) =>
					item.values.map((value, index) => {
						const isFocused = focusedIndex === index;
						return (
							<circle
								key={`${item.label}-${years[index]}`}
								cx={xAt(index)}
								cy={yAt(value)}
								r={isFocused ? 3 : 2}
								fill={item.color}
								stroke={isFocused ? "white" : undefined}
								strokeWidth={isFocused ? 0.8 : 0}
								vectorEffect="non-scaling-stroke"
							>
								<title>{tooltipFor(item, value, index)}</title>
							</circle>
						);
					}),
				)}
				{focusedIndex !== null && (
					<line
						x1={xAt(focusedIndex)}
						x2={xAt(focusedIndex)}
						y1={padY}
						y2={height - padY}
						stroke="currentColor"
						strokeWidth="0.8"
						strokeDasharray="2 2"
						vectorEffect="non-scaling-stroke"
						className="text-foreground/70 pointer-events-none"
					/>
				)}
			</svg>
			{focusedFiscalYear && (
				<div
					className="mt-1 flex flex-wrap items-baseline justify-between gap-2 rounded-sm border bg-background/60 px-2 py-1 text-[10px]"
					aria-live="polite"
				>
					<span className="text-[9px] uppercase tracking-wider text-muted-foreground">
						{focusedFiscalYear}
					</span>
					<span className="tabular-nums">
						<span className="text-muted-foreground">baseline </span>
						<span className="font-medium text-foreground">
							{focusedBaseline !== null ? formatValue(focusedBaseline) : "—"}
						</span>
						<span className="text-muted-foreground"> · scenario </span>
						<span className="font-medium text-foreground">
							{focusedScenario !== null ? formatValue(focusedScenario) : "—"}
						</span>
					</span>
					{focusedDelta !== null && (
						<span
							className={cn(
								"tabular-nums font-medium",
								focusedDelta < 0
									? "text-blue-700"
									: focusedDelta > 0
										? "text-amber-700"
										: "text-muted-foreground",
							)}
						>
							{formatDeltaValue(focusedDelta)}
						</span>
					)}
				</div>
			)}
			<div
				className="mt-1 grid gap-1 text-[9px] tabular-nums text-muted-foreground"
				style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))` }}
			>
				{years.map((year, index) => {
					const isFocused = focusedIndex === index;
					return (
						<span
							key={year}
							className={cn(
								"min-w-0 truncate",
								index === 0
									? "text-left"
									: index === years.length - 1
										? "text-right"
										: "text-center",
								year === ruleFiscalYear && "font-medium text-foreground",
								isFocused && "font-semibold text-foreground",
							)}
							title={year === ruleFiscalYear ? `${year} rule year` : year}
						>
							{year}
						</span>
					);
				})}
			</div>
			<CounterfactualEndpointLabels
				title={title}
				years={years}
				series={series}
				baselineValues={baselineValues}
				formatValue={formatValue}
				formatDeltaValue={formatDeltaValue}
			/>
		</div>
	);
}

function CounterfactualEndpointLabels({
	title,
	years,
	series,
	baselineValues,
	formatValue,
	formatDeltaValue,
}: {
	title: string;
	years: readonly string[];
	series: readonly CounterfactualPathSeries[];
	baselineValues: readonly number[];
	formatValue: (value: number) => string;
	formatDeltaValue: (value: number) => string;
}) {
	const finalYear = years.at(-1);
	const baselineFinalValue = baselineValues.at(-1);
	if (!finalYear || baselineFinalValue === undefined) return null;

	return (
		<div
			className="mt-2 grid gap-1 text-[10px]"
			aria-label={`${title} counterfactual endpoint labels for ${finalYear}`}
		>
			{series.map((item) => {
				const finalValue = item.values.at(-1);
				if (finalValue === undefined) return null;
				const isBaseline = item.values === baselineValues;
				const delta = isBaseline ? 0 : finalValue - baselineFinalValue;
				return (
					<div
						key={`${item.label}-endpoint`}
						className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2"
					>
						<div className="min-w-0">
							<span
								className="mr-1 inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: item.color }}
								aria-hidden="true"
							/>
							<span className="truncate text-muted-foreground">
								{item.label}
							</span>
						</div>
						<div className="text-right tabular-nums">
							<span className="font-medium text-foreground">
								{formatValue(finalValue)}
							</span>
							{!isBaseline && (
								<span className="ml-1 text-muted-foreground">
									{formatDeltaValue(delta)} vs baseline
								</span>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function RuleYearUncertaintyLayers({
	decomposition,
}: {
	decomposition: FiscalRuleUncertaintyDecomposition;
}) {
	if (decomposition.layers.length === 0) return null;

	const values = decomposition.layers.flatMap((layer) => [
		layer.headroomBand.p5,
		layer.headroomBand.p50,
		layer.headroomBand.p95,
		0,
	]);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const xPct = (value: number): number => ((value - min) / range) * 100;
	const zeroPct = xPct(0);

	return (
		<div className="mt-3 rounded-sm border bg-muted/20 p-2">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<div>
					<div className="text-xs font-medium">
						Rule-year uncertainty layers
					</div>
					<p className="text-[10px] leading-snug text-muted-foreground">
						Sequential headroom bands: central estimate, baseline forecast
						error, macro shocks, borrowing-regime tails, and post-reaction
						outcomes.
					</p>
				</div>
				<div className="text-[10px] tabular-nums text-muted-foreground">
					{decomposition.samples} draws
				</div>
			</div>
			<div
				className="mt-2 space-y-2"
				aria-label="Rule-year uncertainty layers by fiscal headroom"
			>
				{decomposition.layers.map((layer) => {
					const left = xPct(layer.headroomBand.p5);
					const right = xPct(layer.headroomBand.p95);
					const median = xPct(layer.headroomBand.p50);
					const tone =
						layer.id === "policy-reaction"
							? "bg-blue-500"
							: layer.id === "borrowing-regime"
								? "bg-red-500"
								: layer.id === "macro-shocks"
									? "bg-amber-500"
									: layer.id === "baseline-forecast-error"
										? "bg-slate-500"
										: "bg-muted-foreground";
					return (
						<div
							key={layer.id}
							className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)_80px] sm:items-center"
							title={layer.description}
						>
							<div className="flex items-baseline justify-between gap-2 sm:block">
								<div className="truncate text-[10px] font-medium text-foreground">
									{layer.label}
								</div>
								<div className="text-[9px] tabular-nums text-muted-foreground sm:hidden">
									{formatProbability(layer.breachProbability)}
								</div>
							</div>
							<div className="relative h-4 rounded-sm bg-background/80">
								<div
									className="absolute inset-y-0 border-l border-dashed border-foreground/40"
									style={{ left: formatStylePct(zeroPct) }}
									aria-hidden="true"
								/>
								<div
									className={cn("absolute top-1 h-2 rounded-full", tone)}
									style={{
										left: formatStylePct(left),
										width: formatStylePct(Math.max(1, right - left)),
										opacity: 0.18,
									}}
								/>
								<div
									className={cn(
										"absolute top-0.5 h-3 w-1 -translate-x-1/2 rounded-full",
										tone,
									)}
									style={{ left: formatStylePct(median) }}
								/>
							</div>
							<div className="hidden text-right text-[10px] tabular-nums text-muted-foreground sm:block">
								{formatProbability(layer.breachProbability)} breach
							</div>
						</div>
					);
				})}
			</div>
			<div className="mt-2 flex justify-between text-[9px] tabular-nums text-muted-foreground">
				<span>{formatBn(min)} headroom</span>
				<span>£0 rule line</span>
				<span>{formatBn(max)} headroom</span>
			</div>
		</div>
	);
}

function ExecutiveMetric({
	label,
	value,
	detail,
	tone,
}: {
	label: string;
	value: string;
	detail: string;
	tone: "blue" | "amber" | "red" | "muted";
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="text-[9px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 text-sm font-semibold tabular-nums",
					metricToneClassName(tone),
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
				{detail}
			</div>
		</div>
	);
}

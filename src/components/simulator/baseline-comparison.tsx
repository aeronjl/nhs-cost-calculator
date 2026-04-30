"use client";

import { cn } from "@/lib/utils";
import type {
	BaselineComparison,
	FiscalRuleFan,
	FiscalRulePriorSensitivity,
	FiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import { policyReactionPackageSummary } from "@/lib/policy-reaction-packages";

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
								<div className="mt-1.5 rounded-sm bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">
									<div className="mb-1 flex items-baseline justify-between gap-2">
										<span className="font-medium text-foreground">
											Uncertainty decomposition
										</span>
										<span className="tabular-nums">
											{fiscalRuleUncertaintyDecomposition.samples} draws
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
								</div>
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
								<div className="mt-1.5 rounded-sm bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">
									<div className="mb-1 flex items-baseline justify-between gap-2">
										<span className="font-medium text-foreground">
											Prior sensitivity
										</span>
										<span className="tabular-nums">
											{fiscalRulePriorSensitivity.samples} draws each
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
								</div>
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
						<div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
							{policyReactionOptions.map((option) => (
								<div
									key={option.id}
									className="rounded-sm border bg-muted/30 px-2 py-1.5 text-[10px]"
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

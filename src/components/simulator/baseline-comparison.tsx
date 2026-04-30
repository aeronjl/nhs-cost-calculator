"use client";

import { cn } from "@/lib/utils";
import type {
	BaselineComparison,
	FiscalRuleFan,
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
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n >= 0 ? "" : "−";
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

export function BaselineComparisonPanel({ comparison, fiscalRuleFan }: Props) {
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

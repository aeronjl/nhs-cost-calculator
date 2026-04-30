"use client";

import { useMemo, useState } from "react";
import {
	Check,
	CheckCircle2,
	CircleSlash,
	Download,
	FileJson,
	FileText,
	Link as LinkIcon,
	TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	buildModelAuditJsonExport,
	buildModelAuditMarkdownAppendix,
	type ModelAuditEvidencePack,
} from "@/lib/model-audit";
import { cn } from "@/lib/utils";

interface Props {
	audit: ModelAuditEvidencePack;
}

type ChecklistStatus = "present" | "missing" | "not-applicable";

interface ChecklistItem {
	label: string;
	detail: string;
	status: ChecklistStatus;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "" : n < 0 ? "−" : "";
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

const formatProbability = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n * 100)}%`;

const formatPct = (n: number): string => `${n.toFixed(1)}%`;

const formatSignedPp = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

const formatBp = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n)}bp`;

const exportFilename = (kind: "md" | "json", generatedAt: string): string =>
	`model-audit-${generatedAt.slice(0, 10)}.${kind}`;

const hasBacktestCoverage = (audit: ModelAuditEvidencePack): boolean =>
	Boolean(
		audit.backtests.borrowingCentralFit &&
			audit.backtests.borrowingOverlayFit &&
			audit.backtests.borrowingRegimeClassifierFit &&
			audit.backtests.fiscalReactionPriorFit,
	);

const buildQualityChecklist = (
	audit: ModelAuditEvidencePack,
): readonly ChecklistItem[] => {
	const hasBorrowing = audit.scenario.borrowingAmountGbp > 0;
	return [
		{
			label: "Scenario summary",
			detail: `${audit.scenario.lineCount} modelled line${audit.scenario.lineCount === 1 ? "" : "s"}`,
			status: audit.scenario.lineCount > 0 ? "present" : "missing",
		},
		{
			label: "Baseline & fiscal rule",
			detail: audit.baselineComparison
				? `${audit.baselineComparison.years.length} years; ${audit.baselineComparison.rule.riskRating} risk`
				: "No baseline comparison",
			status: audit.baselineComparison ? "present" : "missing",
		},
		{
			label: "Provenance ledger",
			detail: `${audit.provenanceLedger.sourceLinkedRows}/${audit.provenanceLedger.rows.length} source-linked`,
			status:
				audit.provenanceLedger.rows.length > 0 &&
				audit.provenanceLedger.sourceLinkedRows > 0
					? "present"
					: "missing",
		},
		{
			label: "Macro stress lab",
			detail: audit.macroStressLab
				? `${audit.macroStressLab.parameters.length} sensitivities`
				: "No stress grid",
			status: audit.macroStressLab ? "present" : "missing",
		},
		{
			label: "Borrowing matrix",
			detail: hasBorrowing
				? `${audit.borrowingScenarioComparison?.rows.length ?? 0} variants`
				: "No positive borrowing line",
			status: hasBorrowing
				? audit.borrowingScenarioComparison
					? "present"
					: "missing"
				: "not-applicable",
		},
		{
			label: "Borrowing regime",
			detail: hasBorrowing
				? audit.liveRisk.borrowingRegimeLabel ?? "No regime estimate"
				: "No positive borrowing line",
			status: hasBorrowing
				? audit.liveRisk.regimeProbabilities.length > 0
					? "present"
					: "missing"
				: "not-applicable",
		},
		{
			label: "Fiscal-rule risk",
			detail:
				audit.liveRisk.breachProbability === null
					? "No fan available"
					: `${formatProbability(audit.liveRisk.breachProbability)} raw breach`,
			status:
				audit.liveRisk.breachProbability === null ? "missing" : "present",
		},
		{
			label: "Prior sensitivity",
			detail:
				audit.liveRisk.priorSensitivityRows.length > 0
					? `${audit.liveRisk.priorSensitivityRows.length} prior cases`
					: "No reaction trigger",
			status:
				audit.liveRisk.priorSensitivityRows.length > 0
					? "present"
					: "not-applicable",
		},
		{
			label: "Uncertainty layers",
			detail:
				audit.liveRisk.uncertaintyLayers.length > 0
					? `${audit.liveRisk.uncertaintyLayers.length} layers`
					: "No decomposition",
			status:
				audit.liveRisk.uncertaintyLayers.length > 0 ? "present" : "missing",
		},
		{
			label: "Calibration & backtests",
			detail: `${audit.calibration.length} calibrations; ${audit.backtests.fiscalReactionPriorFit} reaction fit`,
			status:
				audit.calibration.length > 0 && hasBacktestCoverage(audit)
					? "present"
					: "missing",
		},
	];
};

const downloadTextFile = (
	filename: string,
	body: string,
	mimeType: string,
) => {
	const blob = new Blob([body], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function ModelAuditPanel({ audit }: Props) {
	const {
		scenario,
		baselineComparison,
		borrowingScenarioComparison,
		provenanceLedger,
		calibration,
		backtests,
		liveRisk,
		limitations,
	} = audit;
	const [copied, setCopied] = useState(false);
	const generatedAt = useMemo(() => new Date().toISOString(), [audit]);
	const qualityChecklist = useMemo(() => buildQualityChecklist(audit), [audit]);

	const currentShareUrl = () =>
		typeof window === "undefined" ? undefined : window.location.href;

	const downloadAppendix = (kind: "md" | "json") => {
		const shareUrl = currentShareUrl();
		const body =
			kind === "md"
				? buildModelAuditMarkdownAppendix(audit, { generatedAt, shareUrl })
				: buildModelAuditJsonExport(audit, { generatedAt, shareUrl });
		downloadTextFile(
			exportFilename(kind, generatedAt),
			body,
			kind === "md" ? "text/markdown;charset=utf-8" : "application/json",
		);
	};

	const copyShareUrl = async () => {
		const shareUrl = currentShareUrl();
		if (!shareUrl || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Model audit
				</h3>
				<div className="flex flex-wrap items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 px-2 text-[10px]"
						onClick={copyShareUrl}
					>
						{copied ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
						{copied ? "Copied" : "Link"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 px-2 text-[10px]"
						onClick={() => downloadAppendix("md")}
					>
						<FileText aria-hidden="true" />
						MD
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 px-2 text-[10px]"
						onClick={() => downloadAppendix("json")}
					>
						<FileJson aria-hidden="true" />
						JSON
					</Button>
					<span className="inline-flex h-7 items-center gap-1 text-[10px] text-muted-foreground">
						<Download aria-hidden="true" className="size-3" />
						evidence pack
					</span>
				</div>
			</div>

			<ReportQualityChecklist items={qualityChecklist} />

			<div className="rounded-md border bg-background/60 p-3 space-y-3 text-[10px]">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					<Metric label="Scenario lines" value={String(scenario.lineCount)} />
					<Metric
						label="Composition"
						value={`${scenario.taxLineCount}T / ${scenario.programmeLineCount}P / ${scenario.borrowingLineCount}B`}
					/>
					<Metric
						label="Borrowing"
						value={
							scenario.borrowingAmountGbp > 0
								? formatBn(scenario.borrowingAmountGbp)
								: "none"
						}
					/>
					<Metric
						label="Range coverage"
						value={scenario.methodologyRangeCoverage}
					/>
					<Metric label="Baseline" value={`${scenario.baselineAsOf} EFO`} />
					<Metric label="Rule year" value={scenario.stabilityRuleAt} />
					<Metric
						label="Behavioural tax"
						value={String(scenario.behaviouralTaxLines)}
					/>
					<Metric
						label="Overrides"
						value={String(scenario.overriddenLineCount)}
					/>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
					<Metric
						label="Raw breach risk"
						value={formatProbability(liveRisk.breachProbability)}
						strong
					/>
					<Metric
						label="Post-reaction breach"
						value={formatProbability(liveRisk.postReactionBreachProbability)}
						strong
					/>
					<Metric
						label="Top reaction"
						value={liveRisk.topReactionPackageLabel ?? "none"}
						strong
					/>
				</div>

				{baselineComparison && (
					<div className="rounded-sm border bg-muted/20 p-2 space-y-2">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-medium text-foreground">
								Baseline vs scenario
							</span>
							<span
								className={cn(
									"uppercase tracking-wider",
									baselineComparison.rule.riskRating === "breach"
										? "text-red-700"
										: baselineComparison.rule.riskRating === "tight"
											? "text-amber-700"
											: "text-muted-foreground",
								)}
							>
								{baselineComparison.rule.riskRating}
							</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<Metric
								label="Rule headroom"
								value={`${formatBn(
									baselineComparison.rule.baselineHeadroomGbp,
								)} → ${formatBn(
									baselineComparison.rule.adjustedHeadroomGbp,
								)}`}
								strong
							/>
							<Metric
								label="Consolidation"
								value={formatBn(
									baselineComparison.rule.consolidationRequiredGbp,
								)}
								strong
							/>
							<Metric
								label="Debt proxy shift"
								value={formatSignedPp(
									baselineComparison.rule.debtProxyShiftPpAtHorizon,
								)}
								strong
							/>
						</div>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
							<table className="w-full min-w-[680px] tabular-nums">
								<thead className="text-muted-foreground">
									<tr className="text-left">
										<th className="px-2 py-1 font-medium">Year</th>
										<th className="px-2 py-1 font-medium">Baseline PSNB</th>
										<th className="px-2 py-1 font-medium">Scenario shift</th>
										<th className="px-2 py-1 font-medium">Adjusted PSNB</th>
										<th className="px-2 py-1 font-medium">Debt/GDP</th>
										<th className="px-2 py-1 font-medium">Adjusted debt/GDP</th>
									</tr>
								</thead>
								<tbody>
									{baselineComparison.years.map((year) => (
										<tr
											key={year.fiscalYear}
											className="border-t border-border/60"
										>
											<td className="px-2 py-1 font-medium text-foreground">
												{year.fiscalYear}
											</td>
											<td className="px-2 py-1">
												{formatBn(year.baselinePsnbGbp)}
											</td>
											<td
												className={cn(
													"px-2 py-1",
													year.scenarioPsnbShiftGbp > 0
														? "text-blue-700"
														: year.scenarioPsnbShiftGbp < 0
															? "text-amber-700"
															: "text-muted-foreground",
												)}
											>
												{formatBnDelta(year.scenarioPsnbShiftGbp)}
											</td>
											<td className="px-2 py-1">
												{formatBn(year.adjustedPsnbGbp)}
											</td>
											<td className="px-2 py-1">
												{formatPct(year.baselineDebtGdpPct)}
											</td>
											<td className="px-2 py-1">
												{formatPct(year.adjustedDebtGdpPct)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{borrowingScenarioComparison && (
					<div className="rounded-sm border bg-muted/20 p-2 space-y-2">
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
							<span className="font-medium text-foreground">
								Borrowing scenario matrix
							</span>
							<span className="text-muted-foreground tabular-nums">
								{formatBn(borrowingScenarioComparison.amountGbp)} over{" "}
								{borrowingScenarioComparison.years} years
							</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<Metric
								label="Best headroom"
								value={borrowingScenarioComparison.bestHeadroomRowLabel}
							/>
							<Metric
								label="Worst breach"
								value={borrowingScenarioComparison.worstBreachRowLabel}
							/>
							<Metric
								label="Highest interest"
								value={borrowingScenarioComparison.highestInterestRowLabel}
							/>
						</div>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
							<table className="w-full min-w-[980px] tabular-nums">
								<thead className="text-muted-foreground">
									<tr className="text-left">
										<th className="px-2 py-1 font-medium">Variant</th>
										<th className="px-2 py-1 font-medium">Assumptions</th>
										<th className="px-2 py-1 font-medium">Y5 interest</th>
										<th className="px-2 py-1 font-medium">Rule headroom</th>
										<th className="px-2 py-1 font-medium">Breach</th>
										<th className="px-2 py-1 font-medium">Regime</th>
										<th className="px-2 py-1 font-medium">Pressure</th>
									</tr>
								</thead>
								<tbody>
									{borrowingScenarioComparison.rows.map((row) => (
										<tr key={row.id} className="border-t border-border/60">
											<td className="px-2 py-1 align-top">
												<div className="font-medium text-foreground">
													{row.label}
												</div>
												<div className="max-w-[210px] text-muted-foreground leading-snug">
													{row.description}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<div>{row.strategyLabel}</div>
												<div className="max-w-[220px] text-muted-foreground leading-snug">
													{row.contextLabel}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<div>{formatBn(row.finalYearInterestGbp)}</div>
												<div className="text-muted-foreground">
													cumulative {formatBn(row.cumulativeInterestGbp)}
												</div>
											</td>
											<td
												className={cn(
													"px-2 py-1 align-top",
													row.adjustedHeadroomGbp < 0
														? "text-red-700"
														: row.riskRating === "tight"
															? "text-amber-700"
															: "text-foreground",
												)}
											>
												<div>{formatBn(row.adjustedHeadroomGbp)}</div>
												<div className="text-muted-foreground">
													{row.riskRating}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<div>{formatProbability(row.breachProbability)}</div>
												<div className="text-muted-foreground">
													post {formatProbability(row.postReactionBreachProbability)}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<div>{row.topRegimeLabel ?? "n/a"}</div>
												<div className="text-muted-foreground">
													{formatProbability(row.topRegimeProbability)}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<div>{formatBp(row.expectedPeakPressureBp)}</div>
												<div className="text-muted-foreground">
													reaction {row.topReactionPackageLabel ?? "none"}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

				{provenanceLedger.rows.length > 0 && (
					<div className="rounded-sm border bg-muted/20 p-2 space-y-2">
						<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
							<span className="font-medium text-foreground">
								Scenario provenance ledger
							</span>
							<span className="text-muted-foreground tabular-nums">
								{provenanceLedger.sourceLinkedRows}/{provenanceLedger.rows.length}{" "}
								source-linked · {provenanceLedger.rangeBackedRows} range-backed
							</span>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<Metric
								label="Behavioural adjustment"
								value={formatBnDelta(
									provenanceLedger.totalBehaviouralAdjustmentGbp,
								)}
							/>
							<Metric
								label="Macro feedback"
								value={formatBnDelta(provenanceLedger.totalMacroFeedbackGbp)}
							/>
							<Metric
								label="Y5 debt interest"
								value={formatBn(
									provenanceLedger.totalFinalYearDebtInterestGbp,
								)}
							/>
						</div>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
							<table className="w-full min-w-[1040px] tabular-nums">
								<thead className="text-muted-foreground">
									<tr className="text-left">
										<th className="px-2 py-1 font-medium">Line</th>
										<th className="px-2 py-1 font-medium">Source</th>
										<th className="px-2 py-1 font-medium">Static</th>
										<th className="px-2 py-1 font-medium">Dynamic</th>
										<th className="px-2 py-1 font-medium">Macro</th>
										<th className="px-2 py-1 font-medium">Y5 GE</th>
										<th className="px-2 py-1 font-medium">Uncertainty</th>
										<th className="px-2 py-1 font-medium">Risk</th>
									</tr>
								</thead>
								<tbody>
									{provenanceLedger.rows.map((row) => (
										<tr key={row.lineId} className="border-t border-border/60">
											<td className="px-2 py-1 align-top">
												<div className="font-medium text-foreground">
													{row.description}
												</div>
												<div className="max-w-[240px] text-muted-foreground leading-snug">
													{row.leverLabel} · {row.methodologyAsOf}
													{row.borrowingStrategyLabel
														? ` · ${row.borrowingStrategyLabel}`
														: ""}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												<a
													href={row.sourceUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="text-foreground hover:underline"
												>
													{row.sourceLabel}
												</a>
											</td>
											<td className="px-2 py-1 align-top">
												{formatBnDelta(row.staticDeltaGbp)}
											</td>
											<td className="px-2 py-1 align-top">
												<div>{formatBnDelta(row.dynamicDeltaGbp)}</div>
												<div className="text-muted-foreground">
													{formatBnDelta(row.behaviouralAdjustmentGbp)}
												</div>
											</td>
											<td className="px-2 py-1 align-top">
												{formatBnDelta(row.macroFeedbackGbp)}
											</td>
											<td className="px-2 py-1 align-top">
												<div>{formatBnDelta(row.finalYearGeNetGbp)}</div>
												{Math.abs(row.finalYearDebtInterestGbp) > 0 && (
													<div className="text-muted-foreground">
														interest {formatBn(row.finalYearDebtInterestGbp)}
													</div>
												)}
											</td>
											<td className="px-2 py-1 align-top">
												<div>{row.uncertaintyBasis}</div>
												{row.methodologyRangeLowGbp !== null &&
													row.methodologyRangeHighGbp !== null && (
														<div className="text-muted-foreground">
															{formatBn(row.methodologyRangeLowGbp)}-
															{formatBn(row.methodologyRangeHighGbp)}
														</div>
													)}
											</td>
											<td className="px-2 py-1 align-top">
												<div className="max-w-[220px] leading-snug">
													{row.riskContributionLabel}
												</div>
												{row.borrowingContextLabel && (
													<div className="text-muted-foreground">
														{row.borrowingContextLabel}
													</div>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

				<div className="overflow-x-auto rounded-sm border bg-muted/20">
					<table className="w-full min-w-[620px] tabular-nums">
						<thead className="text-muted-foreground">
							<tr className="text-left">
								<th className="px-2 py-1 font-medium">Calibration</th>
								<th className="px-2 py-1 font-medium">As of</th>
								<th className="px-2 py-1 font-medium">Coverage</th>
								<th className="px-2 py-1 font-medium">Source</th>
							</tr>
						</thead>
						<tbody>
							{calibration.map((item) => (
								<tr key={item.label} className="border-t border-border/60">
									<td className="px-2 py-1 font-medium text-foreground">
										{item.label}
									</td>
									<td className="px-2 py-1">{item.asOf}</td>
									<td className="px-2 py-1">{item.coverage}</td>
									<td className="px-2 py-1">{item.sourceLabel}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					<Metric
						label="Borrowing central fit"
						value={backtests.borrowingCentralFit}
					/>
					<Metric
						label="Borrowing overlay fit"
						value={`${backtests.borrowingOverlayFit} (${formatBp(
							backtests.borrowingMeanOverlayMissBp,
						)} mean miss)`}
					/>
					<Metric
						label="Regime classifier"
						value={`${backtests.borrowingRegimeClassifierFit} (${formatProbability(
							backtests.borrowingRegimeMeanLabelProbability,
						)})`}
					/>
					<Metric
						label="Fiscal reaction fit"
						value={`${backtests.fiscalReactionPriorFit} vs ${backtests.fiscalReactionRuleOnlyFit} rule-only`}
					/>
				</div>

				{liveRisk.regimeProbabilities.length > 0 && (
					<div className="rounded-sm border bg-muted/20 p-2">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-medium text-foreground">
								Current borrowing regime
								{liveRisk.borrowingRegimeLabel
									? `: ${liveRisk.borrowingRegimeLabel}`
									: ""}
							</span>
							<span
								className={cn(
									"uppercase tracking-wider",
									liveRisk.borrowingStressRating === "stress"
										? "text-red-700"
										: liveRisk.borrowingStressRating === "watch"
											? "text-amber-700"
											: "text-muted-foreground",
								)}
							>
								{liveRisk.borrowingStressRating ?? "n/a"} ·{" "}
								{formatBp(liveRisk.borrowingExpectedPeakPressureBp)}
							</span>
						</div>
						<div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-1">
							{liveRisk.regimeProbabilities.map((row) => (
								<div key={row.id} className="rounded-sm bg-background/70 p-1">
									<div className="font-medium text-foreground">
										{row.label} {formatProbability(row.probability)}
									</div>
									<div className="text-muted-foreground">
										overlay {formatBp(row.expectedOverlayBp)} · nearest{" "}
										{row.nearestEpisode}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{liveRisk.uncertaintyLayers.length > 0 && (
					<div className="overflow-x-auto rounded-sm border bg-muted/20">
						<table className="w-full min-w-[560px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="text-left">
									<th className="px-2 py-1 font-medium">Risk layer</th>
									<th className="px-2 py-1 font-medium">Breach</th>
									<th className="px-2 py-1 font-medium">p5 headroom</th>
									<th className="px-2 py-1 font-medium">p5 move</th>
								</tr>
							</thead>
							<tbody>
								{liveRisk.uncertaintyLayers.map((row) => (
									<tr key={row.label} className="border-t border-border/60">
										<td className="px-2 py-1 font-medium text-foreground">
											{row.label}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.breachProbability)}
										</td>
										<td className="px-2 py-1">
											{formatBn(row.p5HeadroomGbp)}
										</td>
										<td
											className={cn(
												"px-2 py-1",
												row.p5MoveGbp < -250_000_000
													? "text-red-700"
													: row.p5MoveGbp > 250_000_000
														? "text-blue-700"
														: "text-muted-foreground",
											)}
										>
											{row.label === "Central path"
												? "base"
												: formatBnDelta(row.p5MoveGbp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{liveRisk.largestDownsideLayerLabel && (
							<div className="border-t px-2 py-1 text-muted-foreground">
								Largest downside layer:{" "}
								<span className="font-medium text-foreground">
									{liveRisk.largestDownsideLayerLabel}
								</span>
							</div>
						)}
					</div>
				)}

				{liveRisk.priorSensitivityRows.length > 0 && (
					<div className="overflow-x-auto rounded-sm border bg-muted/20">
						<table className="w-full min-w-[560px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="text-left">
									<th className="px-2 py-1 font-medium">Prior</th>
									<th className="px-2 py-1 font-medium">Dominant package</th>
									<th className="px-2 py-1 font-medium">Trigger</th>
									<th className="px-2 py-1 font-medium">Post-breach</th>
									<th className="px-2 py-1 font-medium">p95 action</th>
								</tr>
							</thead>
							<tbody>
								{liveRisk.priorSensitivityRows.map((row) => (
									<tr key={row.label} className="border-t border-border/60">
										<td className="px-2 py-1 font-medium text-foreground">
											{row.label}
										</td>
										<td className="px-2 py-1">
											{row.dominantPackageLabel ?? "none"}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.triggerProbability)}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.postReactionBreachProbability)}
										</td>
										<td className="px-2 py-1">
											{formatBn(row.p95GrossActionGbp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<ul className="space-y-1 border-t pt-2 text-muted-foreground leading-snug">
					{limitations.map((limitation) => (
						<li key={limitation}>- {limitation}</li>
					))}
				</ul>

				<details className="border-t pt-2">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
						Evidence payload
					</summary>
					<pre className="mt-2 max-h-64 overflow-auto rounded-sm bg-muted/50 p-2 text-[10px] leading-snug">
						{JSON.stringify(audit, null, 2)}
					</pre>
				</details>
			</div>
		</div>
	);
}

function Metric({
	label,
	value,
	strong = false,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 tabular-nums",
					strong ? "text-sm font-semibold text-foreground" : "text-foreground",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function ReportQualityChecklist({ items }: { items: readonly ChecklistItem[] }) {
	const present = items.filter((item) => item.status === "present").length;
	const missing = items.filter((item) => item.status === "missing").length;
	const notApplicable = items.filter(
		(item) => item.status === "not-applicable",
	).length;
	const summary = [
		`${present} present`,
		missing > 0 ? `${missing} missing` : null,
		notApplicable > 0 ? `${notApplicable} n/a` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="rounded-md border bg-background/60 p-3 text-[10px]">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<h4 className="font-semibold uppercase tracking-wider text-muted-foreground">
					Report quality checklist
				</h4>
				<span
					className={cn(
						"tabular-nums",
						missing > 0 ? "text-amber-700" : "text-blue-700",
					)}
				>
					{summary}
				</span>
			</div>
			<div className="mt-2 grid gap-1.5 sm:grid-cols-2">
				{items.map((item) => {
					const Icon =
						item.status === "present"
							? CheckCircle2
							: item.status === "missing"
								? TriangleAlert
								: CircleSlash;
					return (
						<div
							key={item.label}
							className={cn(
								"flex items-start gap-2 rounded-sm border px-2 py-1.5",
								item.status === "present"
									? "border-blue-100 bg-blue-50/70 text-blue-900"
									: item.status === "missing"
										? "border-amber-200 bg-amber-50 text-amber-950"
										: "border-border bg-muted/20 text-muted-foreground",
							)}
						>
							<Icon
								aria-hidden="true"
								className={cn(
									"mt-0.5 size-3 shrink-0",
									item.status === "present"
										? "text-blue-700"
										: item.status === "missing"
											? "text-amber-700"
											: "text-muted-foreground",
								)}
							/>
							<div className="min-w-0">
								<div className="font-medium leading-tight">{item.label}</div>
								<div className="mt-0.5 leading-snug opacity-80">
									{item.detail}
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

"use client";

import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
type AuditExportKind = "md" | "json";
type AuditExportStatus = "success" | "error";
type AuditExportFeedback = {
	kind: AuditExportKind;
	status: AuditExportStatus;
} | null;

interface ChecklistItem {
	label: string;
	detail: string;
	status: ChecklistStatus;
	targetId?: string;
}

const AUDIT_TARGETS = {
	scenario: "audit-scenario-summary",
	baseline: "audit-baseline-fiscal-rule",
	provenance: "audit-provenance-ledger",
	macroStress: "audit-macro-stress-lab",
	borrowingMatrix: "audit-borrowing-matrix",
	borrowingRegime: "audit-borrowing-regime",
	fiscalRisk: "audit-fiscal-rule-risk",
	priorSensitivity: "audit-prior-sensitivity",
	uncertainty: "audit-uncertainty-layers",
	calibration: "audit-calibration-backtests",
} as const;

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

type AuditTone = "blue" | "amber" | "red" | "muted";

const auditToneClassName = (tone: AuditTone): string =>
	tone === "blue"
		? "text-blue-700"
		: tone === "amber"
			? "text-amber-700"
			: tone === "red"
				? "text-red-700"
				: "text-muted-foreground";

const exportFilename = (kind: "md" | "json", generatedAt: string): string =>
	`model-audit-${generatedAt.slice(0, 10)}.${kind}`;

const AUDIT_EXPORT_FEEDBACK_MS = 1800;

const auditExportDefaultLabel = (kind: AuditExportKind): string =>
	kind === "md" ? "MD" : "JSON";

const auditExportButtonLabel = (
	kind: AuditExportKind,
	feedback: AuditExportFeedback,
): string => {
	if (feedback?.kind !== kind) return auditExportDefaultLabel(kind);
	return feedback.status === "success" ? "Downloaded" : "Failed";
};

const auditExportButtonClassName = (
	kind: AuditExportKind,
	feedback: AuditExportFeedback,
): string =>
	cn(
		"h-7 px-2 text-[10px]",
		feedback?.kind === kind && feedback.status === "success"
			? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
			: feedback?.kind === kind && feedback.status === "error"
				? "border-red-200 bg-red-50 text-red-700 hover:bg-red-50 hover:text-red-700"
				: null,
	);

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
			targetId: AUDIT_TARGETS.scenario,
		},
		{
			label: "Baseline & fiscal rule",
			detail: audit.baselineComparison
				? `${audit.baselineComparison.years.length} years; ${audit.baselineComparison.rule.riskRating} risk`
				: "No baseline comparison",
			status: audit.baselineComparison ? "present" : "missing",
			targetId: audit.baselineComparison ? AUDIT_TARGETS.baseline : undefined,
		},
		{
			label: "Provenance ledger",
			detail: `${audit.provenanceLedger.sourceLinkedRows}/${audit.provenanceLedger.rows.length} source-linked`,
			status:
				audit.provenanceLedger.rows.length > 0 &&
				audit.provenanceLedger.sourceLinkedRows > 0
					? "present"
					: "missing",
			targetId:
				audit.provenanceLedger.rows.length > 0
					? AUDIT_TARGETS.provenance
					: undefined,
		},
		{
			label: "Macro stress lab",
			detail: audit.macroStressLab
				? `${audit.macroStressLab.parameters.length} sensitivities`
				: "No stress grid",
			status: audit.macroStressLab ? "present" : "missing",
			targetId: audit.macroStressLab ? AUDIT_TARGETS.macroStress : undefined,
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
			targetId:
				hasBorrowing && audit.borrowingScenarioComparison
					? AUDIT_TARGETS.borrowingMatrix
					: undefined,
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
			targetId:
				hasBorrowing && audit.liveRisk.regimeProbabilities.length > 0
					? AUDIT_TARGETS.borrowingRegime
					: undefined,
		},
		{
			label: "Fiscal-rule risk",
			detail:
				audit.liveRisk.breachProbability === null
					? "No fan available"
					: `${formatProbability(audit.liveRisk.breachProbability)} raw breach`,
			status:
				audit.liveRisk.breachProbability === null ? "missing" : "present",
			targetId: AUDIT_TARGETS.fiscalRisk,
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
			targetId:
				audit.liveRisk.priorSensitivityRows.length > 0
					? AUDIT_TARGETS.priorSensitivity
					: undefined,
		},
		{
			label: "Uncertainty layers",
			detail:
				audit.liveRisk.uncertaintyLayers.length > 0
					? `${audit.liveRisk.uncertaintyLayers.length} layers`
					: "No decomposition",
			status:
				audit.liveRisk.uncertaintyLayers.length > 0 ? "present" : "missing",
			targetId:
				audit.liveRisk.uncertaintyLayers.length > 0
					? AUDIT_TARGETS.uncertainty
					: undefined,
		},
		{
			label: "Calibration & backtests",
			detail: `${audit.calibration.length} calibrations; ${audit.backtests.fiscalReactionPriorFit} reaction fit`,
			status:
				audit.calibration.length > 0 && hasBacktestCoverage(audit)
					? "present"
					: "missing",
			targetId: AUDIT_TARGETS.calibration,
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
		macroStressLab,
		provenanceLedger,
		calibration,
		backtests,
		liveRisk,
		limitations,
	} = audit;
	const [copied, setCopied] = useState(false);
	const [exportFeedback, setExportFeedback] =
		useState<AuditExportFeedback>(null);
	const exportFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const generatedAt = useMemo(() => new Date().toISOString(), [audit]);
	const qualityChecklist = useMemo(() => buildQualityChecklist(audit), [audit]);

	const showExportFeedback = (
		kind: AuditExportKind,
		status: AuditExportStatus,
	) => {
		if (exportFeedbackTimer.current) {
			clearTimeout(exportFeedbackTimer.current);
		}
		setExportFeedback({ kind, status });
		exportFeedbackTimer.current = setTimeout(() => {
			setExportFeedback(null);
			exportFeedbackTimer.current = null;
		}, AUDIT_EXPORT_FEEDBACK_MS);
	};

	useEffect(
		() => () => {
			if (exportFeedbackTimer.current) {
				clearTimeout(exportFeedbackTimer.current);
			}
		},
		[],
	);

	const currentShareUrl = () =>
		typeof window === "undefined" ? undefined : window.location.href;

	const downloadAppendix = (kind: AuditExportKind) => {
		try {
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
			showExportFeedback(kind, "success");
		} catch {
			showExportFeedback(kind, "error");
		}
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
					{(["md", "json"] as const).map((kind) => {
						const activeFeedback =
							exportFeedback?.kind === kind ? exportFeedback : null;
						const Icon =
							activeFeedback?.status === "success"
								? Check
								: activeFeedback?.status === "error"
									? TriangleAlert
									: kind === "md"
										? FileText
										: FileJson;
						return (
							<Button
								key={kind}
								type="button"
								variant="outline"
								size="sm"
								className={auditExportButtonClassName(kind, exportFeedback)}
								onClick={() => downloadAppendix(kind)}
							>
								<Icon aria-hidden="true" />
								{auditExportButtonLabel(kind, exportFeedback)}
							</Button>
						);
					})}
					<span className="inline-flex h-7 items-center gap-1 text-[10px] text-muted-foreground">
						<Download aria-hidden="true" className="size-3" />
						evidence pack
					</span>
				</div>
			</div>

			<AuditExecutiveSummary audit={audit} items={qualityChecklist} />

			<ReportQualityChecklist items={qualityChecklist} />

			<div className="rounded-md border bg-background/60 p-3 space-y-3 text-[10px]">
				<div
					id={AUDIT_TARGETS.scenario}
					className="scroll-mt-24 grid grid-cols-2 gap-2 sm:grid-cols-4"
				>
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

				<div
					id={AUDIT_TARGETS.fiscalRisk}
					className="scroll-mt-24 grid grid-cols-1 gap-2 sm:grid-cols-3"
				>
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
					<div
						id={AUDIT_TARGETS.baseline}
						className="scroll-mt-24 rounded-sm border bg-muted/20 p-2 space-y-2"
					>
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
					<AuditDisclosureSection
						id={AUDIT_TARGETS.borrowingMatrix}
						title="Borrowing scenario matrix"
						meta={`${formatBn(borrowingScenarioComparison.amountGbp)} over ${
							borrowingScenarioComparison.years
						} years`}
					>
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
					</AuditDisclosureSection>
				)}

				{macroStressLab && (
					<AuditDisclosureSection
						id={AUDIT_TARGETS.macroStress}
						title="Macro stress lab"
						meta={`rule year ${macroStressLab.ruleYear}`}
					>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
							<Metric
								label="Central headroom"
								value={formatBn(macroStressLab.central.adjustedHeadroomGbp)}
							/>
							<Metric
								label="Largest downside"
								value={macroStressLab.largestDownsideParameterLabel}
							/>
							<Metric
								label="Largest swing"
								value={macroStressLab.largestSwingParameterLabel}
							/>
						</div>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
							<table className="w-full min-w-[760px] tabular-nums">
								<thead className="text-muted-foreground">
									<tr className="text-left">
										<th className="px-2 py-1 font-medium">Assumption</th>
										<th className="px-2 py-1 font-medium">Low case</th>
										<th className="px-2 py-1 font-medium">High case</th>
										<th className="px-2 py-1 font-medium">Worst headroom</th>
										<th className="px-2 py-1 font-medium">Y5 interest move</th>
									</tr>
								</thead>
								<tbody>
									{macroStressLab.parameters.map((parameter) => (
										<tr
											key={parameter.id}
											className="border-t border-border/60"
										>
											<td className="px-2 py-1 font-medium text-foreground">
												{parameter.label}
											</td>
											<td className="px-2 py-1">
												{parameter.lowCase.label}
											</td>
											<td className="px-2 py-1">
												{parameter.highCase.label}
											</td>
											<td className="px-2 py-1">
												{formatBn(
													parameter.downsideCase.adjustedHeadroomGbp,
												)}
											</td>
											<td
												className={cn(
													"px-2 py-1",
													parameter.downsideCase
														.finalDebtInterestDeltaGbp > 0
														? "text-amber-700"
														: "text-muted-foreground",
												)}
											>
												{formatBnDelta(
													parameter.downsideCase
														.finalDebtInterestDeltaGbp,
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</AuditDisclosureSection>
				)}

				{provenanceLedger.rows.length > 0 && (
					<AuditDisclosureSection
						id={AUDIT_TARGETS.provenance}
						title="Scenario provenance ledger"
						meta={`${provenanceLedger.sourceLinkedRows}/${provenanceLedger.rows.length} source-linked · ${provenanceLedger.rangeBackedRows} range-backed`}
					>
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
					</AuditDisclosureSection>
				)}

				<AuditDisclosureSection
					id={AUDIT_TARGETS.calibration}
					title="Calibration and backtests"
					meta={`${calibration.length} calibrations`}
				>
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

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
				</AuditDisclosureSection>

				{liveRisk.regimeProbabilities.length > 0 && (
					<div
						id={AUDIT_TARGETS.borrowingRegime}
						className="scroll-mt-24 rounded-sm border bg-muted/20 p-2"
					>
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
					<AuditDisclosureSection
						id={AUDIT_TARGETS.uncertainty}
						title="Uncertainty layers"
						meta={`${liveRisk.uncertaintyLayers.length} layers`}
					>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
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
						</div>
						{liveRisk.largestDownsideLayerLabel && (
							<div className="text-muted-foreground">
								Largest downside layer:{" "}
								<span className="font-medium text-foreground">
									{liveRisk.largestDownsideLayerLabel}
								</span>
							</div>
						)}
					</AuditDisclosureSection>
				)}

				{liveRisk.priorSensitivityRows.length > 0 && (
					<AuditDisclosureSection
						id={AUDIT_TARGETS.priorSensitivity}
						title="Prior sensitivity"
						meta={`${liveRisk.priorSensitivityRows.length} cases`}
					>
						<div className="overflow-x-auto rounded-sm border bg-background/70">
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
					</AuditDisclosureSection>
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

function AuditExecutiveSummary({
	audit,
	items,
}: {
	audit: ModelAuditEvidencePack;
	items: readonly ChecklistItem[];
}) {
	const present = items.filter((item) => item.status === "present").length;
	const missingItems = items.filter((item) => item.status === "missing");
	const notApplicable = items.filter(
		(item) => item.status === "not-applicable",
	).length;
	const evidenceTone: AuditTone = missingItems.length > 0 ? "amber" : "blue";
	const breachRisk = audit.liveRisk.breachProbability;
	const breachTone: AuditTone =
		breachRisk === null
			? "muted"
			: breachRisk > 0.25
				? "red"
				: breachRisk > 0.1
					? "amber"
					: "blue";
	const postReactionTone: AuditTone =
		audit.liveRisk.postReactionBreachProbability === null
			? "muted"
			: audit.liveRisk.postReactionBreachProbability > 0.25
				? "red"
				: audit.liveRisk.postReactionBreachProbability > 0.1
					? "amber"
					: "blue";
	const borrowingTone: AuditTone =
		audit.liveRisk.borrowingStressRating === "stress"
			? "red"
			: audit.liveRisk.borrowingStressRating === "watch"
				? "amber"
				: audit.scenario.borrowingAmountGbp > 0
					? "blue"
					: "muted";
	const priorityPoints = [
		missingItems.length > 0
			? {
					label: "Evidence gaps",
					detail: missingItems.map((item) => item.label).join(", "),
					tone: "amber" as AuditTone,
				}
			: null,
		audit.liveRisk.largestDownsideLayerLabel
			? {
					label: "Downside layer",
					detail: audit.liveRisk.largestDownsideLayerLabel,
					tone: "amber" as AuditTone,
				}
			: null,
		audit.liveRisk.borrowingRegimeLabel
			? {
					label: "Borrowing regime",
					detail: `${audit.liveRisk.borrowingRegimeLabel}; peak pressure ${formatBp(
						audit.liveRisk.borrowingExpectedPeakPressureBp,
					)}`,
					tone: borrowingTone,
				}
			: null,
		audit.liveRisk.priorSensitivityRows.length > 0
			? {
					label: "Prior sensitivity",
					detail: `${audit.liveRisk.priorSensitivityRows.length} reaction-prior cases`,
					tone: "blue" as AuditTone,
				}
			: null,
		audit.limitations.length > 0
			? {
					label: "Known limitations",
					detail: `${audit.limitations.length} caveat${
						audit.limitations.length === 1 ? "" : "s"
					} retained in appendix`,
					tone: "muted" as AuditTone,
				}
			: null,
	].filter(Boolean) as readonly {
		label: string;
		detail: string;
		tone: AuditTone;
	}[];

	return (
		<div className="rounded-md border bg-background/70 p-3 text-[10px]">
			<div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:items-start">
				<div>
					<div
						className={cn(
							"inline-flex items-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide",
							missingItems.length > 0
								? "border-amber-200 bg-amber-50 text-amber-900"
								: "border-blue-200 bg-blue-50 text-blue-800",
						)}
					>
						Executive audit summary
					</div>
					<h4 className="mt-2 text-sm font-semibold text-foreground">
						{missingItems.length > 0
							? "Evidence pack has review gaps"
							: "Evidence pack covers the core research modules"}
					</h4>
					<p className="mt-1 text-[11px] leading-snug text-muted-foreground">
						{present} of {items.length} audit modules are present
						{notApplicable > 0 ? ` (${notApplicable} not applicable)` : ""}.
						The summary below keeps the main assurance tests visible before
						the detailed ledgers, stress grids, and calibration tables.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<AuditHeadlineMetric
						label="Evidence modules"
						value={`${present}/${items.length}`}
						detail={
							missingItems.length > 0
								? `${missingItems.length} gap${
										missingItems.length === 1 ? "" : "s"
									}`
								: "complete core pack"
						}
						tone={evidenceTone}
					/>
					<AuditHeadlineMetric
						label="Raw breach risk"
						value={formatProbability(breachRisk)}
						detail="pre-reaction fan"
						tone={breachTone}
					/>
					<AuditHeadlineMetric
						label="Post-reaction"
						value={formatProbability(
							audit.liveRisk.postReactionBreachProbability,
						)}
						detail={audit.liveRisk.topReactionPackageLabel ?? "no offset"}
						tone={postReactionTone}
					/>
					<AuditHeadlineMetric
						label="Borrowing stress"
						value={audit.liveRisk.borrowingStressRating ?? "n/a"}
						detail={
							audit.liveRisk.borrowingRegimeLabel ??
							(audit.scenario.borrowingAmountGbp > 0
								? "no regime estimate"
								: "no borrowing line")
						}
						tone={borrowingTone}
					/>
				</div>
			</div>

			{priorityPoints.length > 0 && (
				<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
					{priorityPoints.map((point) => (
						<div
							key={point.label}
							className="border-l-2 border-border pl-2"
						>
							<div
								className={cn(
									"font-medium",
									auditToneClassName(point.tone),
								)}
							>
								{point.label}
							</div>
							<div className="mt-0.5 leading-snug text-muted-foreground">
								{point.detail}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function AuditHeadlineMetric({
	label,
	value,
	detail,
	tone,
}: {
	label: string;
	value: string;
	detail: string;
	tone: AuditTone;
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 text-sm font-semibold tabular-nums",
					auditToneClassName(tone),
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 leading-snug text-muted-foreground">
				{detail}
			</div>
		</div>
	);
}

function AuditDisclosureSection({
	id,
	title,
	meta,
	children,
	defaultOpen = false,
}: {
	id?: string;
	title: string;
	meta?: string;
	children: ReactNode;
	defaultOpen?: boolean;
}) {
	return (
		<details
			id={id}
			open={defaultOpen}
			className="scroll-mt-24 rounded-sm border bg-muted/20 p-2"
		>
			<summary className="cursor-pointer">
				<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
					<span className="font-medium text-foreground">{title}</span>
					{meta && (
						<span className="text-muted-foreground tabular-nums">
							{meta}
						</span>
					)}
				</div>
			</summary>
			<div className="mt-2 space-y-2">{children}</div>
		</details>
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
					const body = (
						<>
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
						</>
					);
					const className = cn(
						"flex items-start gap-2 rounded-sm border px-2 py-1.5",
						item.targetId &&
							"transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
						item.status === "present"
							? "border-blue-100 bg-blue-50/70 text-blue-900"
							: item.status === "missing"
								? "border-amber-200 bg-amber-50 text-amber-950"
								: "border-border bg-muted/20 text-muted-foreground",
					);
					if (item.targetId) {
						return (
							<a
								key={item.label}
								href={`#${item.targetId}`}
								className={className}
							>
								{body}
							</a>
						);
					}
					return (
						<div
							key={item.label}
							className={className}
						>
							{body}
						</div>
					);
				})}
			</div>
		</div>
	);
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertCircle,
	Check,
	Download,
	FileJson,
	FileText,
	Link as LinkIcon,
} from "lucide-react";
import { ComparisonsAffordedList } from "@/components/ui/comparisons-afforded-list";
import type { ResolvedComparison } from "@/data/comparisons";
import { comparisonsCovered } from "@/lib/counterfactual";
import {
	type ScenarioLine,
	evaluateScenario,
	evaluateScenarioBand,
	evaluateScenarioDistribution,
	evaluateScenarioDynamic,
	evaluateScenarioMacro,
	projectScenarioBandsByYear,
	projectScenarioWithGEFeedback,
} from "@/lib/scenario";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
	projectFiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import {
	evaluateMicrosim,
	type MicrosimAggregate,
} from "@/lib/microsim/impact";
import { generatePopulation } from "@/lib/microsim/population";
import { cn } from "@/lib/utils";
import {
	buildModelAuditEvidencePack,
	buildModelAuditJsonExport,
	buildModelAuditMarkdownAppendix,
} from "@/lib/model-audit";
import { buildMacroStressLab } from "@/lib/macro-stress-lab";
import { BaselineComparisonPanel } from "./baseline-comparison";
import { CollapsibleSection } from "./collapsible-section";
import { DistributionalImpact } from "./distributional-impact";
import { HouseholdImpactPanel } from "./household-impact";
import { MacroStatePanel } from "./macro-state-panel";
import { MacroStressLabPanel } from "./macro-stress-lab";
import { MacroTierBreakdown } from "./macro-tier-breakdown";
import { MicrosimulationPanel } from "./microsimulation-panel";
import { ModelAuditPanel } from "./model-audit-panel";
import { MultiYearProjection } from "./multi-year-projection";
import { ScenarioAssumptions } from "./scenario-assumptions";
import { TopZone } from "./top-zone";

// Output rail with progressive disclosure:
//
//   • Top zone (always visible): essential answer in ~6 lines —
//     net effect, comparisons, 1-line distributional + household headlines.
//
//   • 6 collapsible sections (closed by default; state persisted):
//     - Trajectory: multi-year + vs OBR baseline
//     - Who pays: distributional + microsim + household archetypes
//     - Macro feedback: tier breakdown (reckoner→dynamic→macro→GE) + macro state
//     - Stress lab: macro assumption tornado and sensitivity table
//     - Assumptions: per-line caveats with full methodology
//     - Model audit: calibration/backtest evidence pack
//
//   • "Expand all" toggle in rail header for power users.
//
// Mobile and desktop share the same structure. State persisted via
// localStorage so a user's preferred depth survives reloads.

export interface OutputRailProps {
	scenario: readonly ScenarioLine[];
	comparisons: readonly ResolvedComparison[];
	usdPerGbp: number;
	// Server-resolved baseline (live OBR override applied to static fallback).
	// Defaults to the embedded static baseline if not passed.
	baseline?: OBRBaseline;
	emptyMessage?: string;
}

const SECTION_IDS = [
	"trajectory",
	"who-pays",
	"macro",
	"stress",
	"assumptions",
	"audit",
] as const;
type SectionId = (typeof SECTION_IDS)[number];
type AppendixExportKind = "md" | "json";
type AppendixExportStatus = "success" | "error";
type AppendixExportFeedback = {
	kind: AppendixExportKind;
	status: AppendixExportStatus;
} | null;

const STORAGE_KEY = "simulator-rail-sections";
const APPENDIX_FEEDBACK_MS = 1800;

const SECTION_NAV: readonly {
	id: SectionId;
	label: string;
}[] = [
	{ id: "trajectory", label: "Trajectory" },
	{ id: "who-pays", label: "Who pays" },
	{ id: "macro", label: "Macro" },
	{ id: "stress", label: "Stress" },
	{ id: "assumptions", label: "Assumptions" },
	{ id: "audit", label: "Audit/export" },
];

const sectionHash = (id: SectionId | "summary") => `report-${id}`;

const appendixFilename = (
	kind: AppendixExportKind,
	generatedAt: string,
): string =>
	`research-appendix-${generatedAt.slice(0, 10)}.${kind}`;

const appendixDefaultLabel = (kind: AppendixExportKind): string =>
	kind === "md" ? "Appendix MD" : "JSON";

const appendixButtonLabel = (
	kind: AppendixExportKind,
	feedback: AppendixExportFeedback,
): string => {
	if (feedback?.kind !== kind) return appendixDefaultLabel(kind);
	return feedback.status === "success" ? "Downloaded" : "Failed";
};

const appendixButtonClassName = (
	kind: AppendixExportKind,
	feedback: AppendixExportFeedback,
): string =>
	cn(
		"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:text-foreground",
		feedback?.kind === kind && feedback.status === "success"
			? "border-blue-200 bg-blue-50 text-blue-700"
			: feedback?.kind === kind && feedback.status === "error"
				? "border-red-200 bg-red-50 text-red-700"
				: "text-muted-foreground",
	);

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

export function OutputRail({
	scenario,
	comparisons,
	usdPerGbp,
	baseline = OBR_BASELINE,
	emptyMessage = "Add a lever to your scenario to see what it'd fund or cost.",
}: OutputRailProps) {
	// Open-state map for collapsible sections. Default closed; restored from
	// localStorage on mount.
	const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>({
		trajectory: false,
		"who-pays": false,
		macro: false,
		stress: false,
		assumptions: false,
		audit: false,
	});
	const [copied, setCopied] = useState(false);
	const [appendixFeedback, setAppendixFeedback] =
		useState<AppendixExportFeedback>(null);
	const appendixFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const showAppendixFeedback = (
		kind: AppendixExportKind,
		status: AppendixExportStatus,
	) => {
		if (appendixFeedbackTimer.current) {
			clearTimeout(appendixFeedbackTimer.current);
		}
		setAppendixFeedback({ kind, status });
		appendixFeedbackTimer.current = setTimeout(() => {
			setAppendixFeedback(null);
			appendixFeedbackTimer.current = null;
		}, APPENDIX_FEEDBACK_MS);
	};

	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as Partial<Record<SectionId, boolean>>;
				setOpenMap((prev) => ({ ...prev, ...parsed }));
			}
		} catch {
			// localStorage unavailable / parse error — keep defaults
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const hash = window.location.hash.replace(/^#/, "");
		const section = SECTION_NAV.find((item) => sectionHash(item.id) === hash);
		if (!section) return;
		setOpenMap((prev) => ({ ...prev, [section.id]: true }));
		window.setTimeout(() => {
			document.getElementById(hash)?.scrollIntoView({ block: "start" });
		}, 80);
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
		} catch {
			// ignore
		}
	}, [openMap]);

	useEffect(
		() => () => {
			if (appendixFeedbackTimer.current) {
				clearTimeout(appendixFeedbackTimer.current);
			}
		},
		[],
	);

	const toggle = (id: SectionId) =>
		setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
	const allOpen = SECTION_IDS.every((id) => openMap[id]);
	const setAll = (v: boolean) =>
		setOpenMap({
			trajectory: v,
			"who-pays": v,
			macro: v,
			stress: v,
			assumptions: v,
			audit: v,
		});
	const copyReportLink = async () => {
		if (typeof window === "undefined" || !navigator.clipboard) return;
		try {
			const url = new URL(window.location.href);
			url.hash = "";
			await navigator.clipboard.writeText(url.toString());
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	};
	const currentReportUrl = (): string | undefined => {
		if (typeof window === "undefined") return undefined;
		const url = new URL(window.location.href);
		url.hash = "";
		return url.toString();
	};
	const goToSection = (id: SectionId | "summary") => {
		const hash = sectionHash(id);
		if (id !== "summary") {
			setOpenMap((prev) => ({ ...prev, [id]: true }));
		}
		if (typeof window !== "undefined") {
			window.history.replaceState(null, "", `#${hash}`);
			window.setTimeout(() => {
				document.getElementById(hash)?.scrollIntoView({ block: "start" });
			}, 80);
		}
	};

	const result = useMemo(
		() => evaluateScenario(scenario as ScenarioLine[]),
		[scenario],
	);
	const items = comparisonsCovered(result.net, comparisons, usdPerGbp);
	const distribution = evaluateScenarioDistribution(result);
	const dynamic = evaluateScenarioDynamic(result);
	const macro = evaluateScenarioMacro(result);
	const macroGapSignificant =
		Math.abs(dynamic.dynamicNet) > 0 &&
		Math.abs(macro.macroFeedbackGbp) / Math.abs(dynamic.dynamicNet) > 0.05;
	const band = evaluateScenarioBand(result);
	const bandWidthSignificant =
		Math.abs(result.net) > 0 &&
		Math.abs(band.p95 - band.p5) / Math.abs(result.net) > 0.05;
	const ge = projectScenarioWithGEFeedback(result, baseline.years.length);
	const projection = ge.withFeedback;
	const projectionBands = projectScenarioBandsByYear(
		result,
		baseline.years.length,
	);
	const macroPath = ge.macroPath;
	const baselineComparison = projectAgainstBaseline(projection, baseline);
	const fiscalRuleFan = useMemo(
		() =>
			scenario.length > 0
				? projectFiscalRuleFan(result, baseline, 500)
				: undefined,
		[baseline, result, scenario.length],
	);
	const fiscalRulePriorSensitivity = useMemo(
		() =>
			fiscalRuleFan && fiscalRuleFan.policyReactionTriggeredProbability > 0
				? projectFiscalRulePriorSensitivity(result, baseline, 300)
				: undefined,
		[baseline, fiscalRuleFan, result],
	);
	const fiscalRuleUncertaintyDecomposition = useMemo(
		() =>
			scenario.length > 0
				? projectFiscalRuleUncertaintyDecomposition(result, baseline, 300)
				: undefined,
		[baseline, result, scenario.length],
	);
	const macroStressLab = useMemo(
		() =>
			(openMap.stress || openMap.audit) && scenario.length > 0
				? buildMacroStressLab(result, baseline)
				: undefined,
		[baseline, openMap.audit, openMap.stress, result, scenario.length],
	);
	const modelAudit = useMemo(
		() =>
			openMap.audit && scenario.length > 0
				? buildModelAuditEvidencePack({
						result,
						baseline,
						baselineComparison,
						macroStressLab,
						fiscalRuleFan,
						fiscalRulePriorSensitivity,
						fiscalRuleUncertaintyDecomposition,
					})
				: undefined,
		[
			baseline,
			baselineComparison,
			fiscalRuleFan,
			fiscalRulePriorSensitivity,
			fiscalRuleUncertaintyDecomposition,
			macroStressLab,
			openMap.audit,
			result,
			scenario.length,
		],
	);
	const buildResearchAppendixAudit = () =>
		buildModelAuditEvidencePack({
			result,
			baseline,
			baselineComparison,
			macroStressLab: macroStressLab ?? buildMacroStressLab(result, baseline),
			fiscalRuleFan,
			fiscalRulePriorSensitivity,
			fiscalRuleUncertaintyDecomposition,
		});
	const downloadResearchAppendix = (kind: AppendixExportKind) => {
		try {
			const generatedAt = new Date().toISOString();
			const audit = buildResearchAppendixAudit();
			const shareUrl = currentReportUrl();
			const body =
				kind === "md"
					? buildModelAuditMarkdownAppendix(audit, {
							generatedAt,
							shareUrl,
							title: "Research Appendix",
						})
					: buildModelAuditJsonExport(audit, { generatedAt, shareUrl });
			downloadTextFile(
				appendixFilename(kind, generatedAt),
				body,
				kind === "md" ? "text/markdown;charset=utf-8" : "application/json",
			);
			showAppendixFeedback(kind, "success");
		} catch {
			showAppendixFeedback(kind, "error");
		}
	};
	const geYear1 = ge.withFeedback[0]?.net ?? 0;
	const macroYear1 = ge.noFeedback[0]?.net ?? 0;
	const geGap = geYear1 - macroYear1;
	const geGapSignificant =
		Math.abs(macroYear1) > 0 &&
		(Math.abs(geGap) / Math.abs(macroYear1) > 0.005 ||
			Math.abs(geGap) > 50_000_000);
	const dynamicGap = result.net - dynamic.dynamicNet;
	const dynamicGapSignificant =
		Math.abs(result.net) > 0 &&
		Math.abs(dynamicGap) / Math.abs(result.net) > 0.05;

	// Microsim aggregate for the top-zone winners/losers headline.
	const population = useMemo(() => generatePopulation(1000, 42), []);
	const microsim: MicrosimAggregate | undefined = useMemo(
		() =>
			result.lines.length > 0
				? evaluateMicrosim(population, result).agg
				: undefined,
		[population, result],
	);

	if (scenario.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
				<p>{emptyMessage}</p>
			</div>
		);
	}

	const year1 = projection[0];
	const year5 = projection[projection.length - 1];

	return (
		<div className="space-y-4">
			{/* Top zone: always-visible essential summary */}
			<div id={sectionHash("summary")} className="scroll-mt-20">
				<TopZone
					result={result}
					dynamic={dynamic}
					dynamicGapSignificant={dynamicGapSignificant}
					items={items}
					distribution={distribution}
					microsim={microsim}
					year1Projection={year1}
					year5Projection={year5}
				/>
			</div>

			<div className="rounded-lg border bg-background/70 p-3 shadow-sm">
				<div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<nav
						aria-label="Report sections"
						className="flex flex-wrap gap-1.5"
					>
						<button
							type="button"
							onClick={() => goToSection("summary")}
							className="rounded-md border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
						>
							Summary
						</button>
						{SECTION_NAV.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => goToSection(item.id)}
								className="rounded-md border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
							>
								{item.label}
							</button>
						))}
					</nav>
					<div className="flex flex-wrap gap-1.5">
						<button
							type="button"
							onClick={copyReportLink}
							className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
						>
							{copied ? (
								<Check aria-hidden="true" className="size-3" />
							) : (
								<LinkIcon aria-hidden="true" className="size-3" />
							)}
							{copied ? "Copied" : "Copy link"}
						</button>
						{(["md", "json"] as const).map((kind) => {
							const activeFeedback =
								appendixFeedback?.kind === kind ? appendixFeedback : null;
							const Icon =
								activeFeedback?.status === "success"
									? Check
									: activeFeedback?.status === "error"
										? AlertCircle
										: kind === "md"
											? FileText
											: FileJson;
							return (
								<button
									key={kind}
									type="button"
									onClick={() => downloadResearchAppendix(kind)}
									className={appendixButtonClassName(kind, appendixFeedback)}
								>
									<Icon aria-hidden="true" className="size-3" />
									{appendixButtonLabel(kind, appendixFeedback)}
								</button>
							);
						})}
						<button
							type="button"
							onClick={() => goToSection("audit")}
							className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<Download aria-hidden="true" className="size-3" />
							Audit panel
						</button>
					</div>
				</div>
			</div>

			{/* Header strip with "Expand all / Collapse all" toggle */}
			<div className="flex items-center justify-between gap-3 border-t pt-3">
				<div>
					<h2 className="text-sm font-semibold">Detailed analysis</h2>
					<p className="text-[11px] text-muted-foreground">
						Trajectory, incidence, macro feedback, stress cases, assumptions, and audit evidence.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setAll(!allOpen)}
					className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					{allOpen ? "Collapse all" : "Expand all"}
				</button>
			</div>

			{/* 6 collapsible sections — closed by default */}
			<CollapsibleSection
				id="trajectory"
				title="Trajectory"
				subtitle="How the £ effect evolves over 5 years, vs OBR's central forecast"
				open={openMap.trajectory}
				onToggle={() => toggle("trajectory")}
			>
				<MultiYearProjection
					projection={projection}
					bands={projectionBands}
				/>
				<BaselineComparisonPanel
					comparison={baselineComparison}
					fiscalRuleFan={fiscalRuleFan}
					fiscalRulePriorSensitivity={fiscalRulePriorSensitivity}
					fiscalRuleUncertaintyDecomposition={
						fiscalRuleUncertaintyDecomposition
					}
				/>
			</CollapsibleSection>

			<CollapsibleSection
				id="who-pays"
				title="Who pays"
				subtitle="Across income deciles, household types, and named cases"
				open={openMap["who-pays"]}
				onToggle={() => toggle("who-pays")}
			>
				<DistributionalImpact distribution={distribution} />
				<MicrosimulationPanel result={result} />
				<HouseholdImpactPanel result={result} />
				<ComparisonsAffordedList
					items={items}
					caption={
						result.net > 0
							? "Full list — what the net surplus could fund:"
							: result.net < 0
								? "Full list — equivalent costs:"
								: undefined
					}
					emptyMessage={null}
				/>
			</CollapsibleSection>

			<CollapsibleSection
				id="macro"
				title="Macro feedback"
				subtitle="How behavioural and demand-side responses shift the headline"
				open={openMap.macro}
				onToggle={() => toggle("macro")}
			>
				<MacroTierBreakdown
					staticNet={result.net}
					dynamic={dynamic}
					dynamicGapSignificant={dynamicGapSignificant}
					macro={macro}
					macroGapSignificant={macroGapSignificant}
					geYear1={geYear1}
					geGap={geGap}
					geGapSignificant={geGapSignificant}
				/>
				{bandWidthSignificant && (
					<div className="text-[11px] leading-snug rounded-md border bg-background/60 p-2 space-y-1">
						<div className="text-xs font-medium">Confidence band</div>
						<div className="text-muted-foreground">
							90% CI:{" "}
							<span className="tabular-nums text-foreground">
								£{Math.round(band.p5).toLocaleString()}
							</span>{" "}
							—{" "}
							<span className="tabular-nums text-foreground">
								£{Math.round(band.p95).toLocaleString()}
							</span>
						</div>
						<div className="text-[10px] text-muted-foreground">
							1000-draw Monte Carlo over per-lever yield distributions (HMRC
							ranges where stated, ±10% otherwise).
						</div>
					</div>
				)}
				<MacroStatePanel
					path={macroPath}
					convergence={{
						iterations: ge.iterations,
						converged: ge.converged,
						maxChangeGbp: ge.maxChangeGbp,
					}}
				/>
			</CollapsibleSection>

			<CollapsibleSection
				id="stress"
				title="Stress lab"
				subtitle="GDP, inflation, Bank Rate, multipliers, buoyancy, and gilt-premium sensitivities"
				open={openMap.stress}
				onToggle={() => toggle("stress")}
			>
				{macroStressLab && <MacroStressLabPanel lab={macroStressLab} />}
			</CollapsibleSection>

			<CollapsibleSection
				id="assumptions"
				title="Assumptions"
				subtitle="What's behind each lever's number, line by line"
				open={openMap.assumptions}
				onToggle={() => toggle("assumptions")}
			>
				<ScenarioAssumptions lines={result.lines} />
			</CollapsibleSection>

			<CollapsibleSection
				id="audit"
				title="Model audit"
				subtitle="Calibration status, backtests, regimes, priors, and uncertainty layers"
				open={openMap.audit}
				onToggle={() => toggle("audit")}
			>
				{modelAudit && <ModelAuditPanel audit={modelAudit} />}
			</CollapsibleSection>
		</div>
	);
}

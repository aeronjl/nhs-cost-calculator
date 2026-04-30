"use client";

import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
	type ScenarioDistribution,
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
	type BaselineComparison,
	type FiscalRuleFan,
	type FiscalRuleUncertaintyDecomposition,
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
import { WhoPaysOverview } from "./who-pays-overview";

// Output rail with progressive disclosure:
//
//   • Top zone (always visible): essential answer in ~6 lines —
//     net effect, comparisons, 1-line distributional + household headlines.
//
//   • 6 detailed tabs:
//     - Trajectory: multi-year + vs OBR baseline
//     - Who pays: distributional + microsim + household archetypes
//     - Macro feedback: tier breakdown (reckoner→dynamic→macro→GE) + macro state
//     - Stress lab: macro assumption tornado and sensitivity table
//     - Assumptions: per-line caveats with full methodology
//     - Model audit: calibration/backtest evidence pack
//
// Mobile and desktop share the same structure. Active tab persisted via
// localStorage so a user's preferred view survives reloads.

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

const STORAGE_KEY = "simulator-rail-active-tab";
const APPENDIX_FEEDBACK_MS = 1800;

const SECTION_NAV: readonly {
	id: SectionId;
	label: string;
	panelTitle: string;
	subtitle: string;
}[] = [
	{
		id: "trajectory",
		label: "Trajectory",
		panelTitle: "Trajectory",
		subtitle: "How the £ effect evolves over 5 years, vs OBR's central forecast",
	},
	{
		id: "who-pays",
		label: "Who pays",
		panelTitle: "Who pays",
		subtitle: "Across income deciles, household types, and named cases",
	},
	{
		id: "macro",
		label: "Macro",
		panelTitle: "Macro feedback",
		subtitle: "How behavioural and demand-side responses shift the headline",
	},
	{
		id: "stress",
		label: "Stress",
		panelTitle: "Stress lab",
		subtitle:
			"GDP, inflation, Bank Rate, multipliers, buoyancy, and gilt-premium sensitivities",
	},
	{
		id: "assumptions",
		label: "Assumptions",
		panelTitle: "Assumptions",
		subtitle: "What's behind each lever's number, line by line",
	},
	{
		id: "audit",
		label: "Audit",
		panelTitle: "Model audit",
		subtitle:
			"Calibration status, backtests, regimes, priors, and uncertainty layers",
	},
];

const sectionHash = (id: SectionId | "summary") => `report-${id}`;

type SignalTone = "blue" | "amber" | "red" | "muted";

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
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

const formatProbability = (n: number): string => `${Math.round(n * 100)}%`;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const formatStylePct = (n: number): string =>
	`${(clamp01(n) * 100).toFixed(4)}%`;

const signalToneClassName = (tone: SignalTone): string =>
	tone === "blue"
		? "text-blue-700"
		: tone === "amber"
			? "text-amber-700"
			: tone === "red"
				? "text-red-700"
				: "text-muted-foreground";

const signalBarClassName = (tone: SignalTone): string =>
	tone === "blue"
		? "bg-blue-600"
		: tone === "amber"
			? "bg-amber-500"
			: tone === "red"
				? "bg-red-600"
				: "bg-slate-400";

const fiscalRiskTone = (probability: number | undefined): SignalTone =>
	probability === undefined
		? "muted"
		: probability > 0.25
			? "red"
			: probability > 0.1
				? "amber"
				: "blue";

const formatHouseholdImpact = (decileTotalGbp: number): string => {
	const perHouseholdPerYear = decileTotalGbp / 2_800_000;
	const abs = Math.abs(perHouseholdPerYear);
	const sign =
		perHouseholdPerYear > 0 ? "−" : perHouseholdPerYear < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(1)}k/yr`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}/yr`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}/yr`;
	if (abs >= 1) return `${sign}£${abs.toFixed(1)}/yr`;
	return "£0/yr";
};

const isSectionId = (value: string | undefined): value is SectionId =>
	SECTION_IDS.includes(value as SectionId);

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
	const [activeSection, setActiveSection] =
		useState<SectionId>("trajectory");
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
			const storedSection = stored ?? undefined;
			if (isSectionId(storedSection)) setActiveSection(storedSection);
		} catch {
			// localStorage unavailable / parse error — keep defaults
		}
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const hash = window.location.hash.replace(/^#/, "");
		const section = SECTION_NAV.find((item) => sectionHash(item.id) === hash);
		if (!section) return;
		setActiveSection(section.id);
		window.setTimeout(() => {
			document.getElementById(hash)?.scrollIntoView({ block: "start" });
		}, 80);
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, activeSection);
		} catch {
			// ignore
		}
	}, [activeSection]);

	useEffect(
		() => () => {
			if (appendixFeedbackTimer.current) {
				clearTimeout(appendixFeedbackTimer.current);
			}
		},
		[],
	);

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
			setActiveSection(id);
		}
		if (typeof window !== "undefined") {
			window.history.replaceState(null, "", `#${hash}`);
			window.setTimeout(() => {
				document.getElementById(hash)?.scrollIntoView({ block: "start" });
			}, 80);
		}
	};
	const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const currentIndex = SECTION_NAV.findIndex(
			(item) => item.id === activeSection,
		);
		if (currentIndex < 0) return;

		let nextIndex: number | undefined;
		if (event.key === "ArrowRight") {
			nextIndex = (currentIndex + 1) % SECTION_NAV.length;
		} else if (event.key === "ArrowLeft") {
			nextIndex =
				(currentIndex - 1 + SECTION_NAV.length) % SECTION_NAV.length;
		} else if (event.key === "Home") {
			nextIndex = 0;
		} else if (event.key === "End") {
			nextIndex = SECTION_NAV.length - 1;
		}

		if (nextIndex === undefined) return;
		event.preventDefault();
		const nextId = SECTION_NAV[nextIndex].id;
		goToSection(nextId);
		window.setTimeout(() => {
			document.getElementById(`report-tab-${nextId}`)?.focus();
		}, 0);
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
			(activeSection === "stress" || activeSection === "audit") &&
			scenario.length > 0
				? buildMacroStressLab(result, baseline)
				: undefined,
		[activeSection, baseline, result, scenario.length],
	);
	const modelAudit = useMemo(
		() =>
			activeSection === "audit" && scenario.length > 0
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
			activeSection,
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
						aria-label="Report shortcuts"
						className="flex flex-wrap gap-1.5"
					>
						<button
							type="button"
							onClick={() => goToSection("summary")}
							className="rounded-md border bg-muted/20 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
						>
							Summary
						</button>
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

			<ReportNarrativeMap
				activeSection={activeSection}
				baselineComparison={baselineComparison}
				distribution={distribution}
				staticNet={result.net}
				dynamicNet={dynamic.dynamicNet}
				geYear1={geYear1}
				fiscalRuleFan={fiscalRuleFan}
				fiscalRuleUncertaintyDecomposition={
					fiscalRuleUncertaintyDecomposition
				}
				scenarioLineCount={result.lines.length}
				onSelect={goToSection}
			/>

			<section
				aria-labelledby="report-details-heading"
				className="overflow-hidden rounded-lg border bg-background shadow-sm"
			>
				<div className="border-b bg-muted/20 p-3">
					<h2
						id="report-details-heading"
						className="text-sm font-semibold"
					>
						Detailed analysis
					</h2>
					<p className="mt-1 text-[11px] text-muted-foreground">
						Trajectory, incidence, macro feedback, stress cases, assumptions,
						and audit evidence.
					</p>
					<div
						role="tablist"
						aria-label="Detailed report tabs"
						onKeyDown={onTabKeyDown}
						className="mt-3 flex flex-wrap gap-1.5"
					>
						{SECTION_NAV.map((item) => {
							const selected = activeSection === item.id;
							return (
								<button
									key={item.id}
									id={`report-tab-${item.id}`}
									type="button"
									role="tab"
									aria-selected={selected}
									aria-controls={sectionHash(item.id)}
									tabIndex={selected ? 0 : -1}
									onClick={() => goToSection(item.id)}
									className={cn(
										"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
										selected
											? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
											: "border-transparent bg-background text-muted-foreground hover:border-border hover:text-foreground",
									)}
								>
									{item.label}
								</button>
							);
						})}
					</div>
				</div>

				{SECTION_NAV.map((item) => {
					const selected = activeSection === item.id;
					return (
						<div
							key={item.id}
							id={sectionHash(item.id)}
							role="tabpanel"
							aria-labelledby={`report-tab-${item.id}`}
							hidden={!selected}
							className={cn(
								"scroll-mt-20 p-3 sm:p-4",
								!selected && "hidden",
							)}
						>
							{selected && (
								<div className="mx-auto w-full max-w-6xl space-y-4">
									<div className="max-w-3xl space-y-1">
										<h3 className="text-sm font-semibold">
											{item.panelTitle}
										</h3>
										<p className="text-[11px] text-muted-foreground">
											{item.subtitle}
										</p>
									</div>

									{activeSection === "trajectory" && (
										<div className="grid gap-3 xl:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.3fr)] xl:items-start">
											<div className="min-w-0 xl:sticky xl:top-20">
												<MultiYearProjection
													projection={projection}
													bands={projectionBands}
												/>
											</div>
											<div className="min-w-0">
												<BaselineComparisonPanel
													comparison={baselineComparison}
													fiscalRuleFan={fiscalRuleFan}
													fiscalRulePriorSensitivity={
														fiscalRulePriorSensitivity
													}
													fiscalRuleUncertaintyDecomposition={
														fiscalRuleUncertaintyDecomposition
													}
												/>
											</div>
										</div>
									)}

									{activeSection === "who-pays" && (
										<div className="space-y-3">
											<WhoPaysOverview
												distribution={distribution}
												microsim={microsim}
												result={result}
											/>
											<div className="grid gap-3 xl:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.18fr)] xl:items-start">
												<div className="min-w-0 space-y-3">
													<DistributionalImpact
														distribution={distribution}
													/>
													{items.length > 0 && (
														<div className="rounded-md border bg-background/60 p-3">
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
														</div>
													)}
												</div>
												<div className="min-w-0 space-y-3">
													<MicrosimulationPanel result={result} />
													<HouseholdImpactPanel result={result} />
												</div>
											</div>
										</div>
									)}

									{activeSection === "macro" && (
										<div className="grid gap-3 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)] xl:items-start">
											<div className="min-w-0 space-y-3 xl:max-w-[520px]">
												<MacroTierBreakdown
													staticNet={result.net}
													dynamic={dynamic}
													dynamicGapSignificant={
														dynamicGapSignificant
													}
													macro={macro}
													macroGapSignificant={
														macroGapSignificant
													}
													macroYear1={macroYear1}
													geYear1={geYear1}
													geGap={geGap}
													geGapSignificant={
														geGapSignificant
													}
												/>
												{bandWidthSignificant && (
													<div className="space-y-1 rounded-md border bg-background/60 p-2 text-[11px] leading-snug">
														<div className="text-xs font-medium">
															Confidence band
														</div>
														<div className="text-muted-foreground">
															90% CI:{" "}
															<span className="tabular-nums text-foreground">
																£
																{Math.round(
																	band.p5,
																).toLocaleString()}
															</span>{" "}
															—{" "}
															<span className="tabular-nums text-foreground">
																£
																{Math.round(
																	band.p95,
																).toLocaleString()}
															</span>
														</div>
														<div className="text-[10px] text-muted-foreground">
															1000-draw Monte Carlo over
															per-lever yield distributions
															(HMRC ranges where stated,
															±10% otherwise).
														</div>
													</div>
												)}
											</div>
											<div className="min-w-0">
												<MacroStatePanel
													path={macroPath}
													convergence={{
														iterations: ge.iterations,
														converged: ge.converged,
														maxChangeGbp: ge.maxChangeGbp,
													}}
												/>
											</div>
										</div>
									)}

									{activeSection === "stress" && macroStressLab && (
										<div className="min-w-0">
											<MacroStressLabPanel lab={macroStressLab} />
										</div>
									)}

									{activeSection === "assumptions" && (
										<div className="max-w-5xl">
											<ScenarioAssumptions lines={result.lines} />
										</div>
									)}

									{activeSection === "audit" && modelAudit && (
										<div className="min-w-0">
											<ModelAuditPanel audit={modelAudit} />
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</section>
		</div>
	);
}

function ReportNarrativeMap({
	activeSection,
	baselineComparison,
	distribution,
	staticNet,
	dynamicNet,
	geYear1,
	fiscalRuleFan,
	fiscalRuleUncertaintyDecomposition,
	scenarioLineCount,
	onSelect,
}: {
	activeSection: SectionId;
	baselineComparison: BaselineComparison;
	distribution: ScenarioDistribution;
	staticNet: number;
	dynamicNet: number;
	geYear1: number;
	fiscalRuleFan?: FiscalRuleFan;
	fiscalRuleUncertaintyDecomposition?: FiscalRuleUncertaintyDecomposition;
	scenarioLineCount: number;
	onSelect: (id: SectionId) => void;
}) {
	const finalYear = baselineComparison.years.at(-1);
	if (!finalYear) return null;

	const ruleYear = baselineComparison.ruleYear ?? finalYear;
	const psnbDelta = finalYear.adjustedPsnb - finalYear.baselinePsnb;
	const ruleHeadroomDelta =
		baselineComparison.adjustedStabilityHeadroom -
		baselineComparison.baseline.stabilityRuleHeadroom;
	const trajectoryTone: SignalTone =
		baselineComparison.adjustedStabilityHeadroom < 0
			? "red"
			: psnbDelta > 0
				? "amber"
				: psnbDelta < 0
					? "blue"
					: "muted";
	const bottomDecile = distribution.perDecile[0] ?? 0;
	const topDecile = distribution.perDecile[9] ?? 0;
	const householdLosses = distribution.perDecile.filter((value) => value > 0).length;
	const householdGains = distribution.perDecile.filter((value) => value < 0).length;
	const maxHouseholdImpact = Math.max(
		...distribution.perDecile.map((value) => Math.abs(value / 2_800_000)),
		0,
	);
	const distributionTone: SignalTone =
		distribution.modelledLines === 0
			? "muted"
			: householdLosses > householdGains
				? "amber"
				: householdGains > householdLosses
					? "blue"
					: "muted";
	const macroAdjustment = geYear1 - staticNet;
	const dynamicAdjustment = dynamicNet - staticNet;
	const largestDownsideLayer = fiscalRuleUncertaintyDecomposition?.layers
		.filter((layer) => layer.id !== "central" && layer.p5DeltaFromPreviousGbp < 0)
		.slice()
		.sort((a, b) => a.p5DeltaFromPreviousGbp - b.p5DeltaFromPreviousGbp)[0];
	const breachTone = fiscalRiskTone(fiscalRuleFan?.breachProbability);
	const cards: readonly ReportSignalCardData[] = [
		{
			id: "trajectory",
			kicker: "Baseline -> scenario",
			title: "Fiscal path",
			value: `${formatBn(finalYear.baselinePsnb)} -> ${formatBn(
				finalYear.adjustedPsnb,
			)}`,
			detail: `${finalYear.fiscalYear} PSNB vs current-policy baseline; rule headroom ${formatBn(
				baselineComparison.adjustedStabilityHeadroom,
			)}`,
			tone: trajectoryTone,
			intensity: Math.abs(psnbDelta) / 50_000_000_000,
		},
		{
			id: "who-pays",
			kicker: "Distributional baseline",
			title: "Household incidence",
			value:
				distribution.modelledLines > 0
					? `D1 ${formatHouseholdImpact(
							bottomDecile,
						)} / D10 ${formatHouseholdImpact(topDecile)}`
					: "Not modelled",
			detail: `${distribution.modelledLines}/${distribution.totalLines} lines with incidence; baseline = £0/yr`,
			tone: distributionTone,
			intensity: maxHouseholdImpact / 1000,
		},
		{
			id: "macro",
			kicker: "Macro bridge",
			title: "Static -> GE score",
			value: formatBnDelta(macroAdjustment),
			detail: `${formatBn(staticNet)} ready-reckoner -> ${formatBn(
				geYear1,
			)} GE year 1`,
			tone:
				macroAdjustment > 0
					? "blue"
					: macroAdjustment < 0
						? "amber"
						: "muted",
			intensity: Math.abs(macroAdjustment) / Math.max(Math.abs(staticNet), 1),
		},
		{
			id: "stress",
			kicker: "Stress/reaction",
			title: "Fiscal-rule risk",
			value: fiscalRuleFan
				? `${formatProbability(
						fiscalRuleFan.breachProbability,
					)} raw -> ${formatProbability(
						fiscalRuleFan.postReactionBreachProbability,
					)} post`
				: baselineComparison.diagnostics.riskRating,
			detail: largestDownsideLayer
				? `Largest downside: ${largestDownsideLayer.label}`
				: `${ruleYear.fiscalYear} rule-year central case`,
			tone: breachTone,
			intensity: fiscalRuleFan?.breachProbability ?? 0,
		},
		{
			id: "assumptions",
			kicker: "Model inputs",
			title: "Line assumptions",
			value: `${scenarioLineCount} line${scenarioLineCount === 1 ? "" : "s"}`,
			detail: `Behavioural adjustment ${formatBnDelta(
				dynamicAdjustment,
			)}; rule headroom move ${formatBnDelta(ruleHeadroomDelta)}`,
			tone:
				dynamicAdjustment > 0
					? "blue"
					: dynamicAdjustment < 0
						? "amber"
						: "muted",
			intensity: Math.abs(dynamicAdjustment) / Math.max(Math.abs(staticNet), 1),
		},
		{
			id: "audit",
			kicker: "Evidence pack",
			title: "Audit trail",
			value: fiscalRuleFan ? `${fiscalRuleFan.samples} risk draws` : "Central case",
			detail: "Calibration, provenance, backtests, uncertainty layers",
			tone: "blue",
			intensity: fiscalRuleFan ? 1 : 0.55,
		},
	];

	return (
		<section
			aria-label="Report narrative map"
			className="rounded-lg border bg-background/70 p-3 shadow-sm"
		>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<h2 className="text-sm font-semibold">Report narrative map</h2>
				<p className="text-[11px] text-muted-foreground">
					Baselines, counterfactuals, stress, and evidence in one scan.
				</p>
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
				{cards.map((card) => (
					<ReportSignalCard
						key={card.id}
						card={card}
						selected={activeSection === card.id}
						onSelect={onSelect}
					/>
				))}
			</div>
		</section>
	);
}

interface ReportSignalCardData {
	id: SectionId;
	kicker: string;
	title: string;
	value: string;
	detail: string;
	tone: SignalTone;
	intensity: number;
}

function ReportSignalCard({
	card,
	selected,
	onSelect,
}: {
	card: ReportSignalCardData;
	selected: boolean;
	onSelect: (id: SectionId) => void;
}) {
	return (
		<button
			type="button"
			aria-controls={sectionHash(card.id)}
			aria-current={selected ? "true" : undefined}
			onClick={() => onSelect(card.id)}
			className={cn(
				"min-w-0 rounded-md border bg-background/80 p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
				selected && "border-blue-300 bg-blue-50/70",
			)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
					{card.kicker}
				</span>
				<span
					className={cn(
						"shrink-0 text-[9px] uppercase tracking-wider",
						signalToneClassName(card.tone),
					)}
				>
					{SECTION_NAV.find((item) => item.id === card.id)?.label}
				</span>
			</div>
			<div className="mt-2 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-medium text-foreground">
						{card.title}
					</div>
					<div
						className={cn(
							"mt-0.5 truncate text-sm font-semibold tabular-nums",
							signalToneClassName(card.tone),
						)}
					>
						{card.value}
					</div>
				</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
				<span
					className={cn("block h-full", signalBarClassName(card.tone))}
					style={{ width: formatStylePct(card.intensity) }}
				/>
			</div>
			<div className="mt-2 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
				{card.detail}
			</div>
		</button>
	);
}

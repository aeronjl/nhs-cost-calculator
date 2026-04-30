"use client";

import { useEffect, useMemo, useState } from "react";
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
import { buildModelAuditEvidencePack } from "@/lib/model-audit";
import { BaselineComparisonPanel } from "./baseline-comparison";
import { CollapsibleSection } from "./collapsible-section";
import { DistributionalImpact } from "./distributional-impact";
import { HouseholdImpactPanel } from "./household-impact";
import { MacroStatePanel } from "./macro-state-panel";
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
//   • 5 collapsible sections (closed by default; state persisted):
//     - Trajectory: multi-year + vs OBR baseline
//     - Who pays: distributional + microsim + household archetypes
//     - Macro feedback: tier breakdown (reckoner→dynamic→macro→GE) + macro state
//     - Assumptions: per-line caveats with full methodology
//     - Model audit: calibration/backtest evidence pack
//
//   • "Expand all" toggle in rail header for power users.
//
// Mobile and desktop share the same structure. State persisted via
// localStorage so a user's preferred depth survives reloads.

interface Props {
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
	"assumptions",
	"audit",
] as const;
type SectionId = (typeof SECTION_IDS)[number];

const STORAGE_KEY = "simulator-rail-sections";

export function OutputRail({
	scenario,
	comparisons,
	usdPerGbp,
	baseline = OBR_BASELINE,
	emptyMessage = "Add a lever to your scenario to see what it'd fund or cost.",
}: Props) {
	// Open-state map for collapsible sections. Default closed; restored from
	// localStorage on mount.
	const [openMap, setOpenMap] = useState<Record<SectionId, boolean>>({
		trajectory: false,
		"who-pays": false,
		macro: false,
		assumptions: false,
		audit: false,
	});

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
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
		} catch {
			// ignore
		}
	}, [openMap]);

	const toggle = (id: SectionId) =>
		setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
	const allOpen = SECTION_IDS.every((id) => openMap[id]);
	const setAll = (v: boolean) =>
		setOpenMap({
			trajectory: v,
			"who-pays": v,
			macro: v,
			assumptions: v,
			audit: v,
		});

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
	const modelAudit = useMemo(
		() =>
			openMap.audit && scenario.length > 0
				? buildModelAuditEvidencePack({
						result,
						baseline,
						baselineComparison,
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
			openMap.audit,
			result,
			scenario.length,
		],
	);
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
			<div className="flex flex-col gap-3 text-sm text-muted-foreground py-6 text-center">
				<div className="text-4xl" aria-hidden="true">
					📐
				</div>
				<p>{emptyMessage}</p>
			</div>
		);
	}

	const year1 = projection[0];
	const year5 = projection[projection.length - 1];

	return (
		<div className="space-y-3">
			{/* Top zone: always-visible essential summary */}
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

			{/* Header strip with "Expand all / Collapse all" toggle */}
			<div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
				<span>More detail</span>
				<button
					type="button"
					onClick={() => setAll(!allOpen)}
					className="hover:text-foreground transition-colors"
				>
					{allOpen ? "Collapse all" : "Expand all"}
				</button>
			</div>

			{/* 4 collapsible sections — closed by default */}
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

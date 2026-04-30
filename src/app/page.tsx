import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { loadResolvedBaseline } from "@/data/baseline/obr-baseline";
import { loadResolvedOutturns } from "@/data/historical/era-baselines";
import {
	loadResolvedComparisons,
	type ResolvedComparison,
} from "@/data/comparisons";
import { resolveSimulatorState } from "@/lib/url-state";
import {
	type ScenarioLine,
	deserializeScenario,
	evaluateScenario,
	serializeScenario,
} from "@/lib/scenario";
import {
	GOAL_DEFINITIONS,
	type WizardGoal,
	materialiseGoalLine,
} from "@/lib/wizard-goals";
import { getUsdPerGbp } from "@/lib/fx";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { formatMoney } from "./utils/formatters";

// The wizard is the main entry. Step into the Treasury, make decisions
// with live impact, end on a fiscal report. Power-user free-form editing now
// lives inside the Result step; comparison-share URLs route to /reference.
//
// Legacy simulator share-links (those with ?scenario= / ?editor= / ?cf_*
// / ?to_* params from before the route swap) decode into the wizard's
// state and land at the Result step pre-populated, so old links keep
// working. Comparison-only shares (?id=… / ?q=…) redirect to /reference.

type SearchParams = Promise<{
	// Comparison surface (legacy — redirected to /reference)
	id?: string;
	q?: string;
	a?: string;
	slice?: string;
	// Legacy simulator namespaces
	to_goal?: string;
	to_q?: string;
	to_amount?: string;
	to_tax?: string;
	to_prog?: string;
	to_split?: string;
	cf_mode?: string;
	cf_prog?: string;
	cf_pct?: string;
	cf_tax?: string;
	cf_pp?: string;
	scenario?: string;
	editor?: string;
	g?: string;
	gq?: string;
	ga?: string;
	// Wizard URL state (read by WizardShell client-side)
	wstep?: string;
	wgoal?: string;
	wera?: string;
	wmode?: string;
	wsparkline?: string;
	wiz?: string;
}>;

const isComparisonShare = (
	params: Record<string, string | undefined>,
): boolean => Boolean(params.id || params.q || params.a || params.slice);

const isSimulatorShare = (
	params: Record<string, string | undefined>,
): boolean =>
	Boolean(
		params.scenario ||
			params.editor ||
			params.g ||
			params.gq ||
			params.ga ||
			params.to_goal ||
			params.to_q ||
			params.to_amount ||
			params.to_tax ||
			params.to_prog ||
			params.to_split ||
			params.cf_mode ||
			params.cf_prog ||
			params.cf_pct ||
			params.cf_tax ||
			params.cf_pp,
	);

const isWizardShare = (
	params: Record<string, string | undefined>,
): boolean =>
	Boolean(
		params.wstep ||
			params.wgoal ||
			params.wera ||
			params.wmode ||
			params.wsparkline ||
			params.wiz,
	);

const resolveReportScenario = (
	params: Record<string, string | undefined>,
	comparisons: readonly ResolvedComparison[],
): ScenarioLine[] => {
	const wizardLines = params.wiz ? deserializeScenario(params.wiz) : [];
	const goal =
		params.wgoal && params.wgoal in GOAL_DEFINITIONS
			? (params.wgoal as WizardGoal)
			: null;
	const goalLine = materialiseGoalLine(goal);
	if (wizardLines.length > 0 || goalLine) {
		return goalLine ? [goalLine, ...wizardLines] : wizardLines;
	}
	return resolveSimulatorState(params, comparisons).scenario;
};

const buildReferenceRedirect = (
	params: Record<string, string | undefined>,
): string => {
	const qs = new URLSearchParams();
	if (params.id) qs.set("id", params.id);
	if (params.q) qs.set("q", params.q);
	if (params.a) qs.set("a", params.a);
	if (params.slice) qs.set("slice", params.slice);
	const s = qs.toString();
	return s ? `/reference?${s}` : "/reference";
};

export async function generateMetadata({
	searchParams,
}: { searchParams: SearchParams }): Promise<Metadata> {
	const params = await searchParams;
	const comparisons = await loadResolvedComparisons();

	let title = "Step into the Treasury — NHS Cost Calculator";
	let description =
		"A guided walk-through of UK fiscal-policy decisions. Real-time impact, explicit constraints, ends in a full fiscal report.";

	const scenario = resolveReportScenario(params, comparisons);
	if (scenario.length > 0) {
		const result = evaluateScenario(scenario);
		const direction =
			result.net > 0
				? "frees"
				: result.net < 0
					? "shortfall of"
					: "balanced";
		title =
			result.net === 0
				? `Fiscal scenario (${scenario.length} line${scenario.length === 1 ? "" : "s"}): balanced`
				: `Fiscal scenario: ${direction} ${formatMoney(Math.abs(Math.round(result.net)), "GBP")}`;
		description = `${scenario.length} fiscal lever change${scenario.length === 1 ? "" : "s"}. View the report at NHSCostCalculator.com.`;
	}

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: "/",
		},
	};
}

export default async function Home({
	searchParams,
}: { searchParams: SearchParams }) {
	const params = await searchParams;

	// Comparison-share URLs (?id=…) belong to /reference now.
	if (isComparisonShare(params) && !isSimulatorShare(params) && !isWizardShare(params)) {
		redirect(buildReferenceRedirect(params));
	}

	const [baseline, resolvedOutturns, comparisons, usdPerGbp] = await Promise.all([
		loadResolvedBaseline(),
		loadResolvedOutturns(),
		loadResolvedComparisons(),
		getUsdPerGbp(),
	]);

	// Legacy simulator share — decode the scenario lines server-side and
	// pass to the wizard as initial state. The wizard lands at Result
	// step (where the analytics report lives) pre-populated.
	let initialScenario: string | undefined;
	let initialStep: number | undefined;
	if (isSimulatorShare(params) && !isWizardShare(params)) {
		const sim = resolveSimulatorState(params, comparisons);
		if (sim.scenario.length > 0) {
			initialScenario = serializeScenario(sim.scenario);
			initialStep = 5; // jump to Result
		}
	}

	return (
		<Suspense>
			<WizardShell
				baseline={baseline}
				resolvedOutturns={resolvedOutturns}
				comparisons={comparisons}
				usdPerGbp={usdPerGbp}
				initialScenarioOverride={initialScenario}
				initialStepOverride={initialStep}
			/>
		</Suspense>
	);
}

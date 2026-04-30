import { ANNOTATED_BUDGETS } from "@/data/budgets/annotated";
import {
	FISCAL_REACTION_BACKTEST_EPISODES,
	type FiscalReactionBacktestEpisode,
	type FiscalReactionPackageId,
} from "@/data/fiscal-reaction-backtests";
import {
	POLICY_REACTION_PROTOTYPES,
	buildPolicyReactionPackage,
	explainPolicyReactionSelection,
	type PolicyReactionOptionId,
	type PolicyReactionPackage,
	type PolicyReactionSelectionScore,
} from "./policy-reaction-packages";
import { deserializeScenario, evaluateScenario, type ScenarioLine } from "./scenario";

export type FiscalReactionBacktestStatus = "match" | "partial" | "miss";

export interface FiscalReactionComposition {
	taxShare: number;
	spendingShare: number;
	grossTighteningGbp: number;
	leverIds: readonly string[];
}

export interface FiscalReactionBacktestRow {
	episode: FiscalReactionBacktestEpisode;
	budgetName: string;
	mechanicalPackageId: PolicyReactionOptionId | null;
	mechanicalPackageLabel: string;
	selectedPackageId: PolicyReactionOptionId | null;
	selectedPackageLabel: string;
	selectedPackage: PolicyReactionPackage | null;
	actualPackageId: FiscalReactionPackageId;
	actualComposition: FiscalReactionComposition;
	modelComposition: FiscalReactionComposition | null;
	shareDistance: number | null;
	leverOverlap: number;
	mechanicalStatus: FiscalReactionBacktestStatus;
	status: FiscalReactionBacktestStatus;
	diagnosis: string;
	priorProfileLabels: readonly string[];
	priorChangedSelection: boolean;
	selectionScores: readonly PolicyReactionSelectionScore[];
}

export interface FiscalReactionBacktestSummary {
	rows: FiscalReactionBacktestRow[];
	mechanicalMatches: number;
	mechanicalPartials: number;
	mechanicalMisses: number;
	matches: number;
	partials: number;
	misses: number;
	priorChangedRows: number;
	meanLeverOverlap: number;
	meanShareDistance: number;
}

const prototypeFor = (id: PolicyReactionOptionId) =>
	POLICY_REACTION_PROTOTYPES.find((prototype) => prototype.id === id) ??
	POLICY_REACTION_PROTOTYPES[0]!;

const lineGrossTightening = (line: ScenarioLine): number => {
	const result = evaluateScenario([line]);
	const delta = result.lines[0]?.deltaGbp ?? 0;
	return delta > 0 ? delta : 0;
};

const compositionForLines = (
	lines: readonly ScenarioLine[],
): FiscalReactionComposition => {
	let taxGbp = 0;
	let spendingGbp = 0;
	const leverIds = new Set<string>();
	for (const line of lines) {
		const gross = lineGrossTightening(line);
		if (gross <= 0) continue;
		if (line.type === "tax") taxGbp += gross;
		if (line.type === "programme") spendingGbp += gross;
		if (line.type !== "borrow") leverIds.add(`${line.type}:${line.leverId}`);
	}
	const total = taxGbp + spendingGbp;
	return {
		taxShare: total > 0 ? taxGbp / total : 0,
		spendingShare: total > 0 ? spendingGbp / total : 0,
		grossTighteningGbp: total,
		leverIds: [...leverIds].sort(),
	};
};

const compositionForPackage = (
	pkg: PolicyReactionPackage,
): FiscalReactionComposition => {
	const total = pkg.taxTighteningGbp + pkg.spendingTighteningGbp;
	return {
		taxShare: total > 0 ? pkg.taxTighteningGbp / total : 0,
		spendingShare: total > 0 ? pkg.spendingTighteningGbp / total : 0,
		grossTighteningGbp: total,
		leverIds: pkg.components
			.map((component) => `${component.type}:${component.leverId}`)
			.sort(),
	};
};

const shareDistance = (
	a: FiscalReactionComposition,
	b: FiscalReactionComposition,
): number =>
	(Math.abs(a.taxShare - b.taxShare) +
		Math.abs(a.spendingShare - b.spendingShare)) /
	2;

const leverOverlap = (
	model: FiscalReactionComposition | null,
	actual: FiscalReactionComposition,
): number => {
	if (!model || actual.leverIds.length === 0) return 0;
	const modelSet = new Set(model.leverIds);
	const matches = actual.leverIds.filter((id) => modelSet.has(id)).length;
	return matches / actual.leverIds.length;
};

const statusFor = (
	selectedPackageId: PolicyReactionOptionId | null,
	actualPackageId: FiscalReactionPackageId,
	distance: number | null,
	overlap: number,
): FiscalReactionBacktestStatus => {
	if (selectedPackageId === actualPackageId) return "match";
	if ((distance ?? 1) <= 0.25 || overlap >= 0.35) return "partial";
	return "miss";
};

const diagnosisFor = (
	row: Omit<FiscalReactionBacktestRow, "status" | "diagnosis">,
	status: FiscalReactionBacktestStatus,
): string => {
	if (
		status === "match" &&
		row.mechanicalStatus !== "match" &&
		row.priorChangedSelection
	) {
		return `Institutional priors move the selector from ${row.mechanicalPackageLabel} to the historical ${row.actualPackageId} package shape.`;
	}
	if (status === "match") {
		return `Selector matches the historical ${row.actualPackageId} package shape.`;
	}
	if (status === "partial") {
		return `Selector misses the headline label but captures part of the tax/spending mix or instrument set.`;
	}
	if (row.selectedPackageId === "tax-led" && row.actualPackageId === "spending-led") {
		return "Rule arithmetic points to tax-led repair, but the historical choice was politically spending-led.";
	}
	if (row.selectedPackageId === "balanced" && row.actualPackageId === "spending-led") {
		return "Without party-preference priors, the selector defaults to a balanced package and misses the spending-led political choice.";
	}
	return `Selector chose ${row.selectedPackageId ?? "none"} against a historical ${row.actualPackageId} package.`;
};

export const evaluateFiscalReactionBacktestEpisode = (
	episode: FiscalReactionBacktestEpisode,
): FiscalReactionBacktestRow => {
	const selectionState = {
		policyReactionGbp: episode.targetCorrectionGbp,
		stabilityRuleBreached: episode.stabilityRuleBreached,
		growthShock: episode.growthShock,
		inflationShock: episode.inflationShock,
		rateStress: episode.rateStress,
		mode: "stress-contingent",
	} as const;
	const mechanicalSelection = explainPolicyReactionSelection(selectionState);
	const selection = explainPolicyReactionSelection({
		...selectionState,
		institutionalPriorProfileIds: episode.institutionalPriorProfileIds,
	});
	const selectedPackageId = selection.selectedId;
	const selectedPackage =
		selectedPackageId === null
			? null
			: buildPolicyReactionPackage(
					prototypeFor(selectedPackageId),
					episode.targetCorrectionGbp,
					5,
				);
	const mechanicalPackage =
		mechanicalSelection.selectedId === null
			? null
			: buildPolicyReactionPackage(
					prototypeFor(mechanicalSelection.selectedId),
					episode.targetCorrectionGbp,
					5,
				);
	const actualComposition = compositionForLines(
		deserializeScenario(episode.actualScenario),
	);
	const modelComposition = selectedPackage
		? compositionForPackage(selectedPackage)
		: null;
	const mechanicalComposition = mechanicalPackage
		? compositionForPackage(mechanicalPackage)
		: null;
	const distance = modelComposition
		? shareDistance(modelComposition, actualComposition)
		: null;
	const overlap = leverOverlap(modelComposition, actualComposition);
	const mechanicalDistance = mechanicalComposition
		? shareDistance(mechanicalComposition, actualComposition)
		: null;
	const mechanicalOverlap = leverOverlap(
		mechanicalComposition,
		actualComposition,
	);
	const budget = ANNOTATED_BUDGETS.find((item) => item.id === episode.budgetId);
	const mechanicalStatus = statusFor(
		mechanicalSelection.selectedId,
		episode.actualPackageId,
		mechanicalDistance,
		mechanicalOverlap,
	);
	const base = {
		episode,
		budgetName: budget?.name ?? episode.label,
		mechanicalPackageId: mechanicalSelection.selectedId,
		mechanicalPackageLabel:
			mechanicalSelection.selectedId === null
				? "No reaction"
				: prototypeFor(mechanicalSelection.selectedId).label,
		selectedPackageId,
		selectedPackageLabel:
			selectedPackageId === null
				? "No reaction"
				: prototypeFor(selectedPackageId).label,
		selectedPackage,
		actualPackageId: episode.actualPackageId,
		actualComposition,
		modelComposition,
		shareDistance: distance,
		leverOverlap: overlap,
		mechanicalStatus,
		priorProfileLabels: selection.appliedPriors.map((profile) => profile.label),
		priorChangedSelection:
			mechanicalSelection.selectedId !== selection.selectedId,
		selectionScores: selection.scores,
	};
	const status = statusFor(
		selectedPackageId,
		episode.actualPackageId,
		distance,
		overlap,
	);
	return {
		...base,
		status,
		diagnosis: diagnosisFor(base, status),
	};
};

export const auditFiscalReactionBacktests =
	(): FiscalReactionBacktestSummary => {
		const rows = FISCAL_REACTION_BACKTEST_EPISODES.map(
			evaluateFiscalReactionBacktestEpisode,
		);
		const mechanicalMatches = rows.filter(
			(row) => row.mechanicalStatus === "match",
		).length;
		const mechanicalPartials = rows.filter(
			(row) => row.mechanicalStatus === "partial",
		).length;
		const mechanicalMisses = rows.filter(
			(row) => row.mechanicalStatus === "miss",
		).length;
		const matches = rows.filter((row) => row.status === "match").length;
		const partials = rows.filter((row) => row.status === "partial").length;
		const misses = rows.filter((row) => row.status === "miss").length;
		const priorChangedRows = rows.filter(
			(row) => row.priorChangedSelection,
		).length;
		const meanLeverOverlap =
			rows.length > 0
				? rows.reduce((sum, row) => sum + row.leverOverlap, 0) / rows.length
				: 0;
		const distanceRows = rows.filter(
			(row): row is FiscalReactionBacktestRow & { shareDistance: number } =>
				row.shareDistance !== null,
		);
		const meanShareDistance =
			distanceRows.length > 0
				? distanceRows.reduce((sum, row) => sum + row.shareDistance, 0) /
					distanceRows.length
				: 0;
		return {
			rows,
			mechanicalMatches,
			mechanicalPartials,
			mechanicalMisses,
			matches,
			partials,
			misses,
			priorChangedRows,
			meanLeverOverlap,
			meanShareDistance,
		};
	};

import { REPRESENTATIVE_HOUSEHOLDS } from "@/data/households";
import { getTaxLever, type TaxUnit } from "@/data/levers/tax-rates";
import { getProgramme } from "@/data/levers/uk-spending";
import { DECILE_DISPOSABLE_INCOME } from "./distribution";
import { evaluateHouseholdImpact } from "./household-impact";
import {
	TAX_TO_GDP_RATIO,
	getProgrammeMultiplier,
	getTaxMultiplier,
	multiplierAtYear,
} from "./macro";
import {
	evaluateScenario,
	evaluateScenarioDistribution,
	evaluateLine,
	evaluateLineDynamic,
	type LineType,
	type ScenarioLine,
} from "./scenario";

export type PolicyReactionOptionId =
	| "balanced"
	| "tax-led"
	| "spending-led"
	| "delayed";

export interface PolicyReactionSelectionState {
	policyReactionGbp: number;
	stabilityRuleBreached: boolean;
	growthShock: number;
	inflationShock: number;
	rateStress: number;
	mode?: PolicyReactionOptionId | "stress-contingent";
}

export interface PolicyReactionPrototype {
	id: PolicyReactionOptionId;
	label: string;
	description: string;
	taxShare: number;
	spendingShare: number;
	implementationLagYears: number;
	taxInstruments: readonly PolicyReactionInstrumentTemplate[];
	spendingInstruments: readonly PolicyReactionInstrumentTemplate[];
}

interface PolicyReactionInstrumentTemplate {
	type: Exclude<LineType, "borrow">;
	leverId: string;
	direction: 1 | -1;
	maxMagnitude: number;
	weight: number;
	rationale: string;
}

interface CandidateInstrument extends PolicyReactionInstrumentTemplate {
	unitStaticGbp: number;
	capacityGbp: number;
	capacityMagnitude: number;
}

const HOUSEHOLDS_PER_DECILE = 2_800_000;

export interface PolicyReactionComponent {
	type: Exclude<LineType, "borrow">;
	leverId: string;
	label: string;
	quantityLabel: string;
	rationale: string;
	magnitude: number;
	staticScoreGbp: number;
	dynamicScoreGbp: number;
	behaviouralAdjustmentGbp: number;
	macroFeedbackGbp: number;
	effectiveCorrectionGbp: number;
	gdpDragGbp: number;
	workerCevGbp: number;
	capacityGbp: number;
	capacityUsed: number;
}

export interface PolicyReactionDecileImpact {
	decile: number;
	perHouseholdGbp: number;
	incomeShare: number;
}

export interface PolicyReactionHouseholdImpact {
	id: string;
	label: string;
	decile: number;
	impactGbp: number;
	incomeShare: number;
}

export interface PolicyReactionIncidenceSummary {
	modelledLines: number;
	totalLines: number;
	modelledDeltaGbp: number;
	totalDeltaGbp: number;
	unmodelledDeltaGbp: number;
	bottomDecile: PolicyReactionDecileImpact;
	middleDecile: PolicyReactionDecileImpact;
	topDecile: PolicyReactionDecileImpact;
	largestDecileLoss: PolicyReactionDecileImpact;
	hardestHitByIncomeShare: PolicyReactionDecileImpact;
	hardestHitHousehold: PolicyReactionHouseholdImpact | null;
	households: readonly PolicyReactionHouseholdImpact[];
	progressivity: "progressive" | "broad" | "regressive" | "mixed";
}

export interface PolicyReactionPackage {
	components: readonly PolicyReactionComponent[];
	staticTighteningGbp: number;
	dynamicTighteningGbp: number;
	behaviouralAdjustmentGbp: number;
	macroFeedbackGbp: number;
	effectiveCorrectionGbp: number;
	taxTighteningGbp: number;
	spendingTighteningGbp: number;
	gdpDragGbp: number;
	workerCevGbp: number;
	targetCorrectionGbp: number;
	residualGapGbp: number;
	bindingConstraints: readonly string[];
	incidence: PolicyReactionIncidenceSummary;
}

export const POLICY_REACTION_PROTOTYPES: readonly PolicyReactionPrototype[] = [
	{
		id: "balanced",
		label: "Balanced mix",
		description:
			"Concrete tax and spending package sized to restore headroom, with mid-range demand drag.",
		taxShare: 0.5,
		spendingShare: 0.5,
		implementationLagYears: 0,
		taxInstruments: [
			{
				type: "tax",
				leverId: "freeze-personal-allowance",
				direction: 1,
				maxMagnitude: 1.5,
				weight: 2.5,
				rationale: "Extends an existing fiscal-drag instrument.",
			},
			{
				type: "tax",
				leverId: "freeze-higher-rate-threshold",
				direction: 1,
				maxMagnitude: 1.5,
				weight: 1.5,
				rationale: "Raises revenue from higher earners without a headline rate rise.",
			},
			{
				type: "tax",
				leverId: "employer-nics-main",
				direction: 1,
				maxMagnitude: 0.75,
				weight: 2,
				rationale: "Broad payroll base with slower pass-through to wages.",
			},
			{
				type: "tax",
				leverId: "dividend-tax",
				direction: 1,
				maxMagnitude: 2,
				weight: 1,
				rationale: "Asset-income measure with lower demand drag.",
			},
		],
		spendingInstruments: [
			{
				type: "programme",
				leverId: "transport",
				direction: -1,
				maxMagnitude: 8,
				weight: 2,
				rationale: "Capital reprofiling is feasible but slows investment delivery.",
			},
			{
				type: "programme",
				leverId: "international-aid",
				direction: -1,
				maxMagnitude: 15,
				weight: 2,
				rationale: "Politically available ODA restraint with little UK GDP drag.",
			},
			{
				type: "programme",
				leverId: "police-justice",
				direction: -1,
				maxMagnitude: 3,
				weight: 1,
				rationale: "Small resource squeeze; operational pressure limits the cap.",
			},
			{
				type: "programme",
				leverId: "local-govt-grants",
				direction: -1,
				maxMagnitude: 2,
				weight: 1,
				rationale: "Small grant restraint; large cuts trigger service-failure risk.",
			},
		],
	},
	{
		id: "tax-led",
		label: "Tax-led",
		description:
			"Mostly broad-base tax rises, scored through taxable-base elasticities and demand feedback.",
		taxShare: 0.8,
		spendingShare: 0.2,
		implementationLagYears: 0,
		taxInstruments: [
			{
				type: "tax",
				leverId: "employer-nics-main",
				direction: 1,
				maxMagnitude: 1.25,
				weight: 2.5,
				rationale: "High-yield payroll base; incidence mainly on wages over time.",
			},
			{
				type: "tax",
				leverId: "nics-main",
				direction: 1,
				maxMagnitude: 1,
				weight: 2,
				rationale: "Employee NICs is a visible but familiar labour-tax lever.",
			},
			{
				type: "tax",
				leverId: "basic-rate-income-tax",
				direction: 1,
				maxMagnitude: 1,
				weight: 1.75,
				rationale: "Large base, but salient for household disposable income.",
			},
			{
				type: "tax",
				leverId: "vat-standard",
				direction: 1,
				maxMagnitude: 1,
				weight: 1,
				rationale: "Powerful base; capped because of CPI and distributional pressure.",
			},
			{
				type: "tax",
				leverId: "corporation-tax",
				direction: 1,
				maxMagnitude: 1,
				weight: 1,
				rationale: "Adds business-tax contribution without relying on it for the bulk.",
			},
			{
				type: "tax",
				leverId: "freeze-personal-allowance",
				direction: 1,
				maxMagnitude: 2,
				weight: 1.5,
				rationale: "Stealthier fiscal drag complements rate rises.",
			},
			{
				type: "tax",
				leverId: "freeze-higher-rate-threshold",
				direction: 1,
				maxMagnitude: 2,
				weight: 1,
				rationale: "Adds top-half fiscal drag.",
			},
		],
		spendingInstruments: [
			{
				type: "programme",
				leverId: "international-aid",
				direction: -1,
				maxMagnitude: 10,
				weight: 2,
				rationale: "Small supporting cut with low domestic demand effect.",
			},
			{
				type: "programme",
				leverId: "transport",
				direction: -1,
				maxMagnitude: 5,
				weight: 1,
				rationale: "Limited reprofiling avoids making the package spending-led.",
			},
		],
	},
	{
		id: "spending-led",
		label: "Spending-led",
		description:
			"Mostly spending restraint, capped by cuttability and higher multiplier drag.",
		taxShare: 0.2,
		spendingShare: 0.8,
		implementationLagYears: 0,
		taxInstruments: [
			{
				type: "tax",
				leverId: "freeze-personal-allowance",
				direction: 1,
				maxMagnitude: 1,
				weight: 2,
				rationale: "Small fiscal-drag backstop if programme cuts bind.",
			},
			{
				type: "tax",
				leverId: "freeze-higher-rate-threshold",
				direction: 1,
				maxMagnitude: 1,
				weight: 1,
				rationale: "Companion threshold freeze.",
			},
			{
				type: "tax",
				leverId: "dividend-tax",
				direction: 1,
				maxMagnitude: 1,
				weight: 1,
				rationale: "Small asset-income contribution.",
			},
		],
		spendingInstruments: [
			{
				type: "programme",
				leverId: "working-age-welfare",
				direction: -1,
				maxMagnitude: 4,
				weight: 2.5,
				rationale: "Largest flexible programme, but sharply regressive.",
			},
			{
				type: "programme",
				leverId: "transport",
				direction: -1,
				maxMagnitude: 12,
				weight: 2,
				rationale: "Capital deferral/reprioritisation carries output costs.",
			},
			{
				type: "programme",
				leverId: "international-aid",
				direction: -1,
				maxMagnitude: 25,
				weight: 2,
				rationale: "High cuttability, limited UK macro feedback.",
			},
			{
				type: "programme",
				leverId: "defence",
				direction: -1,
				maxMagnitude: 4,
				weight: 1,
				rationale: "Procurement reprofiling only; NATO constraints cap this tightly.",
			},
			{
				type: "programme",
				leverId: "police-justice",
				direction: -1,
				maxMagnitude: 5,
				weight: 1,
				rationale: "High-service-pressure resource line; large cuts are not credible.",
			},
			{
				type: "programme",
				leverId: "education",
				direction: -1,
				maxMagnitude: 2,
				weight: 0.75,
				rationale: "Small settlement squeeze; schools visibility limits the cap.",
			},
		],
	},
	{
		id: "delayed",
		label: "Delayed consolidation",
		description:
			"Balanced measures with a two-year implementation lag, so debt improves more slowly.",
		taxShare: 0.5,
		spendingShare: 0.5,
		implementationLagYears: 2,
		taxInstruments: [
			{
				type: "tax",
				leverId: "freeze-personal-allowance",
				direction: 1,
				maxMagnitude: 2,
				weight: 2.5,
				rationale: "Delayed fiscal drag extension from the next threshold cycle.",
			},
			{
				type: "tax",
				leverId: "employer-nics-main",
				direction: 1,
				maxMagnitude: 0.75,
				weight: 2,
				rationale: "Rate rise phased in after the lag.",
			},
			{
				type: "tax",
				leverId: "freeze-higher-rate-threshold",
				direction: 1,
				maxMagnitude: 1.5,
				weight: 1.5,
				rationale: "Higher-rate fiscal drag from the next tax year cycle.",
			},
		],
		spendingInstruments: [
			{
				type: "programme",
				leverId: "transport",
				direction: -1,
				maxMagnitude: 10,
				weight: 2,
				rationale: "Back-loaded capital reprofiling.",
			},
			{
				type: "programme",
				leverId: "international-aid",
				direction: -1,
				maxMagnitude: 15,
				weight: 2,
				rationale: "Delayed ODA restraint.",
			},
			{
				type: "programme",
				leverId: "local-govt-grants",
				direction: -1,
				maxMagnitude: 2,
				weight: 1,
				rationale: "Small grant squeeze after the lag.",
			},
		],
	},
];

export const selectPolicyReactionOptionId = (
	state: PolicyReactionSelectionState,
): PolicyReactionOptionId | null => {
	if (state.policyReactionGbp <= 0) return null;
	if (state.mode && state.mode !== "stress-contingent") return state.mode;
	if (
		state.stabilityRuleBreached &&
		(state.rateStress > 0.01 || state.policyReactionGbp > 20_000_000_000)
	) {
		return "tax-led";
	}
	if (state.inflationShock > 0.01 && state.growthShock > -0.006) {
		return "spending-led";
	}
	return "balanced";
};

const taxQuantityLabel = (unit: TaxUnit, magnitude: number): string => {
	const abs = Math.abs(magnitude);
	const sign = magnitude > 0 ? "+" : "-";
	switch (unit) {
		case "pp":
			return `${sign}${abs.toFixed(abs >= 1 ? 1 : 2)}pp`;
		case "yr":
			return `${sign}${abs.toFixed(abs >= 1 ? 1 : 2)}yr freeze`;
		case "k":
			return magnitude < 0
				? `lower GBP ${abs.toFixed(1)}k`
				: `raise GBP ${abs.toFixed(1)}k`;
		case "bn":
			return `${sign}GBP ${abs.toFixed(1)}bn`;
		case "p-per-litre":
			return `${sign}${abs.toFixed(1)}p/l`;
	}
};

const programmeQuantityLabel = (magnitude: number): string =>
	magnitude < 0
		? `cut ${Math.abs(magnitude).toFixed(1)}%`
		: `raise ${Math.abs(magnitude).toFixed(1)}%`;

const unitStaticGbpForTemplate = (
	template: PolicyReactionInstrumentTemplate,
): number => {
	if (template.type === "tax") {
		const lever = getTaxLever(template.leverId);
		return Math.abs(lever.gbpPerUnit * template.direction);
	}
	const programme = getProgramme(template.leverId);
	return programme.value / 100;
};

const capMagnitudeForTemplate = (
	template: PolicyReactionInstrumentTemplate,
): number => {
	if (template.type === "tax") return template.maxMagnitude;
	const programme = getProgramme(template.leverId);
	const cuttableCap = (programme.cuttableFraction ?? 1) * 100;
	return Math.min(template.maxMagnitude, cuttableCap);
};

const toCandidate = (
	template: PolicyReactionInstrumentTemplate,
): CandidateInstrument | null => {
	const capacityMagnitude = capMagnitudeForTemplate(template);
	const unitStaticGbp = unitStaticGbpForTemplate(template);
	const capacityGbp = unitStaticGbp * capacityMagnitude;
	if (capacityMagnitude <= 0 || capacityGbp <= 0 || template.weight <= 0) {
		return null;
	}
	return {
		...template,
		unitStaticGbp,
		capacityMagnitude,
		capacityGbp,
	};
};

const allocateAcrossCandidates = (
	candidates: readonly CandidateInstrument[],
	targetGbp: number,
	existing: Map<CandidateInstrument, number>,
): void => {
	let remainingTarget = Math.max(0, targetGbp);
	let open = candidates.filter((candidate) => {
		const already = existing.get(candidate) ?? 0;
		return candidate.capacityGbp - already > 1;
	});

	while (remainingTarget > 1 && open.length > 0) {
		const weightSum = open.reduce((sum, candidate) => sum + candidate.weight, 0);
		if (weightSum <= 0) break;
		let cappedAny = false;
		const nextOpen: CandidateInstrument[] = [];
		for (const candidate of open) {
			const already = existing.get(candidate) ?? 0;
			const available = candidate.capacityGbp - already;
			const desired = (remainingTarget * candidate.weight) / weightSum;
			if (desired >= available) {
				existing.set(candidate, already + available);
				remainingTarget -= available;
				cappedAny = true;
			} else {
				nextOpen.push(candidate);
			}
		}
		if (!cappedAny) {
			for (const candidate of open) {
				const already = existing.get(candidate) ?? 0;
				const desired = (remainingTarget * candidate.weight) / weightSum;
				existing.set(candidate, already + desired);
			}
			remainingTarget = 0;
		}
		open = nextOpen;
	}
};

const componentsToScenarioLines = (
	components: readonly PolicyReactionComponent[],
	prefix = "policy-reaction",
): ScenarioLine[] =>
	components.map((component, index) => ({
		id: `${prefix}-${index + 1}-${component.leverId}`,
		type: component.type,
		leverId: component.leverId,
		magnitude: component.magnitude,
	}));

const decileImpactFor = (
	perDecile: readonly number[],
	index: number,
): PolicyReactionDecileImpact => {
	const perHouseholdGbp = (perDecile[index] ?? 0) / HOUSEHOLDS_PER_DECILE;
	const income = DECILE_DISPOSABLE_INCOME[index] ?? 0;
	return {
		decile: index + 1,
		perHouseholdGbp,
		incomeShare: income > 0 ? perHouseholdGbp / income : 0,
	};
};

const classifyProgressivity = (
	bottom: PolicyReactionDecileImpact,
	middle: PolicyReactionDecileImpact,
	top: PolicyReactionDecileImpact,
): PolicyReactionIncidenceSummary["progressivity"] => {
	const bottomBurden = Math.max(0, bottom.incomeShare);
	const middleBurden = Math.max(0, middle.incomeShare);
	const topBurden = Math.max(0, top.incomeShare);
	if (bottomBurden <= 0 && middleBurden <= 0 && topBurden <= 0) return "mixed";
	if (bottomBurden > topBurden * 1.25 && bottomBurden > middleBurden * 1.1) {
		return "regressive";
	}
	if (topBurden > bottomBurden * 1.25 && topBurden > middleBurden * 1.1) {
		return "progressive";
	}
	return "broad";
};

const buildPolicyReactionIncidence = (
	components: readonly PolicyReactionComponent[],
): PolicyReactionIncidenceSummary => {
	const lines = componentsToScenarioLines(components, "incidence");
	const result = evaluateScenario(lines);
	const distribution = evaluateScenarioDistribution(result);
	const deciles = distribution.perDecile.map((_, index) =>
		decileImpactFor(distribution.perDecile, index),
	);
	const bottomDecile = deciles[0]!;
	const middleDecile = deciles[4]!;
	const topDecile = deciles[9]!;
	const largestDecileLoss = deciles.reduce((largest, row) =>
		row.perHouseholdGbp > largest.perHouseholdGbp ? row : largest,
	);
	const hardestHitByIncomeShare = deciles.reduce((largest, row) =>
		row.incomeShare > largest.incomeShare ? row : largest,
	);
	const households = REPRESENTATIVE_HOUSEHOLDS.map((household) => {
		const impact = evaluateHouseholdImpact(household, result);
		return {
			id: household.id,
			label: household.label,
			decile: household.decile,
			impactGbp: impact.totalImpactGbp,
			incomeShare: impact.asPercentOfNetIncome,
		};
	});
	const hardestHitHousehold =
		households.length === 0
			? null
			: households.reduce((largest, row) =>
					row.incomeShare > largest.incomeShare ? row : largest,
				);
	const unmodelledDeltaGbp = Math.max(
		0,
		Math.abs(distribution.totalDelta) - Math.abs(distribution.modelledDelta),
	);
	return {
		modelledLines: distribution.modelledLines,
		totalLines: distribution.totalLines,
		modelledDeltaGbp: distribution.modelledDelta,
		totalDeltaGbp: distribution.totalDelta,
		unmodelledDeltaGbp,
		bottomDecile,
		middleDecile,
		topDecile,
		largestDecileLoss,
		hardestHitByIncomeShare,
		hardestHitHousehold,
		households,
		progressivity: classifyProgressivity(bottomDecile, middleDecile, topDecile),
	};
};

const packageForStaticTarget = (
	prototype: PolicyReactionPrototype,
	staticTargetGbp: number,
	horizonYear: number,
	targetCorrectionGbp: number,
): PolicyReactionPackage => {
	const taxCandidates = prototype.taxInstruments.flatMap((template) => {
		const candidate = toCandidate(template);
		return candidate ? [candidate] : [];
	});
	const spendingCandidates = prototype.spendingInstruments.flatMap((template) => {
		const candidate = toCandidate(template);
		return candidate ? [candidate] : [];
	});
	const allocations = new Map<CandidateInstrument, number>();
	const taxTarget = staticTargetGbp * prototype.taxShare;
	const spendingTarget = staticTargetGbp * prototype.spendingShare;

	allocateAcrossCandidates(taxCandidates, taxTarget, allocations);
	allocateAcrossCandidates(spendingCandidates, spendingTarget, allocations);

	const firstPass = Array.from(allocations.values()).reduce(
		(sum, value) => sum + value,
		0,
	);
	const residualStaticTarget = Math.max(0, staticTargetGbp - firstPass);
	if (residualStaticTarget > 1) {
		allocateAcrossCandidates(
			[...taxCandidates, ...spendingCandidates],
			residualStaticTarget,
			allocations,
		);
	}

	const components = Array.from(allocations.entries())
		.filter(([, allocatedGbp]) => allocatedGbp > 1)
		.map(([candidate, allocatedGbp]): PolicyReactionComponent => {
			const magnitude =
				candidate.direction * (allocatedGbp / candidate.unitStaticGbp);
			const line: ScenarioLine = {
				id: `policy-reaction-${candidate.leverId}`,
				type: candidate.type,
				leverId: candidate.leverId,
				magnitude,
			};
			const evaluation = evaluateLine(line);
			const dynamic = evaluateLineDynamic(evaluation);
			const multiplier =
				candidate.type === "tax"
					? getTaxMultiplier(candidate.leverId)
					: getProgrammeMultiplier(candidate.leverId);
			const yearMultiplier = multiplierAtYear(multiplier, horizonYear);
			const macroFeedbackGbp =
				-dynamic.dynamicDelta * yearMultiplier * TAX_TO_GDP_RATIO;
			const effectiveCorrectionGbp = Math.max(
				0,
				dynamic.dynamicDelta + macroFeedbackGbp,
			);
			const label =
				candidate.type === "tax"
					? getTaxLever(candidate.leverId).name
					: getProgramme(candidate.leverId).name;
			const quantityLabel =
				candidate.type === "tax"
					? taxQuantityLabel(getTaxLever(candidate.leverId).unit, magnitude)
					: programmeQuantityLabel(magnitude);
			return {
				type: candidate.type,
				leverId: candidate.leverId,
				label,
				quantityLabel,
				rationale: candidate.rationale,
				magnitude,
				staticScoreGbp: evaluation.deltaGbp,
				dynamicScoreGbp: dynamic.dynamicDelta,
				behaviouralAdjustmentGbp: dynamic.behaviouralAdjustmentGbp,
				macroFeedbackGbp,
				effectiveCorrectionGbp,
				gdpDragGbp: Math.max(0, dynamic.dynamicDelta * yearMultiplier),
				workerCevGbp: dynamic.workerCevGbp,
				capacityGbp: candidate.capacityGbp,
				capacityUsed:
					candidate.capacityGbp > 0
						? Math.min(1, allocatedGbp / candidate.capacityGbp)
						: 0,
			};
		});

	const staticTighteningGbp = components.reduce(
		(sum, component) => sum + component.staticScoreGbp,
		0,
	);
	const dynamicTighteningGbp = components.reduce(
		(sum, component) => sum + component.dynamicScoreGbp,
		0,
	);
	const behaviouralAdjustmentGbp = components.reduce(
		(sum, component) => sum + component.behaviouralAdjustmentGbp,
		0,
	);
	const macroFeedbackGbp = components.reduce(
		(sum, component) => sum + component.macroFeedbackGbp,
		0,
	);
	const effectiveCorrectionGbp = components.reduce(
		(sum, component) => sum + component.effectiveCorrectionGbp,
		0,
	);
	const taxTighteningGbp = components
		.filter((component) => component.type === "tax")
		.reduce((sum, component) => sum + component.staticScoreGbp, 0);
	const spendingTighteningGbp = components
		.filter((component) => component.type === "programme")
		.reduce((sum, component) => sum + component.staticScoreGbp, 0);
	const gdpDragGbp = components.reduce(
		(sum, component) => sum + component.gdpDragGbp,
		0,
	);
	const workerCevGbp = components.reduce(
		(sum, component) => sum + component.workerCevGbp,
		0,
	);
	const bindingConstraints = components
		.filter((component) => component.capacityUsed >= 0.98)
		.map((component) => component.label);
	const incidence = buildPolicyReactionIncidence(components);

	return {
		components,
		staticTighteningGbp,
		dynamicTighteningGbp,
		behaviouralAdjustmentGbp,
		macroFeedbackGbp,
		effectiveCorrectionGbp,
		taxTighteningGbp,
		spendingTighteningGbp,
		gdpDragGbp,
		workerCevGbp,
		targetCorrectionGbp,
		residualGapGbp: Math.max(0, targetCorrectionGbp - effectiveCorrectionGbp),
		bindingConstraints,
		incidence,
	};
};

const maxStaticCapacity = (prototype: PolicyReactionPrototype): number =>
	[...prototype.taxInstruments, ...prototype.spendingInstruments].reduce(
		(sum, template) => {
			const candidate = toCandidate(template);
			return sum + (candidate?.capacityGbp ?? 0);
		},
		0,
	);

export const buildPolicyReactionPackage = (
	prototype: PolicyReactionPrototype,
	targetCorrectionGbp: number,
	horizonYear: number,
): PolicyReactionPackage => {
	if (targetCorrectionGbp <= 0) {
		return packageForStaticTarget(prototype, 0, horizonYear, targetCorrectionGbp);
	}
	const upperBound = maxStaticCapacity(prototype);
	if (upperBound <= 0) {
		return packageForStaticTarget(prototype, 0, horizonYear, targetCorrectionGbp);
	}

	let low = 0;
	let high = upperBound;
	let best = packageForStaticTarget(prototype, high, horizonYear, targetCorrectionGbp);
	for (let i = 0; i < 32; i++) {
		const mid = (low + high) / 2;
		const candidate = packageForStaticTarget(
			prototype,
			mid,
			horizonYear,
			targetCorrectionGbp,
		);
		const gap = candidate.effectiveCorrectionGbp - targetCorrectionGbp;
		if (Math.abs(gap) < 25_000_000) {
			best = candidate;
			break;
		}
		if (gap >= 0) {
			best = candidate;
			high = mid;
		} else {
			low = mid;
			best = candidate;
		}
	}

	return best;
};

export const policyReactionPackageSummary = (
	pkg: PolicyReactionPackage,
	limit = 3,
): string => {
	const visible = pkg.components.slice(0, limit);
	const suffix =
		pkg.components.length > visible.length
			? ` +${pkg.components.length - visible.length} more`
			: "";
	return (
		visible
			.map((component) => `${component.quantityLabel} ${component.label}`)
			.join(", ") + suffix
	);
};

export const policyReactionPackageToScenarioLines = (
	pkg: PolicyReactionPackage,
	prefix = "policy-reaction",
): ScenarioLine[] =>
	componentsToScenarioLines(pkg.components, prefix);

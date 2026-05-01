import type {
	ScenarioDistribution,
	ScenarioResult,
} from "@/lib/scenario";
import type { MicrosimAggregate } from "@/lib/microsim/impact";
import {
	GOAL_DEFINITIONS,
	type WizardGoal,
	materialiseGoalLine,
} from "@/lib/wizard-goals";

// Plain-English one-or-two sentence summary of a scenario, intended for the
// TopZone of the results page. Goal: a journalist or non-specialist should be
// able to read this and know what the scenario does, in what direction, and
// who is most affected — without parsing the £ headline or the per-decile
// tables.
//
// Composition is deliberately conservative: only mention figures where the
// underlying model is confident enough to surface them. We never invent
// detail beyond what `result`, `distribution`, and `microsim` already
// expose.

const SIGNIFICANT_NET = 1_000_000; // ignore noise below £1m
const HOUSEHOLDS_PER_DECILE = 2_800_000;

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(abs / 1_000_000)}m`;
	return `£${Math.round(abs).toLocaleString()}`;
};

const formatPct = (n: number): string => `${Math.round(n * 100)}%`;

const formatPerHousehold = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1000) return `£${(abs / 1000).toFixed(1)}k/yr`;
	if (abs >= 100) return `£${Math.round(abs)}/yr`;
	if (abs >= 10) return `£${abs.toFixed(0)}/yr`;
	if (abs >= 1) return `£${abs.toFixed(1)}/yr`;
	return "£0/yr";
};

const lowerFirst = (s: string): string =>
	s.length === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1);

export interface NarrativeInputs {
	result: ScenarioResult;
	distribution: ScenarioDistribution;
	microsim?: MicrosimAggregate;
	// When the user came in through the wizard with a goal, the narrative
	// prepends a goal-vs-actuals sentence so the report knows what target
	// they were aiming at. Free-play / hold-steady / no-goal are quietly
	// skipped — there's nothing meaningful to say.
	goal?: WizardGoal | null;
}

const buildGoalSentence = (
	goal: WizardGoal | null | undefined,
	result: ScenarioResult,
): string | null => {
	if (!goal || goal === "free-play" || goal === "hold-steady") return null;
	const goalDef = GOAL_DEFINITIONS[goal];
	if (goalDef.initialDemand <= 0) return null;
	// Goals that materialise an implicit scenario line (fund-nhs etc.) carry
	// the goal cost inside `result` already, so the surplus / shortfall is
	// just `result.net`. Goals without a materialised line (reduce-borrowing)
	// expect the user to find `initialDemand` worth of revenue / savings on
	// top of nothing, so balance is `result.net - demand`.
	const isMaterialised = materialiseGoalLine(goal) !== null;
	const balance = isMaterialised ? result.net : result.net - goalDef.initialDemand;
	const target = formatBn(goalDef.initialDemand);
	const labelLower = goalDef.label.toLowerCase();
	if (Math.abs(balance) < SIGNIFICANT_NET) {
		return `Goal: ${labelLower} (${target}). On target.`;
	}
	if (balance > 0) {
		return `Goal: ${labelLower} (${target}). ${formatBn(balance)} over target.`;
	}
	return `Goal: ${labelLower} (${target}). ${formatBn(Math.abs(balance))} short of target.`;
};

export function composeScenarioNarrative(
	inputs: NarrativeInputs,
): string | null {
	const { result, distribution, microsim, goal } = inputs;
	if (result.lines.length === 0) return null;

	const sentences: string[] = [];

	const goalSentence = buildGoalSentence(goal, result);
	if (goalSentence) sentences.push(goalSentence);

	const raised = result.lines.filter((l) => l.deltaGbp > 0);
	const spent = result.lines.filter((l) => l.deltaGbp < 0);
	const totalRaised = raised.reduce((s, l) => s + l.deltaGbp, 0);
	const totalSpent = spent.reduce((s, l) => s + Math.abs(l.deltaGbp), 0);

	const topRaise = raised.length > 0
		? raised.reduce((a, b) => (a.deltaGbp >= b.deltaGbp ? a : b))
		: null;
	const topSpend = spent.length > 0
		? spent.reduce((a, b) => (a.deltaGbp <= b.deltaGbp ? a : b))
		: null;

	if (result.lines.length === 1) {
		const only = result.lines[0]!;
		const desc = lowerFirst(only.description);
		if (only.deltaGbp > SIGNIFICANT_NET) {
			sentences.push(`You ${desc} — raises ${formatBn(only.deltaGbp)}.`);
		} else if (only.deltaGbp < -SIGNIFICANT_NET) {
			sentences.push(
				`You ${desc} — costs ${formatBn(Math.abs(only.deltaGbp))}.`,
			);
		} else {
			sentences.push(`You ${desc}.`);
		}
	} else if (topRaise && topSpend) {
		const lowerR = lowerFirst(topRaise.description);
		const lowerS = lowerFirst(topSpend.description);
		if (result.net > SIGNIFICANT_NET) {
			sentences.push(
				`You raise ${formatBn(totalRaised)} (top line: ${lowerR}) and spend ${formatBn(
					totalSpent,
				)} (top line: ${lowerS}), freeing ${formatBn(result.net)}.`,
			);
		} else if (result.net < -SIGNIFICANT_NET) {
			sentences.push(
				`You spend ${formatBn(totalSpent)} (top line: ${lowerS}) and raise ${formatBn(
					totalRaised,
				)} (top line: ${lowerR}), creating a ${formatBn(
					Math.abs(result.net),
				)} shortfall.`,
			);
		} else {
			sentences.push(
				`You raise ${formatBn(totalRaised)} (top line: ${lowerR}) and spend ${formatBn(
					totalSpent,
				)} (top line: ${lowerS}) — broadly balanced.`,
			);
		}
	} else if (topRaise) {
		const lowerR = lowerFirst(topRaise.description);
		sentences.push(
			result.lines.length === 1
				? `You ${lowerR} — raises ${formatBn(totalRaised)}.`
				: `You raise ${formatBn(totalRaised)} across ${result.lines.length} lines (top line: ${lowerR}).`,
		);
	} else if (topSpend) {
		const lowerS = lowerFirst(topSpend.description);
		sentences.push(
			result.lines.length === 1
				? `You ${lowerS} — costs ${formatBn(totalSpent)}.`
				: `You spend ${formatBn(totalSpent)} across ${result.lines.length} lines (top line: ${lowerS}).`,
		);
	}

	const microsimMeaningful =
		microsim &&
		microsim.winners + microsim.losers + microsim.unaffected > 0 &&
		microsim.winners + microsim.losers >= 0.3;
	if (microsimMeaningful && microsim) {
		const winners = microsim.winners;
		const losers = microsim.losers;
		if (winners > losers + 0.1) {
			sentences.push(
				`About ${formatPct(winners)} of households gain; ${formatPct(losers)} lose.`,
			);
		} else if (losers > winners + 0.1) {
			sentences.push(
				`About ${formatPct(losers)} of households lose; ${formatPct(winners)} gain.`,
			);
		} else {
			sentences.push(
				`Roughly even split: ${formatPct(winners)} gain, ${formatPct(losers)} lose.`,
			);
		}
	} else if (distribution.modelledLines > 0) {
		const bottomPerHh = (distribution.perDecile[0] ?? 0) / HOUSEHOLDS_PER_DECILE;
		const topPerHh = (distribution.perDecile[9] ?? 0) / HOUSEHOLDS_PER_DECILE;
		if (Math.abs(bottomPerHh) > 1 || Math.abs(topPerHh) > 1) {
			const bottomVerb = bottomPerHh > 0 ? "lose" : "gain";
			const topVerb = topPerHh > 0 ? "lose" : "gain";
			sentences.push(
				`Bottom-decile households ${bottomVerb} about ${formatPerHousehold(
					bottomPerHh,
				)}; top-decile ${topVerb} ${formatPerHousehold(topPerHh)}.`,
			);
		}
	}

	return sentences.length > 0 ? sentences.join(" ") : null;
}

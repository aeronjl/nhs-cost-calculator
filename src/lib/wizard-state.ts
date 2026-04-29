"use client";

import { useCallback, useMemo, useState } from "react";
import { type EraId, ERAS } from "@/data/eras";
import type { BaselineMode } from "@/data/historical/era-baselines";
import {
	type ScenarioLine,
	deserializeScenario,
	serializeScenario,
} from "./scenario";

// Wizard state — committedScenario (lines the user has confirmed),
// hoveredChoice (preview-on-hover), goal + initial demand, running balance.
//
// The goal sets up an "initial fiscal demand" — the £ the wizard expects to
// be filled by the user's choices. The HUD shows progress against this,
// and step-gating uses it to require the user to address the gap before
// moving on (or explicitly choose to leave it as borrowing).

export type WizardGoal =
	| "reduce-borrowing"
	| "fund-nhs"
	| "fund-defence"
	| "cut-taxes-basic"
	| "cut-taxes-business"
	| "hold-steady"
	| "free-play";

export interface GoalDefinition {
	id: WizardGoal;
	label: string;
	description: string;
	// Initial fiscal demand in £.
	//   Positive = need to FIND this much revenue (or cuts) from somewhere.
	//   Negative = the goal already creates a £ obligation (e.g. fund NHS).
	//   Zero    = no specific target (free-play / hold steady).
	initialDemand: number;
	// One-line context shown in the HUD goal-progress bar.
	hudLabel: string;
}

export const GOAL_DEFINITIONS: Readonly<Record<WizardGoal, GoalDefinition>> = {
	"reduce-borrowing": {
		id: "reduce-borrowing",
		label: "Reduce borrowing",
		description:
			"Tighten the public finances. Find £30bn of revenue or savings to bring PSNB down by ~1% of GDP.",
		initialDemand: 30_000_000_000,
		hudLabel: "Find £30bn",
	},
	"fund-nhs": {
		id: "fund-nhs",
		label: "Fund NHS expansion",
		description:
			"Raise NHS England spending by £20bn/yr. Either find the money via tax/savings, or borrow.",
		initialDemand: 20_000_000_000,
		hudLabel: "Find £20bn for NHS",
	},
	"fund-defence": {
		id: "fund-defence",
		label: "Reach 2.5% defence",
		description:
			"Lift defence spending from ~2% to 2.5% of GDP by 2030 — ~£15bn/yr. Find the money or borrow.",
		initialDemand: 15_000_000_000,
		hudLabel: "Find £15bn for defence",
	},
	"cut-taxes-basic": {
		id: "cut-taxes-basic",
		label: "Cut taxes (workers)",
		description:
			"Cut basic-rate income tax or NICs by £15bn. Either find offsetting cuts, or borrow the cost.",
		initialDemand: 15_000_000_000,
		hudLabel: "Find £15bn (or borrow it)",
	},
	"cut-taxes-business": {
		id: "cut-taxes-business",
		label: "Cut taxes (business)",
		description:
			"Cut corporation tax / employer NICs by £20bn. Find the offset or borrow.",
		initialDemand: 20_000_000_000,
		hudLabel: "Find £20bn (or borrow it)",
	},
	"hold-steady": {
		id: "hold-steady",
		label: "Hold steady",
		description:
			"No fiscal target. Adjust priorities within current envelopes — rebalance who pays without changing total.",
		initialDemand: 0,
		hudLabel: "Rebalance — no net target",
	},
	"free-play": {
		id: "free-play",
		label: "No specific goal",
		description:
			"Skip directly to the simulator. No wizard guidance — just open the sandbox.",
		initialDemand: 0,
		hudLabel: "Free play",
	},
};

export interface WizardState {
	step: number;
	goal: WizardGoal | null;
	committedScenario: ScenarioLine[];
	// Lines being previewed on hover (overlay on committed). Cleared on mouseout
	// or commit.
	previewLines: ScenarioLine[];
	// Historical era — controls which fiscal levers exist as instruments and
	// what statutory protections apply. Defaults to "current" (today's OBR).
	era: EraId;
	// "forecast" = the Chancellor's view at the budget (FSBR/EFO).
	// "outturn" = ONS PSF actuals — what actually happened. Toggle on the
	// briefing step lets the user compare plan vs reality.
	baselineMode: BaselineMode;
	// Mobile-only: hide the mini-sparkline row beneath the sticky banner.
	// Persisted to URL (wsparkline) so a share-link carries the user's
	// preference. localStorage also caches it for first-visit defaults.
	mobileSparklineCollapsed: boolean;
}

const STEP_BRIEFING = 0;
const STEP_GOAL = 1;
const STEP_TAXES = 2;
const STEP_SPENDING = 3;
const STEP_BORROW = 4;
const STEP_RESULT = 5;

export const STEPS = [
	STEP_BRIEFING,
	STEP_GOAL,
	STEP_TAXES,
	STEP_SPENDING,
	STEP_BORROW,
	STEP_RESULT,
] as const;

export const STEP_LABELS: Readonly<Record<number, string>> = {
	[STEP_BRIEFING]: "Briefing",
	[STEP_GOAL]: "Goal",
	[STEP_TAXES]: "Taxes",
	[STEP_SPENDING]: "Spending",
	[STEP_BORROW]: "Borrow",
	[STEP_RESULT]: "Result",
};

let nextLocalId = 1;
const newLocalId = () => `wz${nextLocalId++}`;

export const wizardLineId = newLocalId;

export interface WizardActions {
	setStep: (step: number) => void;
	setGoal: (goal: WizardGoal) => void;
	setEra: (era: EraId) => void;
	setBaselineMode: (mode: BaselineMode) => void;
	setMobileSparklineCollapsed: (collapsed: boolean) => void;
	addChoice: (line: ScenarioLine) => void;
	removeChoice: (id: string) => void;
	// Update an existing line's magnitude (used by the Refine panel's
	// inline editor). No-op if id doesn't match a committed line.
	updateChoiceMagnitude: (id: string, magnitude: number) => void;
	setPreview: (lines: ScenarioLine[]) => void;
	clearPreview: () => void;
	resetScenario: () => void;
}

export interface WizardComputedState {
	state: WizardState;
	actions: WizardActions;
	// committedScenario + previewLines, used by the HUD to show
	// "what would this look like if I committed the hover choice."
	effectiveScenario: ScenarioLine[];
	// Running balance: the £ the wizard expects to be filled vs what's been
	// committed. Positive = still need to find £. Negative = over-funded
	// (raised more than the goal demanded).
	balance: number;
	// Current step's index.
	stepIndex: number;
	// Effective committed total (sum of committed deltaGbp would be ideal but we
	// can't import evaluator here without a circular dep — caller computes from
	// scenario evaluator).
}

export const computeBalance = (
	goal: WizardGoal | null,
	committedDelta: number,
): number => {
	const initialDemand = goal ? GOAL_DEFINITIONS[goal].initialDemand : 0;
	return initialDemand - committedDelta;
};

// Each goal has an *implicit* fiscal action — for fund-nhs, it's a £20bn
// NHS raise; for cut-taxes-basic, a 2.5pp basic-rate cut. The wizard treats
// this as already-decided and helps the user find offsets. When we hand off
// to the simulator, the implicit line gets materialised so the simulator's
// net reflects both sides of the trade.
//
// reduce-borrowing has no implicit action (it's a generic deficit target).
// hold-steady and free-play are open-ended.
export const materialiseGoalLine = (
	goal: WizardGoal | null,
): ScenarioLine | null => {
	if (!goal) return null;
	switch (goal) {
		case "fund-nhs":
			return {
				id: "wz-goal-nhs",
				type: "programme",
				leverId: "nhs-england",
				magnitude: 12,
			};
		case "fund-defence":
			return {
				id: "wz-goal-defence",
				type: "programme",
				leverId: "defence",
				magnitude: 28,
			};
		case "cut-taxes-basic":
			return {
				id: "wz-goal-tax-basic",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: -2.5,
			};
		case "cut-taxes-business":
			return {
				id: "wz-goal-tax-corp",
				type: "tax",
				leverId: "corporation-tax",
				magnitude: -4.4,
			};
		case "reduce-borrowing":
		case "hold-steady":
		case "free-play":
			return null;
	}
};

export function useWizardState(initial?: Partial<WizardState>): WizardComputedState {
	const [state, setState] = useState<WizardState>({
		step: initial?.step ?? STEP_BRIEFING,
		goal: initial?.goal ?? null,
		committedScenario: initial?.committedScenario ?? [],
		previewLines: initial?.previewLines ?? [],
		era: initial?.era ?? "current",
		baselineMode: initial?.baselineMode ?? "forecast",
		mobileSparklineCollapsed: initial?.mobileSparklineCollapsed ?? false,
	});

	const setStep = useCallback((step: number) => {
		setState((s) => ({ ...s, step, previewLines: [] }));
	}, []);

	const setGoal = useCallback((goal: WizardGoal) => {
		setState((s) => ({ ...s, goal }));
	}, []);

	const setEra = useCallback((era: EraId) => {
		// Era change wipes scenario — choices made under a different era's
		// constraints don't carry over (e.g. apprenticeship levy makes no sense
		// in 1979).
		setState((s) => ({
			...s,
			era,
			committedScenario: [],
			previewLines: [],
		}));
	}, []);

	const setBaselineMode = useCallback((mode: BaselineMode) => {
		setState((s) => ({ ...s, baselineMode: mode }));
	}, []);

	const setMobileSparklineCollapsed = useCallback((collapsed: boolean) => {
		setState((s) => ({ ...s, mobileSparklineCollapsed: collapsed }));
		// Mirror to localStorage for first-visit default on the next session.
		try {
			localStorage.setItem("hud-sparkline-collapsed", String(collapsed));
		} catch {
			// no localStorage — URL persistence still works
		}
	}, []);

	const addChoice = useCallback((line: ScenarioLine) => {
		setState((s) => ({
			...s,
			committedScenario: [...s.committedScenario, line],
			previewLines: [],
		}));
	}, []);

	const removeChoice = useCallback((id: string) => {
		setState((s) => ({
			...s,
			committedScenario: s.committedScenario.filter((l) => l.id !== id),
		}));
	}, []);

	const updateChoiceMagnitude = useCallback(
		(id: string, magnitude: number) => {
			if (!Number.isFinite(magnitude)) return;
			setState((s) => ({
				...s,
				committedScenario: s.committedScenario.map((l) =>
					l.id === id ? { ...l, magnitude } : l,
				),
			}));
		},
		[],
	);

	const setPreview = useCallback((lines: ScenarioLine[]) => {
		setState((s) => ({ ...s, previewLines: lines }));
	}, []);

	const clearPreview = useCallback(() => {
		setState((s) => ({ ...s, previewLines: [] }));
	}, []);

	const resetScenario = useCallback(() => {
		setState((s) => ({ ...s, committedScenario: [], previewLines: [] }));
	}, []);

	const effectiveScenario = useMemo(
		() => [...state.committedScenario, ...state.previewLines],
		[state.committedScenario, state.previewLines],
	);

	return {
		state,
		actions: {
			setStep,
			setGoal,
			setEra,
			setBaselineMode,
			setMobileSparklineCollapsed,
			addChoice,
			removeChoice,
			updateChoiceMagnitude,
			setPreview,
			clearPreview,
			resetScenario,
		},
		effectiveScenario,
		balance: 0, // computed externally with scenario evaluator
		stepIndex: state.step,
	};
}

// URL serialisation: encode wizard state into ?wiz=... so progress is
// shareable and survives reloads. Matches scenario URL pattern.
export const WIZARD_PARAMS = [
	"wiz",
	"wgoal",
	"wstep",
	"wera",
	"wmode",
	"wsparkline",
] as const;

export const encodeWizardState = (state: WizardState): Record<string, string> => {
	const out: Record<string, string> = {
		wstep: String(state.step),
	};
	if (state.goal) out.wgoal = state.goal;
	if (state.era && state.era !== "current") out.wera = state.era;
	if (state.baselineMode && state.baselineMode !== "forecast") {
		out.wmode = state.baselineMode;
	}
	if (state.mobileSparklineCollapsed) {
		out.wsparkline = "collapsed";
	}
	if (state.committedScenario.length > 0) {
		out.wiz = serializeScenario(state.committedScenario);
	}
	return out;
};

export const decodeWizardState = (
	params: Record<string, string | undefined>,
): Partial<WizardState> => {
	const out: Partial<WizardState> = {};
	if (params.wstep) {
		const n = Number(params.wstep);
		if (Number.isFinite(n) && n >= 0 && n <= 5) out.step = n;
	}
	if (params.wgoal && params.wgoal in GOAL_DEFINITIONS) {
		out.goal = params.wgoal as WizardGoal;
	}
	if (params.wera && params.wera in ERAS) {
		out.era = params.wera as EraId;
	}
	if (params.wmode === "outturn" || params.wmode === "forecast") {
		out.baselineMode = params.wmode as BaselineMode;
	}
	if (params.wsparkline === "collapsed") {
		out.mobileSparklineCollapsed = true;
	}
	if (params.wiz) {
		out.committedScenario = deserializeScenario(params.wiz);
	}
	return out;
};

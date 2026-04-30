import type { ScenarioLine } from "./scenario";

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

// Each goal has an *implicit* fiscal action — for fund-nhs, it's a £20bn
// NHS raise; for cut-taxes-basic, a 2.5pp basic-rate cut. The wizard treats
// this as already-decided and helps the user find offsets. When we hand off
// to the report, the implicit line gets materialised so the report's net
// reflects both sides of the trade.
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

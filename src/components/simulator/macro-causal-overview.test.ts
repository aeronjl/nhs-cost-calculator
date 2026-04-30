import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
	MacroState,
	ScenarioDynamic,
	ScenarioMacro,
} from "@/lib/scenario";
import { MacroCausalOverview } from "./macro-causal-overview";

const dynamic: ScenarioDynamic = {
	staticNet: 30_000_000_000,
	dynamicNet: 27_500_000_000,
	staticFreed: 30_000_000_000,
	dynamicFreed: 27_500_000_000,
	staticRequired: 0,
	dynamicRequired: 0,
	outputEffectGbp: -4_000_000_000,
	workerCevGbp: -900_000_000,
	dynamicLines: [],
};

const macro: ScenarioMacro = {
	dynamicNet: 27_500_000_000,
	macroFeedbackGbp: -1_000_000_000,
	secondRoundNet: 26_500_000_000,
	macroLines: [],
};

const macroPath: MacroState[] = [
	{
		year: 1,
		cpiDeviationPp: 0.03,
		gdpDeviationPct: -0.08,
		debtGdpDeviationPp: 0.15,
		bankRateDeviationPp: 0.012,
		giltYieldDeviationPp: 0.008,
	},
	{
		year: 2,
		cpiDeviationPp: 0.02,
		gdpDeviationPct: -0.05,
		debtGdpDeviationPp: 0.24,
		bankRateDeviationPp: 0.01,
		giltYieldDeviationPp: 0.012,
	},
];

describe("MacroCausalOverview", () => {
	it("renders the macro bridge and state path as one causal system", () => {
		const html = renderToStaticMarkup(
			React.createElement(MacroCausalOverview, {
				staticNet: 30_000_000_000,
				dynamic,
				macro,
				macroPath,
				macroYear1: 26_500_000_000,
				geYear1: 26_000_000_000,
				geGap: -500_000_000,
				convergence: {
					iterations: 3,
					converged: true,
					maxChangeGbp: 250_000,
				},
			}),
		);

		expect(html).toContain("Macro causal overview");
		expect(html).toContain(
			"Static score -&gt; behavioural response -&gt; macro state -&gt; GE feedback",
		);
		expect(html).toContain(
			'aria-label="Macro causal scoring flow from static score to GE-adjusted result"',
		);
		expect(html).toContain(
			'aria-label="Macro state channel deviations versus baseline"',
		);
		expect(html).toContain("Ready-reckoner");
		expect(html).toContain("Behavioural response");
		expect(html).toContain("Macro state");
		expect(html).toContain("GE loop");
		expect(html).toContain("State channels");
		expect(html).toContain("baseline = 0");
		expect(html).toContain("Feedback loop");
	});
});

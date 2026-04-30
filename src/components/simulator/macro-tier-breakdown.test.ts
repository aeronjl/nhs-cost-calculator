import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScenarioDynamic, ScenarioMacro } from "@/lib/scenario";
import { MacroTierBreakdown } from "./macro-tier-breakdown";

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

describe("MacroTierBreakdown", () => {
	it("renders a graph-first macro scoring bridge", () => {
		const html = renderToStaticMarkup(
			React.createElement(MacroTierBreakdown, {
				staticNet: 30_000_000_000,
				dynamic,
				dynamicGapSignificant: true,
				macro,
				macroGapSignificant: true,
				macroYear1: 26_500_000_000,
				geYear1: 26_000_000_000,
				geGap: -500_000_000,
				geGapSignificant: true,
			}),
		);

		expect(html).toContain("Macro scoring bridge");
		expect(html).toContain(
			"Macro scoring bridge from static estimate to GE-adjusted result",
		);
		expect(html).toContain("Ready-reckoner");
		expect(html).toContain("Behavioural response");
		expect(html).toContain("Scope B macro");
		expect(html).toContain("Scope C GE");
		expect(html).toContain("Total adjustment");
		expect(html).toContain("GE feedback");
	});
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
	ScenarioDynamic,
	ScenarioMacro,
	ScenarioTieredYear,
} from "@/lib/scenario";
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

		// New flow chart shape: connectors + tone legend.
		expect(html).toContain("Macro scoring bridge flow");
		expect(html).toContain("gain between stages");
		expect(html).toContain("loss between stages");
		// Three stage-to-stage connector polygons.
		expect(html.match(/<polygon /g)?.length).toBe(3);
	});

	it("renders the multi-year tier sparkline when tiered data is provided", () => {
		const tiered: ScenarioTieredYear[] = Array.from(
			{ length: 5 },
			(_, i) => ({
				year: i + 1,
				staticNet: 30_000_000_000 * Math.pow(1.04, i),
				dynamicNet: 27_500_000_000 * Math.pow(1.04, i),
				macroNet: 26_500_000_000 * Math.pow(1.04, i),
				geNet: 26_000_000_000 * Math.pow(1.04, i),
			}),
		);
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
				tiered,
			}),
		);
		expect(html).toContain(
			"Macro scoring tiers across the projection horizon",
		);
		expect(html).toContain("Tier paths across 5 years");
		expect(html).toContain("static → dynamic → macro → GE per year");
		// Four tier polylines plus one in the bridge chart for its stage-value path.
		expect(html.match(/<polyline /g)?.length).toBe(5);
		// Year labels Y1..Y5 in the sparkline footer (also in any other text;
		// just verify they're present)
		for (const label of ["Y1", "Y2", "Y3", "Y4", "Y5"]) {
			expect(html).toContain(label);
		}
	});
});

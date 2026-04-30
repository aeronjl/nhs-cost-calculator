import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	evaluateScenarioDistribution,
	type ScenarioLine,
} from "@/lib/scenario";
import { DistributionalImpact } from "./distributional-impact";
import { HouseholdImpactPanel } from "./household-impact";
import { MicrosimulationPanel } from "./microsimulation-panel";

const scenario: ScenarioLine[] = [
	{
		id: "test-tax",
		type: "tax",
		leverId: "basic-rate-income-tax",
		magnitude: 1,
	},
];

const result = evaluateScenario(scenario);

describe("incidence visual baselines", () => {
	it("labels the decile chart against the current-policy baseline", () => {
		const html = renderToStaticMarkup(
			React.createElement(DistributionalImpact, {
				distribution: evaluateScenarioDistribution(result),
			}),
		);

		expect(html).toContain("gain vs baseline");
		expect(html).toContain("loss vs baseline");
		expect(html).toContain("current-policy baseline = £0");
	});

	it("labels microsimulation and household charts against the baseline", () => {
		const microsimHtml = renderToStaticMarkup(
			React.createElement(MicrosimulationPanel, { result }),
		);
		const householdHtml = renderToStaticMarkup(
			React.createElement(HouseholdImpactPanel, { result }),
		);

		expect(microsimHtml).toContain("vs current-policy baseline");
		expect(microsimHtml).toContain("baseline = £0/yr");
		expect(householdHtml).toContain("current-policy baseline = £0/yr");
		expect(householdHtml).toContain(
			"Representative household gains and losses versus current-policy baseline",
		);
	});
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	evaluateScenarioDistribution,
	type ScenarioLine,
} from "@/lib/scenario";
import { evaluateMicrosim } from "@/lib/microsim/impact";
import { generatePopulation } from "@/lib/microsim/population";
import { DistributionalImpact } from "./distributional-impact";
import { HouseholdImpactPanel } from "./household-impact";
import { MicrosimulationPanel } from "./microsimulation-panel";
import { WhoPaysOverview } from "./who-pays-overview";

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
	it("summarizes who-pays counterfactuals before detailed panels", () => {
		const microsim = evaluateMicrosim(generatePopulation(1000, 42), result).agg;
		const html = renderToStaticMarkup(
			React.createElement(WhoPaysOverview, {
				distribution: evaluateScenarioDistribution(result),
				microsim,
				result,
			}),
		);

		expect(html).toContain("Who pays overview");
		expect(html).toContain("Current-policy baseline = £0/yr");
		expect(html).toContain(
			"Decile incidence path versus current-policy baseline",
		);
		expect(html).toContain(
			"Synthetic household split versus current-policy baseline",
		);
		expect(html).toContain(
			"Representative household counterfactuals versus baseline",
		);
		expect(html).toContain("Modelled incidence coverage");
	});

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

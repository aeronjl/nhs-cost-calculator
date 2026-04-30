import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import { projectAgainstBaseline } from "@/lib/baseline-projection";
import {
	evaluateScenario,
	projectScenarioWithGEFeedback,
	type ScenarioLine,
} from "@/lib/scenario";
import { BaselineComparisonPanel } from "./baseline-comparison";

const scenario: ScenarioLine[] = [
	{
		id: "test-tax",
		type: "tax",
		leverId: "basic-rate-income-tax",
		magnitude: 1,
	},
];

describe("BaselineComparisonPanel counterfactual chart", () => {
	it("labels baseline and policy scenario paths explicitly", () => {
		const result = evaluateScenario(scenario);
		const projection = projectScenarioWithGEFeedback(
			result,
			OBR_BASELINE.years.length,
		).withFeedback;
		const comparison = projectAgainstBaseline(projection, OBR_BASELINE);
		const html = renderToStaticMarkup(
			React.createElement(BaselineComparisonPanel, { comparison }),
		);

		expect(html).toContain("Fiscal counterfactual paths");
		expect(html).toContain("current-policy baseline");
		expect(html).toContain("policy scenario");
		expect(html).toContain("rule year");
		expect(html).toContain(
			'aria-label="PSNB baseline and scenario counterfactual path"',
		);
		expect(html).toContain(
			'aria-label="Debt to GDP baseline and scenario counterfactual path"',
		);
	});
});

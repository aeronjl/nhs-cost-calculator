import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { evaluateScenario, type ScenarioLine } from "@/lib/scenario";
import { ScenarioAssumptions } from "./scenario-assumptions";

const scenario: ScenarioLine[] = [
	{
		id: "tax",
		type: "tax",
		leverId: "capital-gains-tax",
		magnitude: 4,
	},
	{
		id: "borrow",
		type: "borrow",
		leverId: "",
		magnitude: 40_000_000_000,
		borrowingContext: {
			fiscalEvent: "unscored",
			duration: "persistent",
		},
	},
];

describe("ScenarioAssumptions", () => {
	it("summarizes evidence coverage before detailed line methodology", () => {
		const result = evaluateScenario(scenario);
		const html = renderToStaticMarkup(
			React.createElement(ScenarioAssumptions, { lines: result.lines }),
		);

		expect(html).toContain("Assumptions evidence dashboard");
		expect(html).toContain(
			"Assumption evidence coverage by modelling layer",
		);
		expect(html).toContain("Line evidence matrix");
		expect(html).toContain("Evidence score");
		expect(html).toContain("Dynamic adjustment");
		expect(html).toContain("Incidence coverage");
		expect(html).toContain("Largest behavioural adjustment");
		for (const label of [
			"Source",
			"Range",
			"Incidence",
			"Dynamic",
			"Borrowing",
		]) {
			expect(html).toContain(label);
		}
		expect(html.indexOf("Assumptions evidence dashboard")).toBeLessThan(
			html.indexOf("full methodology"),
		);
	});
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import type { ScenarioLine } from "@/lib/scenario";
import { ScenarioCompareModal } from "./scenario-compare-modal";

const sampleScenario: ScenarioLine[] = [
	{
		id: "tax",
		type: "tax",
		leverId: "basic-rate-income-tax",
		magnitude: 2,
	},
];

describe("ScenarioCompareModal", () => {
	it("renders nothing when closed", () => {
		const html = renderToStaticMarkup(
			React.createElement(ScenarioCompareModal, {
				open: false,
				onOpenChange: () => {},
				scenarioA: sampleScenario,
				baseline: OBR_BASELINE,
			}),
		);
		expect(html).toBe("");
	});

	it("renders the picker + empty state when open with no comparison selected", () => {
		const html = renderToStaticMarkup(
			React.createElement(ScenarioCompareModal, {
				open: true,
				onOpenChange: () => {},
				scenarioA: sampleScenario,
				baseline: OBR_BASELINE,
			}),
		);
		expect(html).toContain('role="dialog"');
		expect(html).toContain("Side-by-side scenario comparison");
		expect(html).toContain("Compare with");
		expect(html).toContain("Annotated UK budgets");
		expect(html).toContain("— pick a scenario —");
		expect(html).toContain("Pick a scenario above to see the diff.");
	});
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScenarioLine } from "@/lib/scenario";
import { OutputRail } from "./output-rail";

const scenario: ScenarioLine[] = [
	{
		id: "test-tax",
		type: "tax",
		leverId: "basic-rate-income-tax",
		magnitude: 1,
	},
];

const renderOutputRail = (lines: readonly ScenarioLine[]) =>
	renderToStaticMarkup(
		React.createElement(OutputRail, {
			scenario: lines,
			comparisons: [],
			usdPerGbp: 1.27,
			emptyMessage: "No decisions yet.",
		}),
	);

describe("OutputRail report chrome", () => {
	it("keeps the report navigation and export toolbar visible", () => {
		const html = renderOutputRail(scenario);

		expect(html).toContain('aria-label="Report sections"');
		for (const label of [
			"Summary",
			"Trajectory",
			"Who pays",
			"Macro",
			"Stress",
			"Assumptions",
			"Audit/export",
		]) {
			expect(html).toContain(label);
		}

		for (const label of ["Copy link", "Appendix MD", "JSON", "Audit panel"]) {
			expect(html).toContain(label);
		}
		expect(html).toContain("Detailed analysis");
		expect(html).toContain("Expand all");
		expect(html.match(/aria-expanded="false"/g)).toHaveLength(6);
	});

	it("does not render report chrome for an empty scenario", () => {
		const html = renderOutputRail([]);

		expect(html).toContain("No decisions yet.");
		expect(html).not.toContain('aria-label="Report sections"');
		expect(html).not.toContain("Appendix MD");
	});
});

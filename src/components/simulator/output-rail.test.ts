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

		expect(html).toContain('aria-label="Report shortcuts"');
		expect(html).toContain("Summary");
		expect(html).toContain('role="tablist"');
		expect(html).toContain('aria-label="Detailed report tabs"');
		expect(html.match(/role="tab"/g)).toHaveLength(6);
		expect(html.match(/role="tabpanel"/g)).toHaveLength(6);
		expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
		expect(html).toContain('aria-controls="report-trajectory"');
		expect(html).toContain('id="report-trajectory"');
		for (const label of [
			"Trajectory",
			"Who pays",
			"Macro",
			"Stress",
			"Assumptions",
			"Audit",
		]) {
			expect(html).toContain(label);
		}

		for (const label of ["Copy link", "Appendix MD", "JSON", "Audit panel"]) {
			expect(html).toContain(label);
		}
		expect(html).toContain("Detailed analysis");
		expect(html).toContain("fiscal risk");
		expect(html).toContain("Rule headroom");
		expect(html).not.toContain("Expand all");
		expect(html).not.toContain('aria-expanded="false"');
	});

	it("does not render report chrome for an empty scenario", () => {
		const html = renderOutputRail([]);

		expect(html).toContain("No decisions yet.");
		expect(html).not.toContain('aria-label="Report shortcuts"');
		expect(html).not.toContain('role="tablist"');
		expect(html).not.toContain("Appendix MD");
	});
});

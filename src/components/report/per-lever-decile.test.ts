import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	type ScenarioLine,
} from "@/lib/scenario";
import { PerLeverDecileBreakdown } from "./per-lever-decile";

const renderWithScenario = (lines: ScenarioLine[]) => {
	const result = evaluateScenario(lines);
	return renderToStaticMarkup(
		React.createElement(PerLeverDecileBreakdown, { lines: result.lines }),
	);
};

describe("PerLeverDecileBreakdown", () => {
	it("renders nothing when no lines have incidence vectors", () => {
		// `tax-other` is the catch-all sundry lever with no incidence vector.
		const html = renderWithScenario([
			{
				id: "x",
				type: "tax",
				leverId: "tax-other",
				magnitude: 5,
			},
		]);
		expect(html).toBe("");
	});

	it("renders 10 decile rows with line legend for a multi-line scenario", () => {
		const html = renderWithScenario([
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
			{
				id: "nhs",
				type: "programme",
				leverId: "nhs-england",
				magnitude: -10,
			},
		]);

		expect(html).toContain('aria-label="Per-lever decile breakdown"');
		expect(html).toContain('aria-label="Per-lever decile contribution stack"');
		// 10 decile labels D1..D10
		for (let d = 1; d <= 10; d++) {
			expect(html).toContain(`>D${d}<`);
		}
		// Both line descriptions surfaced in the legend
		expect(html).toContain("basic-rate income tax");
		expect(html).toContain("NHS England");
		// Coverage indicator
		expect(html).toMatch(/\d+\/\d+ lines with incidence/);
	});

	it("flags unmodelled lines via the coverage caveat", () => {
		const html = renderWithScenario([
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
			{
				id: "other",
				type: "tax",
				leverId: "tax-other",
				magnitude: 3,
			},
		]);
		expect(html).toContain("excluded for lack of an incidence vector");
	});
});

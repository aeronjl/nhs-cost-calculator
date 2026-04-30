import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YearFocusProvider } from "@/lib/year-focus";
import { ScenarioYearScrubber } from "./scenario-year-scrubber";

const renderScrubber = (
	yearCount: number,
	yearLabels?: readonly string[],
) =>
	renderToStaticMarkup(
		React.createElement(
			YearFocusProvider,
			null,
			React.createElement(ScenarioYearScrubber, { yearCount, yearLabels }),
		),
	);

describe("ScenarioYearScrubber", () => {
	it("renders nothing when there is only one year", () => {
		expect(renderScrubber(1)).toBe("");
		expect(renderScrubber(0)).toBe("");
	});

	it("renders the slider, ticks, and auto button when years are present", () => {
		const html = renderScrubber(5, [
			"2024-25",
			"2025-26",
			"2026-27",
			"2027-28",
			"2028-29",
		]);
		expect(html).toContain('aria-label="Year of focus scrubber"');
		expect(html).toContain('aria-label="Year of focus"');
		expect(html).toContain('type="range"');
		expect(html).toContain('min="1"');
		expect(html).toContain('max="5"');
		// Year-tick buttons render once per year
		const tickButtons = html.match(/aria-pressed="false"/g) ?? [];
		expect(tickButtons.length).toBe(5);
		// Each fiscal-year label appears at least once
		expect(html).toContain("2024-25");
		expect(html).toContain("2028-29");
		// Auto button is disabled when no lock has been set
		expect(html).toContain('disabled=""');
		// Default copy when nothing focused
		expect(html).toContain("drag or hover any chart to focus");
	});

	it("falls back to Y-prefixed labels when no fiscal years are passed", () => {
		const html = renderScrubber(3);
		expect(html).toContain("Y1");
		expect(html).toContain("Y2");
		expect(html).toContain("Y3");
	});
});

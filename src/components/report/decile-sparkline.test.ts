import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScenarioDistribution } from "@/lib/scenario";
import { DecileSparkline } from "./decile-sparkline";

const emptyDistribution: ScenarioDistribution = {
	perDecile: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	modelledLines: 0,
	totalLines: 0,
	modelledDelta: 0,
	totalDelta: 0,
};

const HOUSEHOLDS_PER_DECILE = 2_800_000;

describe("DecileSparkline", () => {
	it("renders nothing when no decile carries a meaningful per-household impact", () => {
		const html = renderToStaticMarkup(
			React.createElement(DecileSparkline, {
				distribution: emptyDistribution,
			}),
		);
		expect(html).toBe("");
	});

	it("renders ten bars with title hints when impacts are present", () => {
		const distribution: ScenarioDistribution = {
			perDecile: Array.from({ length: 10 }, (_, i) =>
				HOUSEHOLDS_PER_DECILE * (i < 5 ? 200 : -200),
			),
			modelledLines: 1,
			totalLines: 1,
			modelledDelta: 0,
			totalDelta: 0,
		};
		const html = renderToStaticMarkup(
			React.createElement(DecileSparkline, { distribution }),
		);
		expect(html).toContain('aria-label="Per-decile incidence sparkline"');
		expect(html).toContain("Decile incidence");
		expect(html).toContain("D1");
		expect(html).toContain("D5");
		expect(html).toContain("D10");
		// Each decile produces a relative span — we can count titles on
		// the parent <span title=…> wrappers.
		const titleMatches = html.match(/title="D\d/g) ?? [];
		expect(titleMatches.length).toBe(10);
	});
});

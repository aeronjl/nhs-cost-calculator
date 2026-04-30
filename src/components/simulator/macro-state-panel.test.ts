import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MacroState } from "@/lib/scenario";
import { MacroStatePanel } from "./macro-state-panel";

const path: MacroState[] = [
	{
		year: 1,
		cpiDeviationPp: 0.03,
		gdpDeviationPct: -0.08,
		debtGdpDeviationPp: 0.15,
		bankRateDeviationPp: 0.012,
		giltYieldDeviationPp: 0.008,
	},
	{
		year: 2,
		cpiDeviationPp: 0.02,
		gdpDeviationPct: -0.05,
		debtGdpDeviationPp: 0.24,
		bankRateDeviationPp: 0.01,
		giltYieldDeviationPp: 0.012,
	},
	{
		year: 3,
		cpiDeviationPp: 0.01,
		gdpDeviationPct: -0.03,
		debtGdpDeviationPp: 0.3,
		bankRateDeviationPp: 0.006,
		giltYieldDeviationPp: 0.015,
	},
];

describe("MacroStatePanel", () => {
	it("renders graph-first macro-state paths before the table", () => {
		const html = renderToStaticMarkup(
			React.createElement(MacroStatePanel, {
				path,
				convergence: {
					iterations: 3,
					converged: true,
					maxChangeGbp: 250_000,
				},
			}),
		);

		expect(html).toContain("Macro state path");
		expect(html).toContain('aria-label="GDP deviation path versus baseline"');
		expect(html).toContain('aria-label="CPI deviation path versus baseline"');
		expect(html).toContain(
			'aria-label="Debt to GDP deviation path versus baseline"',
		);
		expect(html).toContain(
			'aria-label="Bank Rate deviation path versus baseline"',
		);
		expect(html).toContain(
			'aria-label="Gilt yield deviation path versus baseline"',
		);
		expect(html).toContain("baseline = 0");
		expect(html).toContain("Show year-by-year macro state table");
		expect(html.indexOf("GDP deviation path versus baseline")).toBeLessThan(
			html.indexOf("Show year-by-year macro state table"),
		);
	});
});

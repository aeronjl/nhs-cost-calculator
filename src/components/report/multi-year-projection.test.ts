import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { YearProjection } from "@/lib/scenario";
import { MultiYearProjection } from "./multi-year-projection";

const projection: YearProjection[] = [
	{
		year: 1,
		net: 20_000_000_000,
		freed: 20_000_000_000,
		required: 0,
		psnbShift: 20_000_000_000,
		debtInterestGbp: 0,
		debtStockDeltaGbp: -20_000_000_000,
		debtGdpDeltaPp: -0.7,
	},
	{
		year: 2,
		net: 21_000_000_000,
		freed: 21_000_000_000,
		required: 0,
		psnbShift: 21_000_000_000,
		debtInterestGbp: 0,
		debtStockDeltaGbp: -41_000_000_000,
		debtGdpDeltaPp: -1.3,
	},
];

const bands = [
	{
		year: 1,
		central: 20_000_000_000,
		band: {
			p5: 17_000_000_000,
			p25: 19_000_000_000,
			p50: 20_000_000_000,
			p75: 21_000_000_000,
			p95: 23_000_000_000,
		},
	},
	{
		year: 2,
		central: 21_000_000_000,
		band: {
			p5: 18_000_000_000,
			p25: 20_000_000_000,
			p50: 21_000_000_000,
			p75: 22_000_000_000,
			p95: 24_000_000_000,
		},
	},
];

describe("MultiYearProjection", () => {
	it("labels the scenario effect fan against the no-policy baseline", () => {
		const html = renderToStaticMarkup(
			React.createElement(MultiYearProjection, { projection, bands }),
		);

		expect(html).toContain("Scenario effect fan");
		expect(html).toContain(
			'aria-label="Scenario effect fan chart versus no-policy baseline"',
		);
		expect(html).toContain("No-policy baseline");
		expect(html).toContain("no-policy baseline");
		expect(html).toContain("central scenario path");
		expect(html).toContain("90% parameter fan");
		expect(html).toContain("50% parameter fan");
		expect(html).toContain("Fan width");
		expect(html).toContain("baseline = £0");
	});
});

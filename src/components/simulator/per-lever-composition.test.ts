import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Methodology } from "@/lib/methodology";
import type {
	LineEvaluation,
	ScenarioLine,
	YearProjection,
} from "@/lib/scenario";
import { PerLeverComposition } from "./per-lever-composition";

const stubMethodology: Methodology = {
	source: { url: "https://example.com", label: "Example" },
	asOf: "2024-01",
	measure: "test",
};

const stubLine = (overrides: Partial<ScenarioLine>): ScenarioLine => ({
	id: overrides.id ?? "line",
	type: overrides.type ?? "tax",
	leverId: overrides.leverId ?? "basic-rate-income-tax",
	magnitude: overrides.magnitude ?? 1,
	...overrides,
});

const stubEvaluation = (
	overrides: { line?: Partial<ScenarioLine> } & Partial<
		Omit<LineEvaluation, "line">
	>,
): LineEvaluation => ({
	line: stubLine(overrides.line ?? {}),
	deltaGbp: overrides.deltaGbp ?? 0,
	description: overrides.description ?? "Stub line",
	methodology: overrides.methodology ?? stubMethodology,
	source: overrides.source ?? { url: "https://example.com", label: "Example" },
});

const projection: YearProjection[] = [
	{
		year: 1,
		net: 4_000_000_000,
		freed: 24_000_000_000,
		required: 20_000_000_000,
		psnbShift: 4_000_000_000,
		debtInterestGbp: 0,
		debtStockDeltaGbp: 0,
		debtGdpDeltaPp: 0,
	},
	{
		year: 2,
		net: 4_500_000_000,
		freed: 25_000_000_000,
		required: 20_500_000_000,
		psnbShift: 4_500_000_000,
		debtInterestGbp: 0,
		debtStockDeltaGbp: 0,
		debtGdpDeltaPp: 0,
	},
];

describe("PerLeverComposition", () => {
	it("renders nothing when there are no line projections", () => {
		const html = renderToStaticMarkup(
			React.createElement(PerLeverComposition, {
				projection,
				lineProjections: [],
			}),
		);
		expect(html).toBe("");
	});

	it("renders polygons + legend for positive and negative lines", () => {
		const lineProjections = [
			{
				line: stubEvaluation({
					deltaGbp: 24_000_000_000,
					description: "Raise basic-rate income tax by 2pp",
					line: { id: "tax", type: "tax" },
				}),
				values: [24_000_000_000, 25_000_000_000],
			},
			{
				line: stubEvaluation({
					deltaGbp: -20_000_000_000,
					description: "Increase NHS England spending",
					line: { id: "nhs", type: "programme", leverId: "nhs-england" },
				}),
				values: [-20_000_000_000, -20_500_000_000],
			},
		];
		const html = renderToStaticMarkup(
			React.createElement(PerLeverComposition, {
				projection,
				lineProjections,
			}),
		);

		expect(html).toContain('aria-label="Per-lever composition stacked area"');
		// One polygon per line
		expect(html.match(/<polygon /g)?.length).toBe(2);
		// Legend surfaces both descriptions
		expect(html).toContain("Raise basic-rate income tax by 2pp");
		expect(html).toContain("Increase NHS England spending");
	});

	it("annotates the static-vs-GE feedback gap when material", () => {
		const lineProjections = [
			{
				line: stubEvaluation({
					deltaGbp: 24_000_000_000,
					description: "Raise basic-rate income tax",
					line: { id: "tax", type: "tax" },
				}),
				values: [24_000_000_000, 25_000_000_000],
			},
			{
				line: stubEvaluation({
					deltaGbp: -20_000_000_000,
					description: "Increase NHS spending",
					line: { id: "nhs", type: "programme", leverId: "nhs-england" },
				}),
				// Static stack sums to +£4bn, +£4.5bn — same as projection central.
				// To create a feedback gap, mismatch the static stack vs the central.
				values: [-19_000_000_000, -19_500_000_000],
			},
		];
		const html = renderToStaticMarkup(
			React.createElement(PerLeverComposition, {
				projection,
				lineProjections,
			}),
		);
		expect(html).toContain("static stack vs GE-adjusted central");
	});
});

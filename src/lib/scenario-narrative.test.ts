import { describe, expect, it } from "vitest";
import type { Methodology } from "./methodology";
import type { MicrosimAggregate } from "./microsim/impact";
import type {
	LineEvaluation,
	ScenarioDistribution,
	ScenarioLine,
	ScenarioResult,
} from "./scenario";
import { composeScenarioNarrative } from "./scenario-narrative";

const stubMethodology: Methodology = {
	source: { url: "https://example.com", label: "Example" },
	asOf: "2024-01",
	measure: "test fixture",
};

const stubLine = (overrides: Partial<ScenarioLine>): ScenarioLine => ({
	id: overrides.id ?? "line-id",
	type: overrides.type ?? "tax",
	leverId: overrides.leverId ?? "basic-rate-income-tax",
	magnitude: overrides.magnitude ?? 1,
	...overrides,
});

type StubEvaluationOverrides = Omit<Partial<LineEvaluation>, "line"> & {
	line?: Partial<ScenarioLine>;
};

const stubEvaluation = (overrides: StubEvaluationOverrides): LineEvaluation => ({
	line: stubLine(overrides.line ?? {}),
	deltaGbp: overrides.deltaGbp ?? 0,
	description: overrides.description ?? "Stub line",
	methodology: overrides.methodology ?? stubMethodology,
	source: overrides.source ?? { url: "https://example.com", label: "Example" },
});

const emptyDistribution: ScenarioDistribution = {
	perDecile: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	modelledLines: 0,
	totalLines: 0,
	modelledDelta: 0,
	totalDelta: 0,
};

describe("composeScenarioNarrative", () => {
	it("returns null for an empty scenario", () => {
		const result: ScenarioResult = { freed: 0, required: 0, net: 0, lines: [] };
		expect(
			composeScenarioNarrative({
				result,
				distribution: emptyDistribution,
			}),
		).toBeNull();
	});

	it("describes a single revenue-raising line", () => {
		const line = stubEvaluation({
			deltaGbp: 4_000_000_000,
			description: "Raise basic rate of income tax by 1pp",
			line: { type: "tax" },
		});
		const result: ScenarioResult = {
			freed: 4_000_000_000,
			required: 0,
			net: 4_000_000_000,
			lines: [line],
		};
		const text = composeScenarioNarrative({
			result,
			distribution: emptyDistribution,
		});
		expect(text).not.toBeNull();
		expect(text).toContain("raise basic rate of income tax by 1pp");
		expect(text).toContain("£4.0bn");
	});

	it("describes a single cost line", () => {
		const line = stubEvaluation({
			deltaGbp: -20_000_000_000,
			description: "Increase NHS England spending by £20bn",
			line: { type: "programme", leverId: "nhs-england" },
		});
		const result: ScenarioResult = {
			freed: 0,
			required: 20_000_000_000,
			net: -20_000_000_000,
			lines: [line],
		};
		const text = composeScenarioNarrative({
			result,
			distribution: emptyDistribution,
		});
		expect(text).toContain("increase NHS England spending by £20bn");
		expect(text).toContain("£20.0bn");
		expect(text).toMatch(/cost/i);
	});

	it("describes a balanced multi-line scenario with top contributors", () => {
		const tax = stubEvaluation({
			deltaGbp: 24_000_000_000,
			description: "Raise basic rate of income tax by 2pp",
			line: { id: "tax", type: "tax", magnitude: 2 },
		});
		const nhs = stubEvaluation({
			deltaGbp: -20_000_000_000,
			description: "Increase NHS England spending by £20bn",
			line: { id: "nhs", type: "programme", leverId: "nhs-england" },
		});
		const result: ScenarioResult = {
			freed: 24_000_000_000,
			required: 20_000_000_000,
			net: 4_000_000_000,
			lines: [tax, nhs],
		};
		const text = composeScenarioNarrative({
			result,
			distribution: emptyDistribution,
		});
		expect(text).toContain("raise basic rate of income tax by 2pp");
		expect(text).toContain("increase NHS England spending by £20bn");
		expect(text).toContain("£24.0bn");
		expect(text).toContain("£20.0bn");
		expect(text).toContain("freeing £4.0bn");
	});

	it("flags a shortfall when spending exceeds raised", () => {
		const tax = stubEvaluation({
			deltaGbp: 8_000_000_000,
			description: "Raise basic rate of income tax by 1pp",
			line: { id: "tax", type: "tax" },
		});
		const nhs = stubEvaluation({
			deltaGbp: -20_000_000_000,
			description: "Increase NHS England spending by £20bn",
			line: { id: "nhs", type: "programme", leverId: "nhs-england" },
		});
		const result: ScenarioResult = {
			freed: 8_000_000_000,
			required: 20_000_000_000,
			net: -12_000_000_000,
			lines: [tax, nhs],
		};
		const text = composeScenarioNarrative({
			result,
			distribution: emptyDistribution,
		});
		expect(text).toContain("£12.0bn shortfall");
	});

	it("appends microsim winners/losers when significant", () => {
		const line = stubEvaluation({
			deltaGbp: 5_000_000_000,
			description: "Raise basic rate of income tax by 1pp",
			line: { type: "tax" },
		});
		const result: ScenarioResult = {
			freed: 5_000_000_000,
			required: 0,
			net: 5_000_000_000,
			lines: [line],
		};
		const microsim = {
			decileMean: [],
			decileP10: [],
			decileP50: [],
			decileP90: [],
			decileMeanPctIncome: [],
			decileNet: [],
			byType: new Map(),
			totalImpact: 0,
			winners: 0.2,
			losers: 0.6,
			unaffected: 0.2,
			sampleSize: 1000,
			skippedLines: 0,
		} satisfies MicrosimAggregate;
		const text = composeScenarioNarrative({
			result,
			distribution: emptyDistribution,
			microsim,
		});
		expect(text).toContain("60% of households lose");
		expect(text).toContain("20% gain");
	});

	it("falls back to decile impact when microsim is unavailable", () => {
		const line = stubEvaluation({
			deltaGbp: 10_000_000_000,
			description: "Raise basic rate of income tax by 1pp",
			line: { type: "tax" },
		});
		const result: ScenarioResult = {
			freed: 10_000_000_000,
			required: 0,
			net: 10_000_000_000,
			lines: [line],
		};
		const distribution: ScenarioDistribution = {
			perDecile: [
				2_800_000 * 200, // d1: each household loses £200/yr
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				2_800_000 * 1500, // d10: each household loses £1500/yr
			],
			modelledLines: 1,
			totalLines: 1,
			modelledDelta: 10_000_000_000,
			totalDelta: 10_000_000_000,
		};
		const text = composeScenarioNarrative({ result, distribution });
		expect(text).toContain("Bottom-decile households lose about £200/yr");
		expect(text).toContain("top-decile lose £1.5k/yr");
	});
});

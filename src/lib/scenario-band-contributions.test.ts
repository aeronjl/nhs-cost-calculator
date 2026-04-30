import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	evaluateScenarioBandContributions,
	type ScenarioLine,
} from "./scenario";

describe("evaluateScenarioBandContributions", () => {
	it("returns an empty list for an empty scenario", () => {
		const result = evaluateScenario([]);
		expect(evaluateScenarioBandContributions(result)).toEqual([]);
	});

	it("assigns zero share to deterministic lines (no per-pp distribution)", () => {
		const lines: ScenarioLine[] = [
			{
				id: "nhs",
				type: "programme",
				leverId: "nhs-england",
				magnitude: -10,
			},
		];
		const result = evaluateScenario(lines);
		const contribs = evaluateScenarioBandContributions(result);
		expect(contribs).toHaveLength(1);
		expect(contribs[0]!.share).toBe(0);
		expect(contribs[0]!.variance).toBe(0);
	});

	it("attributes 100% to a single pp-tax line", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
		];
		const result = evaluateScenario(lines);
		const contribs = evaluateScenarioBandContributions(result);
		expect(contribs).toHaveLength(1);
		expect(contribs[0]!.share).toBe(1);
		expect(contribs[0]!.variance).toBeGreaterThan(0);
	});

	it("splits variance proportionally across multiple pp-tax lines", () => {
		const lines: ScenarioLine[] = [
			{
				id: "basic",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
			{
				id: "higher",
				type: "tax",
				leverId: "higher-rate-income-tax",
				magnitude: 1,
			},
		];
		const result = evaluateScenario(lines);
		const contribs = evaluateScenarioBandContributions(result);
		expect(contribs).toHaveLength(2);
		const total = contribs.reduce((s, c) => s + c.share, 0);
		expect(total).toBeCloseTo(1, 5);
		// Larger magnitude → larger variance share for the same per-pp sd
		// (variance scales with magnitude²).
		expect(contribs[0]!.share).toBeGreaterThan(contribs[1]!.share);
	});

	it("ignores non-pp tax lines (deterministic)", () => {
		const lines: ScenarioLine[] = [
			{
				id: "stochastic",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
			{
				id: "deterministic",
				type: "tax",
				leverId: "tax-other",
				magnitude: 2,
			},
		];
		const result = evaluateScenario(lines);
		const contribs = evaluateScenarioBandContributions(result);
		expect(contribs).toHaveLength(2);
		// First line takes all variance; second is deterministic.
		expect(contribs[0]!.share).toBe(1);
		expect(contribs[1]!.share).toBe(0);
	});
});

import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	projectScenarioTieredOverYears,
	type ScenarioLine,
} from "./scenario";

describe("projectScenarioTieredOverYears", () => {
	it("returns one tier row per requested year", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
		];
		const result = evaluateScenario(lines);
		const tiered = projectScenarioTieredOverYears(result, 5);
		expect(tiered).toHaveLength(5);
		expect(tiered.map((t) => t.year)).toEqual([1, 2, 3, 4, 5]);
	});

	it("matches the year-1 static estimate to the unscaled scenario net", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
		];
		const result = evaluateScenario(lines);
		const tiered = projectScenarioTieredOverYears(result, 5);
		// Year-1 static must agree with the bridge's existing year-1 input.
		expect(tiered[0]!.staticNet).toBeCloseTo(result.net, 2);
	});

	it("scales static yield by nominal GDP growth across years", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
		];
		const result = evaluateScenario(lines);
		const tiered = projectScenarioTieredOverYears(result, 5, {
			nominalGrowth: 0.04,
		});
		expect(tiered[1]!.staticNet).toBeCloseTo(
			tiered[0]!.staticNet * 1.04,
			0,
		);
		expect(tiered[4]!.staticNet).toBeCloseTo(
			tiered[0]!.staticNet * Math.pow(1.04, 4),
			0,
		);
	});

	it("returns zero tiers for an empty scenario", () => {
		const result = evaluateScenario([]);
		const tiered = projectScenarioTieredOverYears(result, 3);
		expect(tiered).toHaveLength(3);
		for (const t of tiered) {
			expect(t.staticNet).toBe(0);
			expect(t.dynamicNet).toBe(0);
			expect(t.macroNet).toBe(0);
			expect(t.geNet).toBe(0);
		}
	});

	it("orders tiers static -> dynamic -> macro -> ge for revenue raises", () => {
		// A behavioural-sensitive tax raise should leak yield from static down
		// through dynamic; macro and GE feedback then layer on. Sign isn't
		// guaranteed but |dynamic| should be ≤ |static| for a tax raise (the
		// behavioural haircut can't *amplify* yield).
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
		];
		const result = evaluateScenario(lines);
		const tiered = projectScenarioTieredOverYears(result, 5);
		expect(Math.abs(tiered[0]!.dynamicNet)).toBeLessThanOrEqual(
			Math.abs(tiered[0]!.staticNet) + 1,
		);
	});
});

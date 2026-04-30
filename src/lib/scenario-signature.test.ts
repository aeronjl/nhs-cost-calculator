import { describe, expect, it } from "vitest";
import {
	evaluateScenario,
	evaluateScenarioDistribution,
	type ScenarioLine,
	type YearProjection,
} from "./scenario";
import { computeScenarioSignature } from "./scenario-signature";

const stubYear = (overrides: Partial<YearProjection>): YearProjection => ({
	year: overrides.year ?? 1,
	net: overrides.net ?? 0,
	freed: overrides.freed ?? Math.max(0, overrides.net ?? 0),
	required: overrides.required ?? Math.max(0, -(overrides.net ?? 0)),
	psnbShift: overrides.psnbShift ?? overrides.net ?? 0,
	debtInterestGbp: overrides.debtInterestGbp ?? 0,
	debtStockDeltaGbp: overrides.debtStockDeltaGbp ?? 0,
	debtGdpDeltaPp: overrides.debtGdpDeltaPp ?? 0,
});

describe("computeScenarioSignature", () => {
	it("returns null for an empty scenario", () => {
		const result = evaluateScenario([]);
		const distribution = evaluateScenarioDistribution(result);
		expect(
			computeScenarioSignature({ result, distribution }),
		).toBeNull();
	});

	it("loads the tax axis when only tax levers are used", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 2,
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const sig = computeScenarioSignature({ result, distribution })!;
		expect(sig.tax).toBeGreaterThan(0);
		expect(sig.spend).toBe(0);
		expect(sig.borrow).toBe(0);
	});

	it("loads the spend axis when only programme lines are used", () => {
		const lines: ScenarioLine[] = [
			{
				id: "nhs",
				type: "programme",
				leverId: "nhs-england",
				magnitude: -10,
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const sig = computeScenarioSignature({ result, distribution })!;
		expect(sig.tax).toBe(0);
		expect(sig.spend).toBeGreaterThan(0);
		expect(sig.borrow).toBe(0);
	});

	it("loads the borrow axis on a borrow-only scenario", () => {
		const lines: ScenarioLine[] = [
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 30_000_000_000,
				borrowingContext: { fiscalEvent: "unscored", duration: "persistent" },
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const sig = computeScenarioSignature({ result, distribution })!;
		expect(sig.borrow).toBeGreaterThan(0);
		expect(sig.tax).toBe(0);
		expect(sig.spend).toBe(0);
	});

	it("returns the neutral progressive midpoint when no losses are modelled", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax-other",
				type: "tax",
				leverId: "tax-other",
				magnitude: 5,
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const sig = computeScenarioSignature({ result, distribution })!;
		expect(sig.progressive).toBe(0.5);
	});

	it("treats year-5 = year-1 as the long-run midpoint", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const year1 = stubYear({ year: 1, net: 5_000_000_000 });
		const year5 = stubYear({ year: 5, net: 5_000_000_000 });
		const sig = computeScenarioSignature({
			result,
			distribution,
			year1,
			year5,
		})!;
		expect(sig.longRun).toBe(0.5);
	});

	it("clamps the long-run axis at 1.0 for runaway growth", () => {
		const lines: ScenarioLine[] = [
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
		];
		const result = evaluateScenario(lines);
		const distribution = evaluateScenarioDistribution(result);
		const year1 = stubYear({ year: 1, net: 1_000_000_000 });
		const year5 = stubYear({ year: 5, net: 10_000_000_000 });
		const sig = computeScenarioSignature({
			result,
			distribution,
			year1,
			year5,
		})!;
		expect(sig.longRun).toBe(1);
	});
});

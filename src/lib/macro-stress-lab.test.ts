import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import { buildMacroStressLab } from "./macro-stress-lab";
import { evaluateScenario } from "./scenario";

describe("macro stress lab", () => {
	it("compares professional macro assumptions against the same scenario", () => {
		const result = evaluateScenario([
			{
				id: "tax",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 80_000_000_000,
				borrowingContext: {
					fiscalEvent: "unscored",
					duration: "persistent",
				},
			},
		]);

		const lab = buildMacroStressLab(result, OBR_BASELINE);

		expect(lab.ruleYear).toBe(OBR_BASELINE.stabilityRuleAt);
		expect(lab.parameters.map((parameter) => parameter.id)).toEqual([
			"growth",
			"inflation",
			"bank-rate",
			"multipliers",
			"tax-buoyancy",
			"debt-risk-premium",
		]);
		expect(Number.isFinite(lab.central.adjustedHeadroomGbp)).toBe(true);
		expect(lab.largestDownsideParameterLabel.length).toBeGreaterThan(0);
		expect(lab.largestSwingParameterLabel.length).toBeGreaterThan(0);
		expect(
			lab.parameters.every(
				(parameter) =>
					Number.isFinite(parameter.lowCase.adjustedHeadroomGbp) &&
					Number.isFinite(parameter.highCase.adjustedHeadroomGbp) &&
					parameter.headroomRangeGbp >= 0,
			),
		).toBe(true);

		const multiplier = lab.parameters.find(
			(parameter) => parameter.id === "multipliers",
		)!;
		const buoyancy = lab.parameters.find(
			(parameter) => parameter.id === "tax-buoyancy",
		)!;
		const debtRisk = lab.parameters.find(
			(parameter) => parameter.id === "debt-risk-premium",
		)!;
		expect(multiplier.headroomRangeGbp).toBeGreaterThan(0);
		expect(buoyancy.headroomRangeGbp).toBeGreaterThan(0);
		expect(debtRisk.headroomRangeGbp).toBeGreaterThan(0);
	});
});

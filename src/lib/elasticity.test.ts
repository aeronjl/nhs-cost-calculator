import { describe, expect, it } from "vitest";
import {
	type BehaviouralModel,
	describeBehaviouralModel,
	dynamicAdjust,
	evaluateBehaviouralResponse,
	haircutAmount,
	haircutFraction,
} from "./elasticity";

const labourModel: BehaviouralModel = {
	kind: "marginal-rate",
	taxType: "labour-income",
	calibration: "post-behavioural-ready-reckoner",
	currentMarginalRate: 0.4,
	taxableBaseElasticity: 0.45,
	response: "net-of-tax",
	workerIncidenceShare: 1,
	outputShare: 0.7,
	note: "test",
};

describe("evaluateBehaviouralResponse", () => {
	it("returns the ready-reckoner delta unchanged when no model is set", () => {
		const r = evaluateBehaviouralResponse(6_000_000_000, undefined, 1);
		expect(r.dynamicDelta).toBe(6_000_000_000);
		expect(r.adjustmentFraction).toBe(0);
	});

	it("calibrates a +1pp move to the ready-reckoner value", () => {
		const r = evaluateBehaviouralResponse(1_600_000_000, labourModel, 1);
		expect(r.dynamicDelta).toBeCloseTo(1_600_000_000);
		expect(r.adjustmentFraction).toBeCloseTo(0);
	});

	it("uses the marginal tax wedge for larger rate rises", () => {
		const r = evaluateBehaviouralResponse(8_000_000_000, labourModel, 5);
		expect(r.dynamicDelta).toBeLessThan(8_000_000_000);
		expect(r.adjustmentFraction).toBeGreaterThan(0.03);
		expect(r.outputEffectGbp).toBeLessThan(0);
		expect(r.workerCevGbp).toBeLessThan(0);
	});

	it("tax cuts expand the affected base and improve worker CEV", () => {
		const r = evaluateBehaviouralResponse(-8_000_000_000, labourModel, -5);
		expect(r.dynamicDelta).toBeLessThan(0);
		expect(r.outputEffectGbp).toBeGreaterThan(0);
		expect(r.workerCevGbp).toBeGreaterThan(0);
	});

	it("supports unit-price duties such as fuel duty", () => {
		const fuel: BehaviouralModel = {
			kind: "unit-price",
			taxType: "commodity-duty",
			calibration: "post-behavioural-ready-reckoner",
			currentDutyPerUnit: 0.5295,
			taxInclusivePricePerUnit: 1.45,
			demandElasticity: 0.2,
			workerIncidenceShare: 0.65,
			outputShare: 0.35,
			note: "test",
		};
		const r = evaluateBehaviouralResponse(2_500_000_000, fuel, 5);
		expect(r.dynamicDelta).toBeLessThan(2_500_000_000);
		expect(r.outputEffectGbp).toBeLessThan(0);
	});

	it("describes marginal-rate model inputs for UI methodology", () => {
		const summary = describeBehaviouralModel(labourModel, 2);
		expect(summary?.rows).toContainEqual({
			label: "Marginal rate",
			value: "40.0% → 42.0%",
		});
		expect(summary?.rows).toContainEqual({ label: "ETI", value: "0.45" });
		expect(summary?.rows.some((row) => row.label === "Base response")).toBe(
			true,
		);
	});

	it("describes unit-price model inputs for UI methodology", () => {
		const fuel: BehaviouralModel = {
			kind: "unit-price",
			taxType: "commodity-duty",
			calibration: "post-behavioural-ready-reckoner",
			currentDutyPerUnit: 0.5295,
			taxInclusivePricePerUnit: 1.45,
			demandElasticity: 0.2,
			workerIncidenceShare: 0.65,
			outputShare: 0.35,
			note: "test",
		};
		const summary = describeBehaviouralModel(fuel, 5);
		expect(summary?.rows).toContainEqual({
			label: "Duty",
			value: "52.95p → 57.95p",
		});
		expect(summary?.rows).toContainEqual({
			label: "Demand elasticity",
			value: "0.20",
		});
	});

	it("keeps the legacy linear-haircut path for old fixtures", () => {
		const e: BehaviouralModel = { coefficient: 0.02, note: "test" };
		expect(dynamicAdjust(30_000_000_000, e, 5)).toBeCloseTo(27_000_000_000);
		expect(haircutFraction(e, 5)).toBeCloseTo(0.1);
		expect(haircutAmount(30_000_000_000, e, 5)).toBeCloseTo(3_000_000_000);
	});
});

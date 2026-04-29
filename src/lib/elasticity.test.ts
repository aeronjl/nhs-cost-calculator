import { describe, expect, it } from "vitest";
import {
	type Elasticity,
	dynamicAdjust,
	haircutAmount,
	haircutFraction,
} from "./elasticity";

describe("dynamicAdjust", () => {
	it("returns the static delta unchanged when no elasticity is set", () => {
		expect(dynamicAdjust(6_000_000_000, undefined, 1)).toBe(6_000_000_000);
	});

	it("applies a small haircut at small magnitudes", () => {
		const e: Elasticity = { coefficient: 0.02, note: "test" };
		// 1pp move: 2% haircut. £6bn → £5.88bn
		expect(dynamicAdjust(6_000_000_000, e, 1)).toBeCloseTo(5_880_000_000);
	});

	it("applies a larger haircut at larger magnitudes", () => {
		const e: Elasticity = { coefficient: 0.02, note: "test" };
		// 5pp move: 10% haircut. £30bn → £27bn
		expect(dynamicAdjust(30_000_000_000, e, 5)).toBeCloseTo(27_000_000_000);
	});

	it("applies the same haircut to negative deltas (tax cuts also lose less than static)", () => {
		const e: Elasticity = { coefficient: 0.02, note: "test" };
		// -2pp move: 4% haircut on cost. -£12bn → -£11.52bn (cost is less than static)
		expect(dynamicAdjust(-12_000_000_000, e, -2)).toBeCloseTo(
			-11_520_000_000,
		);
	});

	it("caps haircut at 95% to prevent sign flip", () => {
		const e: Elasticity = { coefficient: 0.5, note: "very elastic" };
		// 100pp move would mathematically be 50× haircut = 5000% — capped to 95%
		expect(dynamicAdjust(1_000_000_000, e, 100)).toBeCloseTo(50_000_000);
	});

	it("a highly elastic lever (CGT-like) takes substantial haircuts", () => {
		const e: Elasticity = { coefficient: 0.10, note: "CGT-like" };
		// +4pp on CGT: 40% haircut. £400m → £240m
		expect(dynamicAdjust(400_000_000, e, 4)).toBeCloseTo(240_000_000);
	});
});

describe("haircutAmount + haircutFraction", () => {
	it("haircut amount equals static minus dynamic", () => {
		const e: Elasticity = { coefficient: 0.05, note: "test" };
		const amount = haircutAmount(10_000_000_000, e, 2);
		expect(amount).toBeCloseTo(1_000_000_000); // 10% haircut on £10bn
	});

	it("haircut fraction is the fractional reduction (0..0.95)", () => {
		const e: Elasticity = { coefficient: 0.05, note: "test" };
		expect(haircutFraction(e, 2)).toBeCloseTo(0.10);
		expect(haircutFraction(e, 100)).toBeCloseTo(0.95); // capped
	});

	it("returns 0 when no elasticity is provided", () => {
		expect(haircutFraction(undefined, 5)).toBe(0);
		expect(haircutAmount(10_000_000_000, undefined, 5)).toBe(0);
	});
});

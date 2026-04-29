import { describe, expect, it } from "vitest";
import {
	DECILE_DISPOSABLE_INCOME,
	type IncidenceVector,
	asShareOfIncome,
	distributeDelta,
	isValidVector,
	sumDeciles,
	zeroDeciles,
} from "./distribution";

describe("isValidVector", () => {
	it("accepts a uniform vector", () => {
		const v: IncidenceVector = [
			0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
		];
		expect(isValidVector(v)).toBe(true);
	});

	it("accepts a top-heavy vector summing to 1", () => {
		const v: IncidenceVector = [0, 0, 0, 0, 0, 0, 0.05, 0.15, 0.3, 0.5];
		expect(isValidVector(v)).toBe(true);
	});

	it("rejects a vector that doesn't sum to 1", () => {
		const v: IncidenceVector = [
			0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.5,
		];
		expect(isValidVector(v)).toBe(false);
	});

	it("tolerates 2% rounding error", () => {
		const v: IncidenceVector = [
			0.099, 0.099, 0.099, 0.099, 0.099, 0.099, 0.099, 0.099, 0.099, 0.108,
		];
		expect(isValidVector(v)).toBe(true);
	});
});

describe("distributeDelta", () => {
	it("distributes a tax revenue across deciles by incidence", () => {
		// VAT-like: hits bottom deciles harder as % of income (regressive)
		const incidence: IncidenceVector = [
			0.13, 0.12, 0.11, 0.1, 0.1, 0.09, 0.09, 0.08, 0.09, 0.09,
		];
		const result = distributeDelta(8_000_000_000, incidence); // £8bn raised
		expect(result).toHaveLength(10);
		expect(result[0]).toBeCloseTo(1_040_000_000);
		expect(result[9]).toBeCloseTo(720_000_000);
		// Sum equals delta (within rounding)
		const sum = result.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(8_000_000_000, -3);
	});

	it("negative delta = decile gains (e.g. tax cut)", () => {
		const incidence: IncidenceVector = [
			0.05, 0.05, 0.05, 0.05, 0.1, 0.1, 0.1, 0.15, 0.2, 0.15,
		];
		const result = distributeDelta(-5_000_000_000, incidence);
		expect(result.every((v) => v < 0)).toBe(true);
		expect(result[9]).toBeLessThan(result[0]); // top decile gains more in £
	});
});

describe("sumDeciles", () => {
	it("element-wise sums two per-decile arrays", () => {
		const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const b = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		expect(sumDeciles(a, b)).toEqual([11, 11, 11, 11, 11, 11, 11, 11, 11, 11]);
	});

	it("handles a zero base", () => {
		const a = zeroDeciles();
		const b = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		expect(sumDeciles(a, b)).toEqual(b);
	});
});

describe("asShareOfIncome", () => {
	it("computes per-decile burden as % of disposable income", () => {
		// £100 burden on every decile
		const perDecile = Array.from({ length: 10 }, () => 100);
		const shares = asShareOfIncome(perDecile);
		// Bottom decile (income £12,400): 100/12400 = 0.806%
		expect(shares[0]).toBeCloseTo(0.00806, 4);
		// Top decile (income £102,500): 100/102500 = 0.0976%
		expect(shares[9]).toBeCloseTo(0.000976, 4);
		// Bottom decile burden as % is ~8x top decile's, despite £ being equal
		expect(shares[0]! / shares[9]!).toBeGreaterThan(7);
	});

	it("a regressive-in-£ scenario is even more regressive in % of income", () => {
		const perDecile = [200, 180, 160, 140, 120, 100, 80, 60, 40, 20];
		const shares = asShareOfIncome(perDecile);
		// Bottom (£200/£12.4k = 1.6%) vs top (£20/£102.5k = 0.02%) is ~80x ratio
		expect(shares[0]! / shares[9]!).toBeGreaterThan(50);
	});
});

describe("DECILE_DISPOSABLE_INCOME", () => {
	it("is monotonically increasing", () => {
		for (let i = 1; i < DECILE_DISPOSABLE_INCOME.length; i++) {
			expect(DECILE_DISPOSABLE_INCOME[i]).toBeGreaterThan(
				DECILE_DISPOSABLE_INCOME[i - 1]!,
			);
		}
	});

	it("has 10 deciles", () => {
		expect(DECILE_DISPOSABLE_INCOME).toHaveLength(10);
	});
});

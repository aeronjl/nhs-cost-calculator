import { describe, expect, it } from "vitest";
import { compareBorrowingStrategies } from "./borrowing-strategy-comparison";

describe("borrowing strategy comparison", () => {
	it("compares named strategies plus the optimised portfolio", () => {
		const comparison = compareBorrowingStrategies(50_000_000_000, 5, {
			fanSamples: 120,
			fiscalSamples: 120,
			seed: 11,
		});
		expect(comparison).toEqual(
			compareBorrowingStrategies(50_000_000_000, 5, {
				fanSamples: 120,
				fiscalSamples: 120,
				seed: 11,
			}),
		);
		expect(comparison.rows.map((row) => row.id)).toEqual([
			"dmo-remit",
			"short-funded",
			"long-funded",
			"index-linked-heavy",
			"optimised",
		]);
		expect(comparison.optimisedRow.objectiveGbp).toBeLessThanOrEqual(
			comparison.bestNamedRow.objectiveGbp,
		);
	});

	it("exposes central, stress, regime, and fiscal-rule tail metrics", () => {
		const comparison = compareBorrowingStrategies(50_000_000_000, 5, {
			fanSamples: 120,
			fiscalSamples: 120,
			seed: 11,
		});
		for (const row of comparison.rows) {
			expect(row.centralFinalInterestGbp).toBeGreaterThan(0);
			expect(row.centralCumulativeInterestGbp).toBeGreaterThan(
				row.centralFinalInterestGbp,
			);
			expect(row.worstStressFinalInterestGbp).toBeGreaterThan(
				row.centralFinalInterestGbp,
			);
			expect(row.regimeInterestP95Gbp).toBeGreaterThan(
				row.centralFinalInterestGbp,
			);
			expect(row.fiscalBreachProbability).toBeGreaterThanOrEqual(0);
			expect(row.fiscalBreachProbability).toBeLessThanOrEqual(1);
			expect(row.fiscalHeadroomP5Gbp).toBeLessThan(
				row.fiscalPolicyReactionP95Gbp,
			);
			expect(row.peakMarketPressureBp).toBeGreaterThanOrEqual(0);
			expect(row.portfolio.reduce((sum, item) => sum + item.share, 0)).toBeCloseTo(
				1,
			);
		}
	});
});

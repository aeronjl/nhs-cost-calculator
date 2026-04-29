import { describe, expect, it } from "vitest";
import { projectBorrowingFan } from "./borrowing";
import {
	estimateBorrowingStressRegime,
	projectBorrowingRegimeFan,
} from "./borrowing-regime";

describe("borrowing stress regime model", () => {
	it("classifies scored marginal investment borrowing as normal", () => {
		const estimate = estimateBorrowingStressRegime(20_000_000_000, 5);
		expect(estimate.topRegime.id).toBe("normal");
		expect(estimate.topRegime.probability).toBeGreaterThan(0.7);
		expect(estimate.stressRating).toBe("low");
	});

	it("classifies mini-budget-sized unfunded borrowing as credibility risk", () => {
		const estimate = estimateBorrowingStressRegime(43_500_000_000, 5);
		expect(estimate.topRegime.id).toBe("credibility-shock");
		expect(estimate.topRegime.probability).toBeGreaterThan(0.7);
		expect(estimate.expectedOverlayBp).toBeGreaterThan(75);
		expect(estimate.stressRating).toBe("stress");
	});

	it("classifies pandemic-scale issuance as a backstop-like regime", () => {
		const estimate = estimateBorrowingStressRegime(300_000_000_000, 5);
		expect(estimate.topRegime.id).toBe("monetary-backstop");
		expect(estimate.topRegime.probability).toBeGreaterThan(0.95);
		expect(estimate.expectedOverlayBp).toBeLessThan(0);
		expect(estimate.expectedPeakPressureBp).toBeLessThan(
			estimate.features.centralPeakPressureBp,
		);
	});

	it("returns a complete probability distribution", () => {
		const estimate = estimateBorrowingStressRegime(75_000_000_000, 5);
		const probabilityTotal = estimate.probabilities.reduce(
			(sum, item) => sum + item.probability,
			0,
		);
		expect(estimate.probabilities.map((item) => item.id).sort()).toEqual([
			"credibility-shock",
			"monetary-backstop",
			"normal",
		]);
		expect(probabilityTotal).toBeCloseTo(1);
	});

	it("adds regime switching to borrowing fan tails", () => {
		const base = projectBorrowingFan(43_500_000_000, 5, {}, 400, 12);
		const switched = projectBorrowingRegimeFan(
			43_500_000_000,
			5,
			{},
			400,
			12,
		);
		expect(switched).toEqual(
			projectBorrowingRegimeFan(43_500_000_000, 5, {}, 400, 12),
		);
		expect(switched.at(-1)!.interestCostBand.p95).toBeGreaterThan(
			base.at(-1)!.interestCostBand.p95,
		);
		expect(switched.at(-1)!.debtStockBand.p95).toBeGreaterThan(
			base.at(-1)!.debtStockBand.p95,
		);
	});
});

import { describe, expect, it } from "vitest";
import {
	type Allocation,
	adjustLever,
	allocationTotal,
	describeBorrow,
	describeCut,
	describeTax,
	evenSplit,
	rescale,
} from "./trade-off";

const TARGET = 30_000_000_000;

const expectClose = (actual: number, expected: number, tol = 1) =>
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe("trade-off allocation", () => {
	it("evenSplit divides the target into thirds", () => {
		const a = evenSplit(TARGET);
		expectClose(a.tax, TARGET / 3);
		expectClose(allocationTotal(a), TARGET);
	});

	it("adjustLever moves £ from one lever and proportionally rebalances the others", () => {
		const start: Allocation = { tax: 10, borrow: 5, cut: 15 };
		const next = adjustLever(start, "tax", 20, 30);
		expect(next.tax).toBe(20);
		// Remaining 10 split between borrow:cut in their original 5:15 = 1:3 ratio.
		expectClose(next.borrow, 10 * (5 / 20));
		expectClose(next.cut, 10 * (15 / 20));
		expectClose(allocationTotal(next), 30);
	});

	it("adjustLever splits evenly when both other levers were zero", () => {
		const start: Allocation = { tax: 30, borrow: 0, cut: 0 };
		const next = adjustLever(start, "tax", 10, 30);
		expect(next.tax).toBe(10);
		expect(next.borrow).toBe(10);
		expect(next.cut).toBe(10);
	});

	it("adjustLever clamps negative values to zero", () => {
		const start = evenSplit(30);
		const next = adjustLever(start, "tax", -50, 30);
		expect(next.tax).toBe(0);
		expectClose(allocationTotal(next), 30);
	});

	it("adjustLever clamps values above target to the target", () => {
		const start = evenSplit(30);
		const next = adjustLever(start, "borrow", 99999, 30);
		expect(next.borrow).toBe(30);
		expect(next.tax).toBe(0);
		expect(next.cut).toBe(0);
	});

	it("rescale preserves lever ratios when the goal changes", () => {
		const start: Allocation = { tax: 10, borrow: 20, cut: 70 }; // 10:20:70
		const next = rescale(start, 200);
		expectClose(next.tax, 20);
		expectClose(next.borrow, 40);
		expectClose(next.cut, 140);
	});

	it("rescale falls back to an even split when starting from zero", () => {
		const next = rescale({ tax: 0, borrow: 0, cut: 0 }, 30);
		expectClose(next.tax, 10);
	});
});

describe("policy translations", () => {
	it("describeTax converts £ to percentage points using the ready reckoner", () => {
		// Basic-rate income tax: £6bn per pp.
		const r = describeTax(6_000_000_000, "basic-rate-income-tax");
		expectClose(r.ppChange, 1);
		expectClose(r.newRate, 0.21, 0.001);
		expect(r.lever.unit).toBe("pp");
	});

	it("describeTax converts £ to years for freeze levers", () => {
		const r = describeTax(4_500_000_000, "freeze-personal-allowance");
		expectClose(r.yearsOfFreeze, 3);
		expect(r.ppChange).toBe(0);
		expect(r.lever.unit).toBe("yr");
	});

	it("describeBorrow yields annual interest and a debt:GDP delta", () => {
		const r = describeBorrow(26_000_000_000);
		// 5% × £26bn = £1.3bn/yr.
		expectClose(r.annualInterest, 1_300_000_000, 1000);
		// £26bn / £2.6tn = 1pp.
		expectClose(r.debtGdpDelta, 1, 0.001);
	});

	it("describeCut yields the share of the chosen programme", () => {
		const r = describeCut(5_400_000_000, "defence");
		expectClose(r.fraction, 0.1, 0.001); // £5.4bn / £54bn = 10%
	});

	it("describeCut returns zero fraction when the programme has zero budget", () => {
		// Defence is the fallback when an unknown id is passed; defence > 0.
		// To exercise the divide-by-zero guard we pass an unknown id explicitly.
		const r = describeCut(1, "this-programme-does-not-exist");
		expect(r.fraction).toBeGreaterThan(0); // falls through to the first programme
	});

	it("describeCut flags exceedsCuttable when the cut exceeds the cuttable fraction", () => {
		// state-pension: cuttableFraction = 0.05. £20bn / £138bn ≈ 14.5%.
		const r = describeCut(20_000_000_000, "state-pension");
		expect(r.cuttableFraction).toBe(0.05);
		expect(r.exceedsCuttable).toBe(true);
	});

	it("describeCut does NOT flag exceedsCuttable when within the cuttable bound", () => {
		// defence: cuttableFraction = 0.20. £5bn / £54bn ≈ 9%.
		const r = describeCut(5_000_000_000, "defence");
		expect(r.exceedsCuttable).toBe(false);
	});
});

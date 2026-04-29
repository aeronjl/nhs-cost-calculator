import { describe, expect, it } from "vitest";
import { calculateUKTax, nhsShareOfTax } from "./tax";

describe("calculateUKTax", () => {
	it("zero salary → zero everything", () => {
		const r = calculateUKTax(0);
		expect(r.totalTax).toBe(0);
		expect(r.effectiveRate).toBe(0);
	});

	it("below personal allowance → zero income tax and NI", () => {
		const r = calculateUKTax(10_000);
		expect(r.incomeTax).toBe(0);
		expect(r.nationalInsurance).toBe(0);
	});

	it("£30,000 salary: 20% basic rate income tax + 8% NI on the band above PA", () => {
		const r = calculateUKTax(30_000);
		// Income tax: (30000 - 12570) × 0.20 = 3486
		expect(r.incomeTax).toBeCloseTo(3486, 0);
		// NI: (30000 - 12570) × 0.08 = 1394.4
		expect(r.nationalInsurance).toBeCloseTo(1394.4, 0);
	});

	it("£60,000 salary triggers higher rate income tax", () => {
		const r = calculateUKTax(60_000);
		// Basic: (50270 - 12570) × 0.20 = 7540
		// Higher: (60000 - 50270) × 0.40 = 3892
		expect(r.incomeTax).toBeCloseTo(7540 + 3892, 0);
		// NI main: (50270 - 12570) × 0.08 = 3016
		// NI upper: (60000 - 50270) × 0.02 = 194.6
		expect(r.nationalInsurance).toBeCloseTo(3016 + 194.6, 0);
	});

	it("£110,000 starts the personal allowance taper", () => {
		const r = calculateUKTax(110_000);
		// Tapered PA: 12570 - (110000 - 100000)/2 = 12570 - 5000 = 7570
		// Taxable: 110000 - 7570 = 102430
		// Basic: (50270 - 12570) × 0.20 = 7540
		// Higher: (102430 - (50270 - 12570)) × 0.40 = (102430 - 37700) × 0.40 = 64730 × 0.40 = 25892
		expect(r.incomeTax).toBeCloseTo(7540 + 25892, 0);
	});

	it("over £125,140 fully eliminates the personal allowance and uses additional rate", () => {
		const r = calculateUKTax(150_000);
		// PA tapers to 0 above £125,140. Taxable income = full salary.
		// Bands apply to taxable income, so additional rate kicks in at
		// taxable £112,570 (= salary £112,570 with no PA), not at salary £125,140.
		// Basic:      37,700 × 0.20 = 7,540
		// Higher:     74,870 × 0.40 = 29,948
		// Additional: 37,430 × 0.45 = 16,843.50
		expect(r.incomeTax).toBeCloseTo(7540 + 29948 + 16843.5, 0);
	});

	it("total tax = income tax + NI; net income = gross − total tax", () => {
		const r = calculateUKTax(45_000);
		expect(r.totalTax).toBeCloseTo(r.incomeTax + r.nationalInsurance, 4);
		expect(r.netIncome).toBeCloseTo(r.gross - r.totalTax, 4);
	});
});

describe("nhsShareOfTax", () => {
	it("approximates ~18% of total tax going to NHS England", () => {
		expect(nhsShareOfTax(10_000)).toBeCloseTo(1800, 0);
	});

	it("scales linearly with input", () => {
		expect(nhsShareOfTax(0)).toBe(0);
		expect(nhsShareOfTax(50_000)).toBeCloseTo(9000, 0);
	});
});

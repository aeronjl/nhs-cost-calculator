import { describe, expect, it } from "vitest";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
} from "./baseline-projection";
import {
	evaluateScenario,
	type ScenarioLine,
	type YearProjection,
} from "./scenario";

const TEST_BASELINE: OBRBaseline = {
	asOf: "2025-03",
	source: { url: "test", label: "Test" },
	years: [
		{
			fiscalYear: "Y1",
			psnb: 100_000_000_000,
			psnbPctGdp: 4.0,
			psnd: 2_500_000_000_000,
			psndPctGdp: 95.0,
			totalRevenue: 1_100_000_000_000,
			totalSpending: 1_200_000_000_000,
			gdp: 2_500_000_000_000,
		},
		{
			fiscalYear: "Y2",
			psnb: 90_000_000_000,
			psnbPctGdp: 3.5,
			psnd: 2_590_000_000_000,
			psndPctGdp: 95.0,
			totalRevenue: 1_140_000_000_000,
			totalSpending: 1_230_000_000_000,
			gdp: 2_600_000_000_000,
		},
		{
			fiscalYear: "Y3",
			psnb: 80_000_000_000,
			psnbPctGdp: 3.0,
			psnd: 2_670_000_000_000,
			psndPctGdp: 94.0,
			totalRevenue: 1_180_000_000_000,
			totalSpending: 1_260_000_000_000,
			gdp: 2_700_000_000_000,
		},
	],
	stabilityRuleHeadroom: 10_000_000_000,
	stabilityRuleAt: "Y3",
	investmentRuleHeadroom: 15_000_000_000,
};

const yp = (year: number, net: number): YearProjection => ({
	year,
	net,
	freed: net > 0 ? net : 0,
	required: net < 0 ? Math.abs(net) : 0,
	psnbShift: net,
	debtInterestGbp: 0,
	debtStockDeltaGbp: 0,
	debtGdpDeltaPp: 0,
});

const borrowYp = (
	year: number,
	net: number,
	psnbShift: number,
): YearProjection => ({
	year,
	net,
	freed: net > 0 ? net : 0,
	required: net < 0 ? Math.abs(net) : 0,
	psnbShift,
	debtInterestGbp: Math.max(0, -net),
	debtStockDeltaGbp: 10_000_000_000,
	debtGdpDeltaPp: 0.4,
});

describe("projectAgainstBaseline", () => {
	it("revenue-raising scenario shifts PSNB downward each year", () => {
		const proj = [yp(1, 30_000_000_000), yp(2, 30_000_000_000), yp(3, 30_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.years).toHaveLength(3);
		expect(cmp.years[0]?.baselinePsnb).toBe(100_000_000_000);
		expect(cmp.years[0]?.adjustedPsnb).toBe(70_000_000_000);
		expect(cmp.years[2]?.adjustedPsnb).toBe(50_000_000_000);
	});

	it("cost scenario shifts PSNB upward", () => {
		const proj = [yp(1, -20_000_000_000), yp(2, -20_000_000_000), yp(3, -20_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.years[0]?.adjustedPsnb).toBe(120_000_000_000);
		expect(cmp.years[2]?.adjustedPsnb).toBe(100_000_000_000);
	});

	it("borrowing can provide cash while worsening PSNB", () => {
		const proj = [
			borrowYp(1, 9_500_000_000, -10_500_000_000),
			borrowYp(2, -500_000_000, -500_000_000),
			borrowYp(3, -500_000_000, -500_000_000),
		];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.years[0]?.scenarioNet).toBe(9_500_000_000);
		expect(cmp.years[0]?.psnbShift).toBe(-10_500_000_000);
		expect(cmp.years[0]?.adjustedPsnb).toBe(110_500_000_000);
		expect(cmp.years[0]?.adjustedDebtGdp).toBeCloseTo(95.42);
		expect(cmp.years[2]?.debtStockDeltaGbp).toBe(11_500_000_000);
	});

	it("identifies the fiscal-rule year and adjusts headroom", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, 5_000_000_000)]; // £5bn raise at horizon
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.ruleYear?.fiscalYear).toBe("Y3");
		// Baseline headroom £10bn + scenario's £5bn = £15bn adjusted
		expect(cmp.adjustedStabilityHeadroom).toBe(15_000_000_000);
	});

	it("a scenario that breaks the rule shows negative adjusted headroom", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, -15_000_000_000)]; // £15bn cost at horizon
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		// Baseline headroom £10bn − scenario cost £15bn = -£5bn (rule broken)
		expect(cmp.adjustedStabilityHeadroom).toBe(-5_000_000_000);
		expect(cmp.diagnostics.stabilityRuleBreached).toBe(true);
		expect(cmp.diagnostics.consolidationRequiredGbp).toBe(5_000_000_000);
		expect(cmp.diagnostics.riskRating).toBe("breach");
		expect(cmp.policyReactionPath.at(-1)?.correctionGbp).toBe(
			5_000_000_000,
		);
		expect(cmp.policyReactionPath.at(-1)?.correctedPsnb).toBe(
			90_000_000_000,
		);
		expect(cmp.policyReactionOptions.map((option) => option.id)).toEqual([
			"balanced",
			"tax-led",
			"spending-led",
			"delayed",
		]);
	});

	it("flags thin headroom as fiscal reaction risk before formal breach", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, -8_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.adjustedStabilityHeadroom).toBe(2_000_000_000);
		expect(cmp.diagnostics.stabilityRuleBreached).toBe(false);
		expect(cmp.diagnostics.riskRating).toBe("tight");
		expect(cmp.diagnostics.policyReactionGbp).toBe(8_000_000_000);
		expect(cmp.policyReactionPath).toHaveLength(3);
	});

	it("compares fiscal reaction options with macro feedback", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, -15_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		const taxLed = cmp.policyReactionOptions.find(
			(option) => option.id === "tax-led",
		)!;
		const spendingLed = cmp.policyReactionOptions.find(
			(option) => option.id === "spending-led",
		)!;
		const balanced = cmp.policyReactionOptions.find(
			(option) => option.id === "balanced",
		)!;
		const delayed = cmp.policyReactionOptions.find(
			(option) => option.id === "delayed",
		)!;
		expect(taxLed.annualGrossTighteningGbp).toBeLessThan(
			spendingLed.annualGrossTighteningGbp,
		);
		expect(spendingLed.horizonGdpDragGbp).toBeGreaterThan(
			taxLed.horizonGdpDragGbp,
		);
		expect(taxLed.headroomAfterReactionGbp).toBeCloseTo(0);
		expect(spendingLed.headroomAfterReactionGbp).toBeCloseTo(0);
		expect(delayed.debtGdpAtHorizon).toBeGreaterThan(
			balanced.debtGdpAtHorizon,
		);
	});

	it("computes adjusted PSNB as % of GDP correctly", () => {
		const proj = [yp(1, 50_000_000_000)]; // £50bn raise
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		// Baseline 100bn → adjusted 50bn → 50bn / 2.5tn = 2.0%
		expect(cmp.years[0]?.adjustedPsnbPctGdp).toBeCloseTo(2.0);
	});

	it("handles a projection longer than the baseline (truncates)", () => {
		const proj = [yp(1, 10_000_000_000), yp(2, 10_000_000_000), yp(3, 10_000_000_000), yp(4, 10_000_000_000), yp(5, 10_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		expect(cmp.years).toHaveLength(3); // truncated to baseline length
		expect(cmp.policyReactionOptions).toHaveLength(0);
	});
});

describe("projectFiscalRuleFan", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `tax-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("produces deterministic fiscal-rule probability bands", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const a = projectFiscalRuleFan(result, TEST_BASELINE, 200, 99);
		const b = projectFiscalRuleFan(result, TEST_BASELINE, 200, 99);
		expect(a).toEqual(b);
		expect(a.samples).toBe(200);
		expect(a.headroomBand.p5).toBeLessThan(a.headroomBand.p95);
		expect(a.ruleYearPsnbBand.p5).toBeLessThan(a.ruleYearPsnbBand.p95);
		expect(a.breachProbability).toBeGreaterThanOrEqual(0);
		expect(a.breachProbability).toBeLessThanOrEqual(1);
	});

	it("assigns higher breach probability to large costs than large revenue raisers", () => {
		const costly = projectFiscalRuleFan(
			evaluateScenario([
				{
					id: "borrow",
					type: "borrow",
					leverId: "",
					magnitude: 50_000_000_000,
				},
			]),
			TEST_BASELINE,
			300,
			7,
		);
		const revenue = projectFiscalRuleFan(
			evaluateScenario([taxLine("basic-rate-income-tax", 5)]),
			TEST_BASELINE,
			300,
			7,
		);
		expect(costly.breachProbability).toBeGreaterThan(
			revenue.breachProbability,
		);
		expect(costly.headroomBand.p50).toBeLessThan(revenue.headroomBand.p50);
	});

	it("samples borrowing stress regimes inside the fiscal-rule fan", () => {
		const result = evaluateScenario([
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 43_500_000_000,
			},
		]);
		const switched = projectFiscalRuleFan(result, TEST_BASELINE, 300, 7);
		const continuousOnly = projectFiscalRuleFan(
			result,
			TEST_BASELINE,
			300,
			7,
			{},
			{ regimeSwitching: false },
		);
		expect(switched.breachProbability).toBeGreaterThan(
			continuousOnly.breachProbability,
		);
		expect(switched.headroomBand.p5).toBeLessThan(
			continuousOnly.headroomBand.p5,
		);
		expect(switched.headroomBand).not.toEqual(continuousOnly.headroomBand);
		expect(switched.centralHeadroomGbp).toBe(continuousOnly.centralHeadroomGbp);
	});
});

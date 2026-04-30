import { describe, expect, it } from "vitest";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
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
		expect(Math.abs(taxLed.headroomAfterReactionGbp)).toBeLessThan(
			50_000_000,
		);
		expect(Math.abs(spendingLed.headroomAfterReactionGbp)).toBeLessThan(
			50_000_000,
		);
		expect(delayed.debtGdpAtHorizon).toBeGreaterThan(
			balanced.debtGdpAtHorizon,
		);
	});

	it("builds concrete fiscal reaction packages from named levers", () => {
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

		expect(taxLed.package.components.some((c) => c.type === "tax")).toBe(true);
		expect(
			taxLed.package.components.some(
				(c) => c.leverId === "employer-nics-main",
			),
		).toBe(true);
		expect(
			spendingLed.package.components.some((c) => c.type === "programme"),
		).toBe(true);
		expect(
			spendingLed.package.components.some(
				(c) => c.leverId === "working-age-welfare",
			),
		).toBe(true);
		expect(taxLed.package.taxTighteningGbp).toBeGreaterThan(
			taxLed.package.spendingTighteningGbp,
		);
		expect(spendingLed.package.spendingTighteningGbp).toBeGreaterThan(
			spendingLed.package.taxTighteningGbp,
		);
		expect(
			Math.abs(
				balanced.package.effectiveCorrectionGbp -
					cmp.diagnostics.policyReactionGbp,
			),
		).toBeLessThan(50_000_000);
		expect(balanced.package.gdpDragGbp).toBeGreaterThan(0);
		expect(balanced.package.macroFeedbackGbp).toBeLessThan(0);
	});

	it("attaches distributional and household incidence to reaction packages", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, -15_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		const taxLed = cmp.policyReactionOptions.find(
			(option) => option.id === "tax-led",
		)!;
		const spendingLed = cmp.policyReactionOptions.find(
			(option) => option.id === "spending-led",
		)!;

		expect(taxLed.package.incidence.totalLines).toBe(
			taxLed.package.components.length,
		);
		expect(taxLed.package.incidence.modelledLines).toBeGreaterThan(0);
		expect(taxLed.package.incidence.unmodelledDeltaGbp).toBeGreaterThanOrEqual(
			0,
		);
		expect(taxLed.package.incidence.topDecile.perHouseholdGbp).toBeGreaterThan(
			0,
		);
		expect(
			taxLed.package.incidence.hardestHitHousehold?.impactGbp,
		).toBeGreaterThan(0);
		expect(taxLed.package.incidence.households).toHaveLength(9);
		expect(
			spendingLed.package.incidence.bottomDecile.incomeShare,
		).toBeGreaterThan(spendingLed.package.incidence.topDecile.incomeShare);
		expect(spendingLed.package.incidence.progressivity).toBe("regressive");
	});

	it("reports residual gaps when plausible reaction package caps bind", () => {
		const proj = [yp(1, 0), yp(2, 0), yp(3, -90_000_000_000)];
		const cmp = projectAgainstBaseline(proj, TEST_BASELINE);
		const spendingLed = cmp.policyReactionOptions.find(
			(option) => option.id === "spending-led",
		)!;
		expect(spendingLed.package.residualGapGbp).toBeGreaterThan(0);
		expect(spendingLed.package.bindingConstraints.length).toBeGreaterThan(0);
		expect(spendingLed.headroomAfterReactionGbp).toBeLessThan(0);
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

	it("projects endogenous policy-reaction branches inside the fiscal-rule fan", () => {
		const fan = projectFiscalRuleFan(
			evaluateScenario([
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
			]),
			TEST_BASELINE,
			300,
			7,
		);
		expect(fan.policyReactionTriggeredProbability).toBeGreaterThan(0);
		expect(fan.endogenousReactionGrossBand.p95).toBeGreaterThan(0);
		expect(fan.postReactionHeadroomBand.p50).toBeGreaterThan(
			fan.headroomBand.p50,
		);
		expect(fan.postReactionBreachProbability).toBeLessThanOrEqual(
			fan.breachProbability,
		);
		expect(
			fan.reactionPackageMix.reduce((sum, row) => sum + row.count, 0),
		).toBeGreaterThan(0);
		expect(
			fan.reactionPackageMix.some(
				(row) => row.id === "tax-led" && row.count > 0,
			),
		).toBe(true);
	});

	it("can disable endogenous policy-reaction branches for diagnostics", () => {
		const result = evaluateScenario([
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 80_000_000_000,
			},
		]);
		const fan = projectFiscalRuleFan(
			result,
			TEST_BASELINE,
			200,
			7,
			{},
			{ policyReactionTree: false },
		);
		expect(fan.policyReactionTriggeredProbability).toBe(0);
		expect(fan.endogenousReactionGrossBand.p95).toBe(0);
		expect(fan.postReactionHeadroomBand).toEqual(fan.headroomBand);
		expect(fan.postReactionBreachProbability).toBe(fan.breachProbability);
	});

	it("uses borrowing context inside the fiscal-rule regime fan", () => {
		const scored = evaluateScenario([
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 43_500_000_000,
				borrowingContext: {
					fiscalEvent: "obr-scored",
					duration: "temporary",
				},
			},
		]);
		const unscored = evaluateScenario([
			{
				id: "borrow",
				type: "borrow",
				leverId: "",
				magnitude: 43_500_000_000,
				borrowingContext: {
					fiscalEvent: "unscored",
					duration: "persistent",
				},
			},
		]);
		const scoredFan = projectFiscalRuleFan(scored, TEST_BASELINE, 300, 7);
		const unscoredFan = projectFiscalRuleFan(unscored, TEST_BASELINE, 300, 7);
		expect(unscoredFan.breachProbability).toBeGreaterThanOrEqual(
			scoredFan.breachProbability,
		);
		expect(unscoredFan.headroomBand.p5).toBeLessThan(scoredFan.headroomBand.p5);
		expect(unscoredFan.centralHeadroomGbp).toBe(scoredFan.centralHeadroomGbp);
	});

	it("compares policy-reaction prior sensitivity cases", () => {
		const result = evaluateScenario([
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
		const sensitivity = projectFiscalRulePriorSensitivity(
			result,
			TEST_BASELINE,
			200,
			7,
		);
		expect(sensitivity.rows.map((row) => row.id)).toEqual([
			"neutral",
			"credibility-repair",
			"service-protection",
			"spending-restraint",
		]);
		expect(sensitivity.neutral.id).toBe("neutral");
		for (const row of sensitivity.rows) {
			expect(row.fan.samples).toBe(200);
			expect(row.fan.policyReactionTriggeredProbability).toBeGreaterThan(0);
			expect(row.dominantPackage).not.toBeNull();
		}
		const neutral = sensitivity.rows.find((row) => row.id === "neutral")!;
		const spending = sensitivity.rows.find(
			(row) => row.id === "spending-restraint",
		)!;
		expect(neutral.dominantPackage?.id).toBe("tax-led");
		expect(spending.dominantPackage?.id).toBe("spending-led");
		expect(spending.postReactionBreachDeltaFromNeutral).toBe(
			spending.fan.postReactionBreachProbability -
				neutral.fan.postReactionBreachProbability,
		);
	});
});

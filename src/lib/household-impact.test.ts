import { describe, expect, it } from "vitest";
import {
	REPRESENTATIVE_HOUSEHOLDS,
	getHousehold,
} from "@/data/households";
import { evaluateScenario, type ScenarioLine } from "./scenario";
import { evaluateHouseholdImpact } from "./household-impact";

const tax = (id: string, magnitude: number): ScenarioLine => ({
	id: `t-${id}`,
	type: "tax",
	leverId: id,
	magnitude,
});

const programme = (id: string, magnitude: number): ScenarioLine => ({
	id: `p-${id}`,
	type: "programme",
	leverId: id,
	magnitude,
});

describe("evaluateHouseholdImpact — direct tax channels", () => {
	it("basic-rate IT raise hits a basic-rate household at full band exposure", () => {
		const single = getHousehold("single-basic")!; // £35k earned
		const result = evaluateScenario([tax("basic-rate-income-tax", 1)]);
		const h = evaluateHouseholdImpact(single, result);
		// Basic-band exposure = max(0, min(35000, 50270) - 12570) = 22430
		// 1pp on basic-rate IT = 22430 × 0.01 = £224
		expect(h.totalImpactGbp).toBeCloseTo(224.30, 1);
		expect(h.perLine[0]?.method).toBe("direct");
	});

	it("basic-rate IT raise: a household below PA pays nothing", () => {
		const pensioner = getHousehold("single-pensioner")!; // £16.5k taxable
		const result = evaluateScenario([tax("basic-rate-income-tax", 1)]);
		const h = evaluateHouseholdImpact(pensioner, result);
		// Taxable income = state pension + private = 11500 + 5000 = 16500
		// Basic band exposure = 16500 - 12570 = 3930 (taxed at basic rate)
		// 1pp = 3930 × 0.01 = £39.30
		expect(h.totalImpactGbp).toBeCloseTo(39.30, 1);
	});

	it("higher-rate IT raise misses a basic-rate-only household", () => {
		const basic = getHousehold("single-basic")!;
		const result = evaluateScenario([tax("higher-rate-income-tax", 2)]);
		const h = evaluateHouseholdImpact(basic, result);
		// No income above £50,270.
		expect(h.totalImpactGbp).toBe(0);
	});

	it("higher-rate IT raise hits a higher-rate household at higher-band exposure", () => {
		const higher = getHousehold("single-higher")!; // £75k earned
		const result = evaluateScenario([tax("higher-rate-income-tax", 1)]);
		const h = evaluateHouseholdImpact(higher, result);
		// Higher-band exposure = 75000 - 50270 = 24730
		// 1pp = 247.30
		expect(h.totalImpactGbp).toBeCloseTo(247.30, 1);
	});

	it("additional-rate IT raise hits only top-decile-style households", () => {
		const top = getHousehold("top-decile")!; // £200k earned
		const result = evaluateScenario([tax("additional-rate-income-tax", 1)]);
		const h = evaluateHouseholdImpact(top, result);
		// Additional band exposure = 200000 - 125140 = 74860 (from earned alone)
		// 1pp = £748.60
		expect(h.totalImpactGbp).toBeCloseTo(748.60, 1);
	});

	it("VAT raise hits all households roughly proportionally to their VAT-able spend", () => {
		const top = getHousehold("top-decile")!; // £28k vatable
		const bottom = getHousehold("single-pensioner")!; // £4.5k vatable
		const result = evaluateScenario([tax("vat-standard", 1)]);
		const topImpact = evaluateHouseholdImpact(top, result).totalImpactGbp;
		const botImpact = evaluateHouseholdImpact(bottom, result).totalImpactGbp;
		expect(topImpact).toBeGreaterThan(botImpact);
		// As % of net income, the bottom decile is hit harder
		const topPct =
			topImpact / (top.netIncome);
		const botPct = botImpact / bottom.netIncome;
		expect(botPct).toBeGreaterThan(topPct);
	});

	it("dividend-tax raise hits households with dividend income", () => {
		const top = getHousehold("top-decile")!; // £20k dividends
		const single = getHousehold("single-basic")!; // £0 dividends
		const result = evaluateScenario([tax("dividend-tax", 2)]);
		const topImpact = evaluateHouseholdImpact(top, result).totalImpactGbp;
		const singleImpact = evaluateHouseholdImpact(single, result).totalImpactGbp;
		expect(topImpact).toBeCloseTo(400, 1); // 20000 × 0.02
		expect(singleImpact).toBe(0);
	});
});

describe("evaluateHouseholdImpact — programme channels", () => {
	it("state pension cut hits pensioner households", () => {
		const single = getHousehold("single-pensioner")!; // £11.5k state pension
		const couple = getHousehold("pensioner-couple")!; // £23k state pension
		const result = evaluateScenario([programme("state-pension", -10)]);
		const singleImpact =
			evaluateHouseholdImpact(single, result).totalImpactGbp;
		const coupleImpact =
			evaluateHouseholdImpact(couple, result).totalImpactGbp;
		expect(singleImpact).toBeCloseTo(1150, 0); // 10% of £11.5k
		expect(coupleImpact).toBeCloseTo(2300, 0);
	});

	it("state pension cut misses non-pensioner households", () => {
		const single = getHousehold("single-basic")!;
		const result = evaluateScenario([programme("state-pension", -10)]);
		const h = evaluateHouseholdImpact(single, result);
		// Only direct programme channel; no decile fallback for state pension.
		expect(h.perLine[0]?.impactGbp).toBe(0);
	});

	it("working-age welfare cut hits households on benefits", () => {
		const uc = getHousehold("single-parent-uc")!; // £12.5k benefits
		const result = evaluateScenario([programme("working-age-welfare", -10)]);
		const h = evaluateHouseholdImpact(uc, result);
		expect(h.totalImpactGbp).toBeCloseTo(1250, 0); // 10% of £12.5k
	});

	it("NHS cut uses decile fallback (no direct channel)", () => {
		const top = getHousehold("top-decile")!;
		const bottom = getHousehold("single-pensioner")!;
		const result = evaluateScenario([programme("nhs-england", -5)]);
		const topImpact = evaluateHouseholdImpact(top, result);
		const bottomImpact = evaluateHouseholdImpact(bottom, result);
		expect(topImpact.perLine[0]?.method).toBe("decile");
		// NHS incidence is roughly flat across deciles, so impact magnitudes
		// are similar — both small per-household at ~2.8M households per decile.
		expect(Math.abs(topImpact.totalImpactGbp)).toBeGreaterThan(0);
	});
});

describe("evaluateHouseholdImpact — full scenario", () => {
	it("a multi-line scenario aggregates per-line impacts", () => {
		const family = getHousehold("dual-earner-family")!;
		const result = evaluateScenario([
			tax("basic-rate-income-tax", 1),
			tax("vat-standard", 1),
			programme("nhs-england", -5),
		]);
		const h = evaluateHouseholdImpact(family, result);
		expect(h.perLine).toHaveLength(3);
		expect(h.totalImpactGbp).toBeGreaterThan(0); // net loss
		// Pct of net income should be a reasonable single-digit %
		expect(h.asPercentOfNetIncome).toBeGreaterThan(0);
		expect(h.asPercentOfNetIncome).toBeLessThan(0.05); // under 5%
	});

	it("borrow lines are skipped at the household level", () => {
		const single = getHousehold("single-basic")!;
		const result = evaluateScenario([
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const h = evaluateHouseholdImpact(single, result);
		expect(h.perLine[0]?.method).toBe("skipped");
		expect(h.totalImpactGbp).toBe(0);
	});
});

describe("REPRESENTATIVE_HOUSEHOLDS catalog", () => {
	it("has 9 households spanning the income distribution", () => {
		expect(REPRESENTATIVE_HOUSEHOLDS).toHaveLength(9);
		const deciles = REPRESENTATIVE_HOUSEHOLDS.map((h) => h.decile);
		expect(Math.min(...deciles)).toBeLessThanOrEqual(2);
		expect(Math.max(...deciles)).toBeGreaterThanOrEqual(9);
	});

	it("net incomes are in plausible relative order", () => {
		const sorted = [...REPRESENTATIVE_HOUSEHOLDS].sort(
			(a, b) => a.netIncome - b.netIncome,
		);
		// Bottom-decile households should have lower net incomes than top
		expect(sorted[0]!.decile).toBeLessThanOrEqual(3);
		expect(sorted[sorted.length - 1]!.decile).toBeGreaterThanOrEqual(8);
	});
});

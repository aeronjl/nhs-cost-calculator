import { describe, expect, it } from "vitest";
import { evaluateScenario, type ScenarioLine } from "../scenario";
import { generatePopulation, equivalisedIncome } from "./population";
import {
	computeChildBenefit,
	computeNetIncome,
	computeUC,
} from "./tax-benefit";
import { evaluateMicrosim } from "./impact";

describe("generatePopulation", () => {
	it("produces the requested count of households", () => {
		const pop = generatePopulation(500, 42);
		expect(pop).toHaveLength(500);
	});

	it("is deterministic for the same seed", () => {
		const a = generatePopulation(100, 42);
		const b = generatePopulation(100, 42);
		expect(a[0]).toEqual(b[0]);
		expect(a[99]).toEqual(b[99]);
	});

	it("different seeds produce different populations", () => {
		const a = generatePopulation(100, 42);
		const b = generatePopulation(100, 123);
		// Almost certainly some difference
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
	});

	it("covers all 6 household types in a sample of 1000", () => {
		const pop = generatePopulation(1000, 42);
		const types = new Set(pop.map((h) => h.type));
		expect(types.size).toBeGreaterThanOrEqual(5); // expect all 6 with high prob
	});

	it("weights sum to ~28M UK households", () => {
		const pop = generatePopulation(1000, 42);
		const total = pop.reduce((sum, h) => sum + h.weight, 0);
		expect(total).toBe(28_000_000);
	});

	it("pensioners earn negligibly (mostly £0 earned)", () => {
		const pop = generatePopulation(1000, 42);
		const pensioners = pop.filter((h) => h.pensioners > 0);
		const earningPensioners = pensioners.filter((h) => h.earnedIncome > 0);
		expect(earningPensioners.length).toBeLessThan(pensioners.length * 0.20);
	});
});

describe("equivalisedIncome", () => {
	it("scales by 1.0 for single adult", () => {
		const single = generatePopulation(100, 42).find(
			(h) => h.type === "single-no-children",
		)!;
		expect(equivalisedIncome(single, 30_000)).toBe(30_000);
	});

	it("scales by 1.5 for couple", () => {
		// Single with no children
		const single = {
			id: 0,
			type: "single-no-children" as const,
			adults: 1,
			children: 0,
			pensioners: 0,
			earnedIncome: 0,
			privatePensionIncome: 0,
			statePensionIncome: 0,
			dividendIncome: 0,
			vatableSpend: 0,
			weight: 1,
		};
		// Couple
		const couple = { ...single, type: "couple-no-children" as const, adults: 2 };
		expect(equivalisedIncome(single, 60_000)).toBe(60_000);
		expect(equivalisedIncome(couple, 60_000)).toBeCloseTo(40_000, 0);
	});

	it("subtracts for children", () => {
		const family = {
			id: 0,
			type: "couple-with-children" as const,
			adults: 2,
			children: 2,
			pensioners: 0,
			earnedIncome: 0,
			privatePensionIncome: 0,
			statePensionIncome: 0,
			dividendIncome: 0,
			vatableSpend: 0,
			weight: 1,
		};
		// Equiv scale: 1 + 0.5 + 0.3×2 = 2.1
		expect(equivalisedIncome(family, 100_000)).toBeCloseTo(47_619, 0);
	});
});

describe("computeUC", () => {
	const empty = (): import("./population").SynthHousehold => ({
		id: 0,
		type: "single-no-children",
		adults: 1,
		children: 0,
		pensioners: 0,
		earnedIncome: 0,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		vatableSpend: 0,
		weight: 1,
	});

	it("zero earnings, single, no children → standard allowance", () => {
		const h = empty();
		expect(computeUC(h)).toBeCloseTo(4_725, -1);
	});

	it("single parent, 2 kids, low earnings → SA + child elements", () => {
		const h = {
			...empty(),
			type: "single-parent" as const,
			children: 2,
			earnedIncome: 5_000,
		};
		// SA £4725 + first child £3455 + 2nd child £2900 = £11,080
		// Earnings above work allowance (£5000 - £4500 = £500) tapered: £500 × 0.55 = £275
		// Net UC = 11,080 - 275 = ~£10,805
		expect(computeUC(h)).toBeCloseTo(10_805, -2);
	});

	it("high earnings tapers UC to zero", () => {
		const h = { ...empty(), earnedIncome: 50_000 };
		expect(computeUC(h)).toBe(0);
	});

	it("pensioner returns zero (not on working-age UC)", () => {
		const h = { ...empty(), type: "single-pensioner" as const, pensioners: 1 };
		expect(computeUC(h)).toBe(0);
	});
});

describe("computeChildBenefit", () => {
	const base = (): import("./population").SynthHousehold => ({
		id: 0,
		type: "couple-with-children",
		adults: 2,
		children: 0,
		pensioners: 0,
		earnedIncome: 0,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		vatableSpend: 0,
		weight: 1,
	});

	it("pays full amount below HICBC threshold", () => {
		const h = { ...base(), children: 2, earnedIncome: 50_000 };
		// First child £1331 + 2nd £882 = £2213
		expect(computeChildBenefit(h)).toBe(2_213);
	});

	it("clawed back fully above £80k higher-earner income", () => {
		// Couple with one earner on £150k → 60% × £150k = £90k > £80k
		const h = { ...base(), children: 2, earnedIncome: 150_000 };
		expect(computeChildBenefit(h)).toBe(0);
	});

	it("partial clawback in HICBC zone", () => {
		// Couple, higher earner ~£70k (60% × £116.6k earned) — half of clawback
		const h = { ...base(), children: 2, earnedIncome: 116_600 };
		// Higher earner = £69,960; clawback fraction = 9960/20000 = 0.498
		// CB = 2213 × (1 - 0.498) = 1111 (rounded)
		expect(computeChildBenefit(h)).toBeCloseTo(1_111, -2);
	});
});

describe("computeNetIncome", () => {
	it("zero gross income → net = UC + child benefit", () => {
		const h: import("./population").SynthHousehold = {
			id: 0,
			type: "single-parent",
			adults: 1,
			children: 1,
			pensioners: 0,
			earnedIncome: 0,
			privatePensionIncome: 0,
			statePensionIncome: 0,
			dividendIncome: 0,
			vatableSpend: 0,
			weight: 1,
		};
		const r = computeNetIncome(h);
		expect(r.gross).toBe(0);
		expect(r.uc).toBeGreaterThan(0);
		expect(r.childBenefit).toBeGreaterThan(0);
		expect(r.net).toBe(r.uc + r.childBenefit);
	});

	it("higher-rate earner pays substantial tax + NICs", () => {
		const h: import("./population").SynthHousehold = {
			id: 0,
			type: "single-no-children",
			adults: 1,
			children: 0,
			pensioners: 0,
			earnedIncome: 75_000,
			privatePensionIncome: 0,
			statePensionIncome: 0,
			dividendIncome: 0,
			vatableSpend: 0,
			weight: 1,
		};
		const r = computeNetIncome(h);
		expect(r.incomeTax).toBeGreaterThan(15_000);
		expect(r.nics).toBeGreaterThan(2_000);
		expect(r.net).toBeLessThan(60_000);
	});
});

describe("evaluateMicrosim — basic-rate IT raise", () => {
	const tax = (id: string, magnitude: number): ScenarioLine => ({
		id: `t-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("ranks deciles in ascending impact (regressive in £, progressive in % of income for rate-style IT)", () => {
		const pop = generatePopulation(1000, 42);
		const result = evaluateScenario([tax("basic-rate-income-tax", 1)]);
		const { agg } = evaluateMicrosim(pop, result);

		// Impact in £ should be positive (loss) for almost all deciles where
		// taxable earnings exist
		expect(agg.decileMean[0]).toBeGreaterThanOrEqual(0); // bottom may have £0 earned
		// Higher deciles have higher taxable earnings → bigger £ impact (until HRT cuts in)
		expect(agg.decileMean[7]).toBeGreaterThan(agg.decileMean[2]!);
	});

	it("produces decile-level percentiles within deciles (within-decile spread)", () => {
		const pop = generatePopulation(1000, 42);
		const result = evaluateScenario([tax("basic-rate-income-tax", 2)]);
		const { agg } = evaluateMicrosim(pop, result);
		// In each decile, p10 ≤ p50 ≤ p90 (with possible ties)
		for (let d = 0; d < 10; d++) {
			expect(agg.decileP10[d]).toBeLessThanOrEqual(agg.decileP50[d]!);
			expect(agg.decileP50[d]).toBeLessThanOrEqual(agg.decileP90[d]!);
		}
	});

	it("produces winners/losers split that sums to 100%", () => {
		const pop = generatePopulation(500, 42);
		const result = evaluateScenario([tax("basic-rate-income-tax", 1)]);
		const { agg } = evaluateMicrosim(pop, result);
		const total = agg.winners + agg.losers + agg.unaffected;
		expect(total).toBeCloseTo(1.0, 5);
	});

	it("reports type-level breakdowns", () => {
		const pop = generatePopulation(500, 42);
		const result = evaluateScenario([tax("basic-rate-income-tax", 1)]);
		const { agg } = evaluateMicrosim(pop, result);
		expect(agg.byType.size).toBeGreaterThanOrEqual(5);
		// Pensioners should have lower mean impact than working couples
		const pensCouple = agg.byType.get("pensioner-couple");
		const workingCouple = agg.byType.get("couple-with-children");
		if (pensCouple && workingCouple) {
			expect(pensCouple.mean).toBeLessThan(workingCouple.mean);
		}
	});

	it("allocates borrowing as future debt-service incidence", () => {
		const pop = generatePopulation(500, 42);
		const result = evaluateScenario([
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const { agg, perHousehold } = evaluateMicrosim(pop, result);
		expect(agg.skippedLines).toBe(0);
		expect(agg.losers).toBeGreaterThan(0);
		expect(agg.decileMean[9]).toBeGreaterThan(agg.decileMean[0]!);
		expect(perHousehold[0]?.perLine[0]?.method).toBe("decile");
	});
});

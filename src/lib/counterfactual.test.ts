import { describe, expect, it } from "vitest";
import {
	comparisonsCovered,
	evaluateCounterfactual,
} from "./counterfactual";
import type { ResolvedComparison } from "@/data/comparisons";

describe("evaluateCounterfactual", () => {
	it("a programme cut produces positive (freed) revenue", () => {
		const r = evaluateCounterfactual({
			type: "programme",
			id: "defence",
			deltaFraction: -0.1,
		});
		expect(r.isRevenue).toBe(true);
		expect(r.deltaGbp).toBeCloseTo(54_000_000_000 * 0.1, -6);
		expect(r.description).toMatch(/Cut .* by 10\.0%/);
	});

	it("a programme increase produces negative (shortfall) revenue", () => {
		const r = evaluateCounterfactual({
			type: "programme",
			id: "nhs-england",
			deltaFraction: 0.05,
		});
		expect(r.isRevenue).toBe(false);
		expect(r.deltaGbp).toBeCloseTo(-165_000_000_000 * 0.05, -6);
		expect(r.description).toMatch(/Increase .* by 5\.0%/);
	});

	it("raising a tax produces positive revenue", () => {
		const r = evaluateCounterfactual({
			type: "tax",
			id: "basic-rate-income-tax",
			deltaPp: 1,
		});
		expect(r.isRevenue).toBe(true);
		// HMRC ready reckoner: £6bn per pp on basic rate.
		expect(r.deltaGbp).toBeCloseTo(6_000_000_000, -6);
	});

	it("cutting a tax produces a shortfall", () => {
		const r = evaluateCounterfactual({
			type: "tax",
			id: "basic-rate-income-tax",
			deltaPp: -1,
		});
		expect(r.isRevenue).toBe(false);
		expect(r.deltaGbp).toBeCloseTo(-6_000_000_000, -6);
	});

	it("attaches the lever's methodology to the result", () => {
		const r = evaluateCounterfactual({
			type: "programme",
			id: "state-pension",
			deltaFraction: -0.05,
		});
		expect(r.methodology.measure).toMatch(/state pension/i);
		expect(r.methodology.caveat).toMatch(/triple lock/i);
	});
});

const fakeComparison = (
	id: string,
	cost: number,
	categories: readonly string[] = ["Top"],
): ResolvedComparison => ({
	id,
	name: id,
	pluralName: `${id}s`,
	cost,
	nativeCurrency: "GBP",
	emoji: "🧪",
	quantity: 1,
	categories,
	asOf: "2024-11",
	isLive: false,
	methodology: {
		source: { url: "https://example.com", label: "test" },
		asOf: "2024-11",
		measure: "test fixture for unit tests, not a real figure",
		caveat: "do not use outside of tests, do not interpret as real data",
	},
});

describe("comparisonsCovered", () => {
	it("returns empty when delta is zero", () => {
		expect(comparisonsCovered(0, [], 1.27)).toEqual([]);
	});

	it("ranks Top-tagged comparisons by count descending", () => {
		const items = [
			fakeComparison("home", 250_000),
			fakeComparison("hs2", 396_000_000),
			fakeComparison("nuclear", 32_000_000_000),
			fakeComparison("non-top", 1_000, ["Other"]),
		];
		const r = comparisonsCovered(10_000_000_000, items, 1.27);
		// Counts: home 40000, hs2 25.25, nuclear 0.31 (excluded by floor)
		expect(r.map((x) => x.comparison.id)).toEqual(["home", "hs2"]);
		expect(r[0]?.count).toBeCloseTo(40_000);
		expect(r[1]?.count).toBeCloseTo(25.25, 1);
	});

	it("uses absolute value of delta — shortfalls and surpluses look the same", () => {
		const items = [fakeComparison("home", 250_000)];
		const a = comparisonsCovered(1_000_000_000, items, 1.27);
		const b = comparisonsCovered(-1_000_000_000, items, 1.27);
		expect(a[0]?.count).toBe(b[0]?.count);
	});

	it("excludes comparisons with count < 1 (sub-unit)", () => {
		const items = [fakeComparison("nuclear", 32_000_000_000)];
		const r = comparisonsCovered(1_000_000_000, items, 1.27);
		expect(r).toEqual([]);
	});

	it("excludes non-Top categories", () => {
		const items = [fakeComparison("rare", 1_000, ["Other"])];
		const r = comparisonsCovered(10_000_000_000, items, 1.27);
		expect(r).toEqual([]);
	});

	it("converts USD-native costs to GBP using the supplied FX rate", () => {
		const usd: ResolvedComparison = {
			...fakeComparison("starship", 100_000_000),
			nativeCurrency: "USD",
		};
		const r = comparisonsCovered(10_000_000_000, [usd], 1.27);
		// $100m / 1.27 ≈ £78.74m. £10bn / £78.74m ≈ 127 starships.
		expect(r[0]?.count).toBeCloseTo(127, 0);
	});
});

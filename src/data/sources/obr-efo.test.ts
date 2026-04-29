import { afterEach, describe, expect, it, vi } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	type BaselineOverride,
	applyBaselineOverride,
	obrEfoSource,
} from "./obr-efo";

const VALID_OVERRIDE: BaselineOverride = {
	asOf: "2026-03",
	source: { url: "https://obr.uk/efo/march-2026/", label: "OBR EFO March 2026" },
	years: [
		{
			fiscalYear: "2025-26",
			psnb: 95_000_000_000,
			psnbPctGdp: 3.5,
			psnd: 2_800_000_000_000,
			psndPctGdp: 95.0,
			totalRevenue: 1_180_000_000_000,
			totalSpending: 1_275_000_000_000,
			gdp: 2_700_000_000_000,
		},
	],
	stabilityRuleHeadroom: 12_000_000_000,
	stabilityRuleAt: "2030-31",
	investmentRuleHeadroom: 18_000_000_000,
};

describe("obrEfoSource.fetch", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.OBR_BASELINE_DATA_URL;
	});

	it("returns null when env var is unset", async () => {
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns null on network failure", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns null on non-OK response", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () =>
			Promise.resolve({ ok: false, status: 500 } as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns null on malformed JSON", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ asOf: "garbage" }),
			} as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns null on missing fiscal-rule fields", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						...VALID_OVERRIDE,
						stabilityRuleHeadroom: undefined,
					}),
			} as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns null when years array is empty", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ...VALID_OVERRIDE, years: [] }),
			} as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});

	it("returns the override on a fully-valid response", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		vi.stubGlobal("fetch", () =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(VALID_OVERRIDE),
			} as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r?.asOf).toBe("2026-03");
		expect(r?.years).toHaveLength(1);
		expect(r?.stabilityRuleHeadroom).toBe(12_000_000_000);
	});

	it("rejects malformed year entries", async () => {
		process.env.OBR_BASELINE_DATA_URL = "http://example.test/obr.json";
		const bad = {
			...VALID_OVERRIDE,
			years: [
				{ ...VALID_OVERRIDE.years[0]!, gdp: -1 }, // invalid GDP
			],
		};
		vi.stubGlobal("fetch", () =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(bad),
			} as Response),
		);
		const r = await obrEfoSource.fetch();
		expect(r).toBeNull();
	});
});

describe("applyBaselineOverride", () => {
	it("returns the static baseline unchanged when override is null", () => {
		const r = applyBaselineOverride(OBR_BASELINE, null);
		expect(r).toBe(OBR_BASELINE);
	});

	it("fully replaces the baseline when override is supplied", () => {
		const r = applyBaselineOverride(OBR_BASELINE, VALID_OVERRIDE);
		expect(r.asOf).toBe("2026-03");
		expect(r.years).toHaveLength(1);
		expect(r.years[0]?.fiscalYear).toBe("2025-26");
		expect(r.stabilityRuleHeadroom).toBe(12_000_000_000);
	});

	it("preserves the static fallback under the override (immutable)", () => {
		applyBaselineOverride(OBR_BASELINE, VALID_OVERRIDE);
		// Original isn't mutated.
		expect(OBR_BASELINE.asOf).toBe("2025-03");
		expect(OBR_BASELINE.years.length).toBeGreaterThan(1);
	});
});

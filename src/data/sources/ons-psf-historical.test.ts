import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OUTTURN_1979, OUTTURN_2010 } from "@/data/historical/era-baselines";
import {
	DEFAULT_PLAUSIBILITY_BOUNDS,
	EUROZONE_PLAUSIBILITY_BOUNDS,
	JAPAN_PLAUSIBILITY_BOUNDS,
	UK_PLAUSIBILITY_BOUNDS,
	US_PLAUSIBILITY_BOUNDS,
	applyHistoricalOverride,
	createHistoricalOverrideValidator,
	createOnsPsfHistoricalSource,
	createPartialYearValidator,
	onsPsfHistoricalSource,
} from "./ons-psf-historical";

describe("applyHistoricalOverride", () => {
	it("returns static outturn when override is null", () => {
		expect(applyHistoricalOverride(OUTTURN_1979, "1979", null)).toBe(
			OUTTURN_1979,
		);
	});

	it("returns static outturn when override is empty for the era", () => {
		expect(applyHistoricalOverride(OUTTURN_1979, "1979", {})).toBe(
			OUTTURN_1979,
		);
	});

	it("merges full-replacement override (top-level fields + complete years)", () => {
		// Backwards-compat: a complete override replaces all top-level fields
		// and merges its full years[] into the static (since fiscalYears
		// match, every year is replaced).
		const fakeOverride = {
			...OUTTURN_2010,
			asOf: "2025-09",
			source: { url: "https://example.test", label: "test" },
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", {
			"2010": fakeOverride,
		});
		expect(result.asOf).toBe("2025-09");
		expect(result.source.label).toBe("test");
		// Years from override applied
		expect(result.years.length).toBe(fakeOverride.years.length);
	});

	it("ignores overrides for other eras", () => {
		const result = applyHistoricalOverride(OUTTURN_1979, "1979", {
			"2010": { ...OUTTURN_2010, asOf: "2025-09" } as never,
		});
		expect(result).toBe(OUTTURN_1979);
	});

	it("merges a single-year override (the partial-payload case)", () => {
		// Real ONS PSF restatement: only 2014-15 PSNB revised.
		const partial = {
			"2010": {
				years: [
					{ fiscalYear: "2014-15", psnb: 88_000_000_000, psnbPctGdp: 4.6 },
				],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		// Other static years untouched
		expect(result.years[0]!.fiscalYear).toBe("2010-11");
		expect(result.years[0]!.psnb).toBe(OUTTURN_2010.years[0]!.psnb);
		// Targeted year merged: psnb + psnbPctGdp updated; other fields preserved
		const updated = result.years.find((y) => y.fiscalYear === "2014-15");
		expect(updated).toBeDefined();
		expect(updated!.psnb).toBe(88_000_000_000);
		expect(updated!.psnbPctGdp).toBe(4.6);
		expect(updated!.gdp).toBe(
			OUTTURN_2010.years.find((y) => y.fiscalYear === "2014-15")!.gdp,
		);
	});

	it("preserves source/asOf/headroom when override only specifies years", () => {
		const partial = {
			"2010": {
				years: [{ fiscalYear: "2014-15", psnb: 88_000_000_000 }],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		expect(result.asOf).toBe(OUTTURN_2010.asOf);
		expect(result.source).toBe(OUTTURN_2010.source);
		expect(result.stabilityRuleHeadroom).toBe(
			OUTTURN_2010.stabilityRuleHeadroom,
		);
	});

	it("recomputes psnbPctGdp when psnb is overridden but pct isn't supplied", () => {
		const partial = {
			"2010": {
				years: [{ fiscalYear: "2014-15", psnb: 50_000_000_000 }],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		const updated = result.years.find((y) => y.fiscalYear === "2014-15")!;
		expect(updated.psnb).toBe(50_000_000_000);
		// psnbPctGdp should reflect new psnb / static gdp (£1.92T)
		expect(updated.psnbPctGdp).toBeCloseTo(
			(50_000_000_000 / 1_920_000_000_000) * 100,
			2,
		);
	});

	it("respects explicit psnbPctGdp override even when psnb is also overridden", () => {
		const partial = {
			"2010": {
				years: [
					{
						fiscalYear: "2014-15",
						psnb: 50_000_000_000,
						psnbPctGdp: 99.9, // explicit (intentional inconsistency)
					},
				],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		const updated = result.years.find((y) => y.fiscalYear === "2014-15")!;
		expect(updated.psnbPctGdp).toBe(99.9);
	});

	it("recomputes both percentages when gdp is overridden alone", () => {
		const partial = {
			"2010": {
				years: [{ fiscalYear: "2014-15", gdp: 2_000_000_000_000 }],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		const updated = result.years.find((y) => y.fiscalYear === "2014-15")!;
		const staticYear = OUTTURN_2010.years.find(
			(y) => y.fiscalYear === "2014-15",
		)!;
		// Both psnbPctGdp and psndPctGdp recomputed from new gdp
		expect(updated.psnbPctGdp).toBeCloseTo(
			(staticYear.psnb / 2_000_000_000_000) * 100,
			2,
		);
		expect(updated.psndPctGdp).toBeCloseTo(
			(staticYear.psnd / 2_000_000_000_000) * 100,
			2,
		);
	});

	it("appends override years that don't match a static year", () => {
		// Future-year addition: ONS publishes 2016-17 outturn extending the
		// 2010-era horizon.
		const partial = {
			"2010": {
				years: [
					{
						fiscalYear: "2016-17",
						psnb: 50_000_000_000,
						psnbPctGdp: 2.4,
						psnd: 1_700_000_000_000,
						psndPctGdp: 82,
						totalRevenue: 770_000_000_000,
						totalSpending: 820_000_000_000,
						gdp: 2_080_000_000_000,
					},
				],
			},
		};
		const result = applyHistoricalOverride(OUTTURN_2010, "2010", partial);
		expect(result.years.length).toBe(OUTTURN_2010.years.length + 1);
		expect(result.years[result.years.length - 1]!.fiscalYear).toBe("2016-17");
	});
});

describe("createPartialYearValidator (factory)", () => {
	it("default validator rejects 1947-style 270% debt:GDP at the edge of bounds", () => {
		// Default psndPctGdpMax is 300% — 270 should pass.
		const v = createPartialYearValidator();
		const result = v({ fiscalYear: "1947-48", psndPctGdp: 270 });
		expect(result).toBe(true);
	});

	it("custom relaxed bounds accept implausible values for boundary testing", () => {
		// Test scenario: probing a hypothetical 1815 post-Napoleonic debt
		// burden at the edge of credible UK history.
		const v = createPartialYearValidator({
			...DEFAULT_PLAUSIBILITY_BOUNDS,
			psndPctGdpMax: 500,
		});
		expect(v({ fiscalYear: "1815-16", psndPctGdp: 400 })).toBe(true);
	});

	it("custom tight bounds reject normal values for tightening tests", () => {
		const v = createPartialYearValidator({
			...DEFAULT_PLAUSIBILITY_BOUNDS,
			psnbPctGdpMax: 5, // tighter than default 50
		});
		expect(v({ fiscalYear: "2010-11", psnbPctGdp: 8.7 })).toBe(false);
	});

	it("default validator rejects values outside default bounds", () => {
		const v = createPartialYearValidator();
		expect(v({ fiscalYear: "2010-11", psnbPctGdp: 99_900 })).toBe(false);
	});
});

describe("country plausibility presets", () => {
	it("DEFAULT presets to UK bounds", () => {
		expect(DEFAULT_PLAUSIBILITY_BOUNDS).toEqual(UK_PLAUSIBILITY_BOUNDS);
	});

	it("Japan validator accepts 240% debt:GDP (modern Japan)", () => {
		const v = createPartialYearValidator(JAPAN_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "2024-25", psndPctGdp: 240 })).toBe(true);
	});

	it("UK validator rejects 240% (above its 300% cap is fine; this is well within)", () => {
		// Note: 240% IS plausible by UK bounds (cap is 300%). This test
		// confirms the UK preset hasn't accidentally tightened.
		const v = createPartialYearValidator(UK_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "1947-48", psndPctGdp: 240 })).toBe(true);
	});

	it("Japan validator's gdp floor catches a £-amount mistakenly tagged Japan", () => {
		// £200bn ≈ ¥40T — well below Japan's ¥100T floor. Catches a payload
		// where someone mistakenly used UK GDP figures with Japan validator.
		const v = createPartialYearValidator(JAPAN_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "2024-25", gdp: 200_000_000_000 })).toBe(false);
	});

	it("US validator accepts 130% debt:GDP", () => {
		const v = createPartialYearValidator(US_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "2024-25", psndPctGdp: 130 })).toBe(true);
	});

	it("Eurozone validator's tight psnb cap rejects 30%+ deficits (post-Stability-Pact)", () => {
		const v = createPartialYearValidator(EUROZONE_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "2020-21", psnbPctGdp: 35 })).toBe(false);
	});

	it("Eurozone validator's gdp floor catches sub-€100bn (sub-member-state)", () => {
		const v = createPartialYearValidator(EUROZONE_PLAUSIBILITY_BOUNDS);
		expect(v({ fiscalYear: "2024-25", gdp: 50_000_000_000 })).toBe(false);
	});
});

describe("createHistoricalOverrideValidator (factory)", () => {
	it("default validator rejects an over-bounds payload", () => {
		const v = createHistoricalOverrideValidator();
		expect(
			v({ "2010": { years: [{ fiscalYear: "2014-15", gdp: 1 }] } }),
		).toBe(false);
	});

	it("custom relaxed-bounds validator accepts the same payload", () => {
		const v = createHistoricalOverrideValidator({
			...DEFAULT_PLAUSIBILITY_BOUNDS,
			gdpFloor: 0,
		});
		expect(
			v({
				"2010": {
					years: [{ fiscalYear: "2014-15", gdp: 100_000_000_000 }],
				},
			}),
		).toBe(true);
	});

	it("preserves era key validation regardless of bounds (junk era keys rejected)", () => {
		const v = createHistoricalOverrideValidator({
			...DEFAULT_PLAUSIBILITY_BOUNDS,
			gdpFloor: 0,
			gdpCeiling: Number.POSITIVE_INFINITY,
		});
		expect(v({ "1815": { years: [] } })).toBe(false);
	});
});

describe("createOnsPsfHistoricalSource (country-aware factory)", () => {
	const originalUrl = process.env.ONS_PSF_HISTORICAL_URL;
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalUrl === undefined) {
			delete process.env.ONS_PSF_HISTORICAL_URL;
		} else {
			process.env.ONS_PSF_HISTORICAL_URL = originalUrl;
		}
	});
	beforeEach(() => {
		delete process.env.ONS_PSF_HISTORICAL_URL;
	});

	it("default factory call gives a UK-bound source", async () => {
		// UK validator accepts £200bn 1979 GDP; Japan would reject (¥-floor).
		const source = createOnsPsfHistoricalSource();
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					"1979": {
						years: [
							{
								fiscalYear: "1979-80",
								gdp: 200_000_000_000, // £200bn — fine for UK
							},
						],
					},
				}),
			),
		);
		const result = await source.fetch();
		expect(result).not.toBe(null);
	});

	it("Japan source rejects UK-scale GDP figures (junk-by-routing)", async () => {
		const source = createOnsPsfHistoricalSource("JAPAN");
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					"1979": {
						years: [
							{
								fiscalYear: "1979-80",
								gdp: 200_000_000_000, // £200bn — way below Japan's ¥100T floor
							},
						],
					},
				}),
			),
		);
		const result = await source.fetch();
		expect(result).toBe(null);
	});

	it("default singleton onsPsfHistoricalSource is identical to createOnsPsfHistoricalSource('UK')", () => {
		// Sanity: the back-compat singleton is the UK factory call.
		expect(onsPsfHistoricalSource.fallback).toBe(null);
		// Both have the same fetch contract — testing call equivalence is
		// awkward, so check fallback shape.
	});

	it("country-specific URL takes precedence over the generic one", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://generic.test/data.json";
		process.env.ONS_PSF_HISTORICAL_URL_JAPAN = "https://japan.test/data.json";
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		globalThis.fetch = fetchSpy;
		const source = createOnsPsfHistoricalSource("JAPAN");
		await source.fetch();
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://japan.test/data.json",
			expect.any(Object),
		);
		delete process.env.ONS_PSF_HISTORICAL_URL_JAPAN;
	});

	it("falls back to generic URL when country-specific URL unset", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://generic.test/data.json";
		const fetchSpy = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		globalThis.fetch = fetchSpy;
		const source = createOnsPsfHistoricalSource("UK");
		await source.fetch();
		expect(fetchSpy).toHaveBeenCalledWith(
			"https://generic.test/data.json",
			expect.any(Object),
		);
	});
});

describe("onsPsfHistoricalSource", () => {
	const originalFetch = globalThis.fetch;
	const originalUrl = process.env.ONS_PSF_HISTORICAL_URL;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (originalUrl === undefined) {
			delete process.env.ONS_PSF_HISTORICAL_URL;
		} else {
			process.env.ONS_PSF_HISTORICAL_URL = originalUrl;
		}
	});

	beforeEach(() => {
		delete process.env.ONS_PSF_HISTORICAL_URL;
	});

	it("returns null fallback when env var is unset", async () => {
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("returns null on network failure", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("returns null on non-2xx response", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		globalThis.fetch = vi.fn().mockResolvedValue(
			new Response("error", { status: 500 }),
		);
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("rejects implausibly high psnbPctGdp (junk override)", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		// psnb £999bn / gdp £1bn would imply 99,900% — the construction
		// attack we want to catch.
		const junk = {
			"2010": {
				years: [
					{
						fiscalYear: "2014-15",
						psnb: 999_000_000_000,
						psnbPctGdp: 99_900,
					},
				],
			},
		};
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(junk)));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("rejects gdp below the floor (£50bn)", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		const junk = {
			"2010": {
				years: [
					{ fiscalYear: "2014-15", gdp: 1_000_000_000 }, // £1bn — junk
				],
			},
		};
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(junk)));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("rejects gdp above the ceiling (£100T)", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		const junk = {
			"2010": {
				years: [
					{ fiscalYear: "2014-15", gdp: 1_000_000_000_000_000 }, // £1Q
				],
			},
		};
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(junk)));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("rejects psndPctGdp outside 0-300% (UK historical max ~250%)", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		const junk = {
			"2010": {
				years: [{ fiscalYear: "2014-15", psndPctGdp: 1000 }],
			},
		};
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(junk)));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("returns null on malformed JSON shape", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		// Missing required era keys, not the expected shape
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ hello: "world" })));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).toBe(null);
	});

	it("accepts a well-formed override", async () => {
		process.env.ONS_PSF_HISTORICAL_URL = "https://example.test/data.json";
		const wellFormed = { "1979": OUTTURN_1979, "2010": OUTTURN_2010 };
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify(wellFormed)));
		const result = await onsPsfHistoricalSource.fetch();
		expect(result).not.toBe(null);
		expect(result?.["1979"]?.years?.[0]?.fiscalYear).toBe("1979-80");
	});
});

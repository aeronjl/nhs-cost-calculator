import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	BASELINE_1979,
	BASELINE_1988,
	BASELINE_2010,
	BASELINE_2021,
	OUTTURN_1979,
	OUTTURN_1988,
	OUTTURN_2010,
	OUTTURN_2021,
	getEraBaseline,
} from "./era-baselines";

describe("era baselines", () => {
	it("each era's baseline has 5+ years of forecast", () => {
		expect(BASELINE_1979.years.length).toBeGreaterThanOrEqual(5);
		expect(BASELINE_1988.years.length).toBeGreaterThanOrEqual(5);
		expect(BASELINE_2010.years.length).toBeGreaterThanOrEqual(5);
		expect(BASELINE_2021.years.length).toBeGreaterThanOrEqual(5);
	});

	it("years are in chronological order", () => {
		for (const baseline of [BASELINE_1979, BASELINE_1988, BASELINE_2010, BASELINE_2021]) {
			for (let i = 1; i < baseline.years.length; i++) {
				const prevStart = parseInt(
					baseline.years[i - 1]!.fiscalYear.split("-")[0]!,
				);
				const currStart = parseInt(baseline.years[i]!.fiscalYear.split("-")[0]!);
				expect(currStart).toBe(prevStart + 1);
			}
		}
	});

	it("1979 baseline reflects pre-MTFS (no formal fiscal rule)", () => {
		expect(BASELINE_1979.stabilityRuleHeadroom).toBe(0);
		expect(BASELINE_1979.years[0]!.psnbPctGdp).toBeCloseTo(4.5, 1);
	});

	it("1988 baseline shows surplus (Lawson era)", () => {
		expect(BASELINE_1988.years[0]!.psnb).toBeLessThan(0);
	});

	it("2010 baseline shows post-crisis £155bn PSNB and Coalition fiscal mandate", () => {
		expect(BASELINE_2010.years[0]!.psnb).toBe(155_000_000_000);
		expect(BASELINE_2010.years[0]!.psnbPctGdp).toBeCloseTo(10, 1);
		expect(BASELINE_2010.stabilityRuleHeadroom).toBeGreaterThan(0);
	});

	it("2021 baseline shows COVID-elevated borrowing", () => {
		expect(BASELINE_2021.years[0]!.psnb).toBe(128_000_000_000);
		expect(BASELINE_2021.years[0]!.psndPctGdp).toBeGreaterThan(90);
	});

	it("getEraBaseline returns the era's static baseline for historical eras", () => {
		expect(getEraBaseline("1979", OBR_BASELINE)).toBe(BASELINE_1979);
		expect(getEraBaseline("2010", OBR_BASELINE)).toBe(BASELINE_2010);
	});

	it("getEraBaseline returns the live current baseline when era is 'current'", () => {
		expect(getEraBaseline("current", OBR_BASELINE)).toBe(OBR_BASELINE);
	});

	it("each baseline has matching fiscalYear formatting (YYYY-YY)", () => {
		for (const baseline of [BASELINE_1979, BASELINE_1988, BASELINE_2010, BASELINE_2021]) {
			for (const year of baseline.years) {
				expect(year.fiscalYear).toMatch(/^\d{4}-\d{2}$/);
			}
		}
	});
});

describe("outturn baselines (forecast vs actual)", () => {
	it("getEraBaseline returns forecast by default, outturn when requested", () => {
		expect(getEraBaseline("1979", OBR_BASELINE)).toBe(BASELINE_1979);
		expect(getEraBaseline("1979", OBR_BASELINE, "forecast")).toBe(BASELINE_1979);
		expect(getEraBaseline("1979", OBR_BASELINE, "outturn")).toBe(OUTTURN_1979);
	});

	it("1979 outturn shows the 1981 recession blowing up Howe's plan", () => {
		// Forecast year-2 (1980-81) PSBR was £6bn; outturn was £13bn.
		expect(BASELINE_1979.years[1]!.psnb).toBe(6_000_000_000);
		expect(OUTTURN_1979.years[1]!.psnb).toBeGreaterThan(
			BASELINE_1979.years[1]!.psnb * 1.5,
		);
	});

	it("1988 outturn shows the ERM crisis hitting at the horizon", () => {
		// Forecast had a small surplus by year-5; outturn had £36bn deficit.
		expect(BASELINE_1988.years[4]!.psnb).toBeLessThan(10_000_000_000);
		expect(OUTTURN_1988.years[4]!.psnb).toBeGreaterThan(30_000_000_000);
	});

	it("2010 outturn shows Coalition missing the fiscal mandate", () => {
		// Forecast 2015-16 PSNB was £45bn; outturn was £71bn.
		expect(BASELINE_2010.years[5]!.psnb).toBe(45_000_000_000);
		expect(OUTTURN_2010.years[5]!.psnb).toBeGreaterThan(60_000_000_000);
		// Outturn baseline carries broken stability rule (negative headroom)
		expect(OUTTURN_2010.stabilityRuleHeadroom).toBeLessThan(0);
	});

	it("2021 outturn shows the energy crisis blowing up Sunak's plan", () => {
		// Forecast 2022-23 PSNB was £75bn; outturn was £132bn.
		expect(BASELINE_2021.years[1]!.psnb).toBe(75_000_000_000);
		expect(OUTTURN_2021.years[1]!.psnb).toBeGreaterThan(120_000_000_000);
	});

	it("current era ignores mode (always returns live baseline)", () => {
		expect(getEraBaseline("current", OBR_BASELINE, "forecast")).toBe(OBR_BASELINE);
		expect(getEraBaseline("current", OBR_BASELINE, "outturn")).toBe(OBR_BASELINE);
	});
});

import { describe, expect, it } from "vitest";
import {
	evaluateLine,
	evaluateScenario,
	evaluateScenarioDistribution,
	projectScenarioOverYears,
	scaleScenarioResult,
} from "@/lib/scenario";
import {
	ERA_ORDER,
	ERAS,
	applyEraLegislation,
	applyEraLeverOverride,
	applyEraProgramme,
	type EraId,
} from "./eras";
import { getTaxLever } from "./levers/tax-rates";
import { getProgramme } from "./levers/uk-spending";
import { getProgrammeLegislation, getTaxLegislation } from "./legislation";

describe("eras", () => {
	it("includes all expected era ids in order", () => {
		expect(ERA_ORDER).toEqual(["1979", "1988", "2010", "2021", "current"]);
		for (const id of ERA_ORDER) {
			expect(ERAS[id]).toBeDefined();
			expect(ERAS[id].label).toBeTruthy();
		}
	});

	it("each era has at least one pressure", () => {
		for (const id of ERA_ORDER) {
			expect(ERAS[id].pressures.length).toBeGreaterThan(0);
		}
	});

	it("current era passes legislation through unchanged", () => {
		const base = getProgrammeLegislation("state-pension");
		expect(base).toBeDefined();
		const overlaid = applyEraLegislation(base!, "state-pension", "current");
		expect(overlaid).toBe(base);
	});

	it("1979 era removes triple-lock protection from state-pension", () => {
		const base = getProgrammeLegislation("state-pension");
		expect(base!.status).toBe("statutorily-protected");
		const overlaid = applyEraLegislation(base!, "state-pension", "1979");
		expect(overlaid.status).toBe("available");
		expect(overlaid.explainer).toMatch(/2014|Rooker-Wise/);
	});

	it("1979 era marks bank surcharge as anachronistic", () => {
		const base = getTaxLegislation("bank-surcharge");
		expect(base).toBeDefined();
		const overlaid = applyEraLegislation(base!, "bank-surcharge", "1979");
		expect(overlaid.status).toBe("new-legislation");
		expect(overlaid.label).toMatch(/1979/);
	});

	it("2010 era keeps triple lock available (not yet statute)", () => {
		const base = getProgrammeLegislation("state-pension");
		const overlaid = applyEraLegislation(base!, "state-pension", "2010");
		expect(overlaid.status).toBe("available");
	});

	it("2021 era keeps triple lock statute (active that year)", () => {
		const base = getProgrammeLegislation("state-pension");
		const overlaid = applyEraLegislation(base!, "state-pension", "2021");
		expect(overlaid.status).toBe("statutorily-protected");
	});

	it("levers without overrides return base unchanged", () => {
		const base = getTaxLegislation("vat-standard");
		const overlaid1988 = applyEraLegislation(base!, "vat-standard", "1988");
		// 1988 doesn't override vat-standard, so structure should match
		expect(overlaid1988).toEqual(base);
	});

	it("preIntroduction takes priority over legislationOverrides", () => {
		// energy-profits-levy is preIntroduction in 1979, 1988, 2010, and 2021
		// (introduced May 2022 by Sunak).
		for (const era of ["1979", "1988", "2010", "2021"] as EraId[]) {
			const base = getTaxLegislation("energy-profits-levy");
			const overlaid = applyEraLegislation(base!, "energy-profits-levy", era);
			expect(overlaid.status).toBe("new-legislation");
		}
	});

	it("each era carries a sensible gdpScale", () => {
		expect(ERAS["1979"].gdpScale).toBeLessThan(0.1);
		expect(ERAS["1988"].gdpScale).toBeLessThan(0.25);
		expect(ERAS["2010"].gdpScale).toBeLessThan(0.7);
		expect(ERAS["2021"].gdpScale).toBeLessThan(1.0);
		expect(ERAS.current.gdpScale).toBe(1.0);
		// Monotonic — earlier eras must have smaller gdpScale.
		for (let i = 1; i < ERA_ORDER.length; i++) {
			expect(ERAS[ERA_ORDER[i]!].gdpScale).toBeGreaterThan(
				ERAS[ERA_ORDER[i - 1]!].gdpScale,
			);
		}
	});
});

describe("applyEraLeverOverride", () => {
	it("current era passes lever through unchanged", () => {
		const base = getTaxLever("basic-rate-income-tax");
		expect(applyEraLeverOverride(base, "current")).toBe(base);
	});

	it("1979 era overrides basic-rate IT to 33% with historical per-pp yield", () => {
		const base = getTaxLever("basic-rate-income-tax");
		const era = applyEraLeverOverride(base, "1979");
		expect(era.currentRate).toBe(0.33);
		// 1979 has a per-era gbpPerUnit override (£500m) — closer to actual
		// historical figure than the gdpScale × current £6bn = £456m approximation.
		expect(era.gbpPerUnit).toBe(500_000_000);
	});

	it("1979 era overrides VAT to 8%", () => {
		const base = getTaxLever("vat-standard");
		const era = applyEraLeverOverride(base, "1979");
		expect(era.currentRate).toBe(0.08);
	});

	it("2010 era overrides corp tax to 28%", () => {
		const base = getTaxLever("corporation-tax");
		const era = applyEraLeverOverride(base, "2010");
		expect(era.currentRate).toBe(0.28);
	});

	it("levers without overrides return base unchanged", () => {
		// fuel-duty doesn't have a 1988 override, so should pass through
		const base = getTaxLever("fuel-duty");
		const era = applyEraLeverOverride(base, "1988");
		expect(era).toEqual(base);
	});
});

describe("applyEraProgramme", () => {
	it("current era passes programme through unchanged", () => {
		const base = getProgramme("nhs-england");
		expect(applyEraProgramme(base, "current")).toBe(base);
	});

	it("1979 era overrides NHS to £8.4bn", () => {
		const base = getProgramme("nhs-england");
		const era = applyEraProgramme(base, "1979");
		expect(era.value).toBe(8_400_000_000);
		// methodology + source preserved
		expect(era.methodology).toBe(base.methodology);
	});

	it("2010 era overrides defence to £40bn with higher cuttableFraction (no NATO 2% floor yet)", () => {
		const base = getProgramme("defence");
		const era = applyEraProgramme(base, "2010");
		expect(era.value).toBe(40_000_000_000);
		expect(era.cuttableFraction).toBe(0.3); // vs current 0.2
	});

	it("programmes without era override fall back to base", () => {
		// "police-justice" doesn't have a 1979 override, so passes through
		const base = getProgramme("police-justice");
		const era = applyEraProgramme(base, "1979");
		expect(era).toEqual(base);
	});
});

describe("era-aware evaluateLine", () => {
	it("uses era programme value (1979 NHS = £8.4bn, not gdpScale × current)", () => {
		const ev1979 = evaluateLine(
			{
				id: "a",
				type: "programme",
				leverId: "nhs-england",
				magnitude: -5, // -5%
			},
			{ era: "1979" },
		);
		// 1979 NHS £8.4bn × 5% = £420m
		expect(ev1979.deltaGbp).toBeCloseTo(420_000_000, -6);
	});

	it("uses per-era gbpPerUnit override for major levers (1979 basic IT = £500m/pp)", () => {
		const evCurrent = evaluateLine({
			id: "a",
			type: "tax",
			leverId: "basic-rate-income-tax",
			magnitude: 1,
		});
		const ev1979 = evaluateLine(
			{
				id: "b",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
			{ era: "1979" },
		);
		expect(evCurrent.deltaGbp).toBe(6_000_000_000);
		// 1979 historical: ~£500m per pp (HMT Red Book 1979, IFS backseries).
		expect(ev1979.deltaGbp).toBe(500_000_000);
	});

	it("falls back to gdpScale for levers without per-era yield data", () => {
		// fuel-duty has no per-era gbpPerUnit override in 1979.
		const ev1979 = evaluateLine(
			{ id: "a", type: "tax", leverId: "fuel-duty", magnitude: 1 },
			{ era: "1979" },
		);
		const base = getTaxLever("fuel-duty");
		// 1979: gbpPerUnit × gdpScale = base × 0.076
		expect(ev1979.deltaGbp).toBeCloseTo(base.gbpPerUnit * 0.076, -6);
	});

	it("VAT 1979 yield diverges sharply from gdpScale approximation (narrow base)", () => {
		const ev1979 = evaluateLine(
			{ id: "a", type: "tax", leverId: "vat-standard", magnitude: 1 },
			{ era: "1979" },
		);
		const baseGbp = 8_000_000_000; // current VAT 1pp = £8bn
		const gdpScaleApprox = baseGbp * 0.076; // would be £608m
		// Actual 1979 yield: £200m (narrow base, just unified at 8% by Howe).
		// gdpScale would overshoot by 3x.
		expect(ev1979.deltaGbp).toBe(200_000_000);
		expect(ev1979.deltaGbp).toBeLessThan(gdpScaleApprox * 0.5);
	});

	it("scales borrow magnitude by gdpScale (era-£ display)", () => {
		const ev1979 = evaluateLine(
			{
				id: "a",
				type: "borrow",
				leverId: "",
				magnitude: 20_000_000_000,
			},
			{ era: "1979" },
		);
		// £20bn × 0.076 = £1.52bn (era pounds)
		expect(ev1979.deltaGbp).toBeCloseTo(20_000_000_000 * 0.076, -6);
	});
});

describe("era-aware distribution", () => {
	it("1979 state-pension distribution is more bottom-decile concentrated than current", () => {
		const line = {
			id: "a",
			type: "programme" as const,
			leverId: "state-pension",
			magnitude: -5,
		};
		const resultCurrent = evaluateScenario([line]);
		const resultEra = evaluateScenario([line], { era: "1979" });
		const distCurrent = evaluateScenarioDistribution(resultCurrent);
		const distEra = evaluateScenarioDistribution(resultEra, { era: "1979" });
		// Bottom decile share of the modelled delta:
		const bottomShareCurrent = distCurrent.perDecile[0]! / distCurrent.modelledDelta;
		const bottomShareEra = distEra.perDecile[0]! / distEra.modelledDelta;
		// 1979 vector starts at 0.18 (vs current 0.05) — much more bottom-decile
		// concentrated.
		expect(bottomShareEra).toBeGreaterThan(bottomShareCurrent * 2);
	});

	it("1979 working-age-welfare bottom-decile concentration is sharper than 2010 (pre vs post tax credits)", () => {
		const line = {
			id: "a",
			type: "programme" as const,
			leverId: "working-age-welfare",
			magnitude: -5,
		};
		const result1979 = evaluateScenario([line], { era: "1979" });
		const result2010 = evaluateScenario([line], { era: "2010" });
		const dist1979 = evaluateScenarioDistribution(result1979, { era: "1979" });
		const dist2010 = evaluateScenarioDistribution(result2010, { era: "2010" });
		const bottom1979 = dist1979.perDecile[0]! / dist1979.modelledDelta;
		const bottom2010 = dist2010.perDecile[0]! / dist2010.modelledDelta;
		// 1979 [0.40, 0.30, ...] vs 2010 [0.25, 0.24, ...] — pre-tax-credit
		// concentration is sharper.
		expect(bottom1979).toBeGreaterThan(bottom2010);
	});
});

describe("era multiplier adjust", () => {
	it("each era carries a sensible multiplierAdjust", () => {
		// 1979 stagflation: damped transmission (~0.7)
		expect(ERAS["1979"].multiplierAdjust).toBeLessThan(1);
		// 2010 ZLB: amplified (~1.3)
		expect(ERAS["2010"].multiplierAdjust!).toBeGreaterThan(1);
		// current: 1.0 (default — may be undefined)
		expect(ERAS.current.multiplierAdjust ?? 1).toBe(1);
	});

	it("2010 ZLB amplifies transport spending (Blanchard 2013): split capital amplification", () => {
		const transport = ERAS["2010"].programmeMultiplierOverrides?.transport;
		expect(transport).toBeDefined();
		// Override is now a split { capital, current } — check capital is
		// amplified well above the uniform adjust baseline (0.8 × 1.3 = 1.04).
		if (typeof transport === "object" && transport !== null) {
			expect(transport.capital).toBeGreaterThan(1.5);
			expect(transport.capital).toBeGreaterThan(transport.current);
		}
	});

	it("1979 dampens VAT multiplier sharply (high CPI passthrough)", () => {
		const vat = ERAS["1979"].taxMultiplierOverrides?.["vat-standard"];
		expect(vat).toBeDefined();
		// Override 0.3 vs uniform 0.5 × 0.7 = 0.35 — sharper damping
		expect(vat!).toBeLessThan(0.5 * 0.7);
	});

	it("2010 ZLB era × capital interaction: capital component amplified more than current", () => {
		const transport = ERAS["2010"].programmeMultiplierOverrides?.transport;
		expect(typeof transport).toBe("object");
		if (typeof transport === "object" && transport !== null) {
			// Blanchard 2013 finding: ZLB capital multipliers 1.5+, current ~1.0
			expect(transport.capital).toBeGreaterThanOrEqual(1.5);
			expect(transport.current).toBeLessThanOrEqual(1.2);
			expect(transport.capital - transport.current).toBeGreaterThan(0.5);
		}
	});

	it("1979 stagflation × capital: capital projects damaged more than current ops", () => {
		const transport = ERAS["1979"].programmeMultiplierOverrides?.transport;
		expect(typeof transport).toBe("object");
		if (typeof transport === "object" && transport !== null) {
			// Inflation hits capital projects hardest (cost overruns)
			expect(transport.capital).toBeLessThan(transport.current);
		}
	});

	it("each historical era cites a multiplier source", () => {
		expect(ERAS["1979"].multiplierSource).toBeDefined();
		expect(ERAS["1988"].multiplierSource).toBeDefined();
		expect(ERAS["2010"].multiplierSource).toBeDefined();
		expect(ERAS["2021"].multiplierSource).toBeDefined();
		// Sources have URLs
		for (const era of ["1979", "1988", "2010", "2021"] as const) {
			expect(ERAS[era].multiplierSource!.url).toMatch(/^https?:\/\//);
			expect(ERAS[era].multiplierSource!.label.length).toBeGreaterThan(5);
		}
	});

	it("1979 multi-year projection has smaller macro feedback than current (damped multiplier)", () => {
		// A basic-rate IT raise: nominal yield same in both eras (we use
		// per-era gbpPerUnit), but macro feedback differs by era's adjust.
		const line = {
			id: "a",
			type: "tax" as const,
			leverId: "basic-rate-income-tax",
			magnitude: 1,
		};
		const result1979 = evaluateScenario([line], { era: "1979" });
		const proj1979 = projectScenarioOverYears(result1979, 5, { era: "1979" });
		const projUnadjusted = projectScenarioOverYears(result1979, 5);
		// Year-2 fiscal-stance change: with the 0.7 multiplier adjust,
		// the macro feedback haircut is smaller, so realised yield is
		// closer to nominal (i.e. larger) than with the default 1.0
		// adjust. (Tax-rise macro feedback is negative — multipliers
		// reduce yield. Damped multiplier = less reduction.)
		expect(proj1979[1]!.net).toBeGreaterThan(projUnadjusted[1]!.net);
	});
});

describe("scaleScenarioResult", () => {
	it("scales freed/required/net and per-line deltas uniformly", () => {
		const raw = evaluateScenario([
			{ id: "a", type: "tax", leverId: "basic-rate-income-tax", magnitude: 1 },
			{ id: "b", type: "programme", leverId: "nhs-england", magnitude: 5 },
		]);
		const scaled = scaleScenarioResult(raw, 0.5);
		expect(scaled.freed).toBeCloseTo(raw.freed * 0.5, -6);
		expect(scaled.required).toBeCloseTo(raw.required * 0.5, -6);
		expect(scaled.net).toBeCloseTo(raw.net * 0.5, -6);
		expect(scaled.lines.length).toBe(raw.lines.length);
		for (let i = 0; i < raw.lines.length; i++) {
			expect(scaled.lines[i]!.deltaGbp).toBeCloseTo(
				raw.lines[i]!.deltaGbp * 0.5,
				-6,
			);
		}
	});

	it("returns the same reference when scale is 1 (no-op)", () => {
		const raw = evaluateScenario([
			{ id: "a", type: "tax", leverId: "basic-rate-income-tax", magnitude: 1 },
		]);
		expect(scaleScenarioResult(raw, 1)).toBe(raw);
	});

	it("preserves line metadata (description, source) under scaling", () => {
		const raw = evaluateScenario([
			{ id: "a", type: "tax", leverId: "basic-rate-income-tax", magnitude: 1 },
		]);
		const scaled = scaleScenarioResult(raw, 0.076);
		expect(scaled.lines[0]!.description).toBe(raw.lines[0]!.description);
		expect(scaled.lines[0]!.source).toBe(raw.lines[0]!.source);
	});
});

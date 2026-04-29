import { describe, expect, it } from "vitest";
import {
	type FiscalMultiplier,
	PROGRAMME_MULTIPLIERS,
	TAX_TO_GDP_RATIO,
	effectiveCoefficient,
	getProgrammeMultiplier,
	macroFeedback,
	macroFeedbackFraction,
	multiplierAtYear,
	secondRoundDelta,
} from "./macro";

describe("macroFeedback", () => {
	it("returns 0 when no multiplier", () => {
		expect(macroFeedback(6_000_000_000, undefined)).toBe(0);
	});

	it("revenue raise → negative feedback (demand contraction reduces yield)", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "test" };
		// £6bn raise × 0.5 mult × 0.38 tax-to-GDP = £1.14bn revenue feedback
		// Sign: revenue raise → fiscal contraction → GDP falls → revenue falls
		const fb = macroFeedback(6_000_000_000, m);
		expect(fb).toBeCloseTo(-1_140_000_000);
	});

	it("revenue cut → positive feedback (stimulus boosts tax base)", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "test" };
		const fb = macroFeedback(-6_000_000_000, m);
		expect(fb).toBeCloseTo(1_140_000_000); // sign flipped
	});

	it("higher multiplier → larger feedback magnitude", () => {
		const lo: FiscalMultiplier = { coefficient: 0.2, note: "low MPC" };
		const hi: FiscalMultiplier = { coefficient: 0.8, note: "high MPC" };
		expect(Math.abs(macroFeedback(10_000_000_000, lo))).toBeLessThan(
			Math.abs(macroFeedback(10_000_000_000, hi)),
		);
	});
});

describe("secondRoundDelta", () => {
	it("returns first-round unchanged when no multiplier", () => {
		expect(secondRoundDelta(6_000_000_000, undefined)).toBe(6_000_000_000);
	});

	it("£6bn revenue × multiplier 0.5 → ~£4.86bn second round", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "test" };
		const r = secondRoundDelta(6_000_000_000, m);
		// 6bn × (1 - 0.5 × 0.38) = 6bn × 0.81 = 4.86bn
		expect(r).toBeCloseTo(4_860_000_000);
	});

	it("preserves sign when multiplier × tax-to-GDP < 1", () => {
		const m: FiscalMultiplier = { coefficient: 0.6, note: "test" };
		const r = secondRoundDelta(10_000_000_000, m);
		expect(Math.sign(r)).toBe(1); // still positive
	});

	it("clamps to 0 if extreme multiplier would flip sign", () => {
		// multiplier × 0.38 > 1 → would flip sign; we clamp to 0
		const m: FiscalMultiplier = { coefficient: 3.0, note: "extreme" };
		const r = secondRoundDelta(1_000_000_000, m);
		expect(r).toBe(0);
	});

	it("symmetric: a cut gets boost equal to a rise's haircut", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "test" };
		const raise = secondRoundDelta(10_000_000_000, m);
		const cut = secondRoundDelta(-10_000_000_000, m);
		expect(raise + cut).toBeCloseTo(0); // symmetric around 0
	});
});

describe("macroFeedbackFraction", () => {
	it("returns multiplier × tax-to-GDP", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "test" };
		expect(macroFeedbackFraction(m)).toBeCloseTo(0.5 * TAX_TO_GDP_RATIO);
	});

	it("returns 0 when no multiplier", () => {
		expect(macroFeedbackFraction(undefined)).toBe(0);
	});
});

describe("multiplierAtYear (Scope B paths)", () => {
	it("flat shape returns coefficient every year", () => {
		const m: FiscalMultiplier = {
			coefficient: 0.5,
			pathShape: "flat",
			note: "",
		};
		expect(multiplierAtYear(m, 1)).toBeCloseTo(0.5);
		expect(multiplierAtYear(m, 5)).toBeCloseTo(0.5);
	});

	it("fade shape decays from year 1", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "fade",
			note: "",
		};
		expect(multiplierAtYear(m, 1)).toBeCloseTo(1.0);
		expect(multiplierAtYear(m, 5)).toBeCloseTo(0.15);
	});

	it("hump shape peaks at year 2", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "hump",
			note: "",
		};
		expect(multiplierAtYear(m, 2)).toBeGreaterThan(multiplierAtYear(m, 1));
		expect(multiplierAtYear(m, 2)).toBeGreaterThan(multiplierAtYear(m, 5));
	});

	it("spike shape collapses after year 1", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "spike",
			note: "",
		};
		expect(multiplierAtYear(m, 1)).toBeCloseTo(1.0);
		expect(multiplierAtYear(m, 2)).toBeLessThan(multiplierAtYear(m, 1) * 0.4);
	});

	it("year > path length uses last value", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "fade",
			note: "",
		};
		// fade path has 5 entries; year 10 should use index 4 (= 0.15)
		expect(multiplierAtYear(m, 10)).toBeCloseTo(0.15);
	});

	it("default shape (no shape specified) is flat for back-compat", () => {
		const m: FiscalMultiplier = { coefficient: 0.5, note: "" };
		expect(multiplierAtYear(m, 1)).toBeCloseTo(0.5);
		expect(multiplierAtYear(m, 5)).toBeCloseTo(0.5);
	});
});

describe("multiplier split (capital vs current)", () => {
	it("transport has a 30% capital share with higher capital multiplier", () => {
		const m = PROGRAMME_MULTIPLIERS.transport!;
		expect(m.multiplierSplit).toBeDefined();
		expect(m.multiplierSplit!.capitalShare).toBeCloseTo(0.3, 2);
		expect(m.multiplierSplit!.capital).toBeGreaterThan(m.multiplierSplit!.current);
	});

	it("nhs-england capital share is small (~5%)", () => {
		const m = PROGRAMME_MULTIPLIERS["nhs-england"]!;
		expect(m.multiplierSplit?.capitalShare).toBeLessThan(0.1);
	});

	it("defence procurement is ~25% capital", () => {
		const m = PROGRAMME_MULTIPLIERS.defence!;
		expect(m.multiplierSplit?.capitalShare).toBeCloseTo(0.25, 2);
	});

	it("education and local-govt-grants both carry ~10% capital splits", () => {
		expect(PROGRAMME_MULTIPLIERS.education?.multiplierSplit?.capitalShare).toBeCloseTo(0.1, 2);
		expect(PROGRAMME_MULTIPLIERS["local-govt-grants"]?.multiplierSplit?.capitalShare).toBeCloseTo(0.1, 2);
	});

	it("effectiveCoefficient blends split close to base coefficient (calibrated)", () => {
		for (const id of [
			"transport",
			"nhs-england",
			"defence",
			"education",
			"local-govt-grants",
		]) {
			const m = PROGRAMME_MULTIPLIERS[id]!;
			expect(m.multiplierSplit).toBeDefined();
			expect(effectiveCoefficient(m)).toBeCloseTo(m.coefficient, 1);
		}
	});

	it("effectiveCoefficient passes through base when no split", () => {
		const m = PROGRAMME_MULTIPLIERS["state-pension"]!;
		expect(m.multiplierSplit).toBeUndefined();
		expect(effectiveCoefficient(m)).toBe(0.6);
	});

	it("multiplierAtYear uses effectiveCoefficient (split-aware)", () => {
		const m = getProgrammeMultiplier("transport")!;
		// Transport's investment-shape year-1 weight = 0.6 (per
		// PATH_PROFILES); peaks year 3 at 1.1.
		const expected = effectiveCoefficient(m) * 0.6;
		expect(multiplierAtYear(m, 1)).toBeCloseTo(expected, 2);
	});
});

describe("macroFeedback with year parameter", () => {
	it("year-1 feedback uses peak multiplier", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "fade",
			note: "",
		};
		const fb = macroFeedback(10_000_000_000, m, 1);
		// 10bn × 1.0 × 0.38 = 3.8bn, sign-flipped → -3.8bn
		expect(fb).toBeCloseTo(-3_800_000_000, -3);
	});

	it("year-5 fade-shape feedback is much smaller", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "fade",
			note: "",
		};
		const fb1 = macroFeedback(10_000_000_000, m, 1);
		const fb5 = macroFeedback(10_000_000_000, m, 5);
		expect(Math.abs(fb5)).toBeLessThan(Math.abs(fb1) * 0.3);
	});

	it("investment shape (year 2-3 peak) reverses the typical fade", () => {
		const m: FiscalMultiplier = {
			coefficient: 1.0,
			pathShape: "investment",
			note: "",
		};
		const fb1 = macroFeedback(10_000_000_000, m, 1);
		const fb3 = macroFeedback(10_000_000_000, m, 3);
		expect(Math.abs(fb3)).toBeGreaterThan(Math.abs(fb1));
	});
});

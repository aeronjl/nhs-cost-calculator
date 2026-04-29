import { describe, expect, it } from "vitest";
import { fromGBP, toGBP } from "./currency";

const RATE = 1.27;

describe("toGBP", () => {
	it("returns the same value for GBP-native costs regardless of FX", () => {
		expect(toGBP(100, "GBP", 1.0)).toBe(100);
		expect(toGBP(100, "GBP", 1.5)).toBe(100);
		expect(toGBP(100, "GBP", 0.8)).toBe(100);
	});

	it("converts USD to GBP by dividing by the rate", () => {
		expect(toGBP(127, "USD", RATE)).toBe(100);
	});

	it("preserves zero", () => {
		expect(toGBP(0, "USD", RATE)).toBe(0);
	});
});

describe("fromGBP", () => {
	it("returns GBP unchanged when target is GBP", () => {
		expect(fromGBP(100, "GBP", RATE)).toBe(100);
	});

	it("multiplies by the rate when target is USD", () => {
		expect(fromGBP(100, "USD", RATE)).toBe(127);
	});
});

describe("round-trips", () => {
	it("toGBP then fromGBP is identity for USD costs", () => {
		const usdNative = 999.99;
		expect(fromGBP(toGBP(usdNative, "USD", RATE), "USD", RATE)).toBeCloseTo(
			usdNative,
		);
	});
});

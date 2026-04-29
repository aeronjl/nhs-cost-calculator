import { describe, expect, it } from "vitest";
import {
	computeBand,
	distributionFromRange,
	percentile,
	sampleNormal,
	seededRng,
} from "./uncertainty";

describe("seededRng", () => {
	it("produces a stream of numbers in [0, 1)", () => {
		const rng = seededRng(42);
		for (let i = 0; i < 100; i++) {
			const v = rng();
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("is deterministic for the same seed", () => {
		const a = seededRng(42);
		const b = seededRng(42);
		const aSeq = [a(), a(), a()];
		const bSeq = [b(), b(), b()];
		expect(aSeq).toEqual(bSeq);
	});

	it("different seeds produce different streams", () => {
		const a = seededRng(1);
		const b = seededRng(2);
		expect(a()).not.toBe(b());
	});
});

describe("sampleNormal", () => {
	it("returns mean when sd is 0", () => {
		const rng = seededRng(42);
		// With sd=0, the multiplier is 0, so result = mean regardless of rng draws.
		expect(sampleNormal(rng, { mean: 100, sd: 0 })).toBe(100);
	});

	it("samples produce roughly the right mean and sd at scale", () => {
		const rng = seededRng(42);
		const N = 5000;
		const samples = Array.from({ length: N }, () =>
			sampleNormal(rng, { mean: 100, sd: 10 }),
		);
		const mean = samples.reduce((a, b) => a + b, 0) / N;
		const variance =
			samples.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
		const sd = Math.sqrt(variance);
		expect(mean).toBeCloseTo(100, 0); // within ~1
		expect(sd).toBeCloseTo(10, 0); // within ~1
	});
});

describe("percentile", () => {
	it("returns the only element when there's one sample", () => {
		expect(percentile([42], 0.5)).toBe(42);
	});

	it("returns median for sorted odd-length array", () => {
		expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
	});

	it("interpolates for fractional ranks", () => {
		// p=0.25 of [1,2,3,4,5] is index 1.0 (rank-based, n-1 = 4).
		// 0.25 × 4 = 1.0 → exactly element 2 (index 1).
		expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
		// p=0.5 of 0..10 = element 5 (index 5)
		expect(percentile([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
	});

	it("clamps p to [0, 1]", () => {
		expect(percentile([1, 2, 3], -0.5)).toBe(1);
		expect(percentile([1, 2, 3], 1.5)).toBe(3);
	});

	it("handles empty array", () => {
		expect(percentile([], 0.5)).toBe(0);
	});
});

describe("computeBand", () => {
	it("computes 5/25/50/75/95 percentiles correctly for a uniform sample", () => {
		const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
		const band = computeBand(samples);
		expect(band.p5).toBeCloseTo(5.95);
		expect(band.p25).toBeCloseTo(25.75);
		expect(band.p50).toBeCloseTo(50.5);
		expect(band.p75).toBeCloseTo(75.25);
		expect(band.p95).toBeCloseTo(95.05);
	});

	it("p50 equals median for normal-ish samples", () => {
		const rng = seededRng(42);
		const samples = Array.from({ length: 1000 }, () =>
			sampleNormal(rng, { mean: 0, sd: 1 }),
		);
		const band = computeBand(samples);
		expect(band.p50).toBeCloseTo(0, 0); // close to mean=0
		expect(band.p5).toBeLessThan(-1.5); // ~p5 of N(0,1) is -1.645
		expect(band.p95).toBeGreaterThan(1.5);
	});

	it("p5 < p25 < p50 < p75 < p95 always", () => {
		const rng = seededRng(123);
		const samples = Array.from({ length: 100 }, () =>
			sampleNormal(rng, { mean: 50, sd: 20 }),
		);
		const band = computeBand(samples);
		expect(band.p5).toBeLessThan(band.p25);
		expect(band.p25).toBeLessThan(band.p50);
		expect(band.p50).toBeLessThan(band.p75);
		expect(band.p75).toBeLessThan(band.p95);
	});
});

describe("distributionFromRange", () => {
	it("uses range when supplied (95% CI assumption)", () => {
		// HMRC range £5.5–6.5bn implies sd = (6.5 - 5.5) / 3.92 ≈ 255m
		const d = distributionFromRange(6_000_000_000, {
			low: 5_500_000_000,
			high: 6_500_000_000,
		});
		expect(d.mean).toBe(6_000_000_000);
		expect(d.sd).toBeCloseTo(255_102_040, -3);
	});

	it("falls back to default sd fraction when no range supplied", () => {
		const d = distributionFromRange(1_000_000_000, undefined, 0.1);
		expect(d.mean).toBe(1_000_000_000);
		expect(d.sd).toBe(100_000_000);
	});

	it("handles negative central with positive sd (uses absolute)", () => {
		const d = distributionFromRange(-3_000_000_000, undefined, 0.1);
		expect(d.sd).toBe(300_000_000);
	});

	it("returns sd=0 when range is degenerate (low === high)", () => {
		const d = distributionFromRange(100, { low: 100, high: 100 });
		expect(d.sd).toBe(0);
	});
});

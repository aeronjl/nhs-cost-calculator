// Monte Carlo uncertainty quantification for fiscal scenarios.
//
// Every figure in the simulator is currently a central estimate. The
// underlying methodology fields already acknowledge ranges (e.g. basic-rate
// IT: £5.5–6.5bn at 1pp, central £6bn) — this module turns those ranges
// into proper percentile bands across the full scenario.
//
// Approach: independent normal distributions per lever, sampled N=1000 times.
// For each draw: evaluate the full scenario with sampled parameters and
// store the net £. After N draws, sort and read percentiles.
//
// Independence assumption is a known simplification — in reality, lever
// outcomes are correlated (a recession affects every revenue line in the
// same direction). A joint covariance model is a future refinement, but
// even independent sampling produces meaningfully wider bands than the
// current single-line presentation, which is the credibility win.

const SQRT_2_PI = Math.sqrt(2 * Math.PI);

export interface Distribution {
	mean: number;
	sd: number;
}

// Box-Muller normal sampler. Pure function: takes a uniform-[0,1) RNG and
// returns one normal sample.
export const sampleNormal = (
	rng: () => number,
	dist: Distribution,
): number => {
	let u1 = rng();
	const u2 = rng();
	if (u1 < 1e-12) u1 = 1e-12; // avoid log(0)
	const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
	return dist.mean + z * dist.sd;
};

// Mulberry32 — small deterministic 32-bit PRNG. Lets us seed sampling so
// the simulator's UI is stable per render (no flickering bands as the
// component re-renders).
export const seededRng = (seed: number): (() => number) => {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

// Compute percentile from sorted samples. Linear interpolation between
// nearest ranks (matches numpy / scipy default).
export const percentile = (
	sortedSamples: readonly number[],
	p: number,
): number => {
	if (sortedSamples.length === 0) return 0;
	if (sortedSamples.length === 1) return sortedSamples[0]!;
	const clampedP = Math.max(0, Math.min(1, p));
	const idx = clampedP * (sortedSamples.length - 1);
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	if (lo === hi) return sortedSamples[lo]!;
	const frac = idx - lo;
	return sortedSamples[lo]! * (1 - frac) + sortedSamples[hi]! * frac;
};

// 5-percentile fan. Standard fiscal-modelling presentation.
export interface PercentileBand {
	p5: number;
	p25: number;
	p50: number;
	p75: number;
	p95: number;
}

export const computeBand = (samples: number[]): PercentileBand => {
	const sorted = [...samples].sort((a, b) => a - b);
	return {
		p5: percentile(sorted, 0.05),
		p25: percentile(sorted, 0.25),
		p50: percentile(sorted, 0.5),
		p75: percentile(sorted, 0.75),
		p95: percentile(sorted, 0.95),
	};
};

// Map a methodology.range to a Distribution. Convention: range is ~95% CI,
// so sd = (high - low) / (2 × 1.96) ≈ (high - low) / 3.92. For levers
// without an explicit range, fall back to defaultSdFraction × |mean|.
export const distributionFromRange = (
	mean: number,
	range: { low: number; high: number } | undefined,
	defaultSdFraction = 0.10,
): Distribution => {
	if (range && Number.isFinite(range.low) && Number.isFinite(range.high)) {
		return {
			mean,
			sd: Math.max(0, (range.high - range.low) / 3.92),
		};
	}
	return { mean, sd: Math.abs(mean) * defaultSdFraction };
};

// Distributional incidence: per-lever vectors describing where the £ burden
// (or benefit) of a fiscal change actually falls across the income spectrum.
//
// Convention: ECONOMIC incidence, not legal incidence. VAT's legal incidence
// is on retailers but the economic burden falls on consumers; employer NICs
// has a legal incidence on employers but the economic burden falls largely
// on workers via reduced wages (the OBR/IFS consensus). Vectors in this file
// reflect the economic conventions a Treasury or IFS analyst would recognise.
//
// Decile 0 = bottom 10% by equivalised disposable household income.
// Decile 9 = top 10%. We use deciles rather than quintiles because Treasury
// and HMRC's distributional analysis publishes in deciles and the granularity
// matters for revenue-from-the-top measures (CGT, IHT, additional-rate IT)
// where the top decile dominates.
//
// Sources for the vectors are listed per-lever in the lever's methodology +
// in the `incidenceSource` field. When precise published distributional data
// isn't available we use a defensible approximation grounded in:
//   - HMRC's annual "distributional analysis of the impact of cumulative
//     measures" (published with each Budget)
//   - IFS's distributional decompositions in Green Budget and Budget responses
//   - Resolution Foundation nowcasting outputs

export type IncidenceVector = readonly [
	number, // decile 1 (bottom 10%)
	number, // decile 2
	number, // decile 3
	number, // decile 4
	number, // decile 5
	number, // decile 6
	number, // decile 7
	number, // decile 8
	number, // decile 9
	number, // decile 10 (top 10%)
];

export interface IncidenceMeta {
	vector: IncidenceVector;
	// Short human-readable note on the incidence pattern + source.
	note: string;
	source?: { url: string; label: string };
}

// Validate that an incidence vector sums to ~1.0 (within rounding tolerance).
// Useful in tests and when authoring new vectors.
export const isValidVector = (v: IncidenceVector): boolean => {
	const sum = v.reduce((a, b) => a + b, 0);
	return Math.abs(sum - 1) < 0.02; // 2% tolerance
};

// Aggregate a per-decile share into per-decile £ amounts.
// `delta` is the line's deltaGbp from evaluateScenario:
//   positive = revenue freed (taxes raised, programme cut)
//   negative = revenue required (taxes cut, programme increased)
//
// Returns an array where positive values mean "this decile loses £X" and
// negative values mean "this decile gains £X". The sum equals the line's
// deltaGbp (subject to rounding).
export const distributeDelta = (
	delta: number,
	vector: IncidenceVector,
): number[] => vector.map((share) => delta * share);

// Sum two per-decile arrays element-wise. Used to fold per-line distributions
// into a scenario-level distribution.
export const sumDeciles = (a: number[], b: number[]): number[] =>
	a.map((v, i) => v + (b[i] ?? 0));

export const zeroDeciles = (): number[] =>
	Array.from({ length: 10 }, () => 0);

// Reference: UK equivalised disposable household income by decile boundary
// (ONS HBAI 2022/23, rounded for clarity in the UI). Decile midpoints.
//
// We hold these so the distribution UI can express absolute £ as % of
// disposable income — far more meaningful than absolute £ when comparing
// burdens across deciles. £100 to bottom decile is ~1% of disposable income;
// £100 to top decile is ~0.1%.
//
// Source: ONS Effects of Taxes and Benefits on Household Income, latest
// release. Update annually; figures are real-terms estimates.
export const DECILE_DISPOSABLE_INCOME: readonly number[] = [
	12_400, // 1: bottom decile
	17_200, // 2
	21_300, // 3
	25_800, // 4
	30_900, // 5
	36_700, // 6
	43_400, // 7
	51_900, // 8
	63_800, // 9
	102_500, // 10: top decile
];

// Per-decile £ as % of disposable income. Useful for showing distributional
// impact in income-equitable terms. Returns negative values for "decile gains
// X% of income"; positive for "decile loses X%".
export const asShareOfIncome = (perDecile: number[]): number[] =>
	perDecile.map((amount, i) => {
		const income = DECILE_DISPOSABLE_INCOME[i] ?? 0;
		return income > 0 ? amount / income : 0;
	});

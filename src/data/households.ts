// Representative UK households used for "what does this scenario mean for
// me?" framing in the simulator. The catalog is small (8 households) and
// covers the politically important corners of the income/composition space.
//
// This is a pragmatic substitute for full FRS-microdata microsimulation.
// IFS, Resolution Foundation, and Treasury internally run on ~20,000-
// household samples; that requires restricted microdata access we can't
// provide in a public calculator. Instead we hand-pick representative cases
// that map roughly to the Office for National Statistics Effects of Taxes
// and Benefits (ETB) decile profiles — making the results comparable to
// the published distributional analyses everyone references.
//
// Each household's £ figures should be read as "typical for this archetype",
// not "median of decile X." The archetypes deliberately span common policy
// lenses (single mum on UC, pensioner couple, dual-earner family, top-decile
// household) so users see proposals through the lens of demographic groups
// the political conversation actually centres on.
//
// Source notes:
//   - Earned-income figures: ASHE 2024 percentile bands by decile
//   - State pension: full new state pension £11,503/yr (2024-25)
//   - UC + child benefit: standard rates 2024-25 + typical eligibility
//   - VAT-able spending share by decile: ONS Family Spending 2023
//   - Net income figures: gross income minus IT + NICs + (where applicable)
//     UC taper. Approximate; tax.ts provides exact calc when it matters.

export interface RepresentativeHousehold {
	id: string;
	label: string;
	description: string;
	decile: number; // 1 (bottom 10%) .. 10 (top 10%)
	composition: {
		adults: number;
		children: number;
		pensioners: number; // adults of state pension age
	};
	// Annual gross £ by income source.
	earnedIncome: number; // employed + self-employed
	privatePensionIncome: number; // taxable workplace + private pensions
	statePensionIncome: number; // mostly tax-free up to PA
	dividendIncome: number;
	benefitIncome: number; // UC + child benefit + disability + housing (mostly tax-free)
	// Annual £ of consumption falling on VAT (approximate; uses ONS Family
	// Spending share-of-disposable-income by decile × decile-typical income).
	vatableSpend: number;
	// Approximate household net annual income after IT + NICs, for use as
	// the denominator in "% of net income" UI summaries. Ballpark figure.
	netIncome: number;
}

export const REPRESENTATIVE_HOUSEHOLDS: readonly RepresentativeHousehold[] = [
	{
		id: "single-pensioner",
		label: "Single pensioner",
		description:
			"Lives alone on full new state pension + ~£200/wk small private pension. Renter.",
		decile: 2,
		composition: { adults: 1, children: 0, pensioners: 1 },
		earnedIncome: 0,
		privatePensionIncome: 5_000,
		statePensionIncome: 11_500,
		dividendIncome: 0,
		benefitIncome: 0,
		vatableSpend: 4_500,
		netIncome: 16_000,
	},
	{
		id: "pensioner-couple",
		label: "Pensioner couple",
		description:
			"Two pensioners on full state pension + workplace pensions. Owner-occupier.",
		decile: 4,
		composition: { adults: 2, children: 0, pensioners: 2 },
		earnedIncome: 0,
		privatePensionIncome: 10_000,
		statePensionIncome: 23_000,
		dividendIncome: 1_000,
		benefitIncome: 0,
		vatableSpend: 8_500,
		netIncome: 31_500,
	},
	{
		id: "single-parent-uc",
		label: "Single parent, 2 kids, on UC",
		description:
			"Parent earning £18k part-time + Universal Credit + child benefit. Social rent.",
		decile: 2,
		composition: { adults: 1, children: 2, pensioners: 0 },
		earnedIncome: 18_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		benefitIncome: 12_500, // UC + child benefit + housing element
		vatableSpend: 5_500,
		netIncome: 28_000,
	},
	{
		id: "single-low-earner",
		label: "Single, near-minimum wage",
		description:
			"One adult, full-time at ~£23k. No housing benefit. Renter, decile 3.",
		decile: 3,
		composition: { adults: 1, children: 0, pensioners: 0 },
		earnedIncome: 23_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		benefitIncome: 1_300, // possibly some UC
		vatableSpend: 6_000,
		netIncome: 21_500,
	},
	{
		id: "single-basic",
		label: "Single, basic-rate earner",
		description: "One adult, salary £35k. Renter, decile 5.",
		decile: 5,
		composition: { adults: 1, children: 0, pensioners: 0 },
		earnedIncome: 35_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		benefitIncome: 0,
		vatableSpend: 8_000,
		netIncome: 29_300,
	},
	{
		id: "dual-earner-family",
		label: "Dual-earner family, 2 kids",
		description:
			"Two adults each earning £30k, two children. Owner-occupier on mortgage. Decile 6.",
		decile: 6,
		composition: { adults: 2, children: 2, pensioners: 0 },
		earnedIncome: 60_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 0,
		benefitIncome: 2_300, // child benefit
		vatableSpend: 11_500,
		netIncome: 51_500,
	},
	{
		id: "single-higher",
		label: "Single, higher-rate earner",
		description: "One adult on £75k. Decile 8.",
		decile: 8,
		composition: { adults: 1, children: 0, pensioners: 0 },
		earnedIncome: 75_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 1_000,
		benefitIncome: 0,
		vatableSpend: 13_500,
		netIncome: 53_500,
	},
	{
		id: "dual-higher-family",
		label: "Dual-earner family, one higher-rate",
		description:
			"Two adults (one £85k, one £40k), two children. Decile 8-9. Owner-occupier.",
		decile: 9,
		composition: { adults: 2, children: 2, pensioners: 0 },
		earnedIncome: 125_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 2_000,
		benefitIncome: 2_300, // child benefit (high-income tapered some)
		vatableSpend: 17_000,
		netIncome: 92_000,
	},
	{
		id: "top-decile",
		label: "Top-decile household",
		description:
			"One earner on £200k + £20k dividends + occasional capital gains. Owner-occupier.",
		decile: 10,
		composition: { adults: 2, children: 1, pensioners: 0 },
		earnedIncome: 200_000,
		privatePensionIncome: 0,
		statePensionIncome: 0,
		dividendIncome: 20_000,
		benefitIncome: 0,
		vatableSpend: 28_000,
		netIncome: 145_000,
	},
];

export const getHousehold = (
	id: string,
): RepresentativeHousehold | undefined =>
	REPRESENTATIVE_HOUSEHOLDS.find((h) => h.id === id);

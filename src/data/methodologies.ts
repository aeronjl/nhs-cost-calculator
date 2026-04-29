import type { Methodology } from "@/lib/methodology";

// Methodologies for figures that aren't tied to a specific data row.
// Per-row methodologies live alongside their data:
//   - Tax levers: src/data/levers/tax-rates.ts (each TaxLever.methodology)
//   - Spending programmes: src/data/levers/uk-spending.ts
//   - NHS slices: src/data/nhs-budget.ts
//   - Borrowing: src/data/levers/borrowing.ts

export const NHS_TAX_SHARE_METHODOLOGY: Methodology = {
	source: {
		url: "https://www.gov.uk/government/statistics/hmrc-tax-and-nics-receipts-for-the-uk",
		label: "HMRC receipts + NHS England settlement",
	},
	asOf: "2024-04",
	measure:
		"Approximate share of total UK government receipts (~£900bn) that funds NHS England (~£165bn). Treated as a flat factor for personal-tax-share calculations.",
	alternatives: [
		{
			label: "DHSC-wide share",
			value: 0.22,
			note: "If you count the wider DHSC budget (£200bn / £900bn) — closer to what most people mean by 'NHS funding'.",
		},
		{
			label: "NICs alone",
			note: "NICs (~£170bn) is technically earmarked for the NHS and state pension via the National Insurance Fund — but in practice the Treasury sees one revenue pot.",
		},
	],
	caveat:
		"Real fiscal apportionment is more nuanced — non-tax revenue (Crown estates, asset sales, gilt issuance) and DEL/AME mechanics aren't separately modelled. This is a conversational estimate, not an audit.",
};

export const UK_POPULATION_METHODOLOGY: Methodology = {
	source: {
		url: "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates",
		label: "ONS mid-2024 estimate",
	},
	asOf: "2024-06",
	measure:
		"Total UK resident population, including children and non-earners. Used as the per-capita denominator on the page.",
	alternatives: [
		{
			label: "Adults (18+)",
			value: 56_000_000,
			note: "More representative for 'per voter' or 'per service-user' framing.",
		},
		{
			label: "Working-age (16–64)",
			value: 41_000_000,
			note: "Better proxy for 'per worker' framing.",
		},
		{
			label: "Income tax payers",
			value: 33_000_000,
			note: "Roughly the basic-rate-and-above tax base. Closer to 'per person paying for it'.",
		},
		{
			label: "Households",
			value: 28_000_000,
			note: "The receiving-public-services frame.",
		},
	],
	caveat:
		"Per-capita with total population spreads costs across non-earners; per-taxpayer better reflects who funds it. The choice changes the headline by ~2×.",
};

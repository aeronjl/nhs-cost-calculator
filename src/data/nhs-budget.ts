import type { Currency } from "@/lib/currency";
import type { Methodology } from "@/lib/methodology";
import {
	type BudgetOverride,
	nhsEnglandBudgetSource,
} from "@/data/sources/nhs-england-budget";
import { loadSource } from "@/data/sources/types";

// =============================================================================
// NHS England programme budgeting
// =============================================================================
//
// All figures below are NHS England programme spending for FY2023/24,
// approximated from public summaries (King's Fund, Health Foundation, House of
// Commons Library). They are NOT pulled from the primary NHS England Annual
// Report and Accounts — please verify each value against the latest published
// report before deploying significant copy that depends on the exact numbers.
// The CI test in `nhs-budget.test.ts` enforces that slice values sum to the
// total within ±2%; that gate catches "I bumped one number and forgot the
// others" but not "the figures are simply wrong".
//
// To update for a new fiscal year:
//   1. Pull the latest NHS England Annual Report (search "NHS England annual
//      report and accounts <year>") and find the programme budgeting tables.
//   2. Update each slice's `value`, `asOf`, and `source.url` (the URL changes
//      year to year as new reports supersede old ones).
//   3. Update `NHS_ENGLAND_TOTAL.value` + `asOf` to match.
//   4. Run `npm test` — the sum-tolerance test will flag drift.
// =============================================================================

export interface BudgetSlice {
	id: string;
	label: string; // Display name in the pill bar
	shortLabel: string; // Used inline e.g. "X is Y of <shortLabel>"
	value: number; // GBP
	asOf: string; // YYYY-MM
	source: { url: string; label: string };
	methodology: Methodology;
	// Set to true when a live override is applied via `applyBudgetOverride`.
	// Defaults false on the static catalog entries below.
	isLive?: boolean;
}

export interface NhsBudget {
	currency: Currency;
	slices: readonly BudgetSlice[]; // First slice is the total (id: "total").
}

const SOURCE = {
	url: "https://www.england.nhs.uk/publication/nhs-england-annual-report-and-accounts-2023-24/",
	label: "NHS England Annual Report 2023/24",
} as const;

export const NHS_ENGLAND_TOTAL: BudgetSlice = {
	id: "total",
	label: "Total NHS England",
	shortLabel: "NHS England spending",
	value: 165_000_000_000,
	asOf: "2023-04",
	source: SOURCE,
	methodology: {
		source: SOURCE,
		asOf: "2023-04",
		measure:
			"NHS England programme spending (mandate funding). Excludes DHSC central spending, the public health grant, the workforce training budget, and NHS Scotland / Wales / NI.",
		alternatives: [
			{
				label: "DHSC total budget",
				value: 200_000_000_000,
				note: "Adds DHSC admin, public health grant, training, and capital. The number people often mean by 'NHS budget'.",
			},
			{
				label: "UK-wide health spending",
				value: 230_000_000_000,
				note: "Adds NHS Scotland, NHS Wales, NHS NI. Health is devolved.",
			},
			{
				label: "Per UK person",
				value: 2415,
				note: "£165bn / 68.3M residents. Spreads cost over non-earners and children.",
			},
			{
				label: "Per adult (18+)",
				value: 2946,
				note: "£165bn / 56M adults. More representative for 'per voter' framings.",
			},
		],
		range: {
			low: 160_000_000_000,
			high: 175_000_000_000,
			note: "Annual settlements move within this band; outturn vs estimate also varies year-to-year.",
		},
		caveat:
			"From 2025/26 NHS England is being reabsorbed into DHSC, so this category may not exist by FY26/27 and the figure shifts accordingly.",
	},
};

export const NHS_ENGLAND_SLICES: readonly BudgetSlice[] = [
	NHS_ENGLAND_TOTAL,
	{
		id: "acute",
		label: "Acute care",
		shortLabel: "acute (hospital) care",
		value: 87_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"Hospital-based treatment — A&E, planned surgery, inpatient stays, outpatient appointments. ~50% of NHS England programme spending.",
			alternatives: [
				{
					label: "Emergency only",
					value: 25_000_000_000,
					note: "A&E, urgent care, ambulance services.",
				},
				{
					label: "Planned care only",
					value: 40_000_000_000,
					note: "Elective surgery, outpatient.",
				},
			],
			caveat:
				"The boundary between acute and community care moves over time as services shift settings (e.g. virtual wards, community diagnostics). Year-to-year comparisons need careful boundary alignment.",
		},
	},
	{
		id: "specialised",
		label: "Specialised services",
		shortLabel: "specialised services spending",
		value: 25_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"High-cost low-volume conditions commissioned directly by NHS England — rare cancers, transplants, advanced treatments, specialised paediatrics.",
			caveat:
				"Fastest-growing programme category as new high-cost drugs (immunotherapies, gene therapies) enter the formulary. Boundary with acute care isn't crisp — some specialised services are delivered in major acute trusts.",
		},
	},
	{
		id: "primary-care",
		label: "Primary care",
		shortLabel: "primary care spending",
		value: 17_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"GP services, NHS dentistry, pharmacy contracts, optometry. Excludes social care and community nursing.",
			caveat:
				"Independent contractor model — GPs are mostly self-employed. The £17bn is contract values, not the operational running costs of the broader system. The 'GP funding crisis' discourse usually focuses on per-patient funding (~£170/patient/year) rather than the total.",
		},
	},
	{
		id: "mental-health",
		label: "Mental health",
		shortLabel: "mental health spending",
		value: 15_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"NHS mental health services for adults, children & young people, and older adults. Adult community + inpatient + crisis + IAPT.",
			alternatives: [
				{
					label: "Including LA mental health social care",
					value: 20_000_000_000,
					note: "Adds local authority mental-health social care spend.",
				},
			],
			caveat:
				"Difficult to measure — many mental-health costs are buried in acute (A&E, liaison psychiatry), primary care, or local authority budgets. 'Parity of esteem' campaigners argue the true figure is much higher; sceptics argue it's lower because of double-counting.",
		},
	},
	{
		id: "community",
		label: "Community services",
		shortLabel: "community health spending",
		value: 10_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"District nursing, health visiting, community physiotherapy, end-of-life care, services delivered outside hospitals.",
			caveat:
				"Boundary with primary care and acute is fuzzy. NHS England's 'shift to community' goal aims to grow this — but historic underinvestment has left the workforce stretched, so growth requires staffing pipeline that takes years.",
		},
	},
	{
		id: "prescribing",
		label: "Prescribing",
		shortLabel: "out-of-hospital prescribing",
		value: 10_000_000_000,
		asOf: "2023-04",
		source: SOURCE,
		methodology: {
			source: SOURCE,
			asOf: "2023-04",
			measure:
				"Drug costs in primary care + dispensing fees. Excludes hospital drug costs (counted in acute).",
			alternatives: [
				{
					label: "Including hospital drugs",
					value: 25_000_000_000,
					note: "Adds the ~£15bn of in-hospital drug spend, mostly specialised therapies.",
				},
			],
			caveat:
				"Excluding hospital drugs misses the fastest-growing component of NHS drug spend (immunotherapies, biologics). The 'prescribing crisis' framing usually conflates the two.",
		},
	},
];

export const NHS_ENGLAND: NhsBudget = {
	currency: "GBP",
	slices: NHS_ENGLAND_SLICES,
};

export const MINUTES_PER_YEAR = 525_600;

// ONS mid-2024 UK population estimate. Updated annually each summer (search
// "Population estimates for the UK" on ons.gov.uk). Used for per-capita
// framing in the headline ("£X = £Y per UK person per year").
export const UK_POPULATION = {
	value: 68_300_000,
	asOf: "2024-06",
	source: {
		url: "https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates",
		label: "ONS mid-2024 estimate",
	},
} as const;

export const getSlice = (
	id: string | undefined,
	slices: readonly BudgetSlice[] = NHS_ENGLAND_SLICES,
): BudgetSlice => {
	const fallback = slices[0] ?? NHS_ENGLAND_TOTAL;
	if (!id) return fallback;
	return slices.find((s) => s.id === id) ?? fallback;
};

// Apply a live override on top of the static slice metadata. Structure (id,
// label, shortLabel) stays curated; only `value`, `asOf`, and `source` (when
// supplied) are overlaid.
export function applyBudgetOverride(
	base: readonly BudgetSlice[],
	override: BudgetOverride | null,
): readonly BudgetSlice[] {
	if (!override) return base;
	return base.map((slice) => {
		const liveValue =
			slice.id === "total"
				? override.totalValue
				: (override.sliceValues[slice.id] ?? slice.value);
		return {
			...slice,
			value: liveValue,
			asOf: override.asOf,
			source: override.source ?? slice.source,
			isLive: true,
		};
	});
}

// Server-side entry point. Calls the source (env-gated), applies any override,
// and returns the resolved slice array. Use this from server components and
// route handlers; do NOT call from client code (the env var isn't available).
export async function loadResolvedSlices(): Promise<readonly BudgetSlice[]> {
	const override = await loadSource(nhsEnglandBudgetSource);
	return applyBudgetOverride(NHS_ENGLAND_SLICES, override);
}

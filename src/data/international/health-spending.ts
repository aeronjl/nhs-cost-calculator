import type { Methodology } from "@/lib/methodology";
import {
	type CountryHealthOverrideMap,
	worldBankHealthSource,
} from "@/data/sources/world-bank-health";
import {
	type TreatableMortalityOverride,
	oecdTreatableMortalitySource,
} from "@/data/sources/oecd-treatable-mortality";
import {
	type PhysiciansOverride,
	oecdPhysiciansSource,
} from "@/data/sources/oecd-physicians";
import {
	type HospitalBedsOverride,
	oecdHospitalBedsSource,
} from "@/data/sources/oecd-hospital-beds";
import {
	type NursesOverride,
	oecdNursesSource,
} from "@/data/sources/oecd-nurses";
import {
	type CancerSurvivalOverride,
	oecdCancerSurvivalSource,
} from "@/data/sources/oecd-cancer-survival";
import { loadSource } from "@/data/sources/types";

// Comparable health-spending and outcome data for OECD peers, used in the
// "How does the UK compare?" panel. Approximate FY2022 figures from OECD
// Health at a Glance 2023 — the most recent fully-comparable cross-country
// dataset at time of authoring. Verify against the current edition before
// shipping any high-stakes copy.
//
// CRITICAL CAVEAT: every country's spending figure includes BOTH public and
// private spending. The £165bn used elsewhere on the page is NHS England
// alone, which is *narrower* than the OECD's all-payer measure for the UK
// (~£260bn at 11.3% of GDP). The two figures answer different questions; the
// per-country methodology popover spells this out.
//
// "Treatable mortality" follows OECD's standard definition: deaths per
// 100,000 from causes that could have been avoided with effective healthcare.
// Lower is better. Useful as a single outcome proxy, but doesn't capture
// quality-of-life or chronic-condition outcomes.

export interface CountryHealth {
	id: string; // ISO 2-letter or special id
	name: string;
	emoji: string; // flag
	spendPctGdp: number; // 0–1, fraction of GDP
	spendPerCapitaPpp: number; // USD PPP, current
	lifeExpectancy: number; // years at birth
	treatableMortality: number; // per 100k
	physiciansPerThousand: number; // practising physicians per 1,000 population
	bedsPerThousand: number; // hospital beds per 1,000 population (total preferred; public-only for UK/AU)
	nursesPerThousand: number; // practising nurses per 1,000 population (MINU = all nurses combined)
	breastCancer5yrSurvival: number; // % 5-year net survival rate, breast cancer
	asOf: string; // YYYY-MM
	source: { url: string; label: string };
	methodology: Methodology;
	isUk?: boolean; // For UI highlighting
	// Set by `loadResolvedCountries()` when World Bank data overrides the
	// static catalog values. Treatable mortality is never live (no WB equivalent).
	isLive?: boolean;
}

const OECD_HAAG = {
	url: "https://www.oecd.org/health/health-at-a-glance/",
	label: "OECD Health at a Glance 2023",
} as const;

export const COUNTRY_HEALTH: readonly CountryHealth[] = [
	{
		id: "GB",
		name: "United Kingdom",
		emoji: "🇬🇧",
		spendPctGdp: 0.113,
		spendPerCapitaPpp: 5387,
		lifeExpectancy: 80.4,
		treatableMortality: 75,
		physiciansPerThousand: 3.37,
		bedsPerThousand: 2.44,
		nursesPerThousand: 8.72,
		breastCancer5yrSurvival: 85.9,
		asOf: "2022-12",
		source: OECD_HAAG,
		isUk: true,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"UK total current health expenditure (all payers, public + private) as % of GDP. Includes NHS spending across all four nations plus private health, dental, optical, and out-of-pocket.",
			alternatives: [
				{
					label: "NHS England only",
					value: 0.075,
					note: "The £165bn used elsewhere on the page works out to ~7.5% of UK GDP. The OECD's all-payer 11.3% is broader by ~£90bn.",
				},
				{
					label: "Public spending only",
					value: 0.094,
					note: "Excluding private/voluntary insurance and out-of-pocket. Closer to a 'tax-funded health' measure.",
				},
			],
			caveat:
				"Headline 11.3% includes ~£20bn of private spending plus NHS Scotland/Wales/NI. When elsewhere on this page you see '£165bn NHS spending,' that's narrower — comparing 11.3% directly to other tools that quote NHS-only is apples to oranges.",
		},
	},
	{
		id: "US",
		name: "United States",
		emoji: "🇺🇸",
		spendPctGdp: 0.166,
		spendPerCapitaPpp: 12555,
		lifeExpectancy: 76.4,
		treatableMortality: 92,
		physiciansPerThousand: 2.72,
		bedsPerThousand: 2.75,
		nursesPerThousand: 12.07,
		breastCancer5yrSurvival: 90.4,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"US total current health expenditure as % of GDP. Highest among OECD by a wide margin. Roughly half public (Medicare, Medicaid, VA) and half private (employer-sponsored insurance, individual market, out-of-pocket).",
			alternatives: [
				{
					label: "Public-payer only",
					value: 0.083,
					note: "Federal + state programmes; less than the UK's 9.4% public share despite much higher total.",
				},
			],
			caveat:
				"The US is the textbook outlier on health spending. Higher spend, worse population outcomes than peers. The structural difference (private insurance dominance, high admin costs, fee-for-service incentives) makes per-£ comparisons misleading without context.",
		},
	},
	{
		id: "DE",
		name: "Germany",
		emoji: "🇩🇪",
		spendPctGdp: 0.127,
		spendPerCapitaPpp: 8011,
		lifeExpectancy: 80.7,
		treatableMortality: 65,
		physiciansPerThousand: 4.66,
		bedsPerThousand: 7.66,
		nursesPerThousand: 12.52,
		breastCancer5yrSurvival: 86.0,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Germany total current health expenditure. Mixed statutory health insurance (gesetzliche Krankenversicherung, ~88% of population) plus private insurance for higher earners.",
			caveat:
				"German SHI is funded through earnings-related contributions, not general taxation. The ~12.7% headline mixes contributions and private spending; not a direct fiscal-tax comparison to UK NHS funding.",
		},
	},
	{
		id: "FR",
		name: "France",
		emoji: "🇫🇷",
		spendPctGdp: 0.121,
		spendPerCapitaPpp: 6517,
		lifeExpectancy: 82.5,
		treatableMortality: 60,
		physiciansPerThousand: 3.90,
		bedsPerThousand: 5.40,
		nursesPerThousand: 9.74,
		breastCancer5yrSurvival: 86.7,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"France total current health expenditure. Sécurité sociale statutory insurance covers ~78%; complementary insurance and out-of-pocket make up the balance.",
			caveat:
				"French SHI is partly funded by earnings contributions, partly by earmarked taxes (CSG). Cleaner outcome data than the US comparison — life expectancy 6 years higher, treatable mortality two-thirds lower, at lower per-capita spend.",
		},
	},
	{
		id: "NL",
		name: "Netherlands",
		emoji: "🇳🇱",
		spendPctGdp: 0.102,
		spendPerCapitaPpp: 6729,
		lifeExpectancy: 81.7,
		treatableMortality: 53,
		physiciansPerThousand: 3.91,
		bedsPerThousand: 2.31,
		nursesPerThousand: 10.49,
		breastCancer5yrSurvival: 86.6,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Netherlands total current health expenditure. Mandatory private insurance (Zorgverzekeringswet) with government regulation; closer to a managed-market model.",
			caveat:
				"Often cited as evidence that universal coverage doesn't require single-payer. Lower spend than UK, better outcomes; the Dutch model trades single-payer simplicity for regulated competition.",
		},
	},
	{
		id: "CA",
		name: "Canada",
		emoji: "🇨🇦",
		spendPctGdp: 0.112,
		spendPerCapitaPpp: 6319,
		lifeExpectancy: 81.7,
		treatableMortality: 60,
		physiciansPerThousand: 2.72,
		bedsPerThousand: 2.49,
		nursesPerThousand: 10.06,
		breastCancer5yrSurvival: 88.6,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Canada total current health expenditure. Provincial single-payer systems (Medicare) for hospitals + physician services; private spending dominates dental, vision, prescription drugs.",
			caveat:
				"The 'closest to NHS' system structurally, with similar pressures (waiting times, workforce shortages). Comparable per-capita spend, slightly better outcomes — used as a peer benchmark in NHS reform debates.",
		},
	},
	{
		id: "AU",
		name: "Australia",
		emoji: "🇦🇺",
		spendPctGdp: 0.105,
		spendPerCapitaPpp: 6133,
		lifeExpectancy: 83.3,
		treatableMortality: 55,
		physiciansPerThousand: 4.20,
		bedsPerThousand: 3.80,
		nursesPerThousand: 13.00,
		breastCancer5yrSurvival: 89.5,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Australia total current health expenditure. Medicare (universal, federally funded) + private health insurance with means-tested government rebates.",
			caveat:
				"Mixed public/private with strong outcomes — life expectancy among OECD's highest. Often cited as a model for NHS reform that retains universal coverage while expanding private capacity.",
		},
	},
	{
		id: "JP",
		name: "Japan",
		emoji: "🇯🇵",
		spendPctGdp: 0.115,
		spendPerCapitaPpp: 5251,
		lifeExpectancy: 84.5,
		treatableMortality: 50,
		physiciansPerThousand: 2.65,
		bedsPerThousand: 12.52,
		nursesPerThousand: 12.46,
		breastCancer5yrSurvival: 89.4,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Japan total current health expenditure. Universal coverage via employer-based and national health insurance; lifestyle and demographic factors play an outsized role in outcomes.",
			caveat:
				"Highest life expectancy in OECD at moderate per-capita spend. Outcomes are partly attributable to diet, lifestyle, and social factors that the healthcare system doesn't directly produce — naive 'health system efficiency' inferences are misleading.",
		},
	},
	{
		id: "OECD",
		name: "OECD average",
		emoji: "🌐",
		spendPctGdp: 0.092,
		spendPerCapitaPpp: 4986,
		lifeExpectancy: 80.3,
		treatableMortality: 78,
		physiciansPerThousand: 3.70,
		bedsPerThousand: 4.30,
		nursesPerThousand: 9.80,
		breastCancer5yrSurvival: 85.5,
		asOf: "2022-12",
		source: OECD_HAAG,
		methodology: {
			source: OECD_HAAG,
			asOf: "2022-12",
			measure:
				"Unweighted mean across OECD member countries (currently 38). Useful as a 'rich-country baseline' but pulled by smaller economies and ex-Eastern-Bloc accession countries with very different health systems.",
			caveat:
				"The mean isn't necessarily the right comparator — UK peer-group is more naturally G7 or NW European countries, where averages are higher. Treat the OECD line as a distant reference, not a target.",
		},
	},
];

// Apply live values from World Bank (% GDP, $ PPP, life exp) AND OECD SDMX
// (treatable mortality) to the static catalog. Each country gets `isLive`
// set when at least one source returned a value. The OECD-average row stays
// static — neither source computes the OECD average directly.
interface OverrideBundle {
	wb: CountryHealthOverrideMap | null;
	mort: TreatableMortalityOverride | null;
	phys: PhysiciansOverride | null;
	beds: HospitalBedsOverride | null;
	nurses: NursesOverride | null;
	cancer: CancerSurvivalOverride | null;
}

export function applyCountryHealthOverride(
	base: readonly CountryHealth[],
	o: OverrideBundle,
): readonly CountryHealth[] {
	const anyOverride = !!(o.wb || o.mort || o.phys || o.beds || o.nurses || o.cancer);
	if (!anyOverride) return base;
	return base.map((country) => {
		const wb = o.wb?.overrides[country.id];
		const mort = o.mort?.byCountry[country.id];
		const phys = o.phys?.byCountry[country.id];
		const beds = o.beds?.byCountry[country.id];
		const nurses = o.nurses?.byCountry[country.id];
		const cancer = o.cancer?.byCountry[country.id];
		if (!wb && !mort && !phys && !beds && !nurses && !cancer) return country;

		const asOfs = [
			wb?.asOf,
			mort ? `${mort.year}-12` : undefined,
			phys ? `${phys.year}-12` : undefined,
			beds ? `${beds.year}-12` : undefined,
			nurses ? `${nurses.year}-12` : undefined,
			cancer ? `${cancer.year}-12` : undefined,
		].filter((s): s is string => typeof s === "string");
		const asOf = asOfs.sort().reverse()[0] ?? country.asOf;

		// Compose a source label naming each source that contributed.
		const labels: string[] = [];
		let sourceUrl = country.source.url;
		const addLabel = (
			present: unknown,
			source: { url: string; label: string } | undefined,
		) => {
			if (!present || !source) return;
			labels.push(source.label);
			if (labels.length === 1) sourceUrl = source.url;
		};
		addLabel(wb, o.wb?.source);
		addLabel(mort, o.mort?.source);
		addLabel(phys, o.phys?.source);
		addLabel(beds, o.beds?.source);
		addLabel(nurses, o.nurses?.source);
		addLabel(cancer, o.cancer?.source);

		return {
			...country,
			spendPctGdp: wb?.spendPctGdp ?? country.spendPctGdp,
			spendPerCapitaPpp: wb?.spendPerCapitaPpp ?? country.spendPerCapitaPpp,
			lifeExpectancy: wb?.lifeExpectancy ?? country.lifeExpectancy,
			treatableMortality: mort?.value ?? country.treatableMortality,
			physiciansPerThousand: phys?.value ?? country.physiciansPerThousand,
			bedsPerThousand: beds?.value ?? country.bedsPerThousand,
			nursesPerThousand: nurses?.value ?? country.nursesPerThousand,
			breastCancer5yrSurvival:
				cancer?.value ?? country.breastCancer5yrSurvival,
			asOf,
			source: { url: sourceUrl, label: labels.join(" + ") },
			isLive: true,
		};
	});
}

// Server-side entry point. Call from page.tsx; pass result to the panel.
export async function loadResolvedCountries(): Promise<readonly CountryHealth[]> {
	const [wb, mort, phys, beds, nurses, cancer] = await Promise.all([
		loadSource(worldBankHealthSource),
		loadSource(oecdTreatableMortalitySource),
		loadSource(oecdPhysiciansSource),
		loadSource(oecdHospitalBedsSource),
		loadSource(oecdNursesSource),
		loadSource(oecdCancerSurvivalSource),
	]);
	return applyCountryHealthOverride(COUNTRY_HEALTH, {
		wb,
		mort,
		phys,
		beds,
		nurses,
		cancer,
	});
}

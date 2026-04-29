// Major UK government spending programmes for FY2024/25, from HM Treasury's
// Public Expenditure Statistical Analyses (PESA) and supplementary sources.
// Used as the menu of programmes the user can choose to cut from in the
// trade-off engine.
//
// Each entry carries a methodology that explains *cuttability* — the
// political, legal, and operational constraints on actually reducing the
// figure. This is the substantive content; the £ value alone tells the user
// nothing about whether a cut is realistic.

import type { Methodology } from "@/lib/methodology";
import type { IncidenceMeta } from "@/lib/distribution";

export interface SpendingProgramme {
	id: string;
	name: string;
	value: number; // GBP
	asOf: string;
	source: { url: string; label: string };
	methodology: Methodology;
	// Approximate fraction of the programme that's realistically cuttable in
	// a single budget. The remainder is statutory/contractual/politically
	// untouchable. Values are illustrative — real cuttability is contested
	// and varies year-to-year — but provide a useful "you're proposing to
	// cut more than X% of this" signal in the UI.
	// Default 1.0 (fully cuttable) when omitted.
	cuttableFraction?: number;
	// Distributional incidence: where the £ value of this programme falls
	// across the income distribution. Used by the simulator's distributional
	// analysis. When omitted, the line is excluded from distributional
	// scoring and the UI flags it as "incidence not modelled."
	incidence?: IncidenceMeta;
}

const PESA = {
	url: "https://www.gov.uk/government/statistics/public-expenditure-statistical-analyses-2024",
	label: "HM Treasury PESA 2024",
} as const;

const NHS_ENGLAND_SOURCE = {
	url: "https://www.england.nhs.uk/publication/nhs-england-annual-report-and-accounts-2023-24/",
	label: "NHS England 2023/24",
} as const;

export const UK_SPENDING_PROGRAMMES: readonly SpendingProgramme[] = [
	{
		id: "state-pension",
		name: "State Pension",
		value: 138_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.05,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"Total state pension expenditure (basic + new state pension). Excludes pension credit and other top-ups.",
			alternatives: [
				{
					label: "All old-age welfare",
					value: 155_000_000_000,
					note: "Adds pension credit, attendance allowance, and other age-targeted benefits.",
				},
				{
					label: "Per pensioner",
					value: 11_000,
					note: "Roughly £11k/year average for ~12.5M pensioners.",
				},
			],
			caveat:
				"Triple lock is statutory — pensions rise by max(inflation, earnings, 2.5%). Cuts require primary legislation. The most politically protected programme on the list; demographics (rising over-65 share) drive ~2% real growth/year just to stand still.",
		},
		incidence: {
			vector: [0.05, 0.10, 0.15, 0.16, 0.16, 0.14, 0.11, 0.08, 0.04, 0.01],
			note: "Pensioner households cluster in deciles 3–7 of the income distribution (state pension is most of total income for these households). Bottom decile pensioners often qualify for pension credit but receive smaller state pension if they have incomplete NI records.",
			source: PESA,
		},
	},
	{
		id: "working-age-welfare",
		name: "working-age welfare (UC, disability, housing)",
		value: 140_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.1,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"Universal Credit + legacy benefits + disability benefits (PIP, ESA) + housing benefit. Excludes state pension and pension credit.",
			alternatives: [
				{
					label: "UC alone",
					value: 60_000_000_000,
					note: "Universal Credit only.",
				},
				{
					label: "Disability/PIP",
					value: 35_000_000_000,
					note: "Rising fastest — ~10% annually. PIP caseload up 70% since 2019.",
				},
			],
			caveat:
				"Caseload-driven, not policy-driven in the short run. Cuts require either policy changes that take 1–2 years to bite, harsh transitional rules, or the kind of conditionality reforms that historically reduce take-up rather than payments.",
		},
		incidence: {
			vector: [0.30, 0.25, 0.18, 0.12, 0.07, 0.04, 0.02, 0.01, 0.01, 0.0],
			note: "Working-age welfare is heavily targeted at the bottom 5 deciles. Bottom decile receives ~30% of the total — cuts here are sharply regressive. The cleanest example of a programme whose distributional impact dominates the political case for or against changes.",
			source: PESA,
		},
	},
	{
		id: "nhs-england",
		name: "NHS England",
		value: 165_000_000_000,
		asOf: "2024-04",
		source: NHS_ENGLAND_SOURCE,
		cuttableFraction: 0.05,
		methodology: {
			source: NHS_ENGLAND_SOURCE,
			asOf: "2024-04",
			measure:
				"NHS England programme spending (mandate funding). Excludes DHSC central, public health grant, training, and devolved nation NHS bodies.",
			alternatives: [
				{
					label: "DHSC total",
					value: 200_000_000_000,
					note: "Adds DHSC admin, public health grant, training, capital. The number people often mean by 'NHS budget'.",
				},
				{
					label: "Per UK person",
					value: 2415,
					note: "£165bn / 68.3M residents.",
				},
			],
			caveat:
				"From FY26/27 NHS England is being absorbed into DHSC; this category may not exist as a separate line then. Demographic pressure pushes baseline ~3% real growth required to maintain current quality.",
		},
		incidence: {
			vector: [0.13, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.08, 0.08, 0.08],
			note: "NHS use is roughly flat across deciles in £ terms but slightly progressive: lower deciles use more secondary care (worse health outcomes) while higher deciles use more elective procedures. Treated here as mildly progressive on use; private health spending separately covers the gap for top deciles.",
			source: NHS_ENGLAND_SOURCE,
		},
	},
	{
		id: "education",
		name: "education",
		value: 92_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.1,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"DfE spending including schools, FE, HE, early years. Excludes student loan accounting (RAB charge moved outside spending in 2023).",
			alternatives: [
				{
					label: "Schools alone",
					value: 60_000_000_000,
					note: "Per-pupil ~£7k in state schools.",
				},
			],
			caveat:
				"Schools spend is mostly devolved to local authorities and academy trusts — central government controls funding formulas, not operations. Cuts need 1+ year to flow through and hit the most politically visible service in the country.",
		},
		incidence: {
			vector: [0.13, 0.13, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.06, 0.05],
			note: "Households with school-age children skew toward bottom-middle deciles (correlation between fertility and income). Top deciles have a higher private school share (~7% nationally, much higher at top). Higher education spending is more evenly distributed; the overall pattern is mildly progressive.",
			source: PESA,
		},
	},
	{
		id: "net-debt-interest",
		name: "net debt interest",
		value: 90_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.0,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"Net interest paid on UK gilts and Treasury bills, after intra-government flows.",
			alternatives: [
				{
					label: "Gross interest",
					value: 100_000_000_000,
					note: "Before deducting interest the government earns on its own holdings.",
				},
				{
					label: "RPI-indexed gilt cost",
					note: "~25% of UK debt is RPI-indexed, so interest swings £10bn+ in a year on inflation moves.",
				},
			],
			caveat:
				"This is not discretionary. 'Cutting' it requires lower borrowing OR lower gilt yields OR lower inflation (RPI gilts). Treating it as a cut lever is misleading — but excluding it would understate fiscal pressure.",
		},
	},
	{
		id: "defence",
		name: "defence",
		value: 54_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.2,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"MoD core budget. Excludes intelligence agencies (~£3bn) and some hidden lines.",
			alternatives: [
				{
					label: "NATO 2% measure",
					value: 60_000_000_000,
					note: "NATO definition includes some lines outside MoD (pensions, intelligence).",
				},
				{
					label: "Pledged 2.5% by 2030",
					value: 75_000_000_000,
					note: "Implies ~£20bn rise above current trajectory.",
				},
			],
			caveat:
				"NATO 2%-of-GDP commitment is politically binding and the UK has pledged 2.5% by 2030. Cuts incompatible with NATO commitments without serious diplomatic damage; raising looks more likely than cutting given the security environment.",
		},
		incidence: {
			vector: [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10],
			note: "Defence is a pure public good — every household benefits roughly equally from national security. Modelled as flat across deciles. Some economists argue it's mildly regressive (top decile has more property to defend) but the standard convention is flat.",
			source: PESA,
		},
	},
	{
		id: "police-justice",
		name: "police and criminal justice",
		value: 52_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.15,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"Home Office police funding + Ministry of Justice (courts, prisons, legal aid).",
			caveat:
				"Operational pressures are rising (prison overcrowding, court backlog, rising violent crime) and recent funding rises haven't kept pace with caseload. Cuts here historically result in service collapse rather than savings.",
		},
		incidence: {
			vector: [0.13, 0.12, 0.12, 0.11, 0.10, 0.09, 0.09, 0.08, 0.08, 0.08],
			note: "Crime victimisation falls disproportionately on bottom deciles (urban poor and disadvantaged areas), so police and justice services benefit them more on average. Modelled as mildly progressive.",
			source: PESA,
		},
	},
	{
		id: "local-govt-grants",
		name: "local government central grants",
		value: 40_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.05,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"Central government grants to English local authorities. Excludes business rates retention and council tax (raised locally).",
			caveat:
				"Already cut ~40% in real terms since 2010. Further cuts likely trigger Section 114 (effective bankruptcy) notices — Birmingham, Croydon, Thurrock, Woking have already issued these. Technically possible to cut, politically explosive, and costs central government in the medium term as services collapse.",
		},
		incidence: {
			vector: [0.20, 0.18, 0.15, 0.12, 0.10, 0.08, 0.07, 0.05, 0.03, 0.02],
			note: "Means-tested local services (social care, homelessness, children's services) are heavily used by lower deciles. Cuts to local government grants are sharply regressive in their service-impact terms — though the political-economy effects compound across all deciles via collapsing infrastructure.",
			source: PESA,
		},
	},
	{
		id: "transport",
		name: "transport",
		value: 35_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.3,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"DfT spending including HS2, roads, rail subsidy, transport infrastructure. Capital + resource combined.",
			alternatives: [
				{
					label: "Capital only",
					value: 25_000_000_000,
					note: "HS2, road building, rail enhancements. The 'cuttable' part — but with sunk-cost penalties on cancellations.",
				},
				{
					label: "Resource only",
					value: 10_000_000_000,
					note: "Mostly rail operating subsidy. Locked into multi-year contracts.",
				},
			],
			caveat:
				"Mix of capital projects (cuttable but with high sunk-cost penalties on cancellation) and contractual subsidies (rail operators) that can't be cut quickly.",
		},
		incidence: {
			vector: [0.07, 0.08, 0.10, 0.11, 0.12, 0.12, 0.12, 0.11, 0.09, 0.08],
			note: "Roughly flat across deciles in £ terms, slightly progressive on use (lower deciles use buses/trains more; top deciles use roads more, plus disproportionate benefit from airport infrastructure and HS2-style rail).",
			source: PESA,
		},
	},
	{
		id: "international-aid",
		name: "international aid (ODA)",
		value: 15_000_000_000,
		asOf: "2024-04",
		source: PESA,
		cuttableFraction: 0.5,
		methodology: {
			source: PESA,
			asOf: "2024-04",
			measure:
				"ODA (Official Development Assistance) total spending across FCDO and other departments.",
			caveat:
				"0.7% of GNI is statutory commitment; in practice spending was cut to 0.5% in 2020 and remains there. The 0.7% pledge is in primary legislation — formally restoring it requires returning to the statutory level. Politically, the easiest line on this list to cut further but with reputational and soft-power costs.",
		},
	},
];

export const getProgramme = (id: string): SpendingProgramme =>
	UK_SPENDING_PROGRAMMES.find((p) => p.id === id) ??
	UK_SPENDING_PROGRAMMES[0]!;

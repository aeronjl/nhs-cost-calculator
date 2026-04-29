import type { Currency } from "@/lib/currency";
import type { Methodology } from "@/lib/methodology";
import { loadDynamicCost } from "@/data/sources/dynamic-costs";

// Costs are recorded in their NATIVE currency. Conversion happens at display
// time via the helpers in `@/lib/currency`. When you change a value, update
// `asOf` to the new vintage so stale entries are easy to spot.

export interface Comparison {
	id: string;
	name: string;
	pluralName: string;
	cost: number; // Static fallback when `dynamic` is set, otherwise the canonical value
	nativeCurrency: Currency;
	emoji: string;
	quantity: number;
	categories: readonly string[];
	source?: { url: string; label?: string };
	asOf: string; // YYYY-MM (or fallback asOf when `dynamic` is set)

	// Tag to opt out of the freshness CI gate. Use only for one-off historical
	// events where the figure won't move (e.g. coronation costs).
	historical?: boolean;

	// Marks the cost as live-fetched. The server tries the matching source from
	// `DYNAMIC_COST_SOURCES`; on success, `cost`, `asOf`, and `source` are
	// overlaid by the override values. On failure, the static fallback wins.
	// Dynamic entries are exempt from the freshness gate (the source is
	// expected to keep them fresh; the static fallback is best-effort).
	dynamic?: { sourceId: string };

	methodology: Methodology;
}

// Catalog entries plus a resolved-at-runtime `isLive` flag. The client/UI uses
// this to render provenance badges. Static entries always have `isLive: false`;
// dynamic entries are `true` only when the source actually returned a value.
export type ResolvedComparison = Comparison & { isLive: boolean };

// NB: the headline NHS England budget and its programme-budgeting breakdown
// live in `@/data/nhs-budget`. This file is the comparison catalog only.

export const COMPARISONS: readonly Comparison[] = [
	{
		id: "hinkley-point-c",
		name: "Hinkley Point C-style nuclear plant",
		pluralName: "Hinkley Point C-style nuclear plants",
		cost: 32_000_000_000,
		nativeCurrency: "GBP",
		emoji: "☢️",
		quantity: 1,
		categories: ["Top", "Energy"],
		source: { url: "https://ukfoundations.co/", label: "UK Foundations" },
		asOf: "2024-11",
		methodology: {
			source: { url: "https://ukfoundations.co/", label: "UK Foundations" },
			asOf: "2024-11",
			measure:
				"All-in capex of Hinkley Point C, current government estimate. The headline UK reference for 'a new gigawatt-scale nuclear plant'.",
			alternatives: [
				{
					label: "Original 2016 estimate",
					value: 18_000_000_000,
					note: "Base contract figure; the rise to £32bn reflects construction overruns.",
				},
				{
					label: "Sizewell C target",
					value: 25_000_000_000,
					note: "Government's planned successor; aims to be cheaper than Hinkley.",
				},
				{
					label: "South Korean cost basis",
					value: 5_300_000_000,
					note: "Same reactor class built at Korean construction efficiency. The gap is the policy question.",
				},
			],
			caveat:
				"Hinkley costs are notorious — building more like this is precisely what UK Foundations argues is the wrong question. Cheaper builds are achievable; the framing 'how many Hinkleys?' bakes in UK construction inefficiency.",
		},
	},
	{
		id: "south-korean-nuclear",
		name: "South Korean-style nuclear plant",
		pluralName: "South Korean-style nuclear plants",
		cost: 5_300_000_000,
		nativeCurrency: "GBP",
		emoji: "⚡",
		quantity: 1,
		categories: ["Energy"],
		source: { url: "https://ukfoundations.co/", label: "UK Foundations" },
		asOf: "2024-11",
		methodology: {
			source: { url: "https://ukfoundations.co/", label: "UK Foundations" },
			asOf: "2024-11",
			measure:
				"Approximate UK-equivalent cost of an APR-1400 reactor build at Korean construction efficiency, as a counterfactual to Hinkley.",
			alternatives: [
				{
					label: "Hinkley Point C (UK reality)",
					value: 32_000_000_000,
					note: "Same reactor class, ~6× the cost.",
				},
			],
			caveat:
				"Assumes UK could replicate Korean labour costs and construction timelines. UK regulatory regime is materially different; recent UK builds have been dramatically more expensive than the Korean comparator. The figure illustrates a possibility ceiling, not a current capability.",
		},
	},
	{
		id: "hs2-mile",
		name: "mile of HS2",
		pluralName: "miles of HS2",
		cost: 396_000_000,
		nativeCurrency: "GBP",
		emoji: "🚅",
		quantity: 10,
		categories: ["Top", "Transport"],
		source: {
			url: "https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
			label: "Sam Dumitriu",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
				label: "Sam Dumitriu",
			},
			asOf: "2024-11",
			measure:
				"Estimated cost per mile of HS2 main line, derived from total programme cost ÷ route length. Uses the 2019 cost projection.",
			alternatives: [
				{
					label: "Recent estimates",
					value: 500_000_000,
					note: "Per-mile figures have risen toward £500m+ as the programme has been rescoped and curtailed.",
				},
				{
					label: "Crossrail (London)",
					value: 320_000_000,
					note: "~£200m/km; UK rail builds are systematically more expensive than continental peers.",
				},
			],
			caveat:
				"Per-mile is a simplification — fixed costs (stations, depots, tunnelling) don't scale linearly with route length. The figure understates the true marginal cost of extending HS2.",
		},
	},
	{
		id: "french-tram-km",
		name: "km of French-style tram system",
		pluralName: "km of French-style tram systems",
		cost: 20_000_000,
		nativeCurrency: "GBP",
		emoji: "🚊",
		quantity: 50,
		categories: ["Top", "Transport"],
		source: {
			url: "https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
			label: "Sam Dumitriu",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
				label: "Sam Dumitriu",
			},
			asOf: "2024-11",
			measure:
				"Approximate construction cost per kilometre of a French-style modern light-rail tramway.",
			alternatives: [
				{
					label: "Recent UK tram builds",
					value: 60_000_000,
					note: "UK builds (Edinburgh, Manchester) have run ~3× the French rate.",
				},
			],
			caveat:
				"Cost is highly route-dependent (urban vs greenfield, viaducts, junction density). The 'French rate' is a benchmark of what's possible at competent construction; UK delivery has been substantially more expensive in practice.",
		},
	},
	{
		id: "new-home",
		name: "new home",
		pluralName: "new homes",
		cost: 250_000,
		nativeCurrency: "GBP",
		emoji: "🏠",
		quantity: 10_000,
		categories: ["Top", "Housing"],
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.gov.uk/government/statistics/uk-house-price-index",
				label: "UK House Price Index (illustrative)",
			},
			asOf: "2024-11",
			measure:
				"Approximate average UK new-build construction cost (excluding land). Used as a 'cost to deliver one new home' benchmark for housing-policy framings.",
			alternatives: [
				{
					label: "Including land (sale price proxy)",
					value: 350_000,
					note: "Land typically 30–50% of new-build sale price; the figure excludes it.",
				},
				{
					label: "London new-build",
					value: 500_000,
					note: "Construction-only; London land is multiples higher again.",
				},
				{
					label: "Regional new-build",
					value: 180_000,
					note: "North East and similar lower-cost regions.",
				},
			],
			caveat:
				"Excludes land value (often >50% of sale price), planning costs, and supporting infrastructure. The 'how many homes for £X?' framing in housing-policy debates almost always means construction-only — a simplification that can dramatically understate the real cost of new-build supply.",
		},
	},
	{
		id: "world-class-research-year",
		name: "year of world-class research",
		pluralName: "years of world-class research",
		cost: 1_000_000,
		nativeCurrency: "USD",
		emoji: "🔬",
		quantity: 100,
		categories: ["Research"],
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.ukri.org/",
				label: "UKRI grant ranges (illustrative)",
			},
			asOf: "2024-11",
			measure:
				"Order-of-magnitude annual budget for a leading academic research lab — PI salary, postdocs, students, equipment, overheads.",
			alternatives: [
				{
					label: "Theoretical math/CS",
					value: 200_000,
					note: "Mostly salaries + light compute; per-year cost much lower.",
				},
				{
					label: "Wet lab biology",
					value: 2_000_000,
					note: "Equipment, reagents, animal facilities push costs higher.",
				},
				{
					label: "Frontier AI lab",
					value: 50_000_000,
					note: "Compute + headcount makes academic research-lab benchmarks irrelevant for AI.",
				},
			],
			caveat:
				"'World-class research' has no single price tag — costs vary 100× across fields. The figure is a midpoint placeholder. For policy framings, lab-by-lab grant data (UKRI awards) is much more meaningful.",
		},
	},
	{
		id: "crispr-experiment",
		name: "CRISPR gene-editing experiment",
		pluralName: "CRISPR gene-editing experiments",
		cost: 100_000,
		nativeCurrency: "USD",
		emoji: "🧬",
		quantity: 1_000,
		categories: ["Top", "Research"],
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.nature.com/articles/d41586-022-00475-y",
				label: "Nature commentary (illustrative)",
			},
			asOf: "2024-11",
			measure:
				"Approximate cost of a single CRISPR gene-editing experiment in an academic lab — reagents, sequencing, validation.",
			alternatives: [
				{
					label: "Simple knockout",
					value: 10_000,
					note: "Routine work in established labs.",
				},
				{
					label: "Therapeutic application",
					value: 1_000_000,
					note: "Clinical-grade development with safety + efficacy validation.",
				},
			],
			caveat:
				"Wide variation by experiment type and cell line. The figure is a midpoint suitable for 'how many CRISPR experiments would £X buy?' framings; not a price tag for any specific protocol.",
		},
	},
	{
		// 2020-era fallback. Frontier training runs are now $100m–$1bn+.
		// Live source: set AI_TRAINING_COST_DATA_URL to a JSON of shape
		// { value, asOf, source? }. Recommended primary: Epoch AI's "Notable
		// Models" dataset, post-processed to the latest 12-month max.
		id: "ai-training-run",
		name: "advanced AI training run",
		pluralName: "advanced AI training runs",
		cost: 1_000_000,
		nativeCurrency: "USD",
		emoji: "🤖",
		quantity: 100,
		categories: ["Top", "AI"],
		asOf: "2020-01",
		dynamic: { sourceId: "ai-training-cost" },
		methodology: {
			source: {
				url: "https://epoch.ai/data/ai-models",
				label: "Epoch AI · Notable AI Models",
			},
			asOf: "2020-01",
			measure:
				"Cost of a single frontier AI model training run, current most-recent frontier model from Epoch's Notable Models dataset (when live source is reachable). Static fallback is the 2020-era figure.",
			alternatives: [
				{
					label: "GPT-4-class (2023)",
					value: 78_000_000,
					note: "Public estimates from training-cost analyses.",
				},
				{
					label: "GPT-3-class (2020)",
					value: 4_000_000,
					note: "What '$1m training run' approximated at the time.",
				},
				{
					label: "Marginal vs. capital",
					note: "Cost per training run excludes pre-training research, infra capex, and fine-tuning rounds. The 'all-in' cost of frontier model development is an order of magnitude higher.",
				},
			],
			caveat:
				"Training-cost estimates have ±0.5–1 OOM uncertainty per individual model. The Epoch dataset is the best public reference but extrapolations beyond the most recent frontier release are speculative.",
		},
	},
	{
		id: "coronation-charles-iii",
		name: "coronation of King Charles III",
		pluralName: "coronations of King Charles III",
		cost: 72_000_000,
		nativeCurrency: "GBP",
		emoji: "🤴",
		quantity: 1,
		categories: ["Politics"],
		source: {
			url: "https://www.bbc.co.uk/news/articles/c04lyddv2p5o",
			label: "BBC",
		},
		asOf: "2023-05", // The coronation itself, May 2023.
		historical: true,
		methodology: {
			source: {
				url: "https://www.bbc.co.uk/news/articles/c04lyddv2p5o",
				label: "BBC",
			},
			asOf: "2023-05",
			measure:
				"Reported cost of King Charles III's coronation in May 2023, per BBC reporting on the official figure.",
			caveat:
				"Historical event; figure is fixed and won't update. Some commentators have argued the true cost is higher when including security and indirect public-services costs.",
		},
	},
	{
		// Citation is gross profit, so the label needs to match. Was previously
		// labelled "year of profit" which would be net profit (~$10.7bn).
		id: "coca-cola-gross-profit",
		name: "year of gross profit for the Coca-Cola Company",
		pluralName: "years of gross profit for the Coca-Cola Company",
		cost: 28_021_000_000,
		nativeCurrency: "USD",
		emoji: "🥤",
		quantity: 1,
		categories: ["Business"],
		source: {
			url: "https://www.macrotrends.net/stocks/charts/KO/cocacola/gross-profit",
			label: "Macrotrends",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.macrotrends.net/stocks/charts/KO/cocacola/gross-profit",
				label: "Macrotrends",
			},
			asOf: "2024-11",
			measure:
				"Coca-Cola Company's annual gross profit (revenue minus cost of goods sold). Used as a 'what corporate might looks like' framing.",
			alternatives: [
				{
					label: "Net profit",
					value: 10_700_000_000,
					note: "After all expenses; ~38% of gross profit. Often what people mean colloquially by 'profit'.",
				},
				{
					label: "Annual revenue",
					value: 47_000_000_000,
					note: "Top-line sales. Different question again.",
				},
			],
			caveat:
				"Gross profit ≠ net profit. The £-to-$ conversion uses live FX, but the figure itself is in 2023 USD as Coca-Cola reports.",
		},
	},
	{
		id: "uk-salary-year",
		name: "average annual full-time salary for a UK employee",
		pluralName: "average annual full-time salaries for UK employees",
		cost: 37_430,
		nativeCurrency: "GBP",
		emoji: "💼",
		quantity: 1,
		categories: ["Top", "Politics", "Business"],
		source: {
			url: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2024",
			label: "ONS ASHE 2024",
		},
		asOf: "2024-10",
		methodology: {
			source: {
				url: "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2024",
				label: "ONS ASHE 2024",
			},
			asOf: "2024-10",
			measure:
				"ONS Annual Survey of Hours and Earnings, mean gross annual full-time UK earnings.",
			alternatives: [
				{
					label: "Median full-time",
					value: 35_000,
					note: "Better measure of 'typical' UK earner — mean is pulled up by high earners.",
				},
				{
					label: "Median including part-time",
					value: 30_000,
					note: "Lower again; ~28% of UK workforce is part-time.",
				},
				{
					label: "London median",
					value: 47_000,
					note: "Geographic variation is large. Per-region figures matter for local-policy framings.",
				},
			],
			caveat:
				"Mean ≠ median; for 'typical worker' framings, median is more representative. Median is also the figure HMRC uses for income-tax band calibration.",
		},
	},
	{
		id: "hs2-bat-tunnel",
		name: "bat-protective tunnel for HS2",
		pluralName: "bat-protective tunnels for HS2",
		cost: 100_000_000,
		nativeCurrency: "GBP",
		emoji: "🦇",
		quantity: 1,
		categories: ["Transport"],
		source: {
			url: "https://www.bbc.com/news/articles/c9wryxyljglo",
			label: "BBC",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.bbc.com/news/articles/c9wryxyljglo",
				label: "BBC",
			},
			asOf: "2024-11",
			measure:
				"Reported cost of HS2's 1km bat-protective shed at Sheephouse Wood, Buckinghamshire, frequently cited as an emblem of UK environmental cost overruns.",
			caveat:
				"Cited figure includes only the structure itself. Total HS2 environmental mitigation costs run into £100m+ across multiple sites. Whether the figure is 'absurd' or 'necessary protection' depends on the policy frame.",
		},
	},
	{
		// Stored natively in USD (the previous code had pasted the dollar
		// figure into the GBP field). Recommended live source: BLS API series
		// CES0500000003 (avg hourly earnings) annualised, or LEU0252881500
		// (median weekly × 52). Set US_SALARY_DATA_URL to a JSON document of
		// shape { value, asOf, source? }.
		id: "us-salary-year",
		name: "average annual full-time salary for a US employee",
		pluralName: "average annual full-time salaries for US employees",
		cost: 61_963,
		nativeCurrency: "USD",
		emoji: "💵",
		quantity: 1,
		categories: ["Politics", "Business"],
		source: {
			url: "https://www.statista.com/topics/789/wages-and-salary/",
			label: "Statista",
		},
		asOf: "2022-12",
		dynamic: { sourceId: "us-median-salary" },
		methodology: {
			source: {
				url: "https://www.bls.gov/cps/cpsearnings.htm",
				label: "BLS Median weekly earnings",
			},
			asOf: "2022-12",
			measure:
				"US median full-time wage and salary earnings, BLS series LEU0252881500 weekly × 52. Live source picks the most recent annual estimate.",
			alternatives: [
				{
					label: "Mean rather than median",
					value: 75_000,
					note: "Higher; pulled up by top earners. BLS publishes both.",
				},
				{
					label: "Household income (median)",
					value: 80_000,
					note: "Different question — combined household earnings rather than individual.",
				},
			],
			caveat:
				"Static fallback is 2022 vintage; the live BLS source updates quarterly with annual rollups. Monthly figures can swing on shutdowns (Oct 2025 was unavailable due to a federal shutdown).",
		},
	},
	{
		// Stored natively in USD ($100m). Previously hardcoded as £80m using a
		// frozen ~1.25 conversion that drifts as FX moves.
		id: "spacex-starship-launch",
		name: "launch of a SpaceX Starship",
		pluralName: "launches of a SpaceX Starship",
		cost: 100_000_000,
		nativeCurrency: "USD",
		emoji: "🚀",
		quantity: 1,
		categories: ["Top", "Space"],
		source: {
			url: "https://payloadspace.com/payload-research-detailing-artemis-vehicle-rd-costs/",
			label: "Payload",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://payloadspace.com/payload-research-detailing-artemis-vehicle-rd-costs/",
				label: "Payload",
			},
			asOf: "2024-11",
			measure:
				"Approximate per-launch cost of SpaceX Starship at current operational tempo, including amortized R&D.",
			alternatives: [
				{
					label: "Marginal launch cost",
					value: 30_000_000,
					note: "Estimated cost of an additional flight excluding R&D, when the system is mature and reusable.",
				},
				{
					label: "All-in lifecycle (incl. R&D)",
					value: 500_000_000,
					note: "Including total program development cost amortized over expected flights.",
				},
				{
					label: "NASA SLS comparison",
					value: 2_000_000_000,
					note: "Roughly per-launch cost of NASA's Space Launch System — a useful benchmark.",
				},
			],
			caveat:
				"Per-launch cost depends heavily on assumptions about reusability and amortization horizon. SpaceX figures aren't audited; commentary on actual costs varies by orders of magnitude.",
		},
	},
	{
		id: "uk-defence-year",
		name: "year of UK defence spending",
		pluralName: "years of UK defence spending",
		cost: 54_000_000_000,
		nativeCurrency: "GBP",
		emoji: "🛡️",
		quantity: 1,
		categories: ["Defence"],
		source: {
			url: "https://commonslibrary.parliament.uk/research-briefings/cbp-8175",
			label: "House of Commons Library",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://commonslibrary.parliament.uk/research-briefings/cbp-8175",
				label: "House of Commons Library",
			},
			asOf: "2024-11",
			measure:
				"MoD core budget. Same figure used in the trade-off engine's 'cut defence' lever — see that programme's methodology for cuttability constraints.",
			alternatives: [
				{
					label: "NATO 2% measure",
					value: 60_000_000_000,
					note: "Includes some lines outside MoD core (intelligence, war pensions).",
				},
				{
					label: "Pledged 2.5% by 2030",
					value: 75_000_000_000,
					note: "Politically committed direction of travel, ~£20bn above current.",
				},
			],
			caveat:
				"NATO 2% is politically binding; cutting defence requires withdrawing or renegotiating that commitment. Practical 'spend a year of defence budget on X' is a real fiscal trade-off, but politically constrained.",
		},
	},
	{
		id: "type-26-frigate",
		name: "Type 26 frigate",
		pluralName: "Type 26 frigates",
		cost: 525_000_000,
		nativeCurrency: "GBP",
		emoji: "🛳️",
		quantity: 1,
		categories: ["Defence"],
		source: {
			url: "https://www.gov.uk/government/news/british-shipyard-awarded-42-billion-to-build-royal-navy-ships",
			label: "gov.uk",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://www.gov.uk/government/news/british-shipyard-awarded-42-billion-to-build-royal-navy-ships",
				label: "gov.uk",
			},
			asOf: "2024-11",
			measure:
				"Per-frigate cost from the £4.2bn 8-frigate Type 26 contract awarded to BAE Systems.",
			caveat:
				"Government's per-unit figure; programme has had documented cost overruns and the 'unit cost' interpretation depends on whether you include training, spares, and lifetime support — usually not in the headline figure.",
		},
	},
	{
		// Live source: World Bank `GC.TAX.TOTL.CN` (Tax revenue, current LCU)
		// for the UK. Note that this measure excludes social contributions
		// (NICs), so the live value will be lower than the HMRC fallback. See
		// `src/data/sources/uk-tax-revenue.ts` for the rationale.
		id: "uk-tax-revenue-year",
		name: "year of tax revenue for the UK government",
		pluralName: "years of tax revenue for the UK government",
		cost: 829_100_000_000,
		nativeCurrency: "GBP",
		emoji: "🇬🇧",
		quantity: 1,
		categories: ["Politics"],
		source: {
			url: "https://www.gov.uk/government/statistics/hmrc-tax-and-nics-receipts-for-the-uk/hmrc-tax-receipts-and-national-insurance-contributions-for-the-uk-new-annual-bulletin",
			label: "HMRC (FY24/25)",
		},
		asOf: "2024-04",
		dynamic: { sourceId: "uk-tax-revenue" },
		methodology: {
			source: {
				url: "https://www.gov.uk/government/statistics/hmrc-tax-and-nics-receipts-for-the-uk/hmrc-tax-receipts-and-national-insurance-contributions-for-the-uk-new-annual-bulletin",
				label: "HMRC (FY24/25 fallback) · World Bank GC.TAX.TOTL.CN (live)",
			},
			asOf: "2024-04",
			measure:
				"Total UK tax revenue — broad measure including income tax, NICs, VAT, corp tax, etc. Static fallback uses HMRC's 'tax + NICs receipts' (broader). Live source is World Bank's tax-revenue measure (narrower; excludes NICs).",
			alternatives: [
				{
					label: "Excluding NICs (World Bank)",
					value: 777_000_000_000,
					note: "World Bank's measure separates social contributions; the live figure here.",
				},
				{
					label: "Including all government revenue",
					value: 1_100_000_000_000,
					note: "Adds non-tax revenue (Crown estates, gilt sales, asset sales).",
				},
			],
			caveat:
				"The 'UK tax revenue' frame is contested. HMRC's measure (£829bn) is what most UK readers expect; World Bank's measure (£777bn) is the live source available, narrower by NICs. The override's source label flags which is currently shown.",
		},
	},
	{
		id: "dogger-bank-reclamation",
		name: "reclamation of Dogger Bank from the sea",
		pluralName: "reclamations of Dogger Bank from the sea",
		cost: 97_500_000_000,
		nativeCurrency: "GBP",
		emoji: "🧜",
		quantity: 1,
		categories: ["Politics", "Housing"],
		source: {
			url: "https://model-thinking.com/p/a-new-atlantis",
			label: "Model Thinking",
		},
		asOf: "2024-11",
		methodology: {
			source: {
				url: "https://model-thinking.com/p/a-new-atlantis",
				label: "Model Thinking",
			},
			asOf: "2024-11",
			measure:
				"Speculative cost of reclaiming Dogger Bank from the North Sea as new UK land mass — taken from a single think-piece on potential land-creation projects.",
			caveat:
				"Genuinely speculative — no government has costed this. The figure is one analyst's estimate based on Dutch land-reclamation cost benchmarks scaled to Dogger Bank's area. The order of magnitude is roughly defensible; the precise figure is not.",
		},
	},
];

// Server-side entry point. Resolves any `dynamic` entries against their source,
// returning a parallel array of `ResolvedComparison` carrying an `isLive` flag.
// Use this from `page.tsx` and `og/route.tsx`; never from client code.
export async function loadResolvedComparisons(): Promise<
	readonly ResolvedComparison[]
> {
	return Promise.all(
		COMPARISONS.map(async (comp): Promise<ResolvedComparison> => {
			if (!comp.dynamic) return { ...comp, isLive: false };
			const override = await loadDynamicCost(comp.dynamic.sourceId);
			if (!override) return { ...comp, isLive: false };
			return {
				...comp,
				cost: override.value,
				asOf: override.asOf,
				source: override.source ?? comp.source,
				isLive: true,
			};
		}),
	);
}

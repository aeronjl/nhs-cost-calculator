// Historical eras for the wizard. Each era carries:
//   - baseline figures the briefing screen displays (PSNB, debt:GDP, etc.)
//   - 1-2 sentence context the user gets when stepping into that period
//   - legislation overrides — fiscal levers that didn't exist yet, or whose
//     statutory protection wasn't in place.
//
// Scope caveat: this is an *educational* historical mode, not a full
// counterfactual simulator. Per-era lever yields (e.g. £6bn/pp for basic
// rate) reflect the *current* tax base, not the era's. We display era-
// specific badges and context so the user understands what was different,
// but the simulator math behind any committed scenario uses present-day
// calibration. A fuller historical simulator would carry per-era lever
// catalogues — see backlog.
//
// Sources: HM Treasury Public Spending Statistics; ONS PSF time series;
// IFS historical commentary on each budget.

import type { TaxLever } from "./levers/tax-rates";
import type { SpendingProgramme } from "./levers/uk-spending";
import type { LegislativeMeta } from "./legislation";

export type EraId = "1979" | "1988" | "2010" | "2021" | "current";

export interface EraPressure {
	label: string;
	detail: string;
}

export interface EraDefinition {
	id: EraId;
	year: number;
	label: string;
	chancellor: string;
	party: "Conservative" | "Labour" | "Coalition";
	shortContext: string;
	longContext: string;
	// 1-line caveat about the era's fiscal framing (pre-MTFS, MTFS, OBR
	// fiscal mandate, etc.). Numeric figures are derived from the era's
	// OBRBaseline (see /data/historical/era-baselines.ts) — single source
	// of truth.
	yearNote: string;
	pressures: EraPressure[];
	// Lever ids that don't exist as instruments in this era. Render with
	// a synthetic "Not yet introduced" status that hard-disables the card.
	preIntroduction?: string[];
	// Lever ids whose statutory status differs in this era. Partial overlay
	// — only the fields we want to override are merged with the base.
	legislationOverrides?: Record<string, Partial<LegislativeMeta>>;
	// Multiplier on present-day lever yields, capturing nominal-GDP scale.
	// 1979 GDP / 2024 GDP ≈ 0.076 — a 1pp rise in basic-rate IT yielded
	// ~£470m in 1979 vs ~£6bn today. Crude but legible: it gets the
	// magnitude right for "what's a percentage point worth in this era."
	// Structural differences (tax base composition, indexation rules,
	// rate structure) are second-order at this scope.
	// Source: ONS UKEA, GDP at current market prices.
	gdpScale: number;
	// Multiplier on macro coefficient for all levers in this era. Captures
	// regime-level differences in fiscal-multiplier transmission. Each era
	// carries a `multiplierSource` citing the literature behind the value.
	//
	// Applied uniformly to all levers in the era as a base scalar; the
	// finer per-lever overrides via `taxMultiplierOverrides` /
	// `programmeMultiplierOverrides` capture composition (capital spending
	// vs tax cuts respond differently to regime).
	multiplierAdjust?: number;
	multiplierSource?: { url: string; label: string; note?: string };
	// Per-lever multiplier overrides. A number gives a single blended
	// coefficient (the previous shape, preserved for back-compat). An
	// object form `{ capital, current, capitalShare? }` overrides the
	// lever's capital/current decomposition, letting an era amplify just
	// the capital component (Blanchard 2013: 2010 ZLB capital multipliers
	// ran 1.5-1.8 while current-spending multipliers stayed near 1.0).
	// `capitalShare` defaults to the lever's base share if omitted.
	taxMultiplierOverrides?: Record<
		string,
		number | { capital: number; current: number; capitalShare?: number }
	>;
	programmeMultiplierOverrides?: Record<
		string,
		number | { capital: number; current: number; capitalShare?: number }
	>;
	// Per-lever structural overrides — currentRate and currentValue at
	// this era's pre-budget starting position. The wizard uses these to
	// generate accurate subtitles ("33% → 34%" instead of "20% → 21%" in
	// 1979 mode). Only override fields that genuinely differ from current.
	// Sources: HMT Red Books for the year, IFS Green Budget commentary,
	// HMRC archive of historical rates.
	taxLeverOverrides?: Record<string, Partial<TaxLever>>;
	// Optional 1-2 sentence note rendered above the tax-choices grid in
	// non-current eras. Used to flag where the wizard's 3-band model is a
	// simplification (1979's 9-band IT system, etc.) and to surface major
	// structural features (investment income surcharge, threshold freezes
	// just announced).
	taxStructuralNote?: string;
	// Per-programme structural overrides — chiefly nominal `value` (the
	// programme's £ size in this era) and `cuttableFraction` (which shifts
	// when statutory protections didn't yet exist — defence pre-2014 NATO
	// floor, state pension pre-triple-lock, etc.). Sources: HMT PESA
	// historical, ONS public sector finances.
	programmeOverrides?: Record<string, Partial<SpendingProgramme>>;
}

const ANACHRONISM = (year: number): LegislativeMeta => ({
	status: "new-legislation",
	label: `Not yet introduced (${year})`,
	explainer:
		"This instrument doesn't exist in this era. Showing for educational contrast — using it would be anachronistic.",
	relaxation: {
		implementationMonths: 999,
		risk: "Anachronistic — instrument doesn't exist in this era",
	},
});

export const ERAS: Readonly<Record<EraId, EraDefinition>> = {
	"1979": {
		id: "1979",
		year: 1979,
		label: "1979 — Howe's emergency budget",
		chancellor: "Geoffrey Howe",
		party: "Conservative",
		shortContext: "Stagflation era; first Thatcher budget cuts top tax rate.",
		longContext:
			"June 1979 emergency budget. Howe cuts the top rate of income tax from 83% → 60% and the basic rate from 33% → 30%, while raising VAT from 8% → 15%. Inflation runs ~13%. Public Sector Borrowing Requirement (the 1979 framing of PSNB) is the central anxiety; monetarist policy is just emerging.",
		gdpScale: 0.076,
		multiplierAdjust: 0.7,
		multiplierSource: {
			url: "https://www.imf.org/en/Publications/WP/Issues/2016/12/30/The-Effectiveness-of-Fiscal-Policy-in-Stimulating-Economic-Activity-A-Review-of-the-Literature-16129",
			label: "Hemming, Kell & Mahfouz (IMF 2002) · Bruno & Sachs (1985)",
			note: "Stagflation-era multipliers fall to 0.5-0.8 range as savings rise, monetarist policy tightens transmission, and high inflation expectations erode fiscal stimulus. Bruno & Sachs's UK case study cites multipliers near 0.7 for 1979-81.",
		},
		// 1979 stagflation: high CPI passthrough on indirect taxes erodes
		// real consumer benefit from any cut. Welfare transfers eroded
		// in real terms by inflation. Capital spending vulnerable to
		// rapid cost overruns under high inflation — the asymmetric
		// damage is captured via the capital/current split.
		taxMultiplierOverrides: {
			"vat-standard": 0.3, // base 0.5 — high CPI passthrough eats stimulus
			"basic-rate-income-tax": 0.3, // base 0.5 — savings rate elevated
		},
		programmeMultiplierOverrides: {
			"working-age-welfare": 0.6, // base 0.9 — inflation erodes real value
			// Transport capital projects suffer disproportionately under
			// 1979's 13% inflation (cost overruns, stretched timelines).
			// Capital multiplier crashes; current spending still produces
			// wages. Effective ≈ 0.3×0.3 + 0.5×0.7 = 0.44.
			transport: { capital: 0.3, current: 0.5 },
			// Defence procurement under inflation: cost overruns + delays
			// shrink the multiplier. Effective ≈ 0.2×0.25 + 0.4×0.75 = 0.35.
			defence: { capital: 0.2, current: 0.4 },
		},
		yearNote:
			"Pre-MTFS. No formal fiscal rule yet — PSBR is the headline target.",
		pressures: [
			{
				label: "Inflation",
				detail: "Running ~13%; Howe pursues monetary aggregates to bring it down.",
			},
			{
				label: "Top rates",
				detail:
					"Income tax top rate at 83% — 'why bother working' political framing.",
			},
			{
				label: "Strikes",
				detail:
					"Winter of Discontent just ended; public-sector pay backlog drags on.",
			},
		],
		preIntroduction: [
			"bank-surcharge",
			"apprenticeship-levy",
			"energy-profits-levy",
			"dividend-tax",
			// Climate / digital instruments don't exist conceptually in 1979.
			"frequent-flyer-levy",
			"carbon-border-tax",
			"online-services-tax-expansion",
		],
		legislationOverrides: {
			"state-pension": {
				status: "available",
				label: "Available",
				explainer:
					"No triple lock until Pensions Act 2014. Rooker-Wise amendment (1977) requires inflation-uprating, but discretion exists.",
			},
			"international-aid": {
				status: "available",
				label: "Available",
				explainer:
					"0.7% target is a UN General Assembly resolution (1970) but not yet UK statute. Aid spending well below 0.5% in this era.",
			},
			defence: {
				status: "available",
				label: "Available (Cold War context)",
				explainer:
					"NATO 2% floor formalised only at 2014 Wales summit. Defence already ~5% GDP in 1979 due to Cold War posture.",
			},
			"freeze-personal-allowance": {
				status: "available",
				label: "Constrained by Rooker-Wise",
				explainer:
					"Rooker-Wise (1977) actually *requires* indexation of allowances. Freezing PA for fiscal drag was atypical in this era; would require explicit override.",
			},
			"vat-standard": {
				status: "available",
				label: "Available",
				explainer:
					"VAT just unified at 15% by Howe (June 1979). EU VAT framework constraints (joined 1973) shape band structure.",
			},
			// SDLT applied UK-wide in 1979 — Holyrood/Senedd didn't exist
			// (Scotland Act 1998, Wales Act 2014).
			"stamp-duty": {
				status: "available",
				label: "Available (UK-wide)",
				explainer:
					"Stamp duty applies UK-wide in 1979. Devolution of property taxation only happens with LBTT (Scotland 2015) and LTT (Wales 2018). The Treasury sets a single regime.",
			},
			// Hypothetical-lever genealogy in 1979.
			"wealth-tax": {
				status: "new-legislation",
				label: "New legislation (Crosland legacy)",
				explainer:
					"Wealth tax was debated under Wilson/Callaghan governments — Crosland's social democratic project explicitly considered it. By 1979 the political tide has turned: Thatcher-Howe agenda is libertarian (Hayek dominant). Implementation infeasible — no UK wealth registry; 1974 Labour wealth tax green paper shelved.",
			},
			"land-value-tax": {
				status: "new-legislation",
				label: "New legislation (Georgist)",
				explainer:
					"Land Value Tax is a Georgist position — fringe academic interest in 1979. No major political party advocates. Predates Mirrlees Review (2010) by three decades. Site Value Rating proposals occasionally surface in Liberal Party manifestos.",
			},
		},
		taxLeverOverrides: {
			// Pre-Howe-1979: basic 33%; multi-band higher rates from 40%
			// up to 83% on top earned income (+15pp investment income
			// surcharge for unearned). We map "higher" to 40% (the lowest
			// higher-rate band, representative of the bulk of higher-rate
			// taxpayers) and "additional" to 83% (top earned). Howe cut
			// basic to 30% and top to 60% in this very budget.
			//
			// gbpPerUnit values are per-pp yields in 1979 nominal pounds.
			// VAT is the most divergent from gdpScale (narrow consumer-
			// goods base just unified by Howe). Sources: HMT Red Book
			// 1979, IFS historical tax-receipts series, Atkinson 1995.
			"basic-rate-income-tax": {
				currentRate: 0.33,
				gbpPerUnit: 500_000_000,
				incidence: {
					// PA at £1,165 (~6% of average earnings) means almost
					// every full-time worker pays basic IT. Tax base far
					// wider than today's £12,570 PA — less top-skewed.
					vector: [0.05, 0.10, 0.13, 0.15, 0.15, 0.14, 0.12, 0.09, 0.05, 0.02],
					note: "Low PA means even bottom-decile workers paid basic IT in 1979. Distributional pattern less top-skewed than today's PA-tapered structure.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"higher-rate-income-tax": {
				currentRate: 0.4,
				gbpPerUnit: 100_000_000,
				incidence: {
					// HRT entry at ~£11,250 in 1979 ≈ 1.5× average
					// earnings. Larger middle-class higher-rate population
					// than today's £50,270 threshold.
					vector: [0, 0, 0, 0.02, 0.05, 0.08, 0.13, 0.20, 0.27, 0.25],
					note: "Lower nominal HRT meant a wider professional/middle-class higher-rate base in 1979 than today's £50,270 threshold supports.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"additional-rate-income-tax": {
				currentRate: 0.83,
				gbpPerUnit: 20_000_000,
				incidence: {
					// 83% top rate hit only the very-top earners.
					vector: [0, 0, 0, 0, 0, 0, 0, 0, 0.05, 0.95],
					note: "Top earned-income rate at 83% (98% with investment income surcharge) was concentrated almost entirely on top decile — very few payers, but politically charged.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"vat-standard": { currentRate: 0.08, gbpPerUnit: 200_000_000 },
			"corporation-tax": { currentRate: 0.52, gbpPerUnit: 200_000_000 },
			"nics-main": { currentRate: 0.065, gbpPerUnit: 400_000_000 },
			"capital-gains-tax": { currentRate: 0.3, gbpPerUnit: 20_000_000 },
			"inheritance-tax": { currentRate: 0.75, gbpPerUnit: 15_000_000 },
			"freeze-personal-allowance": { currentValue: 1_165 },
			"freeze-higher-rate-threshold": { currentValue: 11_250 },
			"raise-personal-allowance": { currentValue: 1_165 },
		},
		taxStructuralNote:
			"Pre-Howe-1979 IT had **nine bands** (33% basic; 40/45/50/55/60/65/70/75/83% higher) plus a **15pp investment income surcharge** on unearned income — pushing top effective rates to 98%. VAT had two bands (8% standard + 12.5% luxury); Howe unified to 15% in this budget. The wizard's three-rate model is a simplification.",
		programmeOverrides: {
			// 1979-80 nominal £bn. Sources: HMT PESA historical tables;
			// ONS public sector finances. NHS = whole-UK NHS (NHS England
			// didn't exist as a separate entity). Defence ~5% GDP — Cold
			// War posture, no NATO 2% floor yet so cuttableFraction much
			// higher than today's 0.20.
			"nhs-england": { value: 8_400_000_000, cuttableFraction: 0.3 },
			defence: { value: 8_600_000_000, cuttableFraction: 0.5 },
			education: { value: 9_700_000_000 },
			"state-pension": {
				value: 9_000_000_000,
				cuttableFraction: 0.4,
				incidence: {
					// Pensioner poverty was substantially higher in 1979 —
					// state pension was the main income for most pensioners
					// (occupational pensions less developed; SERPS only
					// introduced 1978). Pensioner-only households cluster
					// in bottom 3 deciles. Estimate informed by IFS
					// pensioner-poverty backseries, Atkinson 1995.
					vector: [0.18, 0.20, 0.18, 0.14, 0.10, 0.08, 0.05, 0.04, 0.02, 0.01],
					note: "1979 pensioner population is income-poor relative to today; state pension £ heavily concentrated in bottom 3 deciles. SERPS only introduced 1978; occupational pension coverage about 50% of workers vs ~80% today.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality and Distribution backseries",
					},
				},
			},
			"working-age-welfare": {
				value: 6_000_000_000,
				incidence: {
					// 1979 welfare = supplementary benefit + unemployment
					// benefit + family income supplement + housing benefit.
					// No tax credits (came 1999). No support for working
					// families. Concentrated on bottom 2 deciles.
					vector: [0.40, 0.30, 0.15, 0.08, 0.04, 0.02, 0.01, 0.0, 0.0, 0.0],
					note: "Pre-tax-credit era: welfare £ goes almost entirely to non-working / low-paid households. Bottom decile receives 40% of total — much sharper than today's UC-era distribution.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"international-aid": { value: 600_000_000, cuttableFraction: 1.0 },
			transport: { value: 3_800_000_000 },
			"local-govt-grants": { value: 8_500_000_000 },
		},
	},
	"1988": {
		id: "1988",
		year: 1988,
		label: "1988 — Lawson boom",
		chancellor: "Nigel Lawson",
		party: "Conservative",
		shortContext: "Surplus, top tax rate cut to 40%; inflation about to bite.",
		longContext:
			"March 1988 budget. Lawson cuts the top rate of income tax from 60% → 40%, leaving only the basic rate at 25% and the new higher rate at 40%. PSNB is in surplus (the 'Public Sector Debt Repayment'). Inflation has been low but the credit boom is starting; Lawson's resignation 1989 follows.",
		gdpScale: 0.196,
		multiplierAdjust: 0.9,
		multiplierSource: {
			url: "https://ifs.org.uk/publications",
			label: "IFS Green Budget 1988 commentary; Cuthbertson & Taylor (1992)",
			note: "Late-1980s UK had moderate fiscal multipliers (~0.8-1.0) — credit boom plus rising inflation expectations. Lawson's MTFS regime explicitly downplayed fiscal-policy efficacy in favour of monetary transmission.",
		},
		yearNote: "Surplus year (Public Sector Debt Repayment in 1988 framing).",
		pressures: [
			{
				label: "Inflation",
				detail: "Falling, but credit boom heating up. Risk of overshoot.",
			},
			{
				label: "Tax simplification",
				detail:
					"Lawson's 40% top rate is politically attractive but historically aggressive.",
			},
			{
				label: "ERM debate",
				detail:
					"Shadow ERM membership — domestic monetary autonomy contested (Lawson resigns 1989).",
			},
		],
		preIntroduction: [
			"bank-surcharge",
			"apprenticeship-levy",
			"energy-profits-levy",
			"dividend-tax",
			"frequent-flyer-levy",
			"carbon-border-tax",
			"online-services-tax-expansion",
		],
		legislationOverrides: {
			"state-pension": {
				status: "available",
				label: "Available",
				explainer:
					"No triple lock yet (2014). 1980s uprating practice was generally CPI-based but discretionary.",
			},
			"international-aid": {
				status: "available",
				label: "Available",
				explainer: "No 0.7% statute (Act 2015). Aid ~0.3% of GNI in this era.",
			},
			defence: {
				status: "available",
				label: "Available (Cold War end)",
				explainer:
					"Berlin Wall falls 1989. Pre-2014 NATO floor — peace dividend looming, but defence still ~4% GDP.",
			},
			"freeze-personal-allowance": {
				status: "available",
				label: "Constrained by Rooker-Wise",
				explainer:
					"1980s practice maintained Rooker-Wise indexation. Freezing as a fiscal-drag instrument is atypical pre-1990s.",
			},
			"stamp-duty": {
				status: "available",
				label: "Available (UK-wide)",
				explainer:
					"Stamp duty applies UK-wide in 1988. No devolved property-tax authorities yet (Scotland and Wales gain those only post-1999).",
			},
			"wealth-tax": {
				status: "new-legislation",
				label: "New legislation (theoretical)",
				explainer:
					"Lawson's tax-cutting agenda dominant; wealth tax remains theoretical despite Labour mooting it in opposition. Reagan-era US influence cements anti-wealth-tax orthodoxy. Implementation infrastructure no closer than 1974.",
			},
			"land-value-tax": {
				status: "new-legislation",
				label: "New legislation (academic)",
				explainer:
					"Mirrlees' early optimal-taxation work cites LVT favourably (1971 Nobel-prize-winning paper) but no political pickup. Liberal Democrats occasionally raise; Lawson's CGT-IT alignment (1988) deemed sufficient asset-tax simplification.",
			},
		},
		taxLeverOverrides: {
			// Pre-Lawson-1988: basic 27%, higher 40% (Lawson maintained 40%
			// from his 1986 reform, cut basic to 25%). No additional rate
			// in this era — the rate structure was just basic + higher.
			//
			// gbpPerUnit values are per-pp yields in 1988 nominal pounds.
			// Sources: HMT Red Book 1988, IFS Green Budget 1988 backseries.
			"basic-rate-income-tax": {
				currentRate: 0.27,
				gbpPerUnit: 1_200_000_000,
				incidence: {
					// PA at £2,605 (~12% of average earnings) — wider IT
					// base than today but narrower than 1979.
					vector: [0.03, 0.07, 0.11, 0.14, 0.15, 0.15, 0.14, 0.11, 0.07, 0.03],
					note: "Lower PA than today (£2,605 in 1988) means more bottom-decile workers in IT base. Less extreme than 1979 due to inflation-driven uprating in early 80s.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"higher-rate-income-tax": { currentRate: 0.4, gbpPerUnit: 200_000_000 },
			"additional-rate-income-tax": { currentRate: 0.4, gbpPerUnit: 50_000_000 },
			"vat-standard": { currentRate: 0.15, gbpPerUnit: 700_000_000 },
			"corporation-tax": { currentRate: 0.35, gbpPerUnit: 500_000_000 },
			"nics-main": { currentRate: 0.09, gbpPerUnit: 1_000_000_000 },
			"capital-gains-tax": { currentRate: 0.27, gbpPerUnit: 60_000_000 },
			"inheritance-tax": { currentRate: 0.4, gbpPerUnit: 50_000_000 },
			"freeze-personal-allowance": { currentValue: 2_605 },
			"freeze-higher-rate-threshold": { currentValue: 19_300 },
			"raise-personal-allowance": { currentValue: 2_605 },
		},
		taxStructuralNote:
			"Lawson's 1988 simplification cut IT down to **two bands** (25% basic + 40% higher), aligned **CGT** to the same marginal rate, and harmonised IHT at 40% (replacing Capital Transfer Tax in 1986). Pre-budget rates shown — Lawson would cut basic to 25% in this budget.",
		programmeOverrides: {
			// 1988-89 nominal £bn. Sources: HMT PESA. Berlin Wall about to
			// fall; defence still ~4% GDP. State pension uprating
			// CPI-based but discretionary — no triple lock.
			"nhs-england": { value: 25_000_000_000, cuttableFraction: 0.25 },
			defence: { value: 19_000_000_000, cuttableFraction: 0.4 },
			education: { value: 19_000_000_000 },
			"state-pension": {
				value: 21_000_000_000,
				cuttableFraction: 0.3,
				incidence: {
					// Modest improvement vs 1979 — SERPS maturing, more
					// occupational pension coverage. Still bottom-heavy.
					vector: [0.15, 0.18, 0.18, 0.15, 0.12, 0.09, 0.06, 0.04, 0.02, 0.01],
					note: "1988 pensioners better-off than 1979 (SERPS maturing) but still mostly reliant on state pension. Thatcher's 1986 Social Security Act reformed welfare structurally but didn't shift overall distributional pattern much.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"working-age-welfare": {
				value: 25_000_000_000,
				incidence: {
					// 1988 = post-1986-Social-Security-Act structure: income
					// support replaced supplementary benefit; family credit
					// (1988) replaces FIS. Still heavily bottom-decile.
					vector: [0.38, 0.28, 0.16, 0.10, 0.05, 0.02, 0.01, 0.0, 0.0, 0.0],
					note: "1988 reforms (Income Support, Family Credit) introduce some support for low-paid workers but pre-tax-credit era. Distribution still very bottom-decile concentrated.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality backseries",
					},
				},
			},
			"international-aid": { value: 1_500_000_000, cuttableFraction: 1.0 },
			transport: { value: 4_500_000_000 },
			"local-govt-grants": { value: 15_000_000_000 },
		},
	},
	"2010": {
		id: "2010",
		year: 2010,
		label: "2010 — Osborne austerity begins",
		chancellor: "George Osborne",
		party: "Coalition",
		shortContext: "Post-crisis £155bn deficit; austerity programme launches.",
		longContext:
			"June 2010 emergency budget. Osborne raises VAT from 17.5% → 20%, freezes income tax thresholds, and announces £11bn of welfare cuts. PSNB at peak (£155bn, ~10% GDP). New OBR established to provide independent forecasts. Coalition's fiscal mandate: cyclically-adjusted current balance within 5 years.",
		gdpScale: 0.620,
		multiplierAdjust: 1.3,
		multiplierSource: {
			url: "https://www.imf.org/external/pubs/ft/wp/2013/wp1301.pdf",
			label: "Blanchard & Leigh (IMF 2013) · OBR Forecast Evaluation Reports",
			note: "Blanchard-Leigh's landmark finding: post-crisis fiscal multipliers were systematically understated — true values 1.5-1.7 vs IMF baseline of ~0.5. Zero-lower-bound monetary policy + economic slack amplifies fiscal transmission. OBR retrospectively raised its multiplier assumptions accordingly.",
		},
		// 2010 ZLB: capital spending and transfer multipliers most amplified
		// (Blanchard 2013). Tax cuts less amplified (savings rate rose
		// post-crisis as households deleveraged). Where the programme has
		// a meaningful capital share, the override uses the capital/current
		// split form so capital is amplified more than current spending —
		// the structural reason transport's multiplier rises more than NHS's.
		taxMultiplierOverrides: {
			"basic-rate-income-tax": 0.55, // base 0.5 — modest amplification
			"higher-rate-income-tax": 0.45, // base 0.4
			"vat-standard": 0.7, // base 0.5 — VAT cut helps liquidity-constrained
		},
		programmeMultiplierOverrides: {
			// Transport (30% capital): capital ZLB-amplified to 1.8;
			// current-spending amplification more modest (1.0). Blended
			// effective coefficient ≈ 1.8×0.3 + 1.0×0.7 = 1.24.
			transport: { capital: 1.8, current: 1.0 },
			// Defence (25% capital): capital-heavy procurement amplified;
			// current ops less so. Effective ≈ 1.5×0.25 + 0.7×0.75 = 0.90.
			defence: { capital: 1.5, current: 0.7 },
			// Education (10% capital): school builds ZLB-amplified;
			// teacher wages get smaller boost. Effective ≈ 1.4×0.10 +
			// 1.05×0.90 = 1.085.
			education: { capital: 1.4, current: 1.05 },
			// Local govt grants (10% capital): council capital DEL
			// amplified more than front-line services. Effective ≈
			// 1.5×0.10 + 1.15×0.90 = 1.185.
			"local-govt-grants": { capital: 1.5, current: 1.15 },
			// NHS-england: capital share is small (5%) so split impact is
			// muted. Use scalar override for simplicity.
			"nhs-england": 1.0, // base 0.6 — wages-intensive, slack amplified
			"working-age-welfare": 1.4, // base 0.9 — transfers in slack (~0% capital)
			"state-pension": 0.8, // base 0.6 (~0% capital)
		},
		yearNote:
			"Coalition fiscal mandate: cyclically-adjusted current balance within 5 years. Margin tight.",
		pressures: [
			{
				label: "Bond markets",
				detail:
					"Greek crisis fresh; Coalition framing emphasises 'lose market confidence' risk.",
			},
			{
				label: "Banking",
				detail:
					"Bailed-out banks (RBS, Lloyds) on the books. Bank levy introduced this year.",
			},
			{
				label: "Welfare",
				detail:
					"£11bn cuts announced. Housing benefit cap and CTC restrictions follow.",
			},
		],
		preIntroduction: [
			"bank-surcharge",
			"apprenticeship-levy",
			"energy-profits-levy",
		],
		legislationOverrides: {
			"state-pension": {
				status: "available",
				label: "Triple lock (manifesto, not yet statute)",
				explainer:
					"Triple lock launched as Coalition manifesto commitment from 2010. Pensions Act 2014 codifies it. In 2010 it's policy but not yet statutorily protected.",
			},
			"international-aid": {
				status: "available",
				label: "0.7% (manifesto target)",
				explainer:
					"Coalition pledges to reach 0.7% by 2013 (achieved 2013). Statutory protection comes only with International Development Act 2015.",
			},
			defence: {
				status: "available",
				label: "Available (pre-NATO 2% floor)",
				explainer:
					"NATO 2% floor codified at 2014 Wales summit. SDSR 2010 cuts defence ~8% real over Parliament.",
			},
			"freeze-personal-allowance": {
				status: "available",
				label: "Available (Coalition raised PA)",
				explainer:
					"Coalition's headline tax policy was *raising* PA from £6,475 → £10,000 by 2015. Freezing PA in 2010 would reverse that signature commitment.",
			},
			"stamp-duty": {
				status: "available",
				label: "Available (UK-wide)",
				explainer:
					"Stamp duty still UK-wide in 2010. Holyrood (1999) exists but has no tax-varying powers yet — SRIT comes 2016, LBTT replaces SDLT in Scotland in 2015. Senedd's tax powers come with Wales Act 2014.",
			},
			"wealth-tax": {
				status: "new-legislation",
				label: "New legislation (post-crisis revival)",
				explainer:
					"Resolution Foundation (founded 2008) advocates wealth tax in response to financial crisis. Coalition rejects on grounds of capital flight and valuation overhead. IPPR and IFS engage but Coalition's austerity-via-spending-cuts framework dominates.",
			},
			"land-value-tax": {
				status: "new-legislation",
				label: "New legislation (Mirrlees imminent)",
				explainer:
					"IFS Mirrlees Review (Tax by Design, 2011) about to publish — landmark academic case for LVT. Coalition acknowledges in passing; no political pickup. Liberal Democrats favour but blocked in coalition negotiations.",
			},
			"frequent-flyer-levy": {
				status: "new-legislation",
				label: "New legislation (climate-policy nascent)",
				explainer:
					"Climate Change Act 2008 sets 80% reduction by 2050; aviation initially excluded from EU ETS. Aviation Foundation (precursor advocate group) campaigns for graduated APD. Coalition keeps flat APD framework.",
			},
			"carbon-border-tax": {
				status: "new-legislation",
				label: "New legislation (theoretical, EU-led)",
				explainer:
					"EU ETS operational since 2005; UK part of it. CBAM theoretical — first formal EU proposal not until 2021. Carbon leakage from energy-intensive industries discussed but no border adjustment yet considered viable.",
			},
			"online-services-tax-expansion": {
				status: "new-legislation",
				label: "New legislation (pre-BEPS)",
				explainer:
					"Apple, Google, Amazon dominance debated; FAANG term not yet coined. UK DST won't exist until 2020. OECD BEPS framework launches 2013. International cooperation seen as the only viable path.",
			},
		},
		taxLeverOverrides: {
			// Pre-Osborne-emergency-2010: basic 20%, higher 40%, additional
			// 50% (Brown introduced April 2010). VAT 17.5% (Osborne raised
			// to 20% in this budget). Corp 28% (Osborne staged cuts to 24%
			// by 2014). Employee NICs 11% (Osborne's payroll-tax rise
			// in this budget pushed to 12% from April 2011).
			//
			// gbpPerUnit values are per-pp yields in 2010 nominal pounds.
			// Sources: HMRC ready reckoner 2010, IFS Green Budget 2010.
			// Corp tax suppressed by post-crisis profit weakness.
			"basic-rate-income-tax": {
				currentRate: 0.2,
				gbpPerUnit: 3_700_000_000,
				incidence: {
					// PA at £6,475 (~23% of average earnings) — wider IT
					// base than today's £12,570, narrower than 1988's
					// £2,605. Pattern intermediate.
					vector: [0.02, 0.06, 0.10, 0.14, 0.15, 0.14, 0.13, 0.12, 0.08, 0.06],
					note: "PA £6,475 in 2010 sits between the 1988 low and today's frozen-since-2021 level. IT base wider than today; bottom 3 deciles still pay basic IT.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality analysis",
					},
				},
			},
			"higher-rate-income-tax": {
				currentRate: 0.4,
				gbpPerUnit: 1_000_000_000,
				incidence: {
					// HRT entry £37,400 in 2010 — slightly lower in real
					// terms than today's £50,270; modestly wider higher-
					// rate base.
					vector: [0, 0, 0, 0, 0.03, 0.07, 0.12, 0.20, 0.28, 0.30],
					note: "Lower nominal HRT (£37,400) makes the higher-rate base slightly wider than today's, with a modest middle-decile presence.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality analysis",
					},
				},
			},
			"additional-rate-income-tax": { currentRate: 0.5, gbpPerUnit: 100_000_000 },
			"vat-standard": { currentRate: 0.175, gbpPerUnit: 5_200_000_000 },
			"corporation-tax": { currentRate: 0.28, gbpPerUnit: 1_400_000_000 },
			"nics-main": { currentRate: 0.11, gbpPerUnit: 3_700_000_000 },
			"capital-gains-tax": { currentRate: 0.18, gbpPerUnit: 250_000_000 },
			"inheritance-tax": { currentRate: 0.4, gbpPerUnit: 60_000_000 },
			"freeze-personal-allowance": { currentValue: 6_475 },
			"freeze-higher-rate-threshold": { currentValue: 37_400 },
			"raise-personal-allowance": { currentValue: 6_475 },
		},
		taxStructuralNote:
			"Brown introduced the **50% additional rate** above £150k in April 2010 (his last act). VAT 17.5% — Osborne would raise to 20% in this budget. Corporation tax 28% on a staged path to 24%. The Coalition's signature tax move (raising PA toward £10k) starts here.",
		programmeOverrides: {
			// 2010-11 nominal £bn. Sources: HMT PESA. Defence ~2.6% GDP
			// (above the not-yet-formal NATO 2% — Coalition SDSR cuts in
			// progress). Triple lock launched as Coalition manifesto this
			// year, codified only by Pensions Act 2014, so cuttableFraction
			// reflects political (not statutory) protection.
			"nhs-england": { value: 100_000_000_000, cuttableFraction: 0.1 },
			defence: { value: 40_000_000_000, cuttableFraction: 0.3 },
			education: { value: 55_000_000_000 },
			"state-pension": { value: 69_000_000_000, cuttableFraction: 0.15 },
			"working-age-welfare": {
				value: 95_000_000_000,
				incidence: {
					// 2010 includes Brown's tax credits (introduced 1999)
					// + Working Tax Credit / Child Tax Credit. Tax credits
					// shifted distribution toward decile 2-5 working
					// families. UC announced this year, rolled out 2013+.
					vector: [0.25, 0.24, 0.20, 0.14, 0.08, 0.05, 0.02, 0.01, 0.01, 0.0],
					note: "Tax-credit era: WTC and CTC shift welfare £ toward working families in deciles 2-5. Less bottom-concentrated than pre-1999. Coalition will replace with UC over 2013-2018.",
					source: {
						url: "https://ifs.org.uk/inequality",
						label: "IFS Inequality analysis",
					},
				},
			},
			"international-aid": { value: 8_500_000_000, cuttableFraction: 0.7 },
			transport: { value: 20_000_000_000 },
			"local-govt-grants": { value: 28_000_000_000 },
		},
	},
	"2021": {
		id: "2021",
		year: 2021,
		label: "2021 — Sunak's freeze era begins",
		chancellor: "Rishi Sunak",
		party: "Conservative",
		shortContext: "COVID recovery; thresholds frozen for 5 years.",
		longContext:
			"March 2021 budget. Sunak freezes income tax thresholds (PA, HRT) for 5 years (to April 2026) — patient zero of the freeze era. Corporation tax announced to rise from 19% → 25% in April 2023. PSNB still elevated post-COVID (~£128bn forecast for 2021-22).",
		gdpScale: 0.890,
		multiplierAdjust: 1.1,
		multiplierSource: {
			url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2021/",
			label: "OBR EFO March 2021 supplementary methodology · NIESR COVID papers",
			note: "Sunak-era multipliers slightly elevated above current (0.1-0.2 above baseline) — pandemic recovery left labour-market slack and BoE near zero rates. Supply constraints would soon bite, eroding multipliers; this calibration captures early-2021 conditions.",
		},
		// 2021 COVID-recovery: modest amplification on transfer + spending
		// channels; tax cuts less affected as savings rate had spiked
		// during pandemic and was already normalising.
		taxMultiplierOverrides: {
			"vat-standard": 0.6, // base 0.5 — slight liquidity-constraint help
		},
		programmeMultiplierOverrides: {
			"working-age-welfare": 1.1, // base 0.9 — slack still present
			"nhs-england": 0.8, // base 0.6 — pandemic-stretched workforce
			transport: 1.0, // base 0.8 — modest ZLB-style amplification
		},
		yearNote:
			"Sunak's framework: PSNB falling as % GDP by year 5; current expenditure balanced.",
		pressures: [
			{
				label: "COVID legacy",
				detail:
					"Furlough wound down October 2021. Health spending elevated; backlog growing.",
			},
			{
				label: "Triple lock suspended",
				detail:
					"2022-23 uprating uses CPI not earnings (one-year suspension to avoid 8.3% wage-rebound spike).",
			},
			{
				label: "Inflation",
				detail:
					"Energy crisis brewing; CPI heading toward 11% by Oct 2022. Freeze becomes much more potent than scored.",
			},
		],
		preIntroduction: ["energy-profits-levy"],
		legislationOverrides: {
			"state-pension": {
				status: "statutorily-protected",
				label: "Triple lock (suspended this year)",
				explainer:
					"Sunak suspends triple lock for 2022-23 uprating only (Social Security (Up-rating of Benefits) Act 2021). Returns 2023-24.",
			},
		},
		taxLeverOverrides: {
			// Pre-Sunak-2021-budget: rates as inherited. Sunak's freeze
			// kicks PA + HRT at this point's values for 5 years; corp
			// rise to 25% announced for April 2023.
			//
			// gbpPerUnit values are per-pp yields in 2021 nominal pounds.
			// Sources: HMRC ready reckoner 2021. Corp tax base elevated
			// from COVID-era depression to recovery normalisation.
			"basic-rate-income-tax": { currentRate: 0.2, gbpPerUnit: 5_400_000_000 },
			"higher-rate-income-tax": { currentRate: 0.4, gbpPerUnit: 1_400_000_000 },
			"additional-rate-income-tax": { currentRate: 0.45, gbpPerUnit: 170_000_000 },
			"vat-standard": { currentRate: 0.2, gbpPerUnit: 7_000_000_000 },
			"corporation-tax": { currentRate: 0.19, gbpPerUnit: 3_300_000_000 },
			"nics-main": { currentRate: 0.12, gbpPerUnit: 4_500_000_000 },
			"capital-gains-tax": { currentRate: 0.2, gbpPerUnit: 350_000_000 },
			"inheritance-tax": { currentRate: 0.4, gbpPerUnit: 100_000_000 },
			"freeze-personal-allowance": { currentValue: 12_570 },
			"freeze-higher-rate-threshold": { currentValue: 50_270 },
			"raise-personal-allowance": { currentValue: 12_570 },
		},
		taxStructuralNote:
			"Sunak's signature stealth-tax instrument — a **5-year freeze of PA + HRT** — is announced in this budget. Corp tax 19% on a staged rise to 25% by April 2023. NICs 12% (about to add the 1.25pp Health and Social Care Levy in April 2022, then partially reverse in November).",
		programmeOverrides: {
			// 2021-22 nominal £bn. Sources: HMT PESA. NHS elevated due to
			// COVID supplements. UC including pandemic uprating (£20/wk
			// uplift active until October 2021). Triple lock suspended
			// for 2022-23 only — restored thereafter, so cuttableFraction
			// at the 0.05 statutory level reflects steady-state.
			"nhs-england": { value: 165_000_000_000, cuttableFraction: 0.05 },
			defence: { value: 45_000_000_000, cuttableFraction: 0.2 },
			education: { value: 80_000_000_000 },
			"state-pension": { value: 106_000_000_000, cuttableFraction: 0.05 },
			"working-age-welfare": { value: 140_000_000_000 },
			"international-aid": { value: 11_000_000_000, cuttableFraction: 0.5 },
			transport: { value: 35_000_000_000 },
			"local-govt-grants": { value: 30_000_000_000 },
		},
	},
	current: {
		id: "current",
		year: 2024,
		label: "Current — Reeves's first Labour budget",
		chancellor: "Rachel Reeves",
		party: "Labour",
		shortContext: "Stability rule active; fiscal headroom tight.",
		longContext:
			"October 2024 budget — first Labour budget in 14 years. Reeves's stability rule: current expenditure balanced by year 5; PSNFL falling as % GDP. Headroom against the rule is ~£10bn — historically tight. Major moves: employer NICs raise (£25bn), threshold drop to £5,000.",
		gdpScale: 1.0,
		yearNote:
			"Live OBR forecast (March 2025 EFO) — loaded server-side and passed through to the wizard.",
		pressures: [
			{
				label: "NHS",
				detail:
					"Demographic pressure pushes ~3% real growth required just to stand still.",
			},
			{
				label: "Defence",
				detail:
					"NATO 2.5% pledge by 2030 implies ~£20bn additional spending.",
			},
			{
				label: "State pension",
				detail:
					"Triple lock binds upratings to max(CPI, earnings, 2.5%).",
			},
			{
				label: "Frozen thresholds",
				detail: "Fiscal drag now raising £35bn+/yr, locked until 2031.",
			},
		],
	},
};

export const ERA_ORDER: readonly EraId[] = ["1979", "1988", "2010", "2021", "current"];

// Apply era overlay to a base legislation entry. Returns:
//   - synthetic ANACHRONISM if lever is preIntroduction in this era
//   - merged metadata if lever is in legislationOverrides
//   - base unchanged otherwise
export const applyEraLegislation = (
	base: LegislativeMeta,
	leverId: string,
	era: EraId,
): LegislativeMeta => {
	if (era === "current") return base;
	const def = ERAS[era];
	if (def.preIntroduction?.includes(leverId)) {
		return ANACHRONISM(def.year);
	}
	const override = def.legislationOverrides?.[leverId];
	if (!override) return base;
	return { ...base, ...override };
};

// Apply per-era structural overrides to a base TaxLever. Used by the wizard
// to render era-accurate currentRate / currentValue ("33% → 34%" in 1979
// instead of the present-day "20% → 21%").
export const applyEraLeverOverride = (
	base: TaxLever,
	era: EraId,
): TaxLever => {
	if (era === "current") return base;
	const override = ERAS[era].taxLeverOverrides?.[base.id];
	if (!override) return base;
	return { ...base, ...override };
};

// Resolve the effective per-unit £ yield for a lever in a given era.
//   - era === "current": just the lever's gbpPerUnit
//   - era !== "current" with explicit gbpPerUnit override: use it directly
//     (already in era-pound)
//   - era !== "current" with no override: gdpScale × current gbpPerUnit
//     (the GDP-proxy approximation for levers we haven't researched
//     historically — fuel duty, sundry instruments)
export const eraGbpPerUnit = (base: TaxLever, era: EraId): number => {
	if (era === "current") return base.gbpPerUnit;
	const override = ERAS[era].taxLeverOverrides?.[base.id];
	if (override?.gbpPerUnit !== undefined) return override.gbpPerUnit;
	return base.gbpPerUnit * ERAS[era].gdpScale;
};

// Apply per-era structural overrides to a base SpendingProgramme. Drives
// era-accurate yields ("Education +5% = £485m in 1979" not "£4.6bn") and
// era-aware cuttableFraction (defence pre-2014 NATO floor is much more
// cuttable than today).
export const applyEraProgramme = (
	base: SpendingProgramme,
	era: EraId,
): SpendingProgramme => {
	if (era === "current") return base;
	const override = ERAS[era].programmeOverrides?.[base.id];
	if (!override) return base;
	return { ...base, ...override };
};

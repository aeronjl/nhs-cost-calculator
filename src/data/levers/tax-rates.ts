// HMRC's "Direct effects of illustrative tax changes" — the ready reckoner
// that quantifies how much extra revenue comes from a 1 percentage-point
// change in a given rate (or its equivalent unit). Figures are first-year
// effects; behavioural responses dampen larger changes (a 5pp rise yields
// less than 5× a 1pp rise) but are roughly linear at small changes.
//
// Update annually: HMRC publishes a new edition each January. URL:
// https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes

import type { Methodology } from "@/lib/methodology";
import type { IncidenceMeta } from "@/lib/distribution";
import type { Elasticity } from "@/lib/elasticity";

// Tax levers come in five shapes (discriminated by `unit`):
//   - "pp"          rate change: raise/cut a percentage rate by N percentage points.
//   - "yr"          threshold freeze: hold a threshold nominal for N more years,
//                   letting fiscal drag raise revenue as nominal earnings rise.
//   - "k"           threshold raise/lower: shift a threshold by £Nk; sign-inverted
//                   gbpPerUnit since raising a threshold loses revenue.
//   - "bn"          direct £bn lever (asset/sundry taxes, SDLT, catch-all `tax-other`).
//   - "p-per-litre" commodity duty in pence per litre (fuel duty).
//
// All shapes share the same arithmetic: `gbpPerUnit × magnitude`. They differ
// in what the magnitude represents and how the UI describes them. Add a new
// shape only when the existing four can't carry the policy honestly.

export type TaxUnit = "pp" | "yr" | "k" | "bn" | "p-per-litre";

export interface TaxLever {
	id: string;
	name: string;
	unit: TaxUnit;
	unitLabel: string; // "percentage point", "year of freeze"
	gbpPerUnit: number; // £ raised per unit
	asOf: string; // YYYY-MM
	source: { url: string; label: string };
	methodology: Methodology;
	currentRate?: number; // 0–1, present for rate levers
	currentValue?: number; // GBP, present for threshold-freeze levers
	// Distributional incidence: where the £ revenue from this lever comes
	// from across the income distribution. Convention is ECONOMIC incidence
	// (employer NICs falls on workers, VAT on consumers, etc.) per OBR/IFS.
	// When omitted, the line is excluded from distributional scoring.
	incidence?: IncidenceMeta;
	// Behavioural elasticity: how much the static yield is reduced by
	// behavioural responses (avoidance, profit-shifting, hours adjustments).
	// At small magnitudes the haircut is small; at large magnitudes it bites.
	// When omitted, dynamic yield = static yield (no behavioural model).
	elasticity?: Elasticity;
}

const HMRC = {
	url: "https://www.gov.uk/government/statistics/direct-effects-of-illustrative-tax-changes",
	label: "HMRC Ready Reckoner Jan 2024",
} as const;

export const TAX_LEVERS: readonly TaxLever[] = [
	{
		id: "basic-rate-income-tax",
		name: "basic-rate income tax",
		currentRate: 0.2,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 6_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue effect of a 1pp rise in the basic rate of income tax, holding behaviour constant ('static' estimate).",
			alternatives: [
				{
					label: "Dynamic estimate",
					note: "Behavioural responses (lower workforce participation, increased avoidance, reduced consumption) shave 5–15% off the gain at +5pp; the larger the rise, the bigger the shortfall.",
				},
				{
					label: "Per basic-rate taxpayer",
					value: 180,
					note: "Roughly £180/year for each of ~33M basic-rate taxpayers — a tangible felt cost.",
				},
				{
					label: "VAT 1pp equivalent",
					value: 8_000_000_000,
					note: "VAT raises ~33% more per pp, but is regressive (hits low earners harder).",
				},
			],
			range: {
				low: 5_500_000_000,
				high: 6_500_000_000,
				note: "HMRC's central estimate is £6bn; uncertainty is mostly about how much earnings respond.",
			},
			caveat:
				"Linear at 1–2pp; less reliable above. A 10pp rise is NOT 10× a 1pp rise — at that scale macro effects (lower employment, capital flight) matter.",
		},
		incidence: {
			vector: [0.01, 0.04, 0.08, 0.12, 0.14, 0.15, 0.16, 0.14, 0.10, 0.06],
			note: "Most basic-rate taxpayers are in deciles 4–8 (earning between the personal allowance and £50,270). Bottom deciles are below the PA threshold; top deciles' marginal £ falls under higher-rate IT.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.02,
			note: "Low behavioural elasticity — basic-rate earners have limited room to adjust hours, restructure income, or relocate. HMRC's TIE for the basic rate is ~0.1. At this coefficient: +5pp = ~10% haircut, +10pp = ~20% haircut.",
			source: HMRC,
		},
	},
	{
		id: "higher-rate-income-tax",
		name: "higher-rate income tax",
		currentRate: 0.4,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 1_600_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise on the higher rate (40% → 41%), affecting income above £50,270.",
			alternatives: [
				{
					label: "Dynamic estimate",
					note: "Higher-rate taxpayers have more flexibility (incorporation, dividends, pension contributions, hours worked) so dynamic effects bite faster than at the basic rate.",
				},
				{
					label: "Per higher-rate taxpayer",
					value: 500,
					note: "Roughly £500/year on average for ~5M higher-rate taxpayers.",
				},
				{
					label: "Threshold change",
					note: "Lowering the higher-rate threshold by £1,000 raises ~£800m/yr, with similar incidence — often politically easier than visible rate hikes.",
				},
			],
			range: {
				low: 1_400_000_000,
				high: 1_800_000_000,
				note: "Range driven by elasticity-of-taxable-income assumptions; HMRC uses central elasticity of ~0.45 here.",
			},
			caveat:
				"The 'static' figure assumes no behavioural response. Some economists put the static-revenue-maximising point already near the current 40% rate — meaning a rise could yield very little once dynamic effects bite.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0.02, 0.05, 0.10, 0.18, 0.30, 0.35],
			note: "Higher-rate IT applies above £50,270. Bottom 4 deciles untouched; impact concentrated in top 4 deciles where higher-rate earnings are most common.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.05,
			note: "Moderate behavioural elasticity — higher-rate earners can pension, incorporate, defer bonuses, and shift between income types. HMRC's TIE for higher rate is ~0.45. At this coefficient: +1pp = 5% haircut, +5pp = 25%.",
			source: HMRC,
		},
	},
	{
		id: "additional-rate-income-tax",
		name: "additional-rate income tax",
		currentRate: 0.45,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 200_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise on the additional rate (45% → 46%), affecting income above £125,140 (~600,000 individuals).",
			alternatives: [
				{
					label: "Dynamic estimate",
					note: "Heavily contested — HMRC's own dynamic models suggest near-zero or negative revenue at large rises. Top earners have the most flexibility.",
				},
				{
					label: "Threshold change",
					note: "Lowering the additional-rate threshold raises substantially more than a rate rise (per pp equivalent).",
				},
				{
					label: "50% rate experience (2010-13)",
					note: "Raised much less than projected; eventually scrapped. Evidence cited by both sides of the rate-rise debate.",
				},
			],
			range: {
				low: -500_000_000,
				high: 400_000_000,
				note: "Genuinely uncertain. Dynamic estimates straddle zero.",
			},
			caveat:
				"This is the most behaviour-sensitive lever on the page. Treat the static £200m as a generous ceiling — the realised revenue from a 1pp rise might be much lower, zero, or negative once profit-shifting and avoidance kick in.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.90],
			note: "Additional-rate IT applies above £125,140 — roughly the top 1–3% of earners. Almost the entire incidence falls on the top decile.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.20,
			note: "Very high behavioural elasticity — top earners aggressively manage income timing and form. HMRC's TIE for additional rate is ~0.45–0.65 but real-world responses (post-2010 50p experience, bonus deferrals) suggest larger. At this coefficient: +1pp = 20% haircut, +5pp = 95% (capped); a 50p rate could yield far below static.",
			source: HMRC,
		},
	},
	{
		id: "dividend-tax",
		name: "dividend tax (higher rate)",
		currentRate: 0.3375,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 500_000_000,
		asOf: "2025-11",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2025-11",
			measure:
				"First-year revenue from a 1pp rise in the higher rate of dividend tax (currently 33.75%, rising to 35.75% from April 2026 per Reeves Autumn Budget 2025). Three-rate structure: 8.75% / 33.75% / 39.35% (basic / higher / additional).",
			alternatives: [
				{
					label: "Reverse Reeves's 2025 +2pp rise",
					value: -1_000_000_000,
					note: "Reeves raised all three dividend rates by 2pp (effective April 2026); contributes ~£1bn to the £2.2bn 'asset income' package alongside savings tax + property income tax bands.",
				},
				{
					label: "Equalise with income tax",
					value: 4_000_000_000,
					note: "Aligning dividend rates with marginal IT (20/40/45%) would raise ~£4bn/yr static — closes the gap that incentivises owner-managed companies to extract profits as dividends rather than salary. Long-standing IFS recommendation.",
				},
				{
					label: "Per recipient (higher rate)",
					value: 280,
					note: "1pp on the higher rate costs the median dividend higher-rate taxpayer ~£280/year. ~3M people receive dividends; ~600k pay higher- or additional-rate dividend tax.",
				},
			],
			caveat:
				"Highly behavioural — owner-managers can defer dividends, retain earnings in companies, or rebalance toward salary/pension contributions. Lever covers the 'higher rate' as the headline; basic and additional rates move with it in practice.",
		},
		incidence: {
			vector: [0, 0, 0.01, 0.01, 0.02, 0.03, 0.05, 0.08, 0.20, 0.60],
			note: "Dividend income is heavily concentrated at the top of the distribution: the top decile holds the majority of UK dividend-receiving households.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.05,
			note: "Owner-managers respond to dividend tax by retaining earnings, taking salary instead, or timing distributions. OBR scores recent dividend tax rises with ~10–15% behavioural haircuts at +2pp.",
			source: HMRC,
		},
	},
	{
		id: "dividend-allowance",
		name: "dividend allowance (annual)",
		currentValue: 500,
		unit: "k",
		unitLabel: "£ thousand",
		gbpPerUnit: -500_000_000,
		asOf: "2024-04",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-04",
			measure:
				"Revenue effect of changing the dividend allowance — the amount of dividend income exempt from dividend tax — by £1,000. Currently £500 (cut from £2,000 by Hunt across Nov 2022 and Apr 2024). Sign: positive magnitude raises the allowance (loses revenue); negative magnitude cuts it (gains revenue).",
			alternatives: [
				{
					label: "Reverse Hunt's £2,000→£500 cut",
					value: -750_000_000,
					note: "Restoring the allowance to £2,000 would cost ~£750m/yr — affects ~3M dividend recipients, ~600k of whom currently pay dividend tax above the allowance.",
				},
				{
					label: "Abolish the allowance",
					value: 250_000_000,
					note: "Removing the £500 allowance entirely (taxing all dividend income from £0) would raise ~£250m/yr — small but adds compliance for ~2.4M people who currently pay zero dividend tax.",
				},
				{
					label: "Sunak's original £5,000 (2016)",
					value: -2_250_000_000,
					note: "The allowance was introduced at £5,000 by Osborne in 2016 (alongside the new dividend tax bands). Hammond cut it to £2,000 in 2017; Hunt cut it further to £500 in two steps. Restoring the £5,000 floor would cost ~£2.25bn/yr.",
				},
			],
			caveat:
				"The allowance is tiny in £ terms (£500) but politically charged because the cuts hit a politically active demographic (older, asset-holding, Tory-leaning). 'Stealth tax' framing applies — the allowance was cut without changing the rate, so headline rates stayed the same while the tax base broadened. Methodology calibrates per £1k of allowance change; smaller moves scale linearly.",
		},
		incidence: {
			vector: [0, 0, 0.02, 0.02, 0.03, 0.04, 0.06, 0.10, 0.20, 0.53],
			note: "Dividend recipients are heavily concentrated at the top — over half of any allowance change's effect falls on the top decile. Bottom 2 deciles essentially never receive dividends.",
			source: HMRC,
		},
	},
	{
		id: "vat-standard",
		name: "VAT standard rate",
		currentRate: 0.2,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 8_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise on the standard VAT rate (20% → 21%). Excludes reduced (5%) and zero-rated goods.",
			alternatives: [
				{
					label: "Reduced/zero rate harmonisation",
					note: "Removing zero-rating on food and children's clothes would raise ~£35bn/yr — but is politically untouchable on distributional grounds.",
				},
				{
					label: "Bottom decile burden",
					note: "A 1pp VAT rise costs the bottom-decile household ~0.7% of disposable income. Top-decile burden is ~0.4%. VAT is regressive on disposable income.",
				},
			],
			caveat:
				"VAT is regressive — low earners spend a higher share of income on VAT-able goods. Revenue effects are well-modelled (the base is huge and consumer behaviour is sticky in the short run); distributional effects are the political flashpoint.",
		},
		incidence: {
			vector: [0.13, 0.12, 0.11, 0.10, 0.10, 0.09, 0.09, 0.08, 0.09, 0.09],
			note: "VAT in £ terms is roughly flat across deciles (each decile spends a similar £ on VAT-able goods). As a share of income it's strongly regressive — bottom decile pays ~6× more as % of disposable income than top decile.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.01,
			note: "Very low behavioural elasticity — UK consumption is sticky in the short run. Some shift toward zero-rated goods + cross-border shopping, but tiny relative to the base. HMRC scores VAT changes near static.",
			source: HMRC,
		},
	},
	{
		id: "nics-main",
		name: "Class 1 NICs (main rate)",
		currentRate: 0.08,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 5_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise in employee Class 1 NICs main rate (8% → 9%), on earnings between £12,570 and £50,270.",
			alternatives: [
				{
					label: "Employer NICs",
					note: "Raising employer NICs by 1pp would yield more (~£8bn) but the incidence falls on workers via reduced wages over time.",
				},
				{
					label: "NICs–IT merger",
					note: "Conservative & Labour governments have repeatedly considered merging NICs into income tax. Politically loaded — would expose the rhetorical fiction that NICs is 'separate' from general taxation.",
				},
			],
			caveat:
				"NICs is technically earmarked to the National Insurance Fund (state pension, contributory benefits), but in practice flows to general spending. The 'earmarked' framing is largely rhetorical — Treasury sees one revenue pot.",
		},
		incidence: {
			vector: [0.02, 0.05, 0.08, 0.11, 0.13, 0.14, 0.16, 0.15, 0.10, 0.06],
			note: "Hits employees earning between the primary threshold (£12,570) and the upper earnings limit (£50,270). Concentrated in middle deciles; bottom 2 deciles below threshold; top decile's marginal £ falls outside the band.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.02,
			note: "Low behavioural response — most employees can't easily reduce hours or shift compensation form. Same elasticity profile as basic-rate IT.",
			source: HMRC,
		},
	},
	{
		id: "employer-nics-main",
		name: "employer Class 1 NICs (secondary rate)",
		currentRate: 0.15,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 8_000_000_000,
		asOf: "2024-10",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-10",
			measure:
				"First-year revenue from a 1pp rise in employer Class 1 NICs main rate (currently 15% post-Reeves, was 13.8%). Applied to wages above the secondary threshold (£5,000 since April 2025; was £9,100).",
			alternatives: [
				{
					label: "Reverse Reeves's Oct 2024 changes",
					value: 25_000_000_000,
					note: "Reeves's combined rate rise (1.2pp) + secondary threshold drop (£9,100→£5,000) raised ~£25bn/yr by 2027. Encoding the rate move alone (1.2pp × £8bn) gives ~£10bn; the £15bn residual is the threshold drop, encoded in `tax-other` until/unless we get an employer-threshold lever.",
				},
				{
					label: "Per-worker burden",
					value: 460,
					note: "1pp on employer NICs costs employers ~£460/year per median earner — most economists agree it falls on workers via lower wages over time, but the political optics of 'tax on jobs' make it harder to raise than employee NICs.",
				},
				{
					label: "Compare to employee NICs",
					note: "Employer NICs raises ~60% more per pp than employee NICs (£8bn vs £5bn) because the base is broader (no upper earnings limit) and the rate applies to all employer-paid earnings, not just employee earnings between thresholds.",
				},
			],
			caveat:
				"The 'tax on jobs' framing dominates politics, but in incidence terms employer NICs is largely paid by workers via wage suppression (OBR/IFS consensus). Reeves's 1.2pp rise was the largest employer NICs change in years; CBI/IoD argued it would cost ~280k jobs by 2027 (highly contested). The base is large enough that small changes raise serious money.",
		},
		incidence: {
			vector: [0.02, 0.05, 0.08, 0.11, 0.13, 0.14, 0.15, 0.14, 0.11, 0.07],
			note: "Economic incidence falls on workers via reduced wages (OBR/IFS consensus). Pattern is similar to employee NICs but slightly more spread because the no-upper-earnings-limit means top decile takes more of the burden.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.03,
			note: "Slightly more elastic than employee NICs — employer responses include hiring decisions, shifting to self-employed contractors, and offshoring. Reeves's 2024 +1.2pp move was forecast to cost ~280k jobs by CBI; OBR's central elasticity is more conservative (~0.45 effective TIE).",
			source: HMRC,
		},
	},
	{
		id: "employer-nics-secondary-threshold",
		name: "employer NICs secondary threshold",
		currentValue: 5_000,
		unit: "k",
		unitLabel: "£ thousand",
		gbpPerUnit: -3_700_000_000,
		asOf: "2024-10",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-10",
			measure:
				"Revenue effect of changing the employer NICs secondary threshold (the wage above which employers pay NICs) by £1,000. Currently £5,000 (Reeves cut it from £9,100 in October 2024). Sign: positive magnitude raises the threshold (loses revenue); negative magnitude lowers it (gains revenue).",
			alternatives: [
				{
					label: "Reverse Reeves's Oct 2024 cut",
					value: -15_000_000_000,
					note: "Reeves dropped the threshold from £9,100 to £5,000 — a £4,100 cut raising ~£15bn/yr by 2027. The biggest single fiscal lever pulled by Reeves in Autumn 2024 (bigger even than the rate rise).",
				},
				{
					label: "Per worker affected",
					value: 615,
					note: "Lowering the threshold by £4,100 brings ~1.6M low-paid jobs into employer NICs that previously weren't (e.g. 20-hour-a-week workers on minimum wage). At 15%, the per-job employer cost is up to £615/yr — concentrated effect on retail, hospitality, social care.",
				},
				{
					label: "Align with personal allowance",
					value: -22_500_000_000,
					note: "Lowering the threshold to £0 (full alignment with employee tax base) would raise ~£22bn/yr static — but would strangle marginal employment for low earners. Conceptual ceiling, not a serious proposal.",
				},
			],
			caveat:
				"Threshold is a stealth-tax instrument — Reeves used it to deliver most of the £25bn employer-NICs raise without touching the headline 15% rate. 'Tax on jobs' rhetoric usually focuses on the rate; the threshold drop is harder to message politically (which is precisely why it works as a fiscal lever). Calibration is rough — gbpPerUnit (£3.7bn/k) derived from the £15bn / £4.1k ratio of Reeves's actual move; smaller moves should scale roughly linearly given the wage distribution.",
		},
		incidence: {
			vector: [0.10, 0.18, 0.20, 0.18, 0.13, 0.08, 0.05, 0.04, 0.03, 0.01],
			note: "Lowering the threshold brings low-paid jobs (retail, hospitality, social care) into the NICs base for the first time. Burden falls disproportionately on bottom and lower-middle deciles via wage suppression on the workers in those jobs.",
			source: HMRC,
		},
	},
	{
		id: "corporation-tax",
		name: "corporation tax",
		currentRate: 0.25,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 4_500_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise in the main corporation tax rate (25% → 26%), applicable to companies with >£250k profits.",
			alternatives: [
				{
					label: "Reverse full expensing",
					note: "Removing 100% capital allowances would raise ~£10bn/yr but reduce business investment.",
				},
				{
					label: "Diverted profits tax / windfall taxes",
					note: "Targeted tax raids can raise £2-£15bn one-off (see oil & gas EPL) but invite international friction.",
				},
				{
					label: "OECD comparison",
					note: "UK 25% is mid-OECD (US ~21% federal, France 25%, Germany ~30% combined). Pillar Two minimum is 15%.",
				},
			],
			range: {
				low: 3_500_000_000,
				high: 5_000_000_000,
				note: "Depends on profit-shifting elasticity and timing of incidence.",
			},
			caveat:
				"Highly mobile base. A unilateral UK rise above ~28% would push profit-shifting hard. The OECD Pillar Two minimum tax floors part of this but enforcement is uneven and still being phased in.",
		},
		incidence: {
			vector: [0.02, 0.03, 0.05, 0.07, 0.08, 0.09, 0.10, 0.13, 0.17, 0.26],
			note: "OBR/IFS convention assumes ~50% of corporation tax falls on workers (via wages) and ~50% on capital owners (concentrated top decile). The combined effect is moderately top-heavy.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.04,
			note: "Profit-shifting is the dominant behavioural channel. UK rises above ~28% would push aggressive shifting; Pillar Two minimum partly defends. HMRC's central scoring applies ~10% haircut at +1pp; this coefficient gives 4% (more conservative).",
			source: HMRC,
		},
	},
	// Asset taxes — capital gains and inheritance. Both are highly behavioural
	// and the headline rate masks several actual rates (CGT has 4 sub-rates,
	// IHT has nil-rate band complexity). Encoded as single levers with the
	// 4-rate / threshold structure documented in methodology.
	{
		id: "capital-gains-tax",
		name: "capital gains tax (higher rate)",
		currentRate: 0.24,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 100_000_000,
		asOf: "2024-10",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-10",
			measure:
				"First-year revenue from a 1pp rise in the higher rate of CGT (currently 24% on non-residential gains, 24% on residential after Reeves's October 2024 changes). HMRC ready-reckoner figure for the static estimate.",
			alternatives: [
				{
					label: "Lower rate (1pp)",
					value: 45_000_000,
					note: "1pp on the lower CGT rate (now 18%) raises ~£45m. Combined moves on both rates raise ~£150m per headline pp.",
				},
				{
					label: "Reverse Reeves's Oct 2024 changes",
					value: 2_500_000_000,
					note: "Reeves raised lower rate 10→18% and higher rate 20→24% (non-residential) — projected £2.5bn/yr by 2029-30. Encoding faithfully as a single lever line is hard because two rates moved by different amounts; bundle the residual in `tax-other`.",
				},
				{
					label: "Equalise with income tax",
					value: 14_000_000_000,
					note: "Charging CGT at marginal income tax rates would raise ~£14bn/yr static — but realisations would collapse short-term, so OBR-scored revenue is far lower. The biggest CGT proposal in Labour's 2024 leaked options.",
				},
			],
			caveat:
				"Highly behavioural — taxpayers time realisations around expected rate changes. Static HMRC figure understates actual elasticity at large moves; OBR's costings of recent CGT changes apply ~30-50% behavioural haircuts. Four actual rates in the system: 18% / 24% (residential) and 18% / 24% (non-residential post-Reeves). 'Higher rate' lever is a proxy for the headline; combined moves need `tax-other` for the residual.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0, 0.01, 0.02, 0.04, 0.08, 0.85],
			note: "Realised capital gains are extraordinarily concentrated at the top: the top decile reports the vast majority of taxable gains in any given year (HMRC CGT statistics). 85%+ of any rate change falls on top-decile households.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.10,
			note: "CGT is the most elastic major tax — taxpayers time realisations around expected rate changes (defer when rates are rising; accelerate before announced cuts). OBR scores recent CGT changes with 30–50% behavioural haircuts. At this coefficient: +4pp = 40% haircut, matching OBR's recent treatment.",
			source: HMRC,
		},
	},
	{
		id: "inheritance-tax",
		name: "inheritance tax",
		currentRate: 0.4,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 200_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"First-year revenue from a 1pp rise in the inheritance tax rate (currently 40%) above the £325k nil-rate band (£500k with residence band where applicable). Static HMRC estimate.",
			alternatives: [
				{
					label: "Abolish IHT",
					value: -8_000_000_000,
					note: "IHT raises ~£8bn/yr at the 40% rate. Abolishing it (a recurring Conservative pledge, 2023-24) would lose the full £8bn without a replacement.",
				},
				{
					label: "Lower nil-rate band by £25k",
					value: 500_000_000,
					note: "The £325k nil-rate band has been frozen since 2009 (until 2030 after Reeves's extension). A nominal lowering would raise ~£500m/yr; the freeze itself is the dominant fiscal-drag lever and is encoded separately.",
				},
				{
					label: "Pension pots into IHT (Reeves Oct 2024)",
					value: 1_500_000_000,
					note: "Bringing unused pension pots into the IHT base from April 2027 was projected to raise ~£1.5bn/yr by 2029-30. Encoded as a base-broadening change in `tax-other` — the rate didn't move.",
				},
			],
			caveat:
				"Highly avoidable — gifts (7-year rule), business/agricultural relief, charitable legacies, life insurance written into trust all reduce the effective base. Reeves's Oct 2024 tightening of agricultural and business reliefs (the 'family farm' row) is the most politically charged IHT move in years; encoded in `tax-other` since it's a base change not a rate change. About 4-5% of estates pay IHT at all.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0, 0, 0.01, 0.04, 0.15, 0.80],
			note: "Only ~4-5% of estates pay any IHT, and they're overwhelmingly in the top decile of estate wealth (which correlates strongly with top decile of income at end-of-life). 80% of any IHT rate change falls on the top decile.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.05,
			note: "Avoidance routes are well-developed: gifts (7-year rule), business/agricultural relief, charitable legacies, life insurance into trust. Rate rises accelerate avoidance planning; HMRC scores rate changes with ~10% haircut at small moves.",
			source: HMRC,
		},
	},
	// Threshold-freeze levers — fiscal drag rather than rate change. The
	// `gbpPerUnit` here is per year of additional freeze, in steady state,
	// based on HMRC's published estimates and the OBR's scoring of recent
	// extensions (Hunt's 2022 freeze, Reeves's 2025 extension).
	{
		id: "freeze-personal-allowance",
		name: "personal allowance",
		currentValue: 12_570,
		unit: "yr",
		unitLabel: "year of freeze",
		gbpPerUnit: 1_500_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Approximate steady-state revenue per additional year that the personal allowance (currently £12,570) is held nominal — fiscal drag from inflation pulling earners across the threshold without an explicit rate change.",
			alternatives: [
				{
					label: "First-year effect",
					value: 500_000_000,
					note: "Year-1 effect is smaller (~£0.5bn) and grows as nominal earnings rise. The £1.5bn figure is closer to year-3 in steady state.",
				},
				{
					label: "Raising PA by £1,000",
					value: -3_000_000_000,
					note: "The inverse: raising the threshold by £1k loses ~£3bn/year. We don't model threshold *changes* yet, only freezes.",
				},
			],
			caveat:
				"The 'per year of freeze' figure depends on inflation assumptions — at higher inflation the drag accelerates. HMRC's ready reckoner figures use OBR central inflation paths. Reeves's Budget 2025 extension (3 years past 2028) was scored at ~£8bn cumulative across PA + HRT — consistent with ~£2.5bn/year combined.",
		},
		incidence: {
			vector: [0.01, 0.05, 0.09, 0.12, 0.14, 0.15, 0.15, 0.13, 0.10, 0.06],
			note: "Fiscal drag from a frozen PA pulls more low-paid workers into the tax base. Bottom decile largely below threshold; effect concentrated in deciles 4–7 where inflation-driven nominal earnings cross the frozen line.",
			source: HMRC,
		},
	},
	{
		id: "freeze-higher-rate-threshold",
		name: "higher-rate threshold",
		currentValue: 50_270,
		unit: "yr",
		unitLabel: "year of freeze",
		gbpPerUnit: 1_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Approximate steady-state revenue per additional year that the higher-rate threshold (£50,270) is held nominal. Drags more earners into the 40% band as wages rise.",
			alternatives: [
				{
					label: "Raising HRT by £1,000",
					value: -800_000_000,
					note: "The inverse: raising the threshold by £1k loses ~£800m/year. Often considered as a politically easier alternative to rate cuts.",
				},
				{
					label: "Number of new higher-rate payers",
					note: "Each year of freeze pulls roughly 200-400k additional earners into the higher-rate band (depending on wage growth).",
				},
			],
			caveat:
				"Higher-rate-threshold freezes are a quiet but powerful tool — they 'fiscal drag' aspirational middle earners without ever appearing as a tax rise on the front page. Often more politically palatable than basic-rate changes for the same revenue.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0.02, 0.06, 0.12, 0.20, 0.30, 0.30],
			note: "HRT freeze drag pulls earners into higher-rate IT — affects deciles 7–10 most. Top decile share is large because their marginal income most often crosses the £50,270 line.",
			source: HMRC,
		},
	},
	{
		id: "freeze-additional-rate-threshold",
		name: "additional-rate threshold",
		currentValue: 125_140,
		unit: "yr",
		unitLabel: "year of freeze",
		gbpPerUnit: 200_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Approximate steady-state revenue per additional year that the additional-rate threshold (£125,140) is held nominal.",
			caveat:
				"Narrow base — only ~600k earners affected. Revenue per year of freeze is substantially smaller than the basic and higher-rate threshold freezes. Often included in budget packages 'for symmetry' rather than for the £.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.90],
			note: "Almost entirely top decile — £125,140 is well above the 90th percentile.",
			source: HMRC,
		},
	},
	// Threshold-change levers (unit: "k"). Magnitude in £k; positive = raise
	// threshold (a tax cut). gbpPerUnit is NEGATIVE because raising a
	// threshold loses revenue. Math is uniform: deltaGbp = magnitude × gbpPerUnit.
	{
		id: "raise-personal-allowance",
		name: "personal allowance",
		currentValue: 12_570,
		unit: "k",
		unitLabel: "£1,000 of threshold change",
		gbpPerUnit: -3_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of moving the personal allowance up or down by £1,000. Raising it (positive magnitude) loses ~£3bn/year; lowering loses revenue gain of the same magnitude.",
			alternatives: [
				{
					label: "PA at £15,000 (vs £12,570)",
					value: 7_290_000_000,
					note: "A £2,430 raise = ~£7.3bn/year revenue loss. Frequently proposed as cost-of-living relief.",
				},
				{
					label: "Freeze for 1 year",
					value: 1_500_000_000,
					note: "The 'do nothing' alternative. Different mechanism, similar magnitude per year.",
				},
			],
			caveat:
				"Linear at small changes (±£1-3k); at large moves the integrated revenue effect compounds with band interactions. PA raises are politically popular but highly costly per £.",
		},
		incidence: {
			vector: [0.01, 0.05, 0.09, 0.12, 0.14, 0.15, 0.15, 0.13, 0.10, 0.06],
			note: "Same incidence pattern as a PA freeze (sign-inverted) — affects the same earners, just in the opposite direction.",
			source: HMRC,
		},
	},
	{
		id: "raise-higher-rate-threshold",
		name: "higher-rate threshold",
		currentValue: 50_270,
		unit: "k",
		unitLabel: "£1,000 of threshold change",
		gbpPerUnit: -800_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of moving the higher-rate threshold up or down by £1,000. Raising it loses ~£800m/year as fewer earners pay 40%.",
			caveat:
				"Roughly half the per-£ cost of equivalent PA changes — narrower base affected. Politically attractive as a 'middle-class tax cut' that doesn't help the highest earners (who lose the marginal benefit at the additional-rate threshold).",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0.02, 0.06, 0.12, 0.20, 0.30, 0.30],
			note: "Same incidence pattern as an HRT freeze — affects deciles 7–10. Sign-inverted: raising threshold = these deciles GAIN.",
			source: HMRC,
		},
	},
	{
		id: "raise-additional-rate-threshold",
		name: "additional-rate threshold",
		currentValue: 125_140,
		unit: "k",
		unitLabel: "£1,000 of threshold change",
		gbpPerUnit: -150_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of moving the additional-rate threshold by £1,000. Narrow base.",
			caveat:
				"Highly behavioural — top earners adjust income timing and form aggressively at the threshold boundary. Static estimate only; dynamic effects can flip the sign at large moves.",
		},
		incidence: {
			vector: [0, 0, 0, 0, 0, 0, 0, 0.02, 0.08, 0.90],
			note: "Almost entirely top decile — same pattern as additional-rate IT and the freeze on this threshold.",
			source: HMRC,
		},
	},
	// Catch-all "other tax measures" lever (unit: "bn"). Direct GBP magnitude
	// in £bn. Used for budget measures that don't deserve their own lever
	// (asset taxes, gambling duties, EV mileage charges, etc.) — encoded as
	// a single placeholder line with a clear note in the scenario's caveat.
	{
		id: "apprenticeship-levy",
		name: "apprenticeship levy",
		currentRate: 0.005,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 6_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of a 1pp rise in the apprenticeship levy rate (0.5% of large employers' payroll above £3m). Each pp ≈ £6bn at current payroll base.",
			alternatives: [
				{
					label: "Threshold change",
					note: "Lowering the £3m payroll threshold to £1m would raise ~£500m/yr by capturing more SMEs. Politically loaded — small business sensitive.",
				},
				{
					label: "0.1pp rise (most realistic)",
					value: 600_000_000,
					note: "From 0.5% to 0.6% — modest scale; £600m to fund expanded training. The size of move recent governments have considered.",
				},
			],
			caveat:
				"Introduced by Osborne (Summer 2015) at 0.5%, implemented April 2017. Frozen at 0.5% throughout the Conservative years. Funds apprenticeship training in England (devolved consequentials in Scotland/Wales/NI). Behavioural responses are real — large employers will rebadge work to qualify spending or restructure to stay under the £3m threshold.",
		},
		incidence: {
			vector: [0.02, 0.04, 0.07, 0.10, 0.13, 0.14, 0.15, 0.14, 0.12, 0.09],
			note: "Falls on large employers' payrolls above £3m. Economic incidence is on workers via wage suppression — pattern resembles employer NICs but slightly more middle-weighted because the £3m threshold means it spares smaller firms (where lower-paid workers are concentrated).",
			source: HMRC,
		},
	},
	{
		id: "bank-surcharge",
		name: "bank surcharge (on top of corporation tax)",
		currentRate: 0.03,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 350_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of a 1pp rise in the bank surcharge — an additional corporation tax band applied to UK bank profits above £100m. Currently 3%.",
			alternatives: [
				{
					label: "Reverse Hunt's 8%→3% cut",
					value: 1_750_000_000,
					note: "Restoring the 8% rate Osborne introduced (2016-2023) would raise ~£1.75bn vs the current 3%. Hunt cut it when corp tax rose to 25% to keep the combined bank tax rate stable.",
				},
				{
					label: "Bank levy (different instrument)",
					note: "A 'bank levy' on balance sheets exists separately (~£1.4bn/yr at current rate). The surcharge applies to profits, the levy to assets. Don't conflate.",
				},
			],
			caveat:
				"Bank surcharge is politically charged — banks lobby hard against rises arguing they undermine UK competitiveness in financial services. The 8%→3% cut in 2023 was sold as compensating for the corp tax rise; reversing it would imply an effective tax rate above the headline corp rate for banks.",
		},
		incidence: {
			vector: [0.01, 0.02, 0.03, 0.05, 0.07, 0.08, 0.10, 0.13, 0.20, 0.31],
			note: "Falls on bank profits → roughly half on capital owners (concentrated top decile, including pension funds and insurance) and half on bank workers + customers (more spread). Net effect is moderately top-heavy.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.05,
			note: "Banks have substantial profit-shifting capacity (many UK banks are subsidiaries of internationals). Surcharge rises near the headline corp tax rate trigger relocation/restructuring. Combined with Pillar Two, the realistic ceiling is around 10–12% combined rate before substantial avoidance.",
			source: HMRC,
		},
	},
	{
		id: "energy-profits-levy",
		name: "energy profits levy (on top of corporation tax)",
		currentRate: 0.38,
		unit: "pp",
		unitLabel: "percentage point",
		gbpPerUnit: 70_000_000,
		asOf: "2024-10",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-10",
			measure:
				"Revenue effect of a 1pp rise in the energy profits levy — a windfall surcharge on UK oil and gas profits, on top of the standard 30% ring-fence corporation tax. Currently 38% (Reeves Oct 2024 raised from 35%); combined effective rate ~78%.",
			alternatives: [
				{
					label: "Sunak's 25% introduction (May 2022)",
					value: 5_000_000_000,
					note: "Original EPL set at 25% to capture energy-crisis windfall — projected ~£5bn over the first year. Replaced an earlier voluntary contribution scheme that didn't deliver.",
				},
				{
					label: "Hunt's 35% rise (Nov 2022)",
					value: 700_000_000,
					note: "Raised from 25% to 35% (+10pp) and extended to March 2028 — added ~£20bn over the forecast (~£700m/yr at lever calibration; OBR's then-forecast was higher because gas prices were higher).",
				},
				{
					label: "Reeves's Oct 2024 changes",
					value: 1_500_000_000,
					note: "Rate raised 35→38% (+3pp), extended to March 2030, investment allowance scrapped — combined ~£1.5bn/yr over forecast. Oil & gas industry argued (with some IFS sympathy) that the all-in effective rate now deters investment.",
				},
				{
					label: "Abolish EPL",
					value: -2_500_000_000,
					note: "Conservatives campaigned in 2024 to remove the EPL entirely — would lose ~£2.5bn/yr. Industry and unions both want clarity (sunset vs permanence) — current architecture is a windfall tax with no clear off-ramp.",
				},
			],
			caveat:
				"Narrow base — UK oil & gas profits collapsed since the 2022 energy-crisis spike, so absolute revenue is modest (£2-3bn/yr) compared to political prominence. Per-pp figures are very price-elastic: at peak gas prices (2022-23) each pp was worth far more. Encoded against a 2024 base. EPL is on the active deletion list of every Conservative manifesto since 2024 and a permanent fixture of every Labour fiscal event.",
		},
		incidence: {
			vector: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.15, 0.17],
			note: "Falls on oil & gas firms → partly on shareholders (top decile, pension funds) and partly on consumers via energy prices (slightly regressive). Net effect is moderately top-heavy with a regressive tail.",
			source: HMRC,
		},
		elasticity: {
			coefficient: 0.10,
			note: "Highly elastic to commodity prices and investment timing. EPL revenues collapsed in 2024 as gas prices fell — proof that windfall taxes are vulnerable to the very prices they're designed to capture. Rate rises accelerate disinvestment in the UKCS basin. OBR's recent EPL costings show large dynamic-static gaps.",
			source: HMRC,
		},
	},
	{
		id: "fuel-duty",
		name: "fuel duty",
		currentRate: 52.95, // pence per litre (post-2022 5p cut, frozen since)
		unit: "p-per-litre",
		unitLabel: "penny per litre",
		gbpPerUnit: 500_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Revenue effect of a 1 penny per litre change in main fuel duty rate (52.95p/litre as of 2024). Applies to petrol and diesel for road use.",
			alternatives: [
				{
					label: "5p cut continuation cost",
					value: 2_500_000_000,
					note: "The 5p cut introduced in March 2022 has been continued in every Budget since. Annual cost vs the cancelled inflation increase: ~£2.5bn.",
				},
				{
					label: "Inflation increase reinstatement",
					value: 1_500_000_000,
					note: "If fuel duty rose with inflation as historically planned, it would raise ~£1.5bn extra the first year (then compound).",
				},
			],
			caveat:
				"Fuel duty has been frozen for over a decade — the cumulative real-terms loss vs inflation-indexed duty is enormous (£100bn+ over the freeze period). It's THE most politically protected duty in UK fiscal policy. EVs erode the base over time, motivating Budget 2025's introduction of an EV mileage duty from 2028.",
		},
		incidence: {
			vector: [0.06, 0.08, 0.10, 0.11, 0.12, 0.12, 0.12, 0.11, 0.10, 0.08],
			note: "Roughly flat in £ across deciles, hence regressive in % of income. Bottom deciles drive less but spend a larger share of income on fuel; top deciles drive more but it's a smaller share. Rural households of any decile bear more.",
			source: HMRC,
		},
	},
	{
		id: "stamp-duty",
		name: "stamp duty land tax",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2024-10",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-10",
			measure:
				"SDLT measures expressed in £bn raised (positive) or lost (negative). The banded rate structure (0% / 5% / 10% / 12% on main residential, plus surcharges) makes 'pp on a single rate' meaningless; red books quantify SDLT moves directly in £bn.",
			alternatives: [
				{
					label: "Second-home surcharge (Reeves Oct 2024)",
					value: 300_000_000,
					note: "Surcharge on additional dwellings raised 3% → 5% from October 2024 — projected ~£300m/yr.",
				},
				{
					label: "Mini-budget cuts (Kwarteng Sept 2022)",
					value: -1_500_000_000,
					note: "Threshold raised from £125k to £250k + first-time-buyer band raised — cost ~£1.5bn/yr. Reversed by Hunt within weeks.",
				},
				{
					label: "Sunak holiday (July 2020 - Sept 2021)",
					value: -3_800_000_000,
					note: "Pandemic-era nil-rate band raised to £500k — cost ~£3.8bn over the holiday period. Drove a one-off house-price spike + transactions surge.",
				},
				{
					label: "Abolish residential SDLT",
					value: -10_000_000_000,
					note: "Residential SDLT raises ~£10bn/yr; commercial ~£2-3bn. A perennial think-tank proposal (mobility-distorting tax, IFS critical) but no major party has committed.",
				},
			],
			caveat:
				"SDLT changes show up frequently in budget lines (every Chancellor since 2014 has touched it). Use this lever rather than `tax-other` when the move is specifically housing/property — separates the political signal from sundry asset-tax changes. Surcharge changes (second homes, non-resident) and threshold/band changes are both captured here; methodology should note which.",
		},
		incidence: {
			vector: [0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.10, 0.15, 0.22, 0.32],
			note: "Property purchases are concentrated in upper deciles, with higher SDLT bands (5%/10%/12%) hitting the top decile especially. Bottom deciles rarely buy property at all (high renter share); top deciles dominate higher-value transactions.",
			source: HMRC,
		},
	},
	{
		id: "tax-other",
		name: "other tax measures",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2024-01",
		source: HMRC,
		methodology: {
			source: HMRC,
			asOf: "2024-01",
			measure:
				"Catch-all for fiscal measures not separately modelled — gambling duties, environmental levies, sundry compliance measures, IHT base broadening, dividend/savings allowances. Magnitude is £bn raised (positive) or lost (negative). CGT, IHT rate, SDLT, fuel duty, apprenticeship levy, and bank surcharge are now separate levers — use those when the policy fits.",
			alternatives: [
				{
					label: "Why this exists",
					note: "Real budgets contain dozens of small measures. Forcing each into a specific rate or threshold lever distorts the picture; this lever lets a scenario faithfully record 'this budget raised £2bn through assorted means' without pretending to attribute it to a specific rate change.",
				},
			],
			caveat:
				"Use sparingly. If a measure is large and recurring, it deserves its own lever (motivating future architecture work). Small one-off measures and bundles of compliance changes are the right use case.",
		},
	},
	// -----------------------------------------------------------------
	// Hypothetical instruments — don't exist as UK levers yet. Encoded
	// here as direct £bn levers (unit "bn") so the wizard's "break the
	// rules" override can actually commit them. Status is "new-
	// legislation" in TAX_LEGISLATION; magnitude conventions use the
	// estimatedYield from each lever's primary academic/policy reference.
	// -----------------------------------------------------------------
	{
		id: "wealth-tax",
		name: "wealth tax (annual, 1% on assets > £1m)",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2020-12",
		source: {
			url: "https://www.wealthandpolicy.com/wp/papers.html",
			label: "Wealth Tax Commission 2020",
		},
		methodology: {
			source: {
				url: "https://www.wealthandpolicy.com/wp/papers.html",
				label: "Wealth Tax Commission 2020",
			},
			asOf: "2020-12",
			measure:
				"£bn raised by an annual wealth tax. Wealth Tax Commission 2020 estimated £260bn from a one-off 5% tax on wealth > £500k; an annual 1% on wealth > £1m yields ~£11bn/yr at steady state.",
			alternatives: [
				{
					label: "One-off (5% on wealth > £500k)",
					value: 260_000_000_000,
					note: "Wealth Tax Commission's headline scenario — raises ~£260bn one-off but cannot be repeated.",
				},
				{
					label: "Annual 2% on wealth > £5m",
					value: 8_000_000_000,
					note: "Higher threshold trades fewer payers for more political durability.",
				},
			],
			range: {
				low: 6_000_000_000,
				high: 16_000_000_000,
				note: "Wide uncertainty — capital flight (10-30% of yield), valuation disputes, and avoidance via trusts/offshore structures. Wealth Tax Commission's central estimate already prices in 70% effective base.",
			},
			caveat:
				"Doesn't exist as UK statute. ~24 months to legislate. No comprehensive UK wealth registry — administration would be a significant lift. Risks documented by the Wealth Tax Commission: capital flight, double-taxation arguments, constitutional challenge.",
		},
	},
	{
		id: "land-value-tax",
		name: "Land Value Tax (annual, on unimproved land value)",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2011-09",
		source: {
			url: "https://ifs.org.uk/publications/mirrlees-review",
			label: "IFS Mirrlees Review",
		},
		methodology: {
			source: {
				url: "https://ifs.org.uk/publications/mirrlees-review",
				label: "IFS Mirrlees Review",
			},
			asOf: "2011-09",
			measure:
				"£bn raised by an annual tax on the unimproved value of land. IFS estimates £30bn+/yr at low rates; could replace council tax + business rates.",
			alternatives: [
				{
					label: "Replace council tax + business rates",
					value: 50_000_000_000,
					note: "Combined replacement raises gross ~£50bn but is largely offset by abolished taxes — net new revenue ~£10-15bn.",
				},
				{
					label: "On top of existing taxes",
					value: 30_000_000_000,
					note: "IFS Mirrlees central estimate at low rates.",
				},
			],
			range: {
				low: 20_000_000_000,
				high: 40_000_000_000,
				note: "Yield depends heavily on rate and treatment of agricultural land, residential vs commercial, and threshold structure.",
			},
			caveat:
				"Doesn't exist; ~36mo to legislate including comprehensive land valuation (the major implementation lift). Strong academic support (IFS Mirrlees, Resolution Foundation). Major political opposition from landowners. Transitional housing-market disruption risk.",
		},
	},
	{
		id: "frequent-flyer-levy",
		name: "Frequent flyer levy (escalating per-flight tax)",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2023-01",
		source: {
			url: "https://www.theccc.org.uk/publication/sixth-carbon-budget/",
			label: "CCC Sixth Carbon Budget",
		},
		methodology: {
			source: {
				url: "https://www.theccc.org.uk/publication/sixth-carbon-budget/",
				label: "CCC Sixth Carbon Budget",
			},
			asOf: "2023-01",
			measure:
				"£bn raised by replacing flat Air Passenger Duty with an escalating per-flight tax. CCC and Climate Assembly UK estimates ~£5bn/yr at moderate rates.",
			alternatives: [
				{
					label: "First flight free, escalating thereafter",
					note: "More politically palatable. Most travellers exempt; revenue concentrated on top decile (frequent-flyer minority).",
				},
				{
					label: "Higher base rate (no escalation)",
					note: "Simpler to implement but loses the climate-targeting rationale.",
				},
			],
			range: {
				low: 3_000_000_000,
				high: 8_000_000_000,
				note: "Range driven by rate calibration and behavioural avoidance (route shifting via international hubs).",
			},
			caveat:
				"Doesn't exist as an instrument. Aviation industry pushback. International air-travel agreements (bilateral aviation treaties) complicate per-passenger taxes that depend on route history.",
		},
	},
	{
		id: "carbon-border-tax",
		name: "Carbon Border Adjustment Mechanism (CBAM)",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2023-12",
		source: {
			url: "https://www.gov.uk/government/consultations/factsheet-carbon-border-adjustment-mechanism-cbam",
			label: "HMT · CBAM consultation",
		},
		methodology: {
			source: {
				url: "https://www.gov.uk/government/consultations/factsheet-carbon-border-adjustment-mechanism-cbam",
				label: "HMT · CBAM consultation",
			},
			asOf: "2023-12",
			measure:
				"£bn raised by a tariff on imported goods based on carbon intensity, mirroring the EU CBAM. UK announced intention to introduce by 2027; legislation pending.",
			alternatives: [
				{
					label: "Mirror EU CBAM (cement/steel/aluminium/fertiliser/electricity/H2)",
					value: 4_000_000_000,
					note: "Coverage matching EU implementation. Yield grows as the implicit carbon price rises.",
				},
				{
					label: "Targeted high-emission imports only",
					value: 2_000_000_000,
					note: "Narrower base but lower implementation overhead.",
				},
			],
			range: {
				low: 2_000_000_000,
				high: 6_000_000_000,
				note: "Yield depends on coverage, implicit carbon price, and import substitution response.",
			},
			caveat:
				"Legislation not yet passed (announced for 2027). WTO compatibility under contestation. Trade-partner retaliation risk; implementation requires substantial customs infrastructure.",
		},
	},
	{
		id: "online-services-tax-expansion",
		name: "Expanded Digital Services Tax",
		unit: "bn",
		unitLabel: "£ billion",
		gbpPerUnit: 1_000_000_000,
		asOf: "2024-04",
		source: {
			url: "https://www.gov.uk/guidance/digital-services-tax",
			label: "HMRC · Digital Services Tax",
		},
		methodology: {
			source: {
				url: "https://www.gov.uk/guidance/digital-services-tax",
				label: "HMRC · Digital Services Tax",
			},
			asOf: "2024-04",
			measure:
				"£bn raised by expanding the existing 2% Digital Services Tax (current revenue ~£800m/yr from ~10 platforms) to broader services or a higher rate. Magnitude represents the *additional* revenue beyond the existing DST.",
			alternatives: [
				{
					label: "Rate to 3%",
					value: 1_500_000_000,
					note: "1pp rate rise on existing base.",
				},
				{
					label: "Broaden base to mid-tier platforms",
					value: 2_500_000_000,
					note: "Lower the £25m UK-revenue threshold or expand qualifying services.",
				},
			],
			range: {
				low: 1_000_000_000,
				high: 4_000_000_000,
				note: "Yield depends on OECD Pillar One negotiations — if the multilateral framework lands, UK DST is meant to be withdrawn.",
			},
			caveat:
				"Constrained by OECD Pillar One framework. Political risk from US tech-firm lobbying; tariff retaliation precedent (US 25% Section 301 in 2020).",
		},
	},
];

export const getTaxLever = (id: string): TaxLever =>
	TAX_LEVERS.find((t) => t.id === id) ?? TAX_LEVERS[0]!;

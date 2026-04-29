// Annotated UK budgets and Spring Statements, encoded as approximate
// scenarios our levers can represent. The scenario is a *simplification* of
// what actually happened — many fiscal measures don't map cleanly to the six
// tax levers and ten spending programmes the calculator models. Each entry
// names what we're approximating and what's missing.
//
// Authoring a new budget:
//   1. Set name + date + chancellor + party + sources.
//   2. Encode each major fiscal lever as a scenario line. Use the closest
//      available lever and call out the substitution in `caveats`.
//   3. Order lines by magnitude descending where possible.
//   4. Verify against gov.uk's published Budget Red Book and OBR's outlook.
//
// Order: newest first.

export type Party =
	| "Labour"
	| "Conservative"
	| "Lib Dem"
	| "SNP"
	| "Coalition"
	| "Other";

// `RealisedOutcome` records what actually happened vs the budget's forecast.
// This drives the backtest UI — taking the historical corpus and comparing
// announced impact to delivered impact builds credibility for a public-facing
// model. Populate where realised data is well-documented; leave undefined
// where it isn't yet (the UI will mark such entries "data not yet available"
// rather than fudging).
export interface RealisedOutcome {
	asOf: string; // when this measurement was made (ISO YYYY-MM)
	headline: string; // one-line summary ("Threshold freezes raised 3× the original forecast due to higher inflation")
	predictedDelta: number; // £/yr at horizon (positive = revenue raised; negative = cost)
	realisedDelta: number; // £/yr at the same horizon (post-outturn)
	horizonYears: number; // typically 3–5
	note: string; // 2–4 sentences explaining the divergence
	source: { url: string; label: string };
}

export interface AnnotatedBudget {
	id: string;
	name: string; // "Autumn 2024 Budget"
	date: string; // ISO YYYY-MM-DD
	chancellor: string;
	party: Party;
	scenario: string; // serialized via serializeScenario
	shortDescription: string; // one-liner for the list view
	notes: string; // 2–4 sentences of context
	source: { url: string; label: string };
	caveats: string; // simplifications and what isn't modelled
	placeholder?: boolean; // true = entry is a stub awaiting real content
	realised?: RealisedOutcome;
}

export const ANNOTATED_BUDGETS: readonly AnnotatedBudget[] = [
	{
		id: "spring-forecast-2026",
		name: "Spring Forecast 2026",
		date: "2026-03-03",
		chancellor: "Rachel Reeves",
		party: "Labour",
		// Largely a forecast update under the new 'one major fiscal event per
		// year' rule. Modest new commitments only — the £18bn lower borrowing
		// path was a forecast revision (better revenue), not a policy lever,
		// so it isn't encoded as a scenario line.
		scenario: "p:defence:3,p:education:4",
		shortDescription:
			"Forecast update under Reeves's 'one fiscal event per year' rule. £18bn lower borrowing on better revenues; minor defence + education adds.",
		notes:
			"First Spring Forecast since rebranding from Spring Statement. OBR borrowing fell ~£18bn vs Autumn forecast on better revenues, lifting stability-rule headroom by nearly £24bn. New: £3.5bn DfE for SEND reforms (FY28/29 baseline), £650m Typhoon upgrades + £1bn Leonardo helicopter deal. Cost-of-living continuations from Budget 2025: £150 energy bill cut, rail fare freeze, prescription charge freeze, 5p fuel-duty cut extended to August 2026.",
		source: {
			url: "https://www.gov.uk/government/speeches/spring-forecast-2026-speech",
			label: "HM Treasury · Spring Forecast 2026 speech",
		},
		caveats:
			"Spring Forecasts are smaller fiscal events than Budgets. The headline £18bn lower borrowing was a forecast revision (better revenues), not a policy choice — deliberately omitted from the scenario, mentioned in notes. The £3.5bn SEND money is a 2028-29 commitment encoded as a current-year proxy. Cost-of-living measures (£150 energy, rail freeze, prescription freeze, fuel duty extension) are continuations of Budget 2025 — not new fiscal moves.",
	},
	{
		id: "budget-2025",
		name: "Autumn Budget 2025",
		date: "2025-11-26",
		chancellor: "Rachel Reeves",
		party: "Labour",
		// Big spending package funded heavily by frozen IT thresholds (fiscal
		// drag through 2031) plus selective asset/property tax rises. NHS got
		// 'additional £50bn in 2029-30 vs Spring 2024 plans'. Two-child welfare
		// limit removed. Triple lock confirmed +4.8%.
		// Now uses dedicated freeze levers (3 extra years on PA + HRT) — much
		// closer to the policy mechanism than the previous basic-rate proxy.
		// Dividend tax +2pp encoded directly via the dedicated lever (~£1bn).
		// `tax-other:3` now covers savings tax +2pp, property-income tax bands
		// (~£1.2bn combined), pension pots into IHT (~£1.5bn), gambling duty
		// rises and council tax surcharge — base/structural changes that don't
		// fit the rate-style levers.
		scenario:
			"t:freeze-personal-allowance:3,t:freeze-higher-rate-threshold:3,t:dividend-tax:2,t:tax-other:3,p:nhs-england:10,p:working-age-welfare:3,p:state-pension:5,p:education:2",
		shortDescription:
			"Reeves's second budget. Big spending package — NHS +£50bn by 2029-30, two-child limit removed — funded by frozen tax thresholds + selective asset tax rises.",
		notes:
			"IT/NIC thresholds frozen April 2028–April 2031, generating ~£10bn/year of fiscal drag by 2029-30. Dividend tax +2pp (April 2026), savings tax +2pp (April 2027), new property-income tax bands (basic 22% / higher 42% / additional 47%) — together ~£2.2bn in 2029-30. Pension salary sacrifice capped at £2,000 (2029); pension pots brought into IHT (April 2027). New £2m+ council tax surcharge (April 2028); new EV mileage duty (April 2028). Two-child welfare limit removed (lifting ~450k children out of poverty). NHS Neighbourhood Health Centres + £300m capital. Stability rule met by £21.7bn margin — most fiscal headroom 'more than doubled' vs Spring 2024 plans.",
		source: {
			url: "https://www.gov.uk/government/publications/budget-2025-document",
			label: "HM Treasury · Budget 2025 document",
		},
		caveats:
			"Frozen thresholds (the dominant revenue raiser) are now encoded faithfully via dedicated 'freeze for N years' levers. Dividend tax +2pp encoded directly via the new `dividend-tax` lever (£1bn). Savings tax +2pp + property income tax bands (~£1.2bn), pension pots into IHT (~£1.5bn), gambling duty rises (Remote Gaming Duty 21%→40%), and the £2m council tax surcharge are bundled in `tax-other:+3` — base broadenings or structural/threshold changes that don't fit the rate-style lever set. EV mileage duty (April 2028) and corporation tax writing-down allowance change (-4pp) aren't separately captured. NHS settlement encoded as a single-year shift; actual was a multi-year ramp toward £50bn extra by 2029-30.",
	},
	{
		id: "autumn-2024",
		name: "Autumn Budget 2024",
		date: "2024-10-30",
		chancellor: "Rachel Reeves",
		party: "Labour",
		// Employer NICs +1.2pp (rate) + £4.1k secondary-threshold drop ≈ £25bn
		// raised — both encoded directly via dedicated levers. CGT higher rate
		// +4pp; SDLT second-home surcharge 3→5%; EPL 35→38%; IHT base changes
		// (AIM/agri, pension pots from 2027); fiscal-rule change to allow
		// ~£20bn extra capital borrowing.
		scenario:
			"t:employer-nics-main:1.2,t:employer-nics-secondary-threshold:-4.1,t:capital-gains-tax:4,t:stamp-duty:0.3,t:energy-profits-levy:3,t:tax-other:2.5,p:nhs-england:7,p:defence:5,p:education:3,b:20000000000",
		shortDescription:
			"First Labour budget in 14 years. ~£40bn tax raise (mostly employer NICs, plus CGT/IHT/SDLT/EPL) to fund NHS expansion + capital investment.",
		notes:
			"Reeves's first budget. Headline measure: employer NICs raised from 13.8% to 15% (the rate move) with the secondary threshold dropping from £9,100 to £5,000 (the bigger contributor), together raising ~£25bn. CGT rates raised: lower 10→18%, higher 20→24% (non-residential), projected ~£2.5bn/yr by 2029-30. Second-home SDLT surcharge raised 3→5% (~£300m). Energy Profits Levy raised 35→38% and extended to March 2030, with investment allowance scrapped (~£1.5bn/yr). IHT base broadened: AIM/agricultural reliefs tightened (the 'family farm' row) and unused pension pots brought into IHT from April 2027 (~£2bn combined). NHS got £22.6bn over two years. Capital spending rules eased via a switch from PSND to PSNFL as the fiscal anchor, opening ~£50bn of additional borrowing headroom. Markets digested the package without the volatility that followed the September 2022 mini-budget.",
		source: {
			url: "https://www.gov.uk/government/publications/autumn-budget-2024",
			label: "HM Treasury · Autumn Budget 2024",
		},
			caveats:
			"Both halves of the £25bn employer-NICs raise now encoded explicitly: rate move via `employer-nics-main:1.2` (~£10bn) and threshold drop via `employer-nics-secondary-threshold:-4.1` (~£15bn). CGT higher-rate +4pp, SDLT second-home surcharge +0.3, and EPL +3pp via their dedicated levers. `tax-other:2.5` covers the IHT base broadenings (AIM/agri reliefs + pension pots from 2027, ~£2bn) plus the CGT lower-rate residual (~£0.5bn). NHS settlement encoded as a single first-year increase rather than the actual two-year ramp.",
	},
	{
		id: "spring-2024",
		name: "Spring Budget 2024",
		date: "2024-03-06",
		chancellor: "Jeremy Hunt",
		party: "Conservative",
		// 2pp employee NICs cut, partially funded by non-dom abolition + EPL
		// extension. Net: ~£6bn/yr tax cut after offsets.
		scenario: "t:nics-main:-2,t:tax-other:4",
		shortDescription:
			"Pre-election tax cut. Employee NICs cut from 10% to 8%, costing ~£10bn/year (partly funded by non-dom abolition + EPL extension).",
		notes:
			"Hunt's final pre-election budget. Headline: employee Class 1 NICs main rate cut from 10% to 8%, on top of the 12%→10% cut already announced in the Autumn 2023 Statement. Combined annual cost ~£21bn. Funded partly by abolishing non-dom status (~£3bn) and extending the energy profits levy by a year (~£1.5bn), partially offset by the child benefit threshold rise (£50k → £60k taper start, ~£500m cost). The OBR judged this as boosting take-home pay but at the cost of deteriorating long-run public services.",
		source: {
			url: "https://www.gov.uk/government/publications/spring-budget-2024",
			label: "HM Treasury · Spring Budget 2024",
		},
		caveats:
			"Encodes the headline NICs cut explicitly. Non-dom abolition (~£3bn raised), EPL extension (~£1.5bn raised), and child benefit threshold rise (~£500m cost) bundled as `tax-other:+4` — none fit the existing rate/threshold lever set without distortion. Non-dom is closest to an IHT base change but isn't the rate; EPL deserves its own lever eventually (touched at every budget since 2022).",
		realised: {
			asOf: "2025-04",
			headline:
				"NICs cut delivered as forecast in the first year; non-dom abolition delivery transferred to Labour with modifications.",
			predictedDelta: -10_000_000_000,
			realisedDelta: -10_500_000_000,
			horizonYears: 1,
			note: "Hunt's 2pp employee NICs cut took effect April 2024 with one-month overlap to election. HMRC outturn data for 2024-25 show the rate cut cost ~£10–11bn (modestly above forecast as wage growth was higher). Non-dom abolition was implemented by Labour from April 2025 with substantive modifications (no 4-year overseas income relief; tighter capital-gains treatment) — Treasury costing of the modified package was £2.5bn vs Hunt's £3bn forecast, but unfair to compare since Labour redesigned the policy. EPL extension survived the Conservative→Labour transition and delivered as forecast.",
			source: {
				url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
				label: "OBR EFO Mar 2025 + HMRC outturn",
			},
		},
	},
	{
		id: "autumn-2023",
		name: "Autumn Statement 2023",
		date: "2023-11-22",
		chancellor: "Jeremy Hunt",
		party: "Conservative",
		// 2pp employee NICs cut from 12% to 10%; full expensing permanent.
		scenario: "t:nics-main:-2",
		shortDescription:
			"Tax-cutting Autumn Statement. Employee NICs cut from 12% to 10%; full expensing made permanent.",
		notes:
			"First of two NICs cuts in election-year budgeting. Employee Class 1 NICs main rate from 12% to 10%, costing ~£10bn/year. 'Full expensing' (100% capital allowances) made permanent, costing ~£11bn/year by 2028-29. Triple lock for state pensions retained at +8.5%. Welfare reforms tightened sanctions for some claimants.",
		source: {
			url: "https://www.gov.uk/government/publications/autumn-statement-2023",
			label: "HM Treasury · Autumn Statement 2023",
		},
		caveats:
			"Encodes the headline NICs cut. Permanent full expensing (~£11bn/yr cost) and welfare reforms aren't separately modelled.",
		realised: {
			asOf: "2025-04",
			headline:
				"NICs cut and full expensing both delivered as forecast — but the political cover (Conservative pre-election tax cut) didn't survive the July 2024 election.",
			predictedDelta: -10_000_000_000,
			realisedDelta: -9_500_000_000,
			horizonYears: 1,
			note: "Hunt's 2pp NICs cut from January 2024 cost ~£9.5bn in 2024-25 — close to the £10bn central forecast, slightly under as wage growth came in lower than expected. Permanent full expensing has accumulated cost ~£10bn/yr by 2025-26, on track. Reeves preserved both measures despite earlier Labour signalling that the NICs cuts might be reversed; the political-economy lesson is that pre-election tax cuts entrench, even after a change of government.",
			source: {
				url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
				label: "OBR EFO Mar 2025 + HMRC outturn",
			},
		},
	},
	{
		id: "spring-2023",
		name: "Spring Budget 2023",
		date: "2023-03-15",
		chancellor: "Jeremy Hunt",
		party: "Conservative",
		// Pension cap abolition (£1bn loss), full expensing 3-year (£9bn/yr),
		// childcare expansion (~£4bn/yr by 2027), energy price guarantee
		// extended 3 months (~£3bn). Fuel duty 5p cut maintained.
		scenario:
			"t:tax-other:-10,p:education:5,p:working-age-welfare:0.5,b:5000000000",
		shortDescription:
			"Hunt's growth-plan budget. Pension cap abolished; 3-year full expensing for businesses; major childcare expansion; energy support extended.",
		notes:
			"Hunt's first full budget after stabilising post-mini-budget. Lifetime allowance on pension savings abolished entirely (huge for high earners and NHS consultants). Full expensing — 100% deduction on plant/machinery — set at three years, costing ~£9bn/year. Free childcare expansion to 9-month-olds for working parents (huge multi-year ramp). Energy Price Guarantee extended at £2,500 for three more months (~£3bn). Fuel duty 5p cut maintained, fuel duty inflation increase cancelled.",
		source: {
			url: "https://www.gov.uk/government/speeches/spring-budget-2023-speech",
			label: "HM Treasury · Spring Budget 2023 speech",
		},
		caveats:
			"Full expensing (-£9bn/yr) and pension allowance changes (-£1bn) bundled into a single -£10bn `tax-other` line — both are large enough to deserve their own levers eventually. Childcare expansion encoded as a 5% education increase, but the actual ramp goes from £0 in 2023 to ~£4bn by 2027; hard to capture in a single-year scenario. Energy Price Guarantee 3-month extension treated as £5bn additional borrowing — the actual figure depended on wholesale gas prices.",
	},
	{
		id: "autumn-2022",
		name: "Autumn Statement 2022",
		date: "2022-11-17",
		chancellor: "Jeremy Hunt",
		party: "Conservative",
		// Reversed mini-budget; introduced threshold freeze extension (the
		// freeze that Reeves later extended further); lowered additional rate
		// threshold; raised EPL 25→35% + new electricity generator levy;
		// dividend allowance announced to fall £2k → £1k → £500. NHS +
		// schools spending up.
		scenario:
			"t:freeze-personal-allowance:2,t:freeze-higher-rate-threshold:2,t:raise-additional-rate-threshold:-25,t:energy-profits-levy:10,t:dividend-allowance:-1.5,t:tax-other:3.55,p:nhs-england:2,p:education:2.5,p:working-age-welfare:0.7",
		shortDescription:
			"Hunt's reversal of the mini-budget. Tax rises (frozen thresholds, lowered additional-rate threshold, energy levy) + NHS/schools spending up.",
		notes:
			"The 'cleanup' Autumn Statement after the mini-budget. Original 4-year IT/NIC threshold freeze extended to 6 years (April 2028). Additional-rate threshold cut from £150,000 to £125,140 — effectively raising tax on those earning £150k+ by ~£1,200/year. Energy Profits Levy raised from 25% to 35%; new 45% temporary levy on low-carbon electricity generators. Dividend allowance cut from £2k to £1k (then £500); CGT exemption from £12,300 to £6k (then £3k). On the spending side: NHS +£3.3bn/year, schools +£2.3bn/year, social care +£1-1.7bn. Total fiscal consolidation: £55bn over forecast.",
		source: {
			url: "https://www.gov.uk/government/speeches/the-autumn-statement-2022-speech",
			label: "HM Treasury · Autumn Statement 2022 speech",
		},
		caveats:
			"Now uses the new threshold-change + EPL + dividend-allowance levers natively. Freeze extension is `freeze-personal-allowance:2,freeze-higher-rate-threshold:2`; additional-rate threshold cut is `raise-additional-rate-threshold:-25` (negative magnitude = lowering threshold = revenue gain). EPL +10pp encoded directly (£700m at lever calibration; OBR's then-forecast was higher because gas prices were elevated). Dividend allowance £2k → £500 announced full path encoded as `dividend-allowance:-1.5` (£750m). CGT exemption cut + electricity generator levy + sundry compliance bundled as `tax-other:+3.55bn`. Social care figure is rough.",
		realised: {
			asOf: "2025-03",
			headline:
				"Total fiscal consolidation broadly as scored, but composition diverged: threshold freezes raised more, EPL raised much less.",
			predictedDelta: 55_000_000_000,
			realisedDelta: 50_000_000_000,
			horizonYears: 5,
			note: "OBR's £55bn fiscal consolidation forecast came close to delivering — within ~10% on the headline. Threshold freezes dramatically over-performed (higher CPI than forecast pulled more earners across thresholds; ~£40bn vs £25bn at horizon). The Energy Profits Levy under-delivered by a wide margin: gas prices fell faster than forecast and oil & gas profits collapsed, so the 25→35% rise raised £4–5bn rather than £15bn+ over the period. The two near-cancelled out at the macro level.",
			source: {
				url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
				label: "OBR EFO Mar 2025",
			},
		},
	},
	{
		id: "spring-2022",
		name: "Spring Statement 2022",
		date: "2022-03-23",
		chancellor: "Rishi Sunak",
		party: "Conservative",
		// NICs primary threshold raised £3k (~£6bn cost, encoded via tax-other);
		// 5p fuel duty cut now uses the dedicated fuel-duty lever (£500m/p
		// = £2.5bn for the 5p cut). Future basic-rate IT cut promised, never
		// delivered.
		scenario:
			"t:tax-other:-6,t:fuel-duty:-5,p:working-age-welfare:0.5",
		shortDescription:
			"Sunak's pre-Truss statement. NICs threshold raised £3k (£6bn cut); 5p fuel duty cut; promised basic-rate IT cut by 2024 (never delivered).",
		notes:
			"Sunak's last fiscal event as Chancellor before becoming PM. Headline: NICs primary threshold raised from £9,568 to £12,570 (aligning with IT personal allowance), worth ~£330/year per worker, costing ~£6bn/year. 5p fuel duty cut for 12 months (~£2.5bn). Household Support Fund doubled to £1bn. Promised a basic-rate IT cut from 20% to 19% by 2024 — a commitment that didn't survive the political turmoil that followed. The Truss-Kwarteng mini-budget came six months later.",
		source: {
			url: "https://www.gov.uk/government/speeches/spring-statement-2022-speech",
			label: "HM Treasury · Spring Statement 2022 speech",
		},
		caveats:
			"NICs primary threshold raise (-£6bn) bundled as `tax-other`. Fuel duty 5p cut now encoded via the dedicated `fuel-duty:-5` lever (was previously bundled). The calculator's `raise-personal-allowance` lever covers IT but not NICs — they have different bases despite being at the same threshold post-2022. The promised future basic-rate IT cut isn't encoded since it was never implemented. Household Support Fund £500m increase encoded as a 0.5% bump to working-age welfare.",
	},
	{
		id: "mini-budget-2022",
		name: "Growth Plan ('Mini-budget') 2022",
		date: "2022-09-23",
		chancellor: "Kwasi Kwarteng",
		party: "Conservative",
		// Basic rate IT 20→19 (-1pp), additional rate 45→40 abolished (-5pp),
		// SDLT thresholds raised (-£1.5bn). Corp tax reversal + NICs reversal
		// stay in the borrow proxy. £45bn unfunded headline preserved via
		// reduced borrow line + explicit lever lines.
		scenario:
			"t:basic-rate-income-tax:-1,t:additional-rate-income-tax:-5,t:stamp-duty:-1.5,b:43500000000",
		shortDescription:
			"The mini-budget that crashed gilt markets. ~£45bn of unfunded tax cuts; reversed within weeks.",
		notes:
			"Liz Truss's Growth Plan, delivered by Kwarteng. Basic rate IT cut from 20% to 19%; additional rate at 45% abolished entirely; corporation tax rise reversed; stamp duty thresholds raised (£125k → £250k for main, first-time buyer relief raised to £625k). Total ~£45bn/year unfunded. Gilt yields surged 100bp+ in the days following, prompting Bank of England intervention to stabilise pension fund LDI exposures. Most measures reversed within six weeks; Truss resigned on 20 October. Hunt replaced Kwarteng on 14 October and unwound the bulk of the package.",
		source: {
			url: "https://www.gov.uk/government/publications/the-growth-plan-2022-documents",
			label: "HM Treasury · The Growth Plan 2022",
		},
		caveats:
			"SDLT cuts encoded explicitly as `stamp-duty:-1.5`. Corporation tax reversal (~£18bn/yr at our 6pp lever calibration; £12bn at the time) and 1.25pp NICs reversal (~£15bn) stay in the borrow proxy — extracting them all would lose the iconic 'unfunded' political signal. The reduced £43.5bn 'borrow' line stands in for the remaining unfunded portion, not a literal new gilt issuance plan — the lack of OBR scoring is the substantive policy story.",
		realised: {
			asOf: "2022-11",
			headline:
				"Almost the entire package was reversed within six weeks. Realised fiscal impact ≈ zero — but the gilt-market reaction cost £20bn+ in higher debt servicing.",
			predictedDelta: -45_000_000_000,
			realisedDelta: 0,
			horizonYears: 1,
			note: "Truss resigned 20 October 2022; Hunt unwound the basic-rate cut, additional-rate abolition, corp tax reversal, and energy levy changes within weeks. SDLT changes survived. Beyond the £0 fiscal impact, gilt yields rose ~100bp in the days after the announcement, prompting an emergency Bank of England gilt-buying programme and persistently higher debt-servicing costs estimated at £20–30bn over subsequent forecasts. Pension funds' LDI exposures came close to systemic crisis. The model can't capture market-reaction costs — they're rendered as pure £0 here.",
			source: {
				url: "https://obr.uk/efo/economic-and-fiscal-outlook-november-2022/",
				label: "OBR EFO Nov 2022 (post-reversal)",
			},
		},
	},
	{
		id: "autumn-2021",
		name: "Autumn Budget and Spending Review 2021",
		date: "2021-10-27",
		chancellor: "Rishi Sunak",
		party: "Conservative",
		// UC taper cut 63→55%, NHS resource spending up to £177bn, education
		// boost, alcohol/APD reform.
		scenario:
			"p:nhs-england:7,p:working-age-welfare:1.5,p:education:5,t:tax-other:1,t:bank-surcharge:-5",
		shortDescription:
			"Recovery-mode budget. NHS resource budget rises to £177bn; UC taper cut 63%→55%; education catch-up; bank surcharge announced to fall 8%→3% from April 2023.",
		notes:
			"Sunak's recovery-mode Autumn Budget paired with a multi-year Spending Review. UC work-incentive headline: taper cut from 63% to 55% (8pp reduction) plus £500 work allowance increase, worth ~£1,000/year for 2M families (£2bn cost). NHS resource spending lifted from £133bn toward £177bn over the SR period. Schools per-pupil funding restored to 2010 levels by 2024-25 (+£4.7bn). Alcohol duty simplified to 6 rates with draught relief; air passenger duty restructured (lower domestic, new ultra-long-haul band). National Living Wage +6.6% to £9.50/hr. Bank surcharge announced to fall from 8% to 3% from April 2023 alongside the (separately announced) corp tax rise to 25% — the combined bank tax rate stays roughly stable.",
		source: {
			url: "https://www.gov.uk/government/speeches/autumn-budget-and-spending-review-2021-speech",
			label: "HM Treasury · Autumn Budget and SR 2021 speech",
		},
		caveats:
			"NHS settlement encoded as a single-year boost; the actual ramp was multi-year toward £177bn by 2024-25. UC taper cut + work allowance bundled as a 1.5% working-age welfare increase. Alcohol/APD reform bundled as small `tax-other:+1`. Bank surcharge cut 8%→3% encoded as `bank-surcharge:-5` (-£1.75bn at 2024 base) — announced here, took effect April 2023.",
	},
	{
		id: "spring-2021",
		name: "Budget 2021",
		date: "2021-03-03",
		chancellor: "Rishi Sunak",
		party: "Conservative",
		// PATIENT ZERO of the freeze era. Originated the IT/NIC threshold
		// freezes that every subsequent budget extended. Plus corp tax rise
		// announced (19→25 by 2023) + super-deduction + COVID continuations.
		// SDLT holiday 3-month extension (-£1bn) extracted explicitly via the
		// new stamp-duty lever; remaining COVID continuations stay in borrow.
		scenario:
			"t:freeze-personal-allowance:5,t:freeze-higher-rate-threshold:5,t:corporation-tax:6,t:stamp-duty:-1,t:tax-other:-12,p:nhs-england:1.5,b:29000000000",
		shortDescription:
			"The original freeze. IT thresholds frozen until 2026; corp tax announced to rise 19→25%; super-deduction + SDLT holiday extended.",
		notes:
			"The patient zero of the current freeze era. Sunak announced personal allowance and higher-rate threshold frozen until April 2026 — every subsequent Chancellor (Hunt, Reeves) has extended the freeze further. Corporation tax announced to rise from 19% to 25% by April 2023, with a Small Profits Rate at 19% for sub-£50k profits. Super-deduction: 130% capex relief for 2 years, worth £25bn over the period. Furlough extended to September 2021; £20/wk UC uplift continued 6 months; SDLT holiday extended (£500k nil-rate band kept until June 2021, then £250k tapered to September 2021); hospitality VAT 5% extended. The structural pivot: post-pandemic borrowing winds down via tax rises queued for 2023+ rather than near-term spending cuts.",
		source: {
			url: "https://www.gov.uk/government/speeches/budget-speech-2021",
			label: "HM Treasury · Budget 2021 speech",
		},
		caveats:
			"Single-year scenario can't capture the multi-year nature: the corp tax rise was announced now but effective 2023; freezes ran 5 years; super-deduction was 2-year. Encoded with `freeze-personal-allowance:5,freeze-higher-rate-threshold:5` (5 years per the original freeze duration), `corporation-tax:6` (the announced rise), `tax-other:-12` for super-deduction first-year cost, and `stamp-duty:-1` for the SDLT holiday extension. £29bn borrow line approximates ongoing COVID continuations (furlough, UC uplift, hospitality VAT) — actual was higher; this is a single-year slice.",
		realised: {
			asOf: "2025-03",
			headline:
				"Threshold freezes raised roughly 3× the original forecast — the most under-priced fiscal lever in modern UK budgeting.",
			predictedDelta: 8_000_000_000,
			realisedDelta: 35_000_000_000,
			horizonYears: 5,
			note: "Sunak's 5-year freeze on PA + HRT was scored at ~£8bn/yr by 2025-26. Realised revenue is closer to £35bn/yr by 2027-28 — about 4× the original forecast. The divergence is overwhelmingly inflation: OBR's March 2021 forecast assumed CPI averaging ~2%, but actual inflation peaked at 11.1% (Oct 2022) and stayed elevated through 2024. The gap between forecast and outturn here is the single biggest fiscal-drag underestimate in OBR's track record. Subsequent budgets (Hunt 2022, Reeves 2025) extended the freeze further — partly because it was raising so much more than originally promised.",
			source: {
				url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
				label: "OBR EFO Mar 2025 + Forecast Evaluation Report 2024",
			},
		},
	},
	{
		id: "spring-2020",
		name: "Budget 2020",
		date: "2020-03-11",
		chancellor: "Rishi Sunak",
		party: "Conservative",
		// First COVID emergency response + NICs threshold raise + ER reform +
		// big infrastructure boost. The 'overshadowed by pandemic' budget.
		scenario:
			"t:tax-other:-2,p:transport:8,p:nhs-england:1,b:30000000000",
		shortDescription:
			"Sunak's first budget. Initial COVID emergency response + NICs threshold raise + Entrepreneurs' Relief reform + £600bn infrastructure pledge.",
		notes:
			"Delivered as COVID-19 was emerging; effectively a normal budget plus a £30bn emergency stimulus. NICs primary threshold raised £8,632→£9,500 (~£100/year cut for 31M workers, ~£2.5bn/yr cost). Entrepreneurs' Relief lifetime limit cut £10m→£1m, raising ~£1.2bn/year. Infrastructure: £600bn+ over five years pledged (HS2, roads, broadband, affordable homes). NHS: £6bn additional in Parliament. COVID measures: SSP from day 1, £5bn NHS emergency fund, £2bn small business grants, business rates relief for retail/leisure/hospitality. Within weeks, additional emergency packages (furlough, business loans) dwarfed the budget itself.",
		source: {
			url: "https://www.gov.uk/government/speeches/budget-speech-2020",
			label: "HM Treasury · Budget 2020 speech",
		},
		caveats:
			"NICs threshold raise (-£2.5bn) + Entrepreneurs' Relief reform (+£1.2bn) + sundry small changes bundled as `tax-other:-2`. Infrastructure pledge encoded as transport +8% but the £600bn over 5 years was multi-departmental. £30bn borrow line is the announced COVID stimulus; the actual pandemic borrowing in 2020-21 was £300bn+ via subsequent emergency packages.",
	},
	{
		id: "spring-2019",
		name: "Spring Statement 2019",
		date: "2019-03-13",
		chancellor: "Philip Hammond",
		party: "Conservative",
		// A small fiscal event during Brexit limbo. £100m emergency police
		// funding; rest was future commitments and forecast updates.
		scenario: "p:police-justice:0.2",
		shortDescription:
			"Brexit-limbo statement. Mostly future commitments + small police uplift; substantive fiscal moves deferred pending Brexit resolution.",
		notes:
			"Hammond's last fiscal event before Johnson became PM. Brexit deadlock dominated; substantive moves were deferred pending the upcoming Spending Review. £100m emergency funding for police overtime + Violent Crime Reduction Units. Small infrastructure announcements (£260m Borderlands deal, £717m Housing Infrastructure allocations). Free sanitary products in secondary schools. Borrowing forecast £3bn lower than Autumn Budget; debt-to-GDP forecast to fall to 73% by 2023-24 (a forecast subsequently destroyed by COVID).",
		source: {
			url: "https://www.gov.uk/government/speeches/spring-statement-2019-philip-hammonds-speech",
			label: "HM Treasury · Spring Statement 2019 speech",
		},
		caveats:
			"Spring Statements are deliberately small events. The £100m police funding is the only material policy move encoded; everything else was forecast updates or future commitments. Net effect ~£100m shortfall reflects the genuinely modest scale of this statement.",
	},
	{
		id: "autumn-2018",
		name: "Autumn Budget 2018",
		date: "2018-10-29",
		chancellor: "Philip Hammond",
		party: "Conservative",
		// 'Austerity is finally coming to an end' (Hammond's framing). PA and
		// HRT raised early; £20.5bn NHS commitment; UC work allowances up.
		scenario:
			"t:raise-personal-allowance:0.65,t:raise-higher-rate-threshold:3.65,t:tax-other:-1,p:nhs-england:2.5,p:working-age-welfare:0.7",
		shortDescription:
			"Hammond's 'austerity is ending' budget. PA → £12,500 and HRT → £50,000 a year early; £20.5bn NHS commitment; UC work allowances raised.",
		notes:
			"Hammond's framing: 'austerity is finally coming to an end.' Personal allowance lifted to £12,500 (manifesto target hit one year early); higher-rate threshold to £50,000. £20.5bn real-terms NHS increase over 5 years confirmed (May 2018 commitment). UC work allowances +£1,000/yr (£1.7bn cost when complete). Fuel duty frozen for the 9th consecutive year. National Living Wage to £8.21 (4.9% rise). New Digital Services Tax: 2% on UK revenues of £500m+ digital platforms (~£400m/yr from 2020). Business rates relief for small retailers. Living memory: this is the budget where Hammond announced — and weeks later, COVID and Brexit jointly buried — that austerity was over.",
		source: {
			url: "https://www.gov.uk/government/speeches/budget-2018-philip-hammonds-speech",
			label: "HM Treasury · Budget 2018 (Hammond) speech",
		},
		caveats:
			"PA raise from £11,850 to £12,500 encoded as +£650 (`raise-personal-allowance:0.65`); HRT raise £46,350→£50,000 as +£3,650. NHS settlement is multi-year; encoded as a single 2.5% increase representing the first-year ramp. Digital services tax (small first year) + Entrepreneurs' Relief tightening + business rates relief netted into `tax-other:-1`. National Living Wage rise isn't separately encoded — affects employers and workers but not directly a Treasury lever.",
	},
	{
		id: "summer-2015",
		name: "Summer Budget 2015",
		date: "2015-07-08",
		chancellor: "George Osborne",
		party: "Conservative",
		// First post-Coalition Conservative-only budget. Introduced National
		// Living Wage; Apprenticeship Levy announced; £12bn welfare cuts
		// targeted; bank surcharge introduced.
		scenario:
			"t:raise-personal-allowance:0.4,t:raise-higher-rate-threshold:0.6,t:bank-surcharge:8,t:tax-other:-1,p:working-age-welfare:-3",
		shortDescription:
			"Osborne's first Conservative-majority budget. NLW introduced; £12bn welfare cuts targeted; apprenticeship levy announced; bank surcharge introduced at 8%.",
		notes:
			"First Conservative-only budget after the Coalition years. National Living Wage introduced — £7.20/hr from April 2016 for over-25s, targeting £9 by 2020 (covers 2.5M workers, but a private-sector wage move not a Treasury lever). Apprenticeship Levy announced (rate developed later — became 0.5% on £3m+ payrolls from April 2017). £12bn welfare cuts target by 2019-20: 4-year working-age benefit freeze, 2-child limit on tax credits, benefit cap reduced from £26k to £23k London / £20k elsewhere. Bank surcharge introduced at 8% on bank profits from January 2016 — this stayed until Hunt cut it to 3% in 2023. Permanent non-dom status abolished (15-of-20-year rule). IHT family-home allowance £175k introduced. Corporation tax planned cuts to 19% (2017) and 18% (2020).",
		source: {
			url: "https://www.gov.uk/government/speeches/chancellor-george-osbornes-summer-budget-2015-speech",
			label: "HM Treasury · Summer Budget 2015 speech",
		},
		caveats:
			"Bank surcharge encoded as +8pp from 0 (Osborne's introduction). Apprenticeship Levy was announced but rate (0.5% + £3m threshold) wasn't finalised until 2016 and didn't take effect until April 2017 — left in `tax-other` rather than encoded as a 2015 lever change. Residual `tax-other:-1bn` nets non-dom rises + apprenticeship levy announcement + IHT family-home cost. Welfare cuts encoded as 3% first-year reduction; the £12bn target was multi-year. Corp tax future cuts (announced for 2017+/2020) not encoded since they were deferred. National Living Wage isn't a Treasury lever — it's a private-employer cost transferred via legislation. Bank-surcharge lever uses 2024 fiscal base (£350m/pp); 2015 bank profits were smaller, so the actual first-year revenue was closer to £1.5bn.",
		realised: {
			asOf: "2020-04",
			headline:
				"The £12bn welfare-cuts target collapsed: the tax credit cuts were reversed weeks later, leaving roughly half the announced savings.",
			predictedDelta: 12_000_000_000,
			realisedDelta: 5_000_000_000,
			horizonYears: 4,
			note: "Osborne's headline £12bn working-age welfare cuts target by 2019-20 didn't survive contact with politics. The largest single piece — tax credit cuts saving £4.4bn — was reversed in November 2015 after House of Lords pressure. The 4-year benefit freeze + 2-child limit + benefit cap survived; together they delivered roughly £5–6bn/yr by 2019-20, less than half the announced target. Bank surcharge raised ~£1.7bn first year (vs ~£2bn forecast); apprenticeship levy delivered ~£2.5bn at scale (vs £3bn forecast). Both fairly close to forecast. The IFS subsequently characterised this budget as a textbook case of 'what announces big but doesn't deliver.'",
			source: {
				url: "https://ifs.org.uk/publications/welfare-budget-osbornes-12bn-cuts-target",
				label: "IFS analysis of Osborne welfare cuts",
			},
		},
	},
	{
		id: "emergency-2010",
		name: "Emergency Budget 2010",
		date: "2010-06-22",
		chancellor: "George Osborne",
		party: "Coalition",
		// Patient zero of the austerity era. VAT raised 17.5→20%; welfare cuts;
		// public-sector pay freeze; corp tax cuts begun; bank levy introduced.
		// The fiscal trajectory of UK politics for 14+ years started here.
		scenario:
			"t:vat-standard:2.5,t:raise-personal-allowance:1,t:capital-gains-tax:10,t:tax-other:2,t:corporation-tax:-1,p:working-age-welfare:-7,p:nhs-england:0.5,p:education:-3,p:defence:-3",
		shortDescription:
			"Patient zero of austerity. VAT 17.5%→20%; £11bn welfare cuts; CGT 18→28% for higher earners; corp tax phase-down. Set the trajectory of UK fiscal politics for 14+ years.",
		notes:
			"Osborne's foundational Coalition budget delivered seven weeks after the May 2010 election. The largest single tax rise: VAT from 17.5% to 20% from January 2011 (~£12-13bn/yr, the bulk of revenue raising). Personal allowance raised £6,475 → £7,475 (Lib Dem manifesto influence). Corporation tax to be cut 28%→24% over four years. Capital gains tax higher rate 18%→28% for higher earners (the largest single CGT rate move in 25 years; raised ~£1bn/yr at the time). Bank levy introduced on bank balance sheets (~£2bn/yr — distinct from the bank surcharge Osborne would later introduce in 2015). Two-year public-sector pay freeze (excluding lowest paid). Welfare: £11bn cut by 2014-15 — child benefit frozen, tax credit thresholds tightened, housing benefit cap, disability living allowance reform. Departmental cuts of ~25% in non-protected areas over the parliament (NHS and schools partially protected). Forecast: structural deficit eliminated by 2014-15 (subsequently revised many times). The whole shape of UK fiscal politics from 2010 to today — the freeze era, the welfare consolidation, the public-services strain — traces back to this budget's trajectory.",
		source: {
			url: "https://hansard.parliament.uk/Commons/2010-06-22/debates/10062242000005/Budget",
			label: "Hansard · Budget 2010 (Osborne)",
		},
		caveats:
			"VAT rise +2.5pp encoded directly. Personal allowance raise £6,475→£7,475 = `raise-personal-allowance:1` (£3bn cost, approximated using current per-£k effect). CGT 18→28% on higher earners encoded as `capital-gains-tax:10` (+10pp on higher rate; £1bn at lever calibration; matches HMRC's contemporary scoring). Bank levy (~£2bn/yr) + smaller compliance measures bundled as `tax-other:+2bn`. Corp tax phase-down encoded as `-1pp` for first year; the full 4pp cut took 4 years. Welfare cut encoded as 7% first-year reduction; full £11bn was multi-year. Education and defence cuts at 3% are first-year approximations of the 25% cumulative reductions over the parliament. Public-sector pay freeze (~£3bn/yr saving) and council tax freeze grants aren't separately modelled. Source link is to Hansard since gov.uk archive of the 2010 budget speech is no longer publicly indexed.",
		realised: {
			asOf: "2015-04",
			headline:
				"VAT rise raised broadly as forecast; the welfare-cuts target under-delivered by ~20%; CGT raise barely moved revenue.",
			predictedDelta: 12_500_000_000,
			realisedDelta: 13_000_000_000,
			horizonYears: 4,
			note: "VAT 17.5→20% from January 2011 was scored at ~£12.1–12.5bn/yr at maturity; HMRC outturn data show ~£13bn — slightly above forecast (consumer behaviour was stickier than the dynamic model predicted). The CGT rise from 18% to 28% on higher-rate earners was scored at ~£925m but HMRC's later analysis suggests the actual yield was close to zero or negative, with high-earners deferring or restructuring realisations. The £11bn welfare cuts target by 2014-15 delivered ~£8–9bn — child benefit freeze and DLA→PIP migration drove most of the savings; tax credit and housing benefit changes under-performed.",
			source: {
				url: "https://obr.uk/forecast-evaluation-reports/",
				label: "OBR Forecast Evaluation Reports + HMRC outturn",
			},
		},
	},
	{
		id: "brown-2009",
		name: "Budget 2009",
		date: "2009-04-22",
		chancellor: "Alistair Darling",
		party: "Labour",
		// Crisis-era budget. 50p additional rate announced from April 2010 (raising
		// it from 40%); pension tax relief restricted for high earners; PA taper
		// above £100k introduced. Recession deepening; deficit spiralling.
		scenario:
			"t:additional-rate-income-tax:5,t:tax-other:1,b:175000000000",
		shortDescription:
			"Crisis-era budget. 50p rate from April 2010 announced; PA taper above £100k; record borrowing as recession bit.",
		notes:
			"Darling's second budget under Brown. Headline: 50p additional rate of income tax announced for April 2010 (raising from 40%) — the first new top rate since Lawson's 1988 cut from 60%. PA taper introduced for incomes above £100k (effectively a 60% marginal rate band between £100k and £125k). Pension tax relief restricted for high earners. ISA limit raised. £1.7bn extra for jobs / training. Forecast borrowing for 2009-10 a record £175bn (12% of GDP) — recession dwarfed every fiscal lever. Brown lost the May 2010 election; the additional rate took effect under the Coalition who later cut it to 45p (Osborne, 2012).",
		source: {
			url: "https://www.gov.uk/government/publications/budget-2009",
			label: "HM Treasury · Budget 2009",
		},
		caveats:
			"50p rate (40→50) encoded as `additional-rate-income-tax:5` against the modern 45% baseline — preserves the +5pp scale rather than the absolute figure. PA taper above £100k bundled into `tax-other:+1`. £175bn borrow line is the headline forecast deficit, not a discretionary policy choice — recession-driven.",
		realised: {
			asOf: "2013-04",
			headline:
				"50p rate raised much less than HMRC's central forecast — the canonical case of additional-rate elasticity.",
			predictedDelta: 2_500_000_000,
			realisedDelta: 800_000_000,
			horizonYears: 2,
			note: "HMRC's central forecast was £2.5bn/yr from the 50p rate. After implementation in April 2010, behavioural responses — income shifting forward to 2009-10 (forestalling), incorporation, deferral — meant realised yield was ~£0.8bn (HMRC's own 2012 analysis). The cited revenue loss when Osborne cut to 45p in 2012 was £100m. This budget is the empirical anchor for additional-rate elasticity in every subsequent UK tax-modelling exercise (and is reflected in the high coefficient on our `additional-rate-income-tax` elasticity field).",
			source: {
				url: "https://www.gov.uk/government/publications/the-exchequer-effect-of-the-50-per-cent-additional-rate-of-income-tax",
				label: "HMRC · Exchequer effect of the 50% additional rate (2012)",
			},
		},
	},
	{
		id: "brown-pbr-2008",
		name: "Pre-Budget Report 2008",
		date: "2008-11-24",
		chancellor: "Alistair Darling",
		party: "Labour",
		// Financial-crisis response. Temporary VAT cut 17.5→15% (13 months);
		// fiscal stimulus £20bn; deferred fuel duty rises; capital spending
		// brought forward. Top rate planned for April 2010.
		scenario:
			"t:vat-standard:-2.5,t:tax-other:-3,b:20000000000",
		shortDescription:
			"Crisis stimulus PBR. VAT 17.5→15% temporarily; £20bn fiscal stimulus; capital spending brought forward.",
		notes:
			"Darling's emergency PBR after Lehman. Headline: VAT temporary cut from 17.5% to 15% for 13 months (Dec 2008 – Dec 2009). £20bn discretionary fiscal stimulus across capital spending, motor-trade scrappage, training. Increased deferral of fuel duty rises. Capital allowances temporarily enhanced. National debt forecast to rise from 36% of GDP to 57% by 2013 — extraordinary at the time, foreshadowing the post-crisis fiscal trajectory. The 45p rate was first announced here (later moved to 50p in Budget 2009).",
		source: {
			url: "https://www.gov.uk/government/publications/pre-budget-report-2008",
			label: "HM Treasury · Pre-Budget Report November 2008",
		},
		caveats:
			"VAT cut encoded as -2.5pp (the announced move) at modern lever calibration; the actual £ cost in 2008-09 was ~£12bn for 13 months, similar to our static figure scaled appropriately. £20bn borrow is the stimulus headline; the actual deficit explosion was driven by collapsed receipts and bank-rescue costs (~£100bn+ counted into PSNB), not by this stimulus. Bank-rescue cost was largely off-balance-sheet at the time.",
		realised: {
			asOf: "2010-04",
			headline:
				"VAT cut delivered modest retail-price impact; fiscal stimulus arrived too late and was dwarfed by collapsed receipts.",
			predictedDelta: -12_000_000_000,
			realisedDelta: -11_500_000_000,
			horizonYears: 1,
			note: "VAT cut cost as forecast (~£12bn over 13 months). Behavioural retail effect was modest: ONS estimated price-level fall of ~1.4%, less than the full 2.1% pass-through, suggesting retailers absorbed some. Boost to consumer spending was estimated at 0.5–1% — meaningful but small relative to the demand shock from the crisis. The £20bn 'stimulus' was symbolically important but the real fiscal action was the automatic stabilisers (collapsed receipts + rising welfare claims) which moved the deficit by an order of magnitude more.",
			source: {
				url: "https://obr.uk/docs/dlm_uploads/Briefing_paper_No1.pdf",
				label: "OBR Briefing Paper · Forecasting in good times and bad",
			},
		},
	},
	{
		id: "brown-2002",
		name: "Budget 2002",
		date: "2002-04-17",
		chancellor: "Gordon Brown",
		party: "Labour",
		// "NHS budget" — NICs +1pp on employees AND employers ring-fenced for NHS.
		// Funded the largest sustained NHS spending increase since the 1948 founding.
		scenario:
			"t:nics-main:1,t:employer-nics-main:1,p:nhs-england:7",
		shortDescription:
			"The NHS budget. NICs +1pp on employees and employers, ring-fenced for a 7-year NHS spending boom.",
		notes:
			"Brown's defining budget. Both employee Class 1 NICs (10→11%) and employer NICs (11.8→12.8%) raised by 1pp, explicitly to fund a 7.4% real-terms NHS spending increase per year over 5 years (taking NHS budget from £63bn to £105bn by 2008). The first major NICs hike since the 1980s; framed as 'health insurance' rather than tax. Coupled with structural reforms (NHS Plan): foundation trusts, payment by results, waiting time targets. Often cited as the moment 'NICs is just income tax' became politically settled — Brown could raise NICs in a way no chancellor had done with IT for decades.",
		source: {
			url: "https://www.gov.uk/government/publications/budget-2002",
			label: "HM Treasury · Budget 2002",
		},
		caveats:
			"NICs raises encoded at modern lever calibration — actual 2002-03 yield was ~£8bn combined (employee + employer) per HMRC, scaling to ~£13bn at modern wage base. NHS spending increase encoded as 7% first-year boost; actual ramp was 7.4% real-terms compounded over 5 years (much larger cumulative impact). Various smaller measures (working tax credit reforms, child tax credit) bundled into the spending-side framing.",
		realised: {
			asOf: "2008-04",
			headline:
				"NICs hike raised broadly as forecast; NHS spending ramp delivered fully — the most successful 'tax for service' deal in modern UK history.",
			predictedDelta: 8_000_000_000,
			realisedDelta: 8_500_000_000,
			horizonYears: 5,
			note: "NICs raised ~£8.5bn in the first full year (2003-04), close to the £8bn forecast. Behavioural response was minimal — NICs base is sticky and the political framing as 'health insurance' kept compliance high. NHS spending increases delivered as promised: budget rose from £63bn to £105bn between 2002 and 2008, with real-terms growth averaging 7.4%/yr. Health outcomes improved across waiting times, cancer survival, life expectancy. Critics argue productivity grew slowly relative to inputs; Treasury and IFS retrospectives generally view this budget as successful on its own terms.",
			source: {
				url: "https://ifs.org.uk/publications/labour-government-2002-2010-economic-record",
				label: "IFS · The Labour Government's economic record (retrospective)",
			},
		},
	},
	{
		id: "lawson-1988",
		name: "Budget 1988",
		date: "1988-03-15",
		chancellor: "Nigel Lawson",
		party: "Conservative",
		// THE landmark tax-cutting budget. Top rate 60→40; basic rate 27→25;
		// higher-rate bands consolidated to flat 40%. Boom era.
		scenario:
			"t:additional-rate-income-tax:-20,t:basic-rate-income-tax:-2,t:tax-other:-2",
		shortDescription:
			"Lawson's landmark tax cuts. Top rate 60→40; basic rate 27→25; higher-rate bands flattened. Defined British Conservative tax orthodoxy for a generation.",
		notes:
			"The single most consequential UK tax-cutting budget of the 20th century. Top rate of income tax cut from 60% to 40% — abolishing the higher-rate bands (50%, 55%, 60%) into a single 40% rate above the basic-rate threshold. Basic rate cut from 27% to 25%. CGT aligned with IT marginal rates (a base-broadening progressive measure that partially offset the rate cuts). Inheritance tax structure simplified. Mortgage interest relief (MIRAS) restructured. Delivered during the 'Lawson boom' — credit-fuelled expansion that crashed in 1990. The political settlement: top rates above 40% became politically untouchable for decades.",
		source: {
			url: "https://api.parliament.uk/historic-hansard/commons/1988/mar/15/financial-statement",
			label: "Hansard · Lawson Budget speech 1988",
		},
		caveats:
			"Top rate cut 60→40 encoded as -20pp on `additional-rate-income-tax` against the modern 45% baseline — preserves the rate-move scale, not the absolute level. Modern lever calibration ascribes a £200m yield per pp at 45%; in 1988 the base was much smaller and the elastic response famously large. CGT/MIRAS changes bundled into `tax-other:-2`. The 'merging higher-rate bands' move means the modern higher-rate-income-tax lever (40%) is technically what Lawson set as the new top rate; we don't separately encode this since `additional-rate:-20` already captures the headline.",
		realised: {
			asOf: "1992-04",
			headline:
				"Receipt of top-rate IT ROSE after the rate cut — the canonical UK Laffer-curve evidence (boom-driven, contested as causation).",
			predictedDelta: -2_000_000_000,
			realisedDelta: 1_500_000_000,
			horizonYears: 4,
			note: "HMRC central forecast scored a revenue cost. Realised: top decile share of total IT receipts ROSE between 1988-89 and 1990-91 despite the 20pp rate cut, and absolute receipts from the top rate were higher than under the previous regime. Treasury claims this as Laffer-curve evidence; IFS retrospectives note that the 1988-90 financial-sector boom (BIG BANG-era earnings + housing boom) drove most of the receipts surge regardless of rate. Causation is genuinely contested — but the budget's empirical claim that 'cutting top rates can raise more revenue' has been used in every subsequent UK Conservative tax-cutting argument. Behavioural response at top decile: structurally and persistently very large.",
			source: {
				url: "https://ifs.org.uk/publications/income-tax-cuts-1980s",
				label: "IFS · Income tax cuts of the 1980s (retrospective)",
			},
		},
	},
	{
		id: "howe-1979",
		name: "Budget 1979",
		date: "1979-06-12",
		chancellor: "Geoffrey Howe",
		party: "Conservative",
		// THE pivot to indirect taxation. VAT doubled 8→15%; top rate 83→60;
		// basic 33→30. Foundational Thatcherite budget.
		scenario:
			"t:vat-standard:7,t:additional-rate-income-tax:-23,t:basic-rate-income-tax:-3",
		shortDescription:
			"Thatcher's first budget. VAT 8→15%; top IT 83→60; basic 33→30. The foundational shift from direct to indirect taxation in modern UK politics.",
		notes:
			"Howe's first budget for Thatcher, six weeks after the May 1979 election. VAT raised dramatically from 8% (with a higher 12.5% rate on luxury goods, abolished here) to a unified 15%. Top rate of income tax cut 83% → 60% (a 23pp move, the largest single rate change in UK history); basic rate 33% → 30%. Investment income surcharge raised from 10% to 15% (a counter-progressive move, but applying to a smaller base). Public spending cuts of £1.5bn announced (sector-specific). Net effect: revenue-neutral package designed to shift the tax burden from direct to indirect taxation. Inflation surged from 10% to 18% partly as a consequence (the 'one-off' VAT shock fed through to wages). Set the structural pattern of UK fiscal policy for 4+ decades.",
		source: {
			url: "https://api.parliament.uk/historic-hansard/commons/1979/jun/12/budget-statement",
			label: "Hansard · Howe Budget speech 1979",
		},
		caveats:
			"VAT 8→15% encoded as +7pp at modern lever calibration; in 1979 the actual yield was ~£3bn first year. Top rate cut 83→60 encoded as -23pp on `additional-rate-income-tax` against modern 45% baseline (would take the lever to 22%, which makes no sense in modern terms but preserves the historical move's scale). Investment income surcharge bundled — not modelled. £1.5bn spending cuts not modelled in scenario. Fundamentally, encoding 1979-era moves at 2024 lever calibrations gives the 'what would this look like if proposed now' figure, not the contemporary yield — note this for any reader.",
		realised: {
			asOf: "1983-04",
			headline:
				"VAT raised broadly as forecast (and added 4pts to inflation in 1979-80). Top-rate cut had the largest behavioural response in UK fiscal history.",
			predictedDelta: 3_000_000_000,
			realisedDelta: 4_000_000_000,
			horizonYears: 4,
			note: "VAT yield came in close to forecast in cash terms but the inflation-passthrough was larger than HMT modelled — CPI rose ~4 percentage points more in 1979-80 than would have without the VAT change. Top-rate cut: HMRC's contemporary forecast scored a substantial revenue loss; realised yield was actually higher in the 1980s as North Sea oil revenues + financial-sector growth + behavioural unwinding ('income brought back into the UK') boosted top-rate receipts. As with Lawson 1988, causation is genuinely contested between the rate cut itself and contemporary growth drivers.",
			source: {
				url: "https://obr.uk/docs/dlm_uploads/Briefing_paper_No1.pdf",
				label: "OBR Briefing Paper No.1 · Forecasting in good times and bad",
			},
		},
	},
];

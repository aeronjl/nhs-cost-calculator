// Legislative status for every fiscal lever. Drives the wizard's
// hard-forking constraints: choices flagged as "new-legislation" or
// "statutorily-protected" are greyed out by default, with an inline WHY
// that explains the constraint.
//
// Future iteration: users override constraints to model market/political
// reaction (gilt yields, implementation lag, reversal probability). This
// file already carries `relaxation` hooks that capture the realistic
// implementation lag + risk; the simulator can consume them when override
// mode lands.
//
// Categories:
//   - "available"             Existing instrument, modifiable in Finance
//                             Bill or executive action.
//   - "devolved"              Powers (or partial powers) sit with devolved
//                             governments — Scotland (SRIT, LBTT), Wales
//                             (LTT), NI. UK chancellor can't move alone.
//   - "new-legislation"       Doesn't exist as a UK lever; would require
//                             new primary legislation (typically 18+
//                             months for design + parliamentary passage).
//   - "statutorily-protected" Bound by existing law (triple lock, NATO
//                             commitment, ODA pledge). Repeal possible
//                             but politically and legally costly.

export type LegislativeStatus =
	| "available"
	| "devolved"
	| "new-legislation"
	| "statutorily-protected";

export interface RelaxationCost {
	// Estimated time from announcement to revenue/spending impact, in months.
	// Used by future "break the rules" mode to delay the lever's effect.
	implementationMonths: number;
	// Qualitative description of the political / market risk if the rule
	// is broken or the constraint relaxed. Short — one phrase.
	risk: string;
	// Per-rule override penalty fields. The evaluator uses these when an
	// overridden line is committed:
	//   - yieldHaircut: realised yield = nominal × yieldHaircut. Default 0.7
	//     if not specified. Captures capital flight, behavioural avoidance,
	//     partial-reversal risk all rolled in.
	//   - riskPremium: annual debt-servicing cost (negative number) standing
	//     in for the gilt yield response to a credibility-damaging rule break.
	//     Default -£500m if not specified.
	yieldHaircut?: number;
	riskPremium?: number;
}

export interface LegislativeMeta {
	status: LegislativeStatus;
	// Short label rendered in the badge: "Available", "Devolved", etc.
	label: string;
	// 1-2 sentence explainer of the constraint. Surfaced when the user
	// hovers/clicks an unavailable card.
	explainer: string;
	// Optional citation: the Act / commitment / instrument that creates the
	// constraint.
	source?: { url: string; label: string };
	// Future-iteration hook: what overriding this rule would cost.
	relaxation?: RelaxationCost;
}

const FINANCE_BILL = {
	url: "https://www.gov.uk/government/collections/finance-bill",
	label: "HM Treasury · Finance Bill",
};

// Tax levers — keyed by lever id from src/data/levers/tax-rates.ts.
export const TAX_LEGISLATION: Readonly<Record<string, LegislativeMeta>> = {
	"basic-rate-income-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"UK income tax rates are set annually in the Finance Bill. The Chancellor can adjust the basic rate at any Budget; changes typically take effect from the start of the next tax year (April).",
		source: FINANCE_BILL,
	},
	"higher-rate-income-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"UK income tax rates are set annually in the Finance Bill. Changes typically take effect April.",
		source: FINANCE_BILL,
	},
	"additional-rate-income-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"UK income tax rates are set annually in the Finance Bill. Politically charged at the top rate; rate changes have repeatedly been reversed (Brown 50p → Osborne 45p; Truss attempted abolition → Hunt restored).",
		source: FINANCE_BILL,
	},
	"dividend-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"Set annually in the Finance Bill. Owner-managers are highly responsive; rate rises tend to compress the gap between dividend and IT marginal rates.",
		source: FINANCE_BILL,
	},
	"vat-standard": {
		status: "available",
		label: "Available now",
		explainer:
			"VAT rates are set in the Finance Bill. Brexit (Jan 2021) removed the EU VAT framework constraint on reduced/zero rates; the UK retains structural choice.",
		source: FINANCE_BILL,
	},
	"nics-main": {
		status: "available",
		label: "Available now",
		explainer:
			"Employee Class 1 NICs main rate is set in the Social Security Contributions and Benefits Act 1992 (and Finance Bills). Politically distinct from income tax in framing but functionally similar.",
		source: FINANCE_BILL,
	},
	"employer-nics-main": {
		status: "available",
		label: "Available now",
		explainer:
			"Employer Class 1 NICs (secondary rate). Set annually. Reeves's October 2024 rise was the largest single move in years.",
		source: FINANCE_BILL,
	},
	"employer-nics-secondary-threshold": {
		status: "available",
		label: "Available now",
		explainer:
			"Threshold above which employers pay NICs. Set in regulations under the SSCB Act; Reeves dropped it from £9,100 to £5,000 in October 2024.",
		source: FINANCE_BILL,
	},
	"corporation-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"Set annually in the Finance Bill. UK rates above ~28% start to bite on profit-shifting; OECD Pillar Two (15% global minimum) constrains the floor.",
		source: FINANCE_BILL,
	},
	"capital-gains-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"Set in the Finance Bill. Highly behavioural — taxpayers time realisations around expected rate changes (Brown 50p, Reeves 2024).",
		source: FINANCE_BILL,
	},
	"inheritance-tax": {
		status: "available",
		label: "Available now",
		explainer:
			"40% rate set in IHTA 1984 + Finance Bills. Highly avoidable via gifts, business / agricultural relief, life-insurance trusts. Only ~4-5% of estates pay any IHT.",
		source: FINANCE_BILL,
	},
	"stamp-duty": {
		status: "devolved",
		label: "Partly devolved",
		explainer:
			"SDLT applies in England + NI. Replaced by Land and Buildings Transaction Tax in Scotland (2015) and Land Transaction Tax in Wales (2018). UK Chancellor sets only the SDLT version.",
		source: {
			url: "https://www.gov.uk/government/collections/stamp-duty-land-tax-rates",
			label: "HMRC · Stamp Duty Land Tax",
		},
	},
	"fuel-duty": {
		status: "available",
		label: "Available now",
		explainer:
			"Set in the Finance Bill. Frozen for 14+ consecutive years — the most politically protected duty in UK fiscal policy. Annual cancellation of the inflation-uprating is itself a £1.5bn+ giveaway.",
		source: FINANCE_BILL,
	},
	"bank-surcharge": {
		status: "available",
		label: "Available now",
		explainer:
			"Additional corporation-tax band on UK banks above £100m profits. Introduced by Osborne (Summer 2015) at 8%; cut by Hunt to 3% in 2023 alongside the corp-tax rise.",
		source: FINANCE_BILL,
	},
	"energy-profits-levy": {
		status: "available",
		label: "Available now",
		explainer:
			"Windfall surcharge on UK oil and gas profits. Sunak 25% (May 2022) → Hunt 35% (Nov 2022) → Reeves 38% (Oct 2024). Sunset clauses repeatedly extended.",
		source: FINANCE_BILL,
	},
	"apprenticeship-levy": {
		status: "available",
		label: "Available now",
		explainer:
			"0.5% of large employers' payrolls above £3m. Introduced by Osborne (Summer 2015), implemented April 2017. Funds apprenticeship training in England (devolved consequentials elsewhere).",
		source: FINANCE_BILL,
	},
	"raise-personal-allowance": {
		status: "available",
		label: "Available now",
		explainer:
			"Set in the Finance Bill annually. Politically attractive but highly costly per £k (£3bn/yr per £1k raised).",
		source: FINANCE_BILL,
	},
	"raise-higher-rate-threshold": {
		status: "available",
		label: "Available now",
		explainer:
			"Set in the Finance Bill. Roughly half the per-£k cost of equivalent PA changes due to narrower base.",
		source: FINANCE_BILL,
	},
	"raise-additional-rate-threshold": {
		status: "available",
		label: "Available now",
		explainer:
			"Set in the Finance Bill. Highly behavioural — top earners adjust income timing aggressively at the threshold boundary.",
		source: FINANCE_BILL,
	},
	"freeze-personal-allowance": {
		status: "available",
		label: "Available now",
		explainer:
			"Achieved by simply NOT uprating with inflation in the Finance Bill. The 'stealth tax' instrument: Sunak's 5-year freeze (2021) was extended by Hunt (2022) and Reeves (2025).",
		source: FINANCE_BILL,
	},
	"freeze-higher-rate-threshold": {
		status: "available",
		label: "Available now",
		explainer:
			"Held nominal in the Finance Bill — fiscal drag pulls more earners into higher-rate IT each year. Politically quiet but raises substantial revenue.",
		source: FINANCE_BILL,
	},
	"freeze-additional-rate-threshold": {
		status: "available",
		label: "Available now",
		explainer:
			"Already at £125,140 (cut from £150,000 by Hunt in Nov 2022). Continued freezing relies on no inflation-indexation in the Finance Bill.",
		source: FINANCE_BILL,
	},
	"dividend-allowance": {
		status: "available",
		label: "Available now",
		explainer:
			"Annual exempt amount of dividend income. Cut from £5,000 (Osborne 2016) → £2,000 (Hammond 2017) → £500 (Hunt 2022/24). Set in the Finance Bill.",
		source: FINANCE_BILL,
	},
	"tax-other": {
		status: "available",
		label: "Mostly available",
		explainer:
			"Catch-all for sundry budget measures. Most existing UK tax instruments can be adjusted in the Finance Bill; new instruments (wealth tax, LVT, carbon border tax) would require separate primary legislation.",
		source: FINANCE_BILL,
	},
	// Hypothetical levers — committable as proper TaxLevers (unit "bn") but
	// gated by "new-legislation" status. Wizard "break the rules" override
	// applies a yield haircut + risk premium per the relaxation data below.
	"wealth-tax": {
		status: "new-legislation",
		label: "New legislation",
		explainer:
			"No UK wealth tax exists. Would require new primary legislation (~24 months). Wealth Tax Commission 2020 estimated £260bn from a one-off 5% tax on wealth > £500k. Significant administrative challenge: comprehensive UK wealth registry doesn't exist.",
		source: {
			url: "https://www.wealthandpolicy.com/wp/papers.html",
			label: "Wealth Tax Commission 2020",
		},
		relaxation: {
			implementationMonths: 24,
			risk: "Capital flight; valuation disputes; constitutional challenge; double taxation arguments",
			// Capital flight ~15%, valuation disputes ~10%, behavioural
			// avoidance via trusts/offshore ~10%. Risk premium reflects
			// heavy admin overhead (no UK wealth registry exists) plus
			// court challenges.
			yieldHaircut: 0.65,
			riskPremium: -1_000_000_000,
		},
	},
	"land-value-tax": {
		status: "new-legislation",
		label: "New legislation",
		explainer:
			"Tax on the unimproved value of land. Doesn't exist in the UK; perennial proposal from IFS, Mirrlees Review, Resolution Foundation. Requires comprehensive land valuation. IFS estimates £30bn+/yr at low rates.",
		source: {
			url: "https://ifs.org.uk/publications/mirrlees-review",
			label: "IFS · Mirrlees Review",
		},
		relaxation: {
			implementationMonths: 36,
			risk: "Valuation overhead; political opposition from landowners; transitional housing-market disruption",
			// LVT is hard to avoid (land can't move) so haircut is small,
			// but transitional housing-market disruption shaves ~25%.
			// Risk premium dominated by valuation overhead — comprehensive
			// UK land valuation has never been done at scale.
			yieldHaircut: 0.75,
			riskPremium: -1_500_000_000,
		},
	},
	"frequent-flyer-levy": {
		status: "new-legislation",
		label: "New legislation",
		explainer:
			"Replaces flat Air Passenger Duty with a per-flight escalating tax. Doesn't exist as an instrument. Climate Assembly UK and CCC have recommended; would require new legislation and cooperation with airlines for tracking.",
		relaxation: {
			implementationMonths: 24,
			risk: "Aviation industry pushback; international air-travel agreements complications",
			// Avoidance via international hubs (15-20% of yield), airline
			// pushback. Risk premium covers bilateral aviation treaty
			// renegotiations.
			yieldHaircut: 0.80,
			riskPremium: -300_000_000,
		},
	},
	"carbon-border-tax": {
		status: "new-legislation",
		label: "New legislation",
		explainer:
			"Tariff on imported goods based on carbon intensity, mirroring the EU's CBAM. UK announced intention to introduce by 2027 but legislation not yet passed. Would require new primary legislation.",
		source: {
			url: "https://www.gov.uk/government/consultations/factsheet-carbon-border-adjustment-mechanism-cbam",
			label: "HMT · CBAM consultation (Dec 2023)",
		},
		relaxation: {
			implementationMonths: 18,
			risk: "WTO compatibility challenges; trade-partner retaliation",
			// WTO disputes + import-substitution response + trade
			// retaliation reducing import flow → ~30% haircut. Risk
			// premium covers admin + dispute resolution overhead.
			yieldHaircut: 0.70,
			riskPremium: -500_000_000,
		},
	},
	"online-services-tax-expansion": {
		status: "new-legislation",
		label: "New legislation",
		explainer:
			"Existing 2% DST applies to ~10 large platforms; expansion to wider digital services or higher rate would require Finance Bill amendments. Currently constrained by OECD Pillar One negotiations.",
		relaxation: {
			implementationMonths: 12,
			risk: "OECD framework friction; US tech-firm lobbying; tariff retaliation risk",
			// US tech firms have demonstrated capacity to restructure to
			// avoid DST (~15% haircut). Risk premium reflects tariff
			// retaliation precedent (US 25% Section 301 in 2020) and
			// OECD framework friction.
			yieldHaircut: 0.85,
			riskPremium: -400_000_000,
		},
	},
};

export const PROGRAMME_LEGISLATION: Readonly<Record<string, LegislativeMeta>> = {
	"state-pension": {
		status: "statutorily-protected",
		label: "Triple lock (statute)",
		explainer:
			"State pension uprating is bound by the triple lock: max(CPI inflation, earnings growth, 2.5%). Cutting below this requires repealing or suspending the lock — primary legislation, fierce political contest. Sunak's 2022 one-year suspension faced significant pushback.",
		source: {
			url: "https://www.legislation.gov.uk/ukpga/2014/19/contents",
			label: "Pensions Act 2014",
		},
		relaxation: {
			implementationMonths: 12,
			risk: "Pensioner-vote backlash; Lords delays; potential cabinet resignations",
			// Most of the cut delivers — pensioners can't easily 'avoid' a
			// reduced uprating — but Sunak's 2022 one-year suspension shows
			// political pushback often forces partial restoration. Risk
			// premium reflects cabinet-level fallout + likely court challenge.
			yieldHaircut: 0.85,
			riskPremium: -1_500_000_000,
		},
	},
	"working-age-welfare": {
		status: "available",
		label: "Available (but caseload-driven)",
		explainer:
			"UC + disability benefits are set by Acts of Parliament; rates are uprated annually (typically with CPI). Cuts are politically possible but caseload responds slowly and reform packages take 1-2 years to bite.",
		source: {
			url: "https://www.gov.uk/government/collections/welfare-reform-act-2012",
			label: "Welfare Reform Act 2012",
		},
	},
	"nhs-england": {
		status: "available",
		label: "Available (but politically protected)",
		explainer:
			"NHS funding is set in the Spending Review, not statutorily fixed. Demographic pressure pushes baseline ~3% real growth required to maintain current quality. Below-trend settlements have repeatedly become electoral liabilities (2017, 2024).",
	},
	education: {
		status: "available",
		label: "Available",
		explainer:
			"DfE budget set in Spending Review. Schools spend devolved to local authorities + academy trusts; central government controls funding formulas, not operations.",
	},
	defence: {
		status: "statutorily-protected",
		label: "NATO 2% commitment",
		explainer:
			"NATO 2%-of-GDP floor is a binding commitment, not a domestic statute, but breach would be a major diplomatic incident (2023 Wales summit reaffirmed). UK has pledged 2.5% by 2030. Cuts below current levels effectively impossible without renegotiating the alliance commitment.",
		source: {
			url: "https://www.nato.int/cps/en/natohq/topics_67655.htm",
			label: "NATO defence-spending pledge",
		},
		relaxation: {
			implementationMonths: 6,
			risk: "Diplomatic consequences; EU pressure; transatlantic alliance damage",
			// Defence cuts deliver promptly (procurement contracts unwind
			// quickly), but emergency cuts incur ~20% inefficiency from
			// cancelled programmes / penalty clauses. The big cost is
			// diplomatic — gilt yields rise as 'will UK honour commitments?'
			// becomes a market question.
			yieldHaircut: 0.80,
			riskPremium: -3_000_000_000,
		},
	},
	"police-justice": {
		status: "available",
		label: "Available",
		explainer:
			"Police and Ministry of Justice funding set in Spending Review. Operational pressures (prison overcrowding, court backlogs) make further cuts politically costly.",
	},
	"local-govt-grants": {
		status: "available",
		label: "Available (S114 risk)",
		explainer:
			"Central grants to English local authorities. Cut ~40% in real terms since 2010. Further cuts now risk Section 114 (effective bankruptcy) notices — Birmingham, Croydon, Thurrock, Woking already issued these. Technically possible to cut, politically explosive.",
		source: {
			url: "https://www.legislation.gov.uk/ukpga/1988/41/section/114",
			label: "Local Government Finance Act 1988 · S.114",
		},
	},
	transport: {
		status: "available",
		label: "Available",
		explainer:
			"DfT spending set in Spending Review. Capital projects (HS2, road, rail) have high sunk-cost penalties on cancellation; rail subsidies have contractual minimums.",
	},
	"international-aid": {
		status: "statutorily-protected",
		label: "0.7% GNI (statute, currently relaxed)",
		explainer:
			"The 0.7% GNI ODA target is in primary legislation (International Development Act 2015). Sunak cut to 0.5% (2020-22) using a temporary-circumstances clause; restoring to 0.7% is statutorily required but timing is discretionary.",
		source: {
			url: "https://www.legislation.gov.uk/ukpga/2015/12/contents",
			label: "International Development (Official Development Assistance Target) Act 2015",
		},
		relaxation: {
			implementationMonths: 0,
			risk: "Statutorily already relaxed; political pressure to restore",
			// Already de facto relaxed — Sunak cut to 0.5% in 2020. Further
			// cuts deliver almost full nominal savings (recipients are
			// foreign — no domestic political coalition can sustain reversal).
			// Modest risk premium for soft-power damage.
			yieldHaircut: 1.0,
			riskPremium: -200_000_000,
		},
	},
	"net-debt-interest": {
		status: "statutorily-protected",
		label: "Not discretionary",
		explainer:
			"Debt interest is contractual on outstanding gilts and indexed-linked securities. Reducing it requires lower borrowing OR lower gilt yields OR lower inflation (RPI gilts). Treating it as a cuttable lever is misleading.",
		relaxation: {
			implementationMonths: 999,
			risk: "Default would be sovereign-debt crisis",
		},
	},
};

// Hypothetical instruments that don't exist as UK levers. The wizard can
// surface these as greyed-out options with the WHY: "doesn't exist; would
// take ~18-24 months to legislate; politically loaded." Future iteration
// could allow override and model market reaction.
export interface HypotheticalLever {
	id: string;
	name: string;
	estimatedYield: number; // £/yr at maturity
	explainer: string;
	relaxation: RelaxationCost;
	source?: { url: string; label: string };
}

export const HYPOTHETICAL_LEVERS: readonly HypotheticalLever[] = [
	{
		id: "wealth-tax",
		name: "Wealth tax (one-off, e.g. 1% on assets > £1m)",
		estimatedYield: 11_000_000_000,
		explainer:
			"No UK wealth tax exists. Would require new primary legislation. Wealth Tax Commission 2020 estimated £260bn from a one-off 5% tax on wealth above £500k. Significant administrative challenge: comprehensive UK wealth registry doesn't exist.",
		relaxation: {
			implementationMonths: 24,
			risk: "Capital flight; valuation disputes; constitutional challenge; double taxation arguments",
		},
		source: {
			url: "https://www.wealthandpolicy.com/wp/papers.html",
			label: "Wealth Tax Commission 2020",
		},
	},
	{
		id: "land-value-tax",
		name: "Land Value Tax",
		estimatedYield: 30_000_000_000,
		explainer:
			"Tax on the unimproved value of land. Doesn't exist in the UK; perennial proposal from IFS, Mirrlees Review, Resolution Foundation. Would require comprehensive land valuation. IFS estimates £30bn+/yr at low rates.",
		relaxation: {
			implementationMonths: 36,
			risk: "Valuation overhead; political opposition from landowners; transitional housing-market disruption",
		},
		source: {
			url: "https://ifs.org.uk/publications/mirrlees-review",
			label: "IFS · Mirrlees Review (Tax by Design)",
		},
	},
	{
		id: "frequent-flyer-levy",
		name: "Frequent flyer levy (escalating per-flight tax)",
		estimatedYield: 5_000_000_000,
		explainer:
			"Replaces flat Air Passenger Duty with a per-flight escalating tax. Doesn't exist as an instrument. Climate Assembly UK and CCC have recommended; would require new legislation and cooperation with airlines for tracking.",
		relaxation: {
			implementationMonths: 24,
			risk: "Aviation industry pushback; international air-travel agreements complications",
		},
	},
	{
		id: "carbon-border-tax",
		name: "Carbon Border Adjustment Mechanism",
		estimatedYield: 4_000_000_000,
		explainer:
			"Tariff on imported goods based on carbon intensity, mirroring the EU's CBAM. UK announced intention to introduce by 2027 but legislation not yet passed. Would require new primary legislation.",
		relaxation: {
			implementationMonths: 18,
			risk: "WTO compatibility challenges; trade-partner retaliation",
		},
		source: {
			url: "https://www.gov.uk/government/consultations/factsheet-carbon-border-adjustment-mechanism-cbam",
			label: "HMT · CBAM consultation (Dec 2023)",
		},
	},
	{
		id: "online-services-tax-expansion",
		name: "Expanded digital services tax",
		estimatedYield: 2_500_000_000,
		explainer:
			"Existing 2% DST applies to ~10 large platforms; expansion to wider digital services or higher rate would require Finance Bill amendments. Currently constrained by OECD Pillar One negotiations.",
		relaxation: {
			implementationMonths: 12,
			risk: "OECD framework friction; US tech-firm lobbying; tariff retaliation risk",
		},
	},
];

export const getTaxLegislation = (id: string): LegislativeMeta | undefined =>
	TAX_LEGISLATION[id];

export const getProgrammeLegislation = (
	id: string,
): LegislativeMeta | undefined => PROGRAMME_LEGISLATION[id];

// Borrow line legislation — single entry for the borrow lever.
export const BORROW_LEGISLATION: LegislativeMeta = {
	status: "available",
	label: "Available (within fiscal rules)",
	explainer:
		"UK government borrowing is unlimited in principle (no debt ceiling). The constraint is fiscal rules (currently Reeves's stability rule: current expenditure balanced by year 5; PSNFL falling as % GDP). Markets and OBR can constrain de facto via gilt yield response.",
};

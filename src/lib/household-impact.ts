// Compute a scenario's £/yr impact on a representative UK household.
//
// Two-tier methodology, mirroring how IFS / Resolution Foundation publish
// distributional impact tables:
//
//   Tier 1: Direct calculation for levers where we know the household's
//   exposure (income tax bands, NICs bands, dividend income, VAT-able
//   spending, state pension, working-age welfare). These give exact-ish
//   per-household figures.
//
//   Tier 2: Decile-share fallback for levers without a household-direct
//   channel (NHS England, defence, debt interest, etc.). For these we use
//   the lever's incidence vector to allocate £ across deciles, then divide
//   by ~2.8M households per decile to get a per-household £.
//
// Limitations of this simplified model are documented in the UI caveats:
//   - No marginal-rate interaction modelling (Universal Credit taper, child
//     benefit high-income charge, additional-rate transition)
//   - No capital gains / inheritance modelling at the household level
//     (these are highly heterogeneous within a decile)
//   - No regional / housing-tenure adjustments
//   - No behavioural response at the household level (the marginal-rate
//     behavioural model is applied to aggregate yield, not redistributed to
//     individual households)

import { getTaxLever } from "@/data/levers/tax-rates";
import { getProgramme } from "@/data/levers/uk-spending";
import type { RepresentativeHousehold } from "@/data/households";
import type {
	LineEvaluation,
	ScenarioResult,
} from "./scenario";

// How much of a household's income falls within [lower, upper). Used to
// compute exposure to each tax band.
const bandIncome = (income: number, lower: number, upper: number): number =>
	Math.max(0, Math.min(income, upper) - lower);

const HOUSEHOLDS_PER_DECILE = 2_800_000;
const PA = 12_570;
const HRT = 50_270;
const ART = 125_140;
const NIC_PRIMARY = 12_570;
const NIC_UEL = 50_270;
const VAT_BASE_FRAC = 1 / 1.2; // share of price that's NOT VAT (at 20%)

export interface HouseholdLineImpact {
	leverId: string;
	type: "tax" | "programme" | "borrow";
	description: string;
	// £/yr impact. Positive = household loses £; negative = household gains £.
	// Same sign convention as scenario distributional analysis.
	impactGbp: number;
	method: "direct" | "decile" | "skipped";
}

export interface HouseholdImpact {
	totalImpactGbp: number;
	asPercentOfNetIncome: number;
	perLine: HouseholdLineImpact[];
}

// Convenience: total taxable income (subject to standard IT bands).
const taxableIncome = (h: RepresentativeHousehold): number =>
	h.earnedIncome + h.privatePensionIncome + h.statePensionIncome;

const earnedForNICs = (h: RepresentativeHousehold): number => h.earnedIncome;

const computeLineImpact = (
	household: RepresentativeHousehold,
	evaluation: LineEvaluation,
): HouseholdLineImpact => {
	const { line, deltaGbp, description } = evaluation;

	// Borrow lines: no direct household impact in the short run. Long-run
	// debt-servicing cost is allocated by gilt-holding distribution (concentrated
	// top decile + pension funds), but for simplicity we skip per-household.
	if (line.type === "borrow") {
		return {
			leverId: "",
			type: "borrow",
			description,
			impactGbp: 0,
			method: "skipped",
		};
	}

	if (line.type === "programme") {
		const prog = getProgramme(line.leverId);
		// Direct channels we model:
		//   - State pension: hits households with pensioners.
		//   - Working-age welfare: hits households on UC / disability / housing benefit.
		// Otherwise fall back to decile incidence.
		if (line.leverId === "state-pension") {
			if (household.composition.pensioners === 0) {
				return {
					leverId: line.leverId,
					type: "programme",
					description,
					impactGbp: 0,
					method: "direct",
				};
			}
			// Programme magnitude is signed % (positive = increase, negative = cut).
			// deltaGbp positive = revenue freed (programme cut → household loses £).
			// Per pensioner: their state pension is reduced by |magnitude/100| of value.
			const pensionLoss =
				household.statePensionIncome * (-line.magnitude / 100);
			return {
				leverId: line.leverId,
				type: "programme",
				description,
				impactGbp: pensionLoss,
				method: "direct",
			};
		}
		if (line.leverId === "working-age-welfare") {
			if (household.benefitIncome === 0) {
				return {
					leverId: line.leverId,
					type: "programme",
					description,
					impactGbp: 0,
					method: "direct",
				};
			}
			const benefitLoss =
				household.benefitIncome * (-line.magnitude / 100);
			return {
				leverId: line.leverId,
				type: "programme",
				description,
				impactGbp: benefitLoss,
				method: "direct",
			};
		}
		// Other programmes: use decile incidence as a fallback.
		if (prog.incidence) {
			const decileShare =
				prog.incidence.vector[household.decile - 1] ?? 0.1;
			const decileTotalImpact = deltaGbp * decileShare;
			return {
				leverId: line.leverId,
				type: "programme",
				description,
				impactGbp: decileTotalImpact / HOUSEHOLDS_PER_DECILE,
				method: "decile",
			};
		}
		return {
			leverId: line.leverId,
			type: "programme",
			description,
			impactGbp: 0,
			method: "skipped",
		};
	}

	// Tax lines.
	const lever = getTaxLever(line.leverId);
	if (lever.unit === "pp") {
		// Direct calculation for the major rate-style levers based on the
		// household's income exposure to the band.
		if (line.leverId === "basic-rate-income-tax") {
			const exposure = bandIncome(taxableIncome(household), PA, HRT);
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: exposure * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "higher-rate-income-tax") {
			const exposure = bandIncome(taxableIncome(household), HRT, ART);
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: exposure * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "additional-rate-income-tax") {
			const exposure = bandIncome(taxableIncome(household), ART, Infinity);
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: exposure * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "nics-main") {
			const exposure = bandIncome(earnedForNICs(household), NIC_PRIMARY, NIC_UEL);
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: exposure * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "employer-nics-main") {
			// Economic incidence on workers via wages (OBR/IFS consensus).
			// Approximated as full pass-through to wages above the secondary
			// threshold. Conservative: real pass-through is partial in short run.
			const exposure = Math.max(0, household.earnedIncome - 5_000);
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: exposure * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "vat-standard") {
			// VAT on the VAT-able share of consumption. Approximated as if all
			// vatableSpend includes VAT at the new rate; magnitude/100 of that
			// is the additional cost.
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: household.vatableSpend * VAT_BASE_FRAC * (line.magnitude / 100),
				method: "direct",
			};
		}
		if (line.leverId === "dividend-tax") {
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: household.dividendIncome * (line.magnitude / 100),
				method: "direct",
			};
		}
	}

	// Threshold raises (k unit): change in marginal tax around the threshold.
	if (lever.unit === "k") {
		if (line.leverId === "raise-personal-allowance") {
			// Raising PA by £1k: each taxpayer above PA saves £1k × marginal rate.
			// Marginal rate for basic-rate taxpayer: 20% IT + 8% NICs = 28%.
			// For higher-rate: 40% IT + 2% NICs = 42%.
			const ti = taxableIncome(household);
			if (ti <= PA) {
				return {
					leverId: line.leverId,
					type: "tax",
					description,
					impactGbp: 0,
					method: "direct",
				};
			}
			const marginalRate =
				ti > HRT ? 0.42 : ti > NIC_PRIMARY ? 0.28 : 0.20;
			// raise PA by £k → saves £1000k × marginalRate per taxpayer.
			// gbpPerUnit on this lever is negative (raising loses revenue), so
			// deltaGbp on the line is negative when magnitude > 0. Household sees
			// a GAIN (negative impact in our convention).
			const adultsAffected = household.composition.adults;
			return {
				leverId: line.leverId,
				type: "tax",
				description,
				impactGbp: -line.magnitude * 1000 * marginalRate * adultsAffected,
				method: "direct",
			};
		}
	}

	// Fallback: use lever's incidence vector if available.
	if (lever.incidence) {
		const decileShare = lever.incidence.vector[household.decile - 1] ?? 0.1;
		const decileTotalImpact = deltaGbp * decileShare;
		return {
			leverId: line.leverId,
			type: "tax",
			description,
			impactGbp: decileTotalImpact / HOUSEHOLDS_PER_DECILE,
			method: "decile",
		};
	}

	// No incidence available — skip rather than fudge.
	return {
		leverId: line.leverId,
		type: "tax",
		description,
		impactGbp: 0,
		method: "skipped",
	};
};

export const evaluateHouseholdImpact = (
	household: RepresentativeHousehold,
	scenario: ScenarioResult,
): HouseholdImpact => {
	const perLine = scenario.lines.map((ev) =>
		computeLineImpact(household, ev),
	);
	const total = perLine.reduce((sum, p) => sum + p.impactGbp, 0);
	return {
		totalImpactGbp: total,
		asPercentOfNetIncome:
			household.netIncome > 0 ? total / household.netIncome : 0,
		perLine,
	};
};

// Helper exported for tests.
export { bandIncome };

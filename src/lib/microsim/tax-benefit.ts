// Tax-benefit code for the synthetic microsim.
//
// Computes net household income given gross income + composition, applying:
//   - Income tax (FY24/25 bands; uses tax.ts where possible)
//   - Employee NICs (FY24/25)
//   - Universal Credit (standard allowance, child element, work allowance,
//     55% taper)
//   - Child benefit + High Income Child Benefit Charge
//   - Dividend tax (allowance + rate bands)
//   - State pension (taxable income)
//
// Out of scope (would need fuller modelling):
//   - Housing benefit element of UC (we don't model housing tenure)
//   - Council tax + reductions
//   - Disability benefits (PIP, ESA) — would need a disability flag
//   - Carer's allowance, attendance allowance, etc.
//   - Self-employed Class 4 NICs (we lump self-employed into employed earnings)
//   - Pension contribution relief
//
// Sources: HMRC Tax Tables 2024-25, DWP UC Guidance 2024-25, HMRC HICBC.

import { calculateUKTax } from "@/lib/tax";
import type { SynthHousehold } from "./population";

// FY24/25 figures
const PA = 12_570;
const HRT = 50_270;
const ART = 125_140;
const NIC_PT = 12_570; // primary threshold
const NIC_UEL = 50_270;

// UC parameters (annual £, 2024-25 rough)
const UC_STANDARD_SINGLE = 4_725; // single, 25+
const UC_STANDARD_COUPLE = 7_412;
const UC_FIRST_CHILD = 3_455;
const UC_SUBSEQUENT_CHILD = 2_900;
const UC_WORK_ALLOWANCE = 4_500; // higher rate (no housing element)
const UC_TAPER = 0.55;

// Child benefit (annual)
const CB_FIRST_CHILD = 1_331; // £25.60/wk × 52
const CB_SUBSEQUENT_CHILD = 882; // £16.95/wk × 52
const HICBC_START = 60_000;
const HICBC_FULL_CLAWBACK = 80_000;

// Dividend tax (FY24/25)
const DIVIDEND_ALLOWANCE = 500;
const DIV_BASIC_RATE = 0.0875;
const DIV_HIGHER_RATE = 0.3375;
const DIV_ADDITIONAL_RATE = 0.3935;

// Compute the higher-earner's individual earned income for the HICBC test.
// Single-adult households: just their earnings. Couples: assume 60/40 split.
const higherEarnerIncome = (h: SynthHousehold): number => {
	if (h.adults <= 1) return h.earnedIncome;
	return h.earnedIncome * 0.6;
};

// Compute Universal Credit entitlement for a household. Returns 0 if not
// eligible. Uses gross earned income (UC tapers on net-of-tax-and-NIC, but
// the difference at this scale is small; the simplification is OK for first
// pass).
export const computeUC = (h: SynthHousehold): number => {
	// Pensioners aren't on working-age UC (they get pension credit, which we
	// don't model). Households without children + with high earnings won't
	// qualify; let UC taper handle that naturally.
	if (h.pensioners > 0) return 0;

	const isCouple = h.adults >= 2;
	let standardAllowance = isCouple ? UC_STANDARD_COUPLE : UC_STANDARD_SINGLE;
	const childElement =
		h.children === 0
			? 0
			: UC_FIRST_CHILD + (h.children - 1) * UC_SUBSEQUENT_CHILD;
	standardAllowance += childElement;

	// Earnings reduction (taper)
	const taperableEarnings = Math.max(
		0,
		h.earnedIncome - UC_WORK_ALLOWANCE,
	);
	const reduction = taperableEarnings * UC_TAPER;
	const ucNet = Math.max(0, standardAllowance - reduction);
	return Math.round(ucNet);
};

// Child benefit + HICBC clawback. HICBC is on the higher-earning individual,
// not on household income.
export const computeChildBenefit = (h: SynthHousehold): number => {
	if (h.children === 0) return 0;
	const gross =
		CB_FIRST_CHILD + (h.children - 1) * CB_SUBSEQUENT_CHILD;
	const higherInc = higherEarnerIncome(h);
	if (higherInc <= HICBC_START) return gross;
	if (higherInc >= HICBC_FULL_CLAWBACK) return 0;
	const clawbackFraction =
		(higherInc - HICBC_START) / (HICBC_FULL_CLAWBACK - HICBC_START);
	return Math.round(gross * (1 - clawbackFraction));
};

// Dividend tax based on dividend allowance + bands (uses non-dividend income
// to determine which dividend band applies).
export const computeDividendTax = (h: SynthHousehold): number => {
	if (h.dividendIncome <= DIVIDEND_ALLOWANCE) return 0;
	const taxable = h.dividendIncome - DIVIDEND_ALLOWANCE;

	// Determine which band we're in based on non-dividend taxable income
	const nonDivTaxable =
		h.earnedIncome + h.privatePensionIncome + h.statePensionIncome;
	const taxedNonDiv = Math.max(0, nonDivTaxable - PA);

	// Dividends stack on top of other income for band purposes
	let div = taxable;
	let tax = 0;
	const remainingBasic = Math.max(0, HRT - PA - taxedNonDiv);
	const remainingHigher = Math.max(0, ART - HRT);

	const basicSlice = Math.min(div, remainingBasic);
	tax += basicSlice * DIV_BASIC_RATE;
	div -= basicSlice;

	if (div > 0) {
		const higherSlice = Math.min(div, remainingHigher);
		tax += higherSlice * DIV_HIGHER_RATE;
		div -= higherSlice;
	}

	if (div > 0) {
		tax += div * DIV_ADDITIONAL_RATE;
	}

	return Math.round(tax);
};

export interface NetIncomeResult {
	gross: number;
	incomeTax: number;
	nics: number;
	dividendTax: number;
	uc: number;
	childBenefit: number;
	net: number;
}

// Compute the household's net income under current FY24/25 rules.
// Net = gross + UC + child benefit − IT − NICs − dividend tax.
export const computeNetIncome = (h: SynthHousehold): NetIncomeResult => {
	// Combined taxable non-dividend income for IT/NICs purposes
	const taxableEarnings =
		h.earnedIncome + h.privatePensionIncome + h.statePensionIncome;

	// Use existing tax.ts for standard IT + employee NICs on the earner
	// (calculateUKTax assumes a single earner; for couples we apply per-adult
	// approximation by splitting earned income 60/40).
	let incomeTax = 0;
	let nics = 0;
	if (h.adults === 1 || h.pensioners > 0) {
		const tax = calculateUKTax(taxableEarnings);
		incomeTax = tax.incomeTax;
		nics = tax.nationalInsurance;
	} else {
		// Couple: rough split. Higher earner gets 60%, lower 40%.
		const higher = h.earnedIncome * 0.6;
		const lower = h.earnedIncome * 0.4;
		const taxH = calculateUKTax(higher);
		const taxL = calculateUKTax(lower);
		incomeTax = taxH.incomeTax + taxL.incomeTax;
		nics = taxH.nationalInsurance + taxL.nationalInsurance;
		// Pension income still taxable but typically £0 for working-age couples
		if (h.privatePensionIncome + h.statePensionIncome > 0) {
			const pensTax = calculateUKTax(
				h.privatePensionIncome + h.statePensionIncome,
			);
			incomeTax += pensTax.incomeTax;
		}
	}

	const dividendTax = computeDividendTax(h);
	const uc = computeUC(h);
	const childBenefit = computeChildBenefit(h);

	const gross =
		h.earnedIncome +
		h.privatePensionIncome +
		h.statePensionIncome +
		h.dividendIncome;
	const net = gross + uc + childBenefit - incomeTax - nics - dividendTax;

	return { gross, incomeTax, nics, dividendTax, uc, childBenefit, net };
};

// UK income tax + employee NIC bands for FY2024/25 (frozen for FY2025/26).
// Sources: gov.uk income tax bands, gov.uk NIC rates and thresholds.

export const PERSONAL_ALLOWANCE = 12_570;
export const BASIC_RATE_LIMIT = 50_270;
export const HIGHER_RATE_LIMIT = 125_140;
export const PA_TAPER_THRESHOLD = 100_000;

export const BASIC_RATE = 0.2;
export const HIGHER_RATE = 0.4;
export const ADDITIONAL_RATE = 0.45;

// Employee Class 1 NICs (2024/25): 8% main rate, 2% upper rate.
export const NI_MAIN_RATE = 0.08;
export const NI_UPPER_RATE = 0.02;

export interface UKTaxResult {
	gross: number;
	incomeTax: number;
	nationalInsurance: number;
	totalTax: number; // incomeTax + ni
	netIncome: number; // gross − totalTax
	effectiveRate: number; // totalTax / gross
}

export function calculateUKTax(grossSalary: number): UKTaxResult {
	const gross = Math.max(0, grossSalary);
	if (gross === 0) {
		return {
			gross: 0,
			incomeTax: 0,
			nationalInsurance: 0,
			totalTax: 0,
			netIncome: 0,
			effectiveRate: 0,
		};
	}

	// Personal allowance taper: lose £1 of allowance for every £2 earned over
	// £100,000. Fully eliminated by ~£125,140.
	const taperReduction = Math.max(0, gross - PA_TAPER_THRESHOLD) / 2;
	const taperedPA = Math.max(0, PERSONAL_ALLOWANCE - taperReduction);

	const taxableIncome = Math.max(0, gross - taperedPA);
	const basicWidth = BASIC_RATE_LIMIT - PERSONAL_ALLOWANCE;
	const higherWidth = HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT;

	const inBasic = Math.min(basicWidth, taxableIncome);
	const inHigher = Math.min(
		higherWidth,
		Math.max(0, taxableIncome - basicWidth),
	);
	const inAdditional = Math.max(
		0,
		taxableIncome - basicWidth - higherWidth,
	);
	const incomeTax =
		inBasic * BASIC_RATE +
		inHigher * HIGHER_RATE +
		inAdditional * ADDITIONAL_RATE;

	// NICs: 8% on £12,570–£50,270, 2% above. Below PA: 0%.
	const niMain = Math.max(
		0,
		Math.min(BASIC_RATE_LIMIT, gross) - PERSONAL_ALLOWANCE,
	);
	const niUpper = Math.max(0, gross - BASIC_RATE_LIMIT);
	const nationalInsurance = niMain * NI_MAIN_RATE + niUpper * NI_UPPER_RATE;

	const totalTax = incomeTax + nationalInsurance;
	return {
		gross,
		incomeTax,
		nationalInsurance,
		totalTax,
		netIncome: gross - totalTax,
		effectiveRate: totalTax / gross,
	};
}

// Approximate share of total UK government revenue that funds NHS England.
// NHS England ~£165bn / total HMRC tax + NICs receipts ~£900bn ≈ 0.18.
// Intentionally a single rounded constant — a precise calculation would need
// to factor in non-tax revenue (Crown estates etc.) and earmarked NICs flows,
// which is out of scope for a calculator's framing.
export const NHS_FUNDING_SHARE_OF_REVENUE = 0.18;

export const nhsShareOfTax = (totalTax: number): number =>
	totalTax * NHS_FUNDING_SHARE_OF_REVENUE;

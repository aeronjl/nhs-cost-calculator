import { BORROWING, type DebtInstrument } from "@/data/levers/borrowing";
import type { IncidenceVector } from "@/lib/distribution";

export interface BorrowingPathAssumptions {
	nominalGrowth: number;
	bankRate: number;
	inflation: number;
	// Parallel shift from macro feedback or a stress scenario, expressed as a
	// rate (0.01 = +100bp).
	yieldCurveShift?: number;
	// CPI/RPI shock for index-linked gilts, expressed in percentage points.
	cpiDeviationPp?: number;
}

export interface BorrowingInstrumentCost {
	id: DebtInstrument["id"];
	label: string;
	share: number;
	rate: number;
	interestCostGbp: number;
	refinancingGbp: number;
}

export interface BorrowingYear {
	year: number;
	nominalGdpGbp: number;
	primaryFinancingGbp: number;
	interestCostGbp: number;
	netFundingGbp: number;
	psnbIncreaseGbp: number;
	psnbShiftGbp: number;
	openingDebtGbp: number;
	closingDebtGbp: number;
	debtStockDeltaGbp: number;
	debtGdpDeltaPp: number;
	effectiveRate: number;
	riskPremium: number;
	rMinusG: number;
	stabilisingPrimaryBalanceGbp: number;
	debtInterestPctGdp: number;
	refinancingPctGdp: number;
	refinancingGbp: number;
	instruments: BorrowingInstrumentCost[];
}

export interface BorrowingStressCase {
	id: "central" | "rate-shock" | "inflation-shock" | "credibility-shock";
	label: string;
	path: BorrowingYear[];
}

// Future debt-service incidence: broad taxpayer base, mildly progressive.
// This is deliberately less top-heavy than wealth/capital taxes because debt
// service is usually financed from the whole tax mix over time.
export const FUTURE_DEBT_SERVICE_INCIDENCE: IncidenceVector = [
	0.03, 0.05, 0.07, 0.08, 0.09, 0.1, 0.12, 0.14, 0.17, 0.15,
];

const DEFAULT_ASSUMPTIONS: BorrowingPathAssumptions = {
	nominalGrowth: 0.04,
	bankRate: BORROWING.bankRate,
	inflation: BORROWING.inflation,
};

const gdpAtYear = (
	year: number,
	assumptions: BorrowingPathAssumptions,
): number => BORROWING.ukGdp * Math.pow(1 + assumptions.nominalGrowth, year - 1);

const issuancePressurePremium = (amount: number): number => {
	if (amount <= 0) return 0;
	const excess = Math.max(0, amount - 50_000_000_000);
	return (excess / 100_000_000_000) * BORROWING.risk.issuancePremiumPer100bn;
};

export const borrowingRiskPremium = (
	openingDebtGbp: number,
	year: number,
	amount: number,
	assumptions: BorrowingPathAssumptions = DEFAULT_ASSUMPTIONS,
): number => {
	const debtGdpDeltaPp = (openingDebtGbp / gdpAtYear(year, assumptions)) * 100;
	const linear =
		debtGdpDeltaPp * BORROWING.risk.debtGdpRiskPremiumPerPp;
	const excess = Math.max(
		0,
		Math.abs(debtGdpDeltaPp) - BORROWING.risk.convexityThresholdDebtGdpPp,
	);
	const convex =
		Math.sign(debtGdpDeltaPp) *
		excess *
		excess *
		BORROWING.risk.convexityPremiumPerPpSquared;
	return linear + convex + issuancePressurePremium(amount);
};

const instrumentRate = (
	instrument: DebtInstrument,
	riskPremium: number,
	assumptions: BorrowingPathAssumptions,
): number => {
	const bankRateShock = assumptions.bankRate - BORROWING.bankRate;
	const macroShift = assumptions.yieldCurveShift ?? 0;
	if (instrument.inflationLinked) {
		return Math.max(
			-0.02,
			(instrument.realYield ?? 0) +
				assumptions.inflation +
				(assumptions.cpiDeviationPp ?? 0) / 100 +
				riskPremium +
				macroShift +
				bankRateShock * instrument.bankRatePassThrough,
		);
	}
	return Math.max(
		0,
		(instrument.nominalYield ?? BORROWING.thirtyYearGiltYield) +
			riskPremium +
			macroShift +
			bankRateShock * instrument.bankRatePassThrough,
	);
};

export const effectiveBorrowingRate = (
	openingDebtGbp: number,
	year: number,
	amount: number,
	assumptions: BorrowingPathAssumptions = DEFAULT_ASSUMPTIONS,
): { rate: number; riskPremium: number; instruments: BorrowingInstrumentCost[] } => {
	const riskPremium = borrowingRiskPremium(
		openingDebtGbp,
		year,
		amount,
		assumptions,
	);
	const instruments = BORROWING.portfolio.map((instrument) => {
		const rate = instrumentRate(instrument, riskPremium, assumptions);
		const debtSlice = openingDebtGbp * instrument.share;
		const refinancingGbp =
			Math.abs(debtSlice) / Math.max(0.25, instrument.maturityYears);
		return {
			id: instrument.id,
			label: instrument.label,
			share: instrument.share,
			rate,
			interestCostGbp: debtSlice * rate,
			refinancingGbp,
		};
	});
	const rate = instruments.reduce((sum, item) => sum + item.share * item.rate, 0);
	return { rate, riskPremium, instruments };
};

export const projectBorrowingPath = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingYear[] => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const rows: BorrowingYear[] = [];
	let openingDebtGbp = amount;

	for (let year = 1; year <= years; year++) {
		const nominalGdpGbp = gdpAtYear(year, a);
		const primaryFinancingGbp = year === 1 ? amount : 0;
		const { rate, riskPremium, instruments } = effectiveBorrowingRate(
			openingDebtGbp,
			year,
			amount,
			a,
		);
		const interestCostGbp = instruments.reduce(
			(sum, instrument) => sum + instrument.interestCostGbp,
			0,
		);
		const refinancingGbp = instruments.reduce(
			(sum, instrument) => sum + instrument.refinancingGbp,
			0,
		);
		const closingDebtGbp = openingDebtGbp + interestCostGbp;
		const debtGdpDeltaPp = (closingDebtGbp / nominalGdpGbp) * 100;
		const psnbIncreaseGbp = primaryFinancingGbp + interestCostGbp;
		const rMinusG = rate - a.nominalGrowth;
		const stabilisingPrimaryBalanceGbp =
			(closingDebtGbp * rMinusG) / (1 + a.nominalGrowth);

		rows.push({
			year,
			nominalGdpGbp,
			primaryFinancingGbp,
			interestCostGbp,
			netFundingGbp: primaryFinancingGbp - interestCostGbp,
			psnbIncreaseGbp,
			psnbShiftGbp: -psnbIncreaseGbp,
			openingDebtGbp,
			closingDebtGbp,
			debtStockDeltaGbp: closingDebtGbp,
			debtGdpDeltaPp,
			effectiveRate: rate,
			riskPremium,
			rMinusG,
			stabilisingPrimaryBalanceGbp,
			debtInterestPctGdp: (interestCostGbp / nominalGdpGbp) * 100,
			refinancingPctGdp: (refinancingGbp / nominalGdpGbp) * 100,
			refinancingGbp,
			instruments,
		});
		openingDebtGbp = closingDebtGbp;
	}

	return rows;
};

export const projectBorrowingStressCases = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingStressCase[] => {
	const central = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	return [
		{
			id: "central",
			label: "Central",
			path: projectBorrowingPath(amount, years, central),
		},
		{
			id: "rate-shock",
			label: "+100bp Bank Rate",
			path: projectBorrowingPath(amount, years, {
				...central,
				bankRate: central.bankRate + 0.01,
			}),
		},
		{
			id: "inflation-shock",
			label: "+3pp inflation",
			path: projectBorrowingPath(amount, years, {
				...central,
				inflation: central.inflation + 0.03,
				cpiDeviationPp: (central.cpiDeviationPp ?? 0) + 3,
			}),
		},
		{
			id: "credibility-shock",
			label: "+100bp gilt premium",
			path: projectBorrowingPath(amount, years, {
				...central,
				yieldCurveShift: (central.yieldCurveShift ?? 0) + 0.01,
			}),
		},
	];
};

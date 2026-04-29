import {
	BORROWING,
	DEFAULT_BORROWING_STRATEGY_ID,
	type BorrowingStrategyId,
	type DebtInstrument,
	getBorrowingStrategy,
} from "@/data/levers/borrowing";
import type { IncidenceVector } from "@/lib/distribution";
import {
	type PercentileBand,
	computeBand,
	sampleNormal,
	seededRng,
} from "@/lib/uncertainty";

export interface BorrowingPathAssumptions {
	nominalGrowth: number;
	bankRate: number;
	inflation: number;
	strategyId: BorrowingStrategyId;
	// Parallel shift from macro feedback or a stress scenario, expressed as a
	// rate (0.01 = +100bp).
	yieldCurveShift?: number;
	// CPI/RPI shock for index-linked gilts, expressed in percentage points.
	cpiDeviationPp?: number;
	// Explicit portfolio override for research tests or user-defined strategy
	// work. When present, it takes precedence over `strategyId`.
	portfolio?: readonly DebtInstrument[];
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
	id:
		| "central"
		| "rate-shock"
		| "inflation-shock"
		| "credibility-shock"
		| BorrowingStrategyId;
	label: string;
	path: BorrowingYear[];
}

export interface BorrowingFanYear {
	year: number;
	centralInterestCostGbp: number;
	interestCostBand: PercentileBand;
	centralDebtStockGbp: number;
	debtStockBand: PercentileBand;
	centralPsnbShiftGbp: number;
	psnbShiftBand: PercentileBand;
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
	strategyId: DEFAULT_BORROWING_STRATEGY_ID,
};

const resolvedAssumptions = (
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingPathAssumptions => ({ ...DEFAULT_ASSUMPTIONS, ...assumptions });

const portfolioFor = (
	assumptions: BorrowingPathAssumptions,
): readonly DebtInstrument[] =>
	assumptions.portfolio ?? getBorrowingStrategy(assumptions.strategyId).portfolio;

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
	assumptions: Partial<BorrowingPathAssumptions> = {},
): number => {
	const a = resolvedAssumptions(assumptions);
	const debtGdpDeltaPp = (openingDebtGbp / gdpAtYear(year, a)) * 100;
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
	assumptions: Partial<BorrowingPathAssumptions> = {},
): { rate: number; riskPremium: number; instruments: BorrowingInstrumentCost[] } => {
	const a = resolvedAssumptions(assumptions);
	const riskPremium = borrowingRiskPremium(
		openingDebtGbp,
		year,
		amount,
		a,
	);
	const instruments = portfolioFor(a).map((instrument) => {
		const rate = instrumentRate(instrument, riskPremium, a);
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
	const a = resolvedAssumptions(assumptions);
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
	const central = resolvedAssumptions(assumptions);
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

export const projectBorrowingStrategyCases = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingStressCase[] =>
	BORROWING.strategies.map((strategy) => ({
		id: strategy.id,
		label: strategy.label,
		path: projectBorrowingPath(amount, years, {
			...assumptions,
			strategyId: strategy.id,
		}),
	}));

export const projectBorrowingFan = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
	samples = 1000,
	seed = 73,
): BorrowingFanYear[] => {
	const centralPath = projectBorrowingPath(amount, years, assumptions);
	const rng = seededRng(seed);
	const interestByYear: number[][] = Array.from({ length: years }, () => []);
	const debtByYear: number[][] = Array.from({ length: years }, () => []);
	const psnbByYear: number[][] = Array.from({ length: years }, () => []);

	for (let sample = 0; sample < samples; sample++) {
		const bankRateShock = sampleNormal(rng, { mean: 0, sd: 0.0075 });
		const inflationShock = sampleNormal(rng, { mean: 0, sd: 0.0125 });
		const giltShock = sampleNormal(rng, { mean: 0, sd: 0.01 });
		const path = projectBorrowingPath(amount, years, {
			...assumptions,
			bankRate: Math.max(-0.005, (assumptions.bankRate ?? BORROWING.bankRate) + bankRateShock),
			inflation: Math.max(-0.01, (assumptions.inflation ?? BORROWING.inflation) + inflationShock),
			yieldCurveShift: (assumptions.yieldCurveShift ?? 0) + giltShock,
			cpiDeviationPp: (assumptions.cpiDeviationPp ?? 0) + inflationShock * 100,
		});
		for (let i = 0; i < years; i++) {
			const row = path[i]!;
			interestByYear[i]!.push(row.interestCostGbp);
			debtByYear[i]!.push(row.debtStockDeltaGbp);
			psnbByYear[i]!.push(row.psnbShiftGbp);
		}
	}

	return centralPath.map((row, index) => ({
		year: row.year,
		centralInterestCostGbp: row.interestCostGbp,
		interestCostBand: computeBand(interestByYear[index]!),
		centralDebtStockGbp: row.debtStockDeltaGbp,
		debtStockBand: computeBand(debtByYear[index]!),
		centralPsnbShiftGbp: row.psnbShiftGbp,
		psnbShiftBand: computeBand(psnbByYear[index]!),
	}));
};

import {
	BORROWING,
	DEFAULT_BORROWING_STRATEGY_ID,
	type BorrowingStrategyId,
	type DebtInstrument,
	getBorrowingStrategy,
} from "@/data/levers/borrowing";
import auctionDemandCalibration from "@/data/generated/auction-demand-calibration.json";
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
	marginalIssuanceGbp: number;
	plannedAnnualIssuanceGbp: number;
	competingApfSupplyGbp: number;
	netMarketSupplyGbp: number;
	baseAuctionDemandGbp: number;
	auctionDemandElasticityGbpPerBp: number;
	requiredAuctionConcessionBp: number;
	auctionClearingConcessionBp: number;
	auctionCoverRatio: number;
	auctionTailBp: number;
	uncoveredAuctionSupplyGbp: number;
	absorptionRatio: number;
	absorptionPremium: number;
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
	absorptionPremium: number;
	absorptionStressIndex: number;
	absorptionBottleneck: DebtInstrument["id"] | "none";
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

export interface BorrowingStrategyFrontierCase {
	id: BorrowingStrategyId | "optimised";
	label: string;
	path: BorrowingYear[];
	cumulativeInterestCostGbp: number;
	finalInterestCostGbp: number;
	finalDebtStockGbp: number;
	averageMaturityYears: number;
	weightedBankRatePassThrough: number;
	treasuryBillShare: number;
	indexLinkedShare: number;
	refinancingRiskScoreGbp: number;
	bankRateRiskScoreGbp: number;
	absorptionRiskScoreGbp: number;
	totalRiskScoreGbp: number;
	objectiveGbp: number;
}

export interface BorrowingStrategyFrontier {
	cases: BorrowingStrategyFrontierCase[];
	recommended: BorrowingStrategyFrontierCase;
}

export interface BorrowingOptimiserConstraints {
	shareStep: number;
	minAverageMaturityYears: number;
	maxAverageMaturityYears: number;
	maxBankRatePassThrough: number;
	maxTreasuryBillShare: number;
	maxIndexLinkedShare: number;
	minLongGiltShare: number;
	minMediumGiltShare: number;
}

export interface BorrowingStrategyOptimisation {
	optimum: BorrowingStrategyFrontierCase;
	dmoRemit: BorrowingStrategyFrontierCase;
	improvementVsDmoGbp: number;
	searchedPortfolios: number;
	feasiblePortfolios: number;
	constraints: BorrowingOptimiserConstraints;
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

export interface BorrowingMarketReactionYear extends BorrowingYear {
	marketReactionPremium: number;
	marketReactionTrigger: "none" | "debt-gdp" | "refinancing" | "issuance";
}

export interface MonetaryFiscalExposure {
	bankRateShock: number;
	reserveInterestCostGbp: number;
	apfCashflowProxyGbp: number;
	totalExposureGbp: number;
	totalExposurePctGdp: number;
	annualApfCompetingSupplyGbp: number;
}

interface AuctionDemandCurve {
	normalCoverRatio: number;
	elasticityShareOfAnnualIssuancePerBp: number;
	tailShareOfConcession: number;
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

const ABSORPTION_CAPACITY_SHARE_OF_ANNUAL_REMIT = 0.3;
const ABSORPTION_PREMIUM_CAP = 0.0075;
const APF_ANNUAL_SUPPLY_SHARE = 0.12;
const APF_CROWDING_WEIGHT = 0.25;
const APF_BANK_RATE_CASHFLOW_BETA = 0.25;
const STRATEGY_FRONTIER_REFINANCING_STRESS_RATE = 0.004;
const STRATEGY_FRONTIER_BANK_RATE_STRESS = 0.01;
const STRATEGY_FRONTIER_ABSORPTION_STRESS_RATE = 0.0025;
const AUCTION_TAIL_UNCOVERED_SUPPLY_BP = 25;
const DEFAULT_OPTIMISER_CONSTRAINTS: BorrowingOptimiserConstraints = {
	shareStep: 0.05,
	minAverageMaturityYears: 8,
	maxAverageMaturityYears: 16,
	maxBankRatePassThrough: 0.35,
	maxTreasuryBillShare: 0.2,
	maxIndexLinkedShare: 0.25,
	minLongGiltShare: 0.05,
	minMediumGiltShare: 0.2,
};
const APF_SUPPLY_SHARE: Record<DebtInstrument["id"], number> = {
	"treasury-bills": 0,
	"short-gilts": 0.2,
	"medium-gilts": 0.35,
	"long-gilts": 0.35,
	"index-linked-gilts": 0.1,
};
const AUCTION_DEMAND_CURVES =
	auctionDemandCalibration.curves as Record<DebtInstrument["id"], AuctionDemandCurve>;

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

const plannedAnnualIssuanceFor = (instrument: DebtInstrument): number => {
	const centralShare =
		BORROWING.portfolio.find((item) => item.id === instrument.id)?.share ??
		instrument.share;
	return BORROWING.grossFinancingRequirement * centralShare;
};

export const annualApfCompetingSupplyGbp = (): number =>
	BORROWING.apfGiltStock * APF_ANNUAL_SUPPLY_SHARE;

const competingApfSupplyFor = (instrument: DebtInstrument): number =>
	annualApfCompetingSupplyGbp() * APF_SUPPLY_SHARE[instrument.id];

const portfolioWithShares = (
	shares: Record<DebtInstrument["id"], number>,
): readonly DebtInstrument[] =>
	BORROWING.portfolio.map((instrument) => ({
		...instrument,
		share: shares[instrument.id],
	}));

const weightedAverageMaturity = (portfolio: readonly DebtInstrument[]): number =>
	portfolio.reduce(
		(sum, instrument) => sum + instrument.share * instrument.maturityYears,
		0,
	);

const weightedBankRatePassThrough = (
	portfolio: readonly DebtInstrument[],
): number =>
	portfolio.reduce(
		(sum, instrument) => sum + instrument.share * instrument.bankRatePassThrough,
		0,
	);

export const estimateMonetaryFiscalExposure = (
	bankRateShock = 0.01,
): MonetaryFiscalExposure => {
	const reserveInterestCostGbp = BORROWING.reservesBalances * bankRateShock;
	const apfCashflowProxyGbp =
		BORROWING.apfGiltStock * bankRateShock * APF_BANK_RATE_CASHFLOW_BETA;
	const totalExposureGbp = reserveInterestCostGbp + apfCashflowProxyGbp;
	return {
		bankRateShock,
		reserveInterestCostGbp,
		apfCashflowProxyGbp,
		totalExposureGbp,
		totalExposurePctGdp: (totalExposureGbp / BORROWING.ukGdp) * 100,
		annualApfCompetingSupplyGbp: annualApfCompetingSupplyGbp(),
	};
};

const absorptionForInstrument = (
	instrument: DebtInstrument,
	amount: number,
): {
	marginalIssuanceGbp: number;
	plannedAnnualIssuanceGbp: number;
	competingApfSupplyGbp: number;
	netMarketSupplyGbp: number;
	baseAuctionDemandGbp: number;
	auctionDemandElasticityGbpPerBp: number;
	requiredAuctionConcessionBp: number;
	auctionClearingConcessionBp: number;
	auctionCoverRatio: number;
	auctionTailBp: number;
	uncoveredAuctionSupplyGbp: number;
	absorptionRatio: number;
	absorptionPremium: number;
} => {
	const marginalIssuanceGbp = Math.max(0, amount) * instrument.share;
	const plannedAnnualIssuanceGbp = plannedAnnualIssuanceFor(instrument);
	const competingApfSupplyGbp = competingApfSupplyFor(instrument);
	const netMarketSupplyGbp =
		marginalIssuanceGbp + competingApfSupplyGbp * APF_CROWDING_WEIGHT;
	const digestibleCapacity =
		plannedAnnualIssuanceGbp * ABSORPTION_CAPACITY_SHARE_OF_ANNUAL_REMIT;
	const demandCurve = AUCTION_DEMAND_CURVES[instrument.id];
	const baseAuctionDemandGbp =
		digestibleCapacity * demandCurve.normalCoverRatio;
	const auctionDemandElasticityGbpPerBp =
		plannedAnnualIssuanceGbp *
		demandCurve.elasticityShareOfAnnualIssuancePerBp;
	const requiredAuctionConcessionBp =
		auctionDemandElasticityGbpPerBp > 0
			? Math.max(
					0,
					(netMarketSupplyGbp - baseAuctionDemandGbp) /
						auctionDemandElasticityGbpPerBp,
				)
			: 0;
	const auctionClearingConcessionBp = Math.min(
		ABSORPTION_PREMIUM_CAP * 10_000,
		requiredAuctionConcessionBp,
	);
	const clearedAuctionDemandGbp =
		baseAuctionDemandGbp +
		auctionDemandElasticityGbpPerBp * auctionClearingConcessionBp;
	const auctionCoverRatio =
		netMarketSupplyGbp > 0
			? clearedAuctionDemandGbp / netMarketSupplyGbp
			: demandCurve.normalCoverRatio;
	const uncoveredAuctionSupplyGbp = Math.max(
		0,
		netMarketSupplyGbp - clearedAuctionDemandGbp,
	);
	const absorptionRatio =
		baseAuctionDemandGbp > 0 ? netMarketSupplyGbp / baseAuctionDemandGbp : 0;
	const uncoveredSupplyShare =
		netMarketSupplyGbp > 0 ? uncoveredAuctionSupplyGbp / netMarketSupplyGbp : 0;
	const auctionTailBp =
		auctionClearingConcessionBp * demandCurve.tailShareOfConcession +
		uncoveredSupplyShare * AUCTION_TAIL_UNCOVERED_SUPPLY_BP;
	const absorptionPremium = auctionClearingConcessionBp / 10_000;
	return {
		marginalIssuanceGbp,
		plannedAnnualIssuanceGbp,
		competingApfSupplyGbp,
		netMarketSupplyGbp,
		baseAuctionDemandGbp,
		auctionDemandElasticityGbpPerBp,
		requiredAuctionConcessionBp,
		auctionClearingConcessionBp,
		auctionCoverRatio,
		auctionTailBp,
		uncoveredAuctionSupplyGbp,
		absorptionRatio,
		absorptionPremium,
	};
};

const nextMarketReaction = (
	previousPremium: number,
	amount: number,
	row: BorrowingYear,
): { premium: number; trigger: BorrowingMarketReactionYear["marketReactionTrigger"] } => {
	if (amount <= 0) return { premium: Math.max(0, previousPremium * 0.7), trigger: "none" };
	const debtPressure = Math.max(0, row.debtGdpDeltaPp - 1.5) * 0.00025;
	const refinancingPressure = Math.max(0, row.refinancingPctGdp - 0.25) * 0.00035;
	const issuancePressure =
		amount > BORROWING.grossFinancingRequirement * 0.15 ? 0.00035 : 0;
	const premium = Math.min(
		0.015,
		previousPremium * 0.75 +
			debtPressure +
			refinancingPressure +
			issuancePressure,
	);
	const maxPressure = Math.max(debtPressure, refinancingPressure, issuancePressure);
	const trigger =
		maxPressure === 0
			? "none"
			: maxPressure === issuancePressure
				? "issuance"
				: maxPressure === refinancingPressure
					? "refinancing"
					: "debt-gdp";
	return { premium, trigger };
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
	absorptionPremium: number,
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
				absorptionPremium +
				macroShift +
				bankRateShock * instrument.bankRatePassThrough,
		);
	}
	return Math.max(
		0,
		(instrument.nominalYield ?? BORROWING.thirtyYearGiltYield) +
			riskPremium +
			absorptionPremium +
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
		const absorption = absorptionForInstrument(instrument, amount);
		const rate = instrumentRate(
			instrument,
			riskPremium,
			absorption.absorptionPremium,
			a,
		);
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
			...absorption,
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
		const absorptionPremium = instruments.reduce(
			(sum, instrument) => sum + instrument.share * instrument.absorptionPremium,
			0,
		);
		const absorptionBottleneck =
			instruments.reduce<BorrowingInstrumentCost | null>(
				(max, instrument) =>
					!max || instrument.absorptionRatio > max.absorptionRatio
						? instrument
						: max,
				null,
			)?.id ?? "none";
		const absorptionStressIndex = Math.max(
			0,
			...instruments.map((instrument) => instrument.absorptionRatio),
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
			absorptionPremium,
			absorptionStressIndex,
			absorptionBottleneck:
				absorptionStressIndex > 1 ? absorptionBottleneck : "none",
			instruments,
		});
		openingDebtGbp = closingDebtGbp;
	}

	return rows;
};

export const projectBorrowingMarketReactionPath = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingMarketReactionYear[] => {
	const a = resolvedAssumptions(assumptions);
	const rows: BorrowingMarketReactionYear[] = [];
	let openingDebtGbp = amount;
	let marketReactionPremium = 0;
	let marketReactionTrigger: BorrowingMarketReactionYear["marketReactionTrigger"] =
		"none";

	for (let year = 1; year <= years; year++) {
		const nominalGdpGbp = gdpAtYear(year, a);
		const primaryFinancingGbp = year === 1 ? amount : 0;
		const { rate, riskPremium, instruments } = effectiveBorrowingRate(
			openingDebtGbp,
			year,
			amount,
			{
				...a,
				yieldCurveShift: (a.yieldCurveShift ?? 0) + marketReactionPremium,
			},
		);
		const interestCostGbp = instruments.reduce(
			(sum, instrument) => sum + instrument.interestCostGbp,
			0,
		);
		const refinancingGbp = instruments.reduce(
			(sum, instrument) => sum + instrument.refinancingGbp,
			0,
		);
		const absorptionPremium = instruments.reduce(
			(sum, instrument) => sum + instrument.share * instrument.absorptionPremium,
			0,
		);
		const absorptionBottleneck =
			instruments.reduce<BorrowingInstrumentCost | null>(
				(max, instrument) =>
					!max || instrument.absorptionRatio > max.absorptionRatio
						? instrument
						: max,
				null,
			)?.id ?? "none";
		const absorptionStressIndex = Math.max(
			0,
			...instruments.map((instrument) => instrument.absorptionRatio),
		);
		const closingDebtGbp = openingDebtGbp + interestCostGbp;
		const debtGdpDeltaPp = (closingDebtGbp / nominalGdpGbp) * 100;
		const psnbIncreaseGbp = primaryFinancingGbp + interestCostGbp;
		const rMinusG = rate - a.nominalGrowth;
		const stabilisingPrimaryBalanceGbp =
			(closingDebtGbp * rMinusG) / (1 + a.nominalGrowth);
		const row: BorrowingMarketReactionYear = {
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
			absorptionPremium,
			absorptionStressIndex,
			absorptionBottleneck:
				absorptionStressIndex > 1 ? absorptionBottleneck : "none",
			instruments,
			marketReactionPremium,
			marketReactionTrigger,
		};
		rows.push(row);
		const next = nextMarketReaction(marketReactionPremium, amount, row);
		marketReactionPremium = next.premium;
		marketReactionTrigger = next.trigger;
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

const scoreBorrowingPortfolio = (
	id: BorrowingStrategyFrontierCase["id"],
	label: string,
	portfolio: readonly DebtInstrument[],
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions>,
): BorrowingStrategyFrontierCase => {
	const path = projectBorrowingPath(amount, years, {
		...assumptions,
		portfolio,
	});
	const finalYear = path.at(-1)!;
	const cumulativeInterestCostGbp = path.reduce(
		(sum, row) => sum + row.interestCostGbp,
		0,
	);
	const passThrough = weightedBankRatePassThrough(portfolio);
	const refinancingRiskScoreGbp =
		finalYear.refinancingGbp * STRATEGY_FRONTIER_REFINANCING_STRESS_RATE;
	const bankRateRiskScoreGbp =
		Math.abs(finalYear.debtStockDeltaGbp) *
		passThrough *
		STRATEGY_FRONTIER_BANK_RATE_STRESS;
	const absorptionRiskScoreGbp = finalYear.instruments.reduce(
		(sum, instrument) =>
			sum +
			instrument.uncoveredAuctionSupplyGbp *
				STRATEGY_FRONTIER_ABSORPTION_STRESS_RATE +
			instrument.netMarketSupplyGbp * (instrument.auctionTailBp / 10_000),
		0,
	);
	const totalRiskScoreGbp =
		refinancingRiskScoreGbp +
		bankRateRiskScoreGbp +
		absorptionRiskScoreGbp;
	return {
		id,
		label,
		path,
		cumulativeInterestCostGbp,
		finalInterestCostGbp: finalYear.interestCostGbp,
		finalDebtStockGbp: finalYear.debtStockDeltaGbp,
		averageMaturityYears: weightedAverageMaturity(portfolio),
		weightedBankRatePassThrough: passThrough,
		treasuryBillShare:
			portfolio.find((instrument) => instrument.id === "treasury-bills")
				?.share ?? 0,
		indexLinkedShare:
			portfolio.find((instrument) => instrument.id === "index-linked-gilts")
				?.share ?? 0,
		refinancingRiskScoreGbp,
		bankRateRiskScoreGbp,
		absorptionRiskScoreGbp,
		totalRiskScoreGbp,
		objectiveGbp: cumulativeInterestCostGbp + totalRiskScoreGbp,
	};
};

export const projectBorrowingStrategyFrontier = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
): BorrowingStrategyFrontier => {
	const cases = BORROWING.strategies.map<BorrowingStrategyFrontierCase>(
		(strategy) =>
			scoreBorrowingPortfolio(
				strategy.id,
				strategy.label,
				strategy.portfolio,
				amount,
				years,
				assumptions,
			),
	);
	const recommended = cases.reduce((best, item) =>
		item.objectiveGbp < best.objectiveGbp ? item : best,
	);
	return { cases, recommended };
};

const optimiserConstraintSatisfied = (
	portfolio: readonly DebtInstrument[],
	constraints: BorrowingOptimiserConstraints,
): boolean => {
	const share = (id: DebtInstrument["id"]) =>
		portfolio.find((instrument) => instrument.id === id)?.share ?? 0;
	const averageMaturityYears = weightedAverageMaturity(portfolio);
	return (
		averageMaturityYears >= constraints.minAverageMaturityYears &&
		averageMaturityYears <= constraints.maxAverageMaturityYears &&
		weightedBankRatePassThrough(portfolio) <=
			constraints.maxBankRatePassThrough &&
		share("treasury-bills") <= constraints.maxTreasuryBillShare &&
		share("index-linked-gilts") <= constraints.maxIndexLinkedShare &&
		share("long-gilts") >= constraints.minLongGiltShare &&
		share("medium-gilts") >= constraints.minMediumGiltShare
	);
};

export const optimiseBorrowingStrategy = (
	amount: number,
	years: number,
	assumptions: Partial<BorrowingPathAssumptions> = {},
	constraints: Partial<BorrowingOptimiserConstraints> = {},
): BorrowingStrategyOptimisation => {
	const resolvedConstraints = {
		...DEFAULT_OPTIMISER_CONSTRAINTS,
		...constraints,
	};
	const units = Math.round(1 / resolvedConstraints.shareStep);
	let searchedPortfolios = 0;
	let feasiblePortfolios = 0;
	let optimum: BorrowingStrategyFrontierCase | null = null;

	for (let bills = 0; bills <= units; bills++) {
		for (let short = 0; short <= units - bills; short++) {
			for (let medium = 0; medium <= units - bills - short; medium++) {
				for (
					let long = 0;
					long <= units - bills - short - medium;
					long++
				) {
					const indexLinked = units - bills - short - medium - long;
					searchedPortfolios++;
					const shares: Record<DebtInstrument["id"], number> = {
						"treasury-bills": bills / units,
						"short-gilts": short / units,
						"medium-gilts": medium / units,
						"long-gilts": long / units,
						"index-linked-gilts": indexLinked / units,
					};
					const portfolio = portfolioWithShares(shares);
					if (!optimiserConstraintSatisfied(portfolio, resolvedConstraints)) {
						continue;
					}
					feasiblePortfolios++;
					const candidate = scoreBorrowingPortfolio(
						"optimised",
						"Optimised mix",
						portfolio,
						amount,
						years,
						assumptions,
					);
					if (!optimum || candidate.objectiveGbp < optimum.objectiveGbp) {
						optimum = candidate;
					}
				}
			}
		}
	}

	const dmoRemit = scoreBorrowingPortfolio(
		"dmo-remit",
		"DMO-style blend",
		getBorrowingStrategy("dmo-remit").portfolio,
		amount,
		years,
		assumptions,
	);
	const best = optimum ?? dmoRemit;
	return {
		optimum: best,
		dmoRemit,
		improvementVsDmoGbp: Math.max(0, dmoRemit.objectiveGbp - best.objectiveGbp),
		searchedPortfolios,
		feasiblePortfolios,
		constraints: resolvedConstraints,
	};
};

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
		const commonShock = sampleNormal(rng, { mean: 0, sd: 1 });
		const bankRateShock =
			commonShock * 0.0055 + sampleNormal(rng, { mean: 0, sd: 0.0045 });
		const inflationShock =
			commonShock * 0.009 + sampleNormal(rng, { mean: 0, sd: 0.006 });
		const giltShock =
			commonShock * 0.008 + sampleNormal(rng, { mean: 0, sd: 0.0055 });
		const growthShock =
			commonShock * -0.004 + sampleNormal(rng, { mean: 0, sd: 0.006 });
		const path = projectBorrowingPath(amount, years, {
			...assumptions,
			bankRate: Math.max(-0.005, (assumptions.bankRate ?? BORROWING.bankRate) + bankRateShock),
			inflation: Math.max(-0.01, (assumptions.inflation ?? BORROWING.inflation) + inflationShock),
			nominalGrowth: Math.max(0, (assumptions.nominalGrowth ?? 0.04) + growthShock),
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

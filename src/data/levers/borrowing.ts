// Borrowing constants used to model "+£X borrowed" as financing, debt stock,
// debt interest, refinancing risk, and market feedback. The point is not to
// forecast the DMO remit line-by-line; it is to avoid treating debt issuance
// as permanent fiscal space.

import type { Methodology } from "@/lib/methodology";

export type DebtInstrumentId =
	| "treasury-bills"
	| "short-gilts"
	| "medium-gilts"
	| "long-gilts"
	| "index-linked-gilts";

export type BorrowingStrategyId =
	| "dmo-remit"
	| "short-funded"
	| "long-funded"
	| "index-linked-heavy";

export interface DebtInstrument {
	id: DebtInstrumentId;
	label: string;
	share: number; // 0-1 share of marginal issuance
	maturityYears: number;
	nominalYield?: number; // conventional / bill yield
	realYield?: number; // index-linked real yield
	inflationLinked?: boolean;
	bankRatePassThrough: number; // 0-1 sensitivity to Bank Rate changes
	note: string;
}

export interface BorrowingStrategy {
	id: BorrowingStrategyId;
	label: string;
	description: string;
	portfolio: readonly DebtInstrument[];
}

export interface BorrowingRiskSettings {
	// Gilt-yield risk premium from higher debt:GDP. 0.0005 = 5bp per 1pp
	// debt:GDP, matching the reduced-form assumption in macro.ts.
	debtGdpRiskPremiumPerPp: number;
	// Gross-issuance pressure from very large discretionary borrowing.
	issuancePremiumPer100bn: number;
	// Convex credibility premium: once debt:GDP shift exceeds this threshold,
	// each additional pp has a nonlinear market-price effect.
	convexityThresholdDebtGdpPp: number;
	convexityPremiumPerPpSquared: number;
}

export interface BorrowingConstants {
	thirtyYearGiltYield: number; // 0–1
	bankRate: number; // 0-1
	inflation: number; // CPI/RPI proxy for index-linked uplift
	ukGdp: number; // GBP, current price
	ukDebt: number; // GBP, public sector net debt
	grossFinancingRequirement: number; // GBP, DMO remit scale
	averageDebtMaturityYears: number;
	reservesBalances: number; // GBP, BoE reserve balances
	apfGiltStock: number; // GBP, gilts held for monetary policy purposes
	portfolio: readonly DebtInstrument[];
	strategies: readonly BorrowingStrategy[];
	risk: BorrowingRiskSettings;
	asOf: string;
	source: { url: string; label: string };
	methodology: Methodology;
}

const SOURCE = {
	url: "https://www.dmo.gov.uk/responsibilities/financing-remit/",
	label: "UK DMO remit · OBR fiscal risks · Bank of England",
} as const;

const instrument = (
	id: DebtInstrumentId,
	label: string,
	share: number,
	maturityYears: number,
	rate: { nominalYield?: number; realYield?: number; inflationLinked?: boolean },
	bankRatePassThrough: number,
	note: string,
): DebtInstrument => ({
	id,
	label,
	share,
	maturityYears,
	...rate,
	bankRatePassThrough,
	note,
});

// Central marginal issuance mix. Calibrated to the DMO's 2025-26 Budget 2025
// remit revision: planned gilt sales £303.7bn, short conventional 44.0%,
// medium conventional 33.6%, long conventional 9.5%, index-linked 10.2%,
// unallocated 2.7%, plus an £11bn Treasury bill financing contribution.
const DMO_REMIT_PORTFOLIO: readonly DebtInstrument[] = [
	instrument(
		"treasury-bills",
		"Treasury bills",
		0.035,
		0.5,
		{ nominalYield: 0.0375 },
		1,
		"Short debt-management issuance. Cheapest initially, but reprices quickly with Bank Rate.",
	),
	instrument(
		"short-gilts",
		"Short conventional gilts",
		0.439,
		5,
		{ nominalYield: 0.04 },
		0.35,
		"Dominant marginal issuance bucket in the latest DMO remit; reprices materially with Bank Rate.",
	),
	instrument(
		"medium-gilts",
		"Medium conventional gilts",
		0.335,
		10,
		{ nominalYield: 0.046 },
		0.15,
		"Core benchmark issuance; less sensitive to Bank Rate than bills or short gilts.",
	),
	instrument(
		"long-gilts",
		"Long conventional gilts",
		0.091,
		30,
		{ nominalYield: 0.052 },
		0.05,
		"Locks in funding but pays the long-end term premium.",
	),
	instrument(
		"index-linked-gilts",
		"Index-linked gilts",
		0.1,
		20,
		{ realYield: 0.015, inflationLinked: true },
		0.05,
		"Principal and coupon uplift with inflation; exposes the Exchequer to RPI/CPI shocks.",
	),
];

const strategyPortfolio = (
	shares: Record<DebtInstrumentId, number>,
): readonly DebtInstrument[] =>
	DMO_REMIT_PORTFOLIO.map((item) => ({ ...item, share: shares[item.id] }));

export const BORROWING_STRATEGIES: readonly BorrowingStrategy[] = [
	{
		id: "dmo-remit",
		label: "DMO-style blend",
		description:
			"Central case: latest remit mix, with heavy short/medium conventional issuance and a modest Treasury bill contribution.",
		portfolio: DMO_REMIT_PORTFOLIO,
	},
	{
		id: "short-funded",
		label: "Short-funded",
		description:
			"Leans into bills and short gilts. Lower starting coupons, much higher refinancing and Bank Rate exposure.",
		portfolio: strategyPortfolio({
			"treasury-bills": 0.2,
			"short-gilts": 0.55,
			"medium-gilts": 0.15,
			"long-gilts": 0.05,
			"index-linked-gilts": 0.05,
		}),
	},
	{
		id: "long-funded",
		label: "Long-funded",
		description:
			"Pays a higher term premium up front to reduce rollover and Bank Rate risk.",
		portfolio: strategyPortfolio({
			"treasury-bills": 0.02,
			"short-gilts": 0.18,
			"medium-gilts": 0.35,
			"long-gilts": 0.35,
			"index-linked-gilts": 0.1,
		}),
	},
	{
		id: "index-linked-heavy",
		label: "Index-linked-heavy",
		description:
			"Raises the inflation-linked share. Useful when real yields look cheap, risky under inflation shocks.",
		portfolio: strategyPortfolio({
			"treasury-bills": 0.03,
			"short-gilts": 0.25,
			"medium-gilts": 0.25,
			"long-gilts": 0.12,
			"index-linked-gilts": 0.35,
		}),
	},
];

export const DEFAULT_BORROWING_STRATEGY_ID: BorrowingStrategyId = "dmo-remit";

export const getBorrowingStrategy = (
	id: BorrowingStrategyId | string | undefined,
): BorrowingStrategy =>
	BORROWING_STRATEGIES.find((strategy) => strategy.id === id) ??
	BORROWING_STRATEGIES[0]!;

export const BORROWING: BorrowingConstants = {
	thirtyYearGiltYield: 0.05,
	bankRate: 0.0375,
	inflation: 0.03,
	ukGdp: 2_600_000_000_000,
	ukDebt: 2_500_000_000_000,
	grossFinancingRequirement: 322_500_000_000,
	averageDebtMaturityYears: 15,
	reservesBalances: 631_488_000_000,
	apfGiltStock: 528_000_000_000,
	portfolio: DMO_REMIT_PORTFOLIO,
	strategies: BORROWING_STRATEGIES,
	risk: {
		debtGdpRiskPremiumPerPp: 0.0005,
		issuancePremiumPer100bn: 0.0002,
		convexityThresholdDebtGdpPp: 2,
		convexityPremiumPerPpSquared: 0.00008,
	},
	asOf: "2026-04",
	source: SOURCE,
	methodology: {
		source: SOURCE,
		asOf: "2026-04",
		measure:
			"Marginal UK debt-financing model. Borrowing is split across Treasury bills, conventional gilts, and index-linked gilts; debt interest responds to the yield curve, inflation, Bank Rate, refinancing, financing strategy, and a debt/GDP risk premium.",
		alternatives: [
			{
				label: "Single 30-year gilt yield",
				value: 0.05,
				note: "Simpler but misses the recent shift toward shorter issuance and the inflation exposure of index-linked gilts.",
			},
			{
				label: "Treasury bill funding",
				value: 0.0375,
				note: "Cheaper initially but reprices quickly with Bank Rate, which is why short funding raises fiscal risk.",
			},
			{
				label: "Index-linked funding",
				value: 0.045,
				note: "Approximate real yield plus inflation uplift. Inflation shocks raise debt interest quickly.",
			},
		],
		range: {
			low: 0.0375,
			high: 0.055,
			note: "Bills follow Bank Rate; medium and long gilts follow the yield curve; index-linked debt follows real yields plus inflation uplift.",
		},
		caveat:
			"Borrowing is financing, not free fiscal space. It worsens PSNB when issued, adds to debt stock, and creates debt-interest costs that compound if financed by further borrowing. Large unfunded packages can also raise gilt yields through credibility and issuance-pressure channels. The central mix follows the DMO remit; strategy cases show short-funded, long-funded, and index-linked-heavy alternatives.",
	},
};

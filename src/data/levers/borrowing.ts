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
	risk: BorrowingRiskSettings;
	asOf: string;
	source: { url: string; label: string };
	methodology: Methodology;
}

const SOURCE = {
	url: "https://www.dmo.gov.uk/responsibilities/financing-remit/",
	label: "UK DMO remit · OBR fiscal risks · Bank of England",
} as const;

export const BORROWING: BorrowingConstants = {
	thirtyYearGiltYield: 0.05,
	bankRate: 0.0375,
	inflation: 0.03,
	ukGdp: 2_600_000_000_000,
	ukDebt: 2_500_000_000_000,
	grossFinancingRequirement: 275_300_000_000,
	averageDebtMaturityYears: 15,
	reservesBalances: 631_488_000_000,
	apfGiltStock: 528_000_000_000,
	portfolio: [
		{
			id: "treasury-bills",
			label: "Treasury bills",
			share: 0.08,
			maturityYears: 0.5,
			nominalYield: 0.0375,
			bankRatePassThrough: 1,
			note: "Short cash-management issuance. Cheapest initially, but reprices quickly with Bank Rate.",
		},
		{
			id: "short-gilts",
			label: "Short conventional gilts",
			share: 0.32,
			maturityYears: 5,
			nominalYield: 0.04,
			bankRatePassThrough: 0.35,
			note: "Large marginal issuance share after the recent shift away from very long maturities.",
		},
		{
			id: "medium-gilts",
			label: "Medium conventional gilts",
			share: 0.28,
			maturityYears: 10,
			nominalYield: 0.046,
			bankRatePassThrough: 0.15,
			note: "Core benchmark issuance; less sensitive to Bank Rate than bills.",
		},
		{
			id: "long-gilts",
			label: "Long conventional gilts",
			share: 0.2,
			maturityYears: 30,
			nominalYield: 0.052,
			bankRatePassThrough: 0.05,
			note: "Locks in funding but pays the long-end term premium.",
		},
		{
			id: "index-linked-gilts",
			label: "Index-linked gilts",
			share: 0.12,
			maturityYears: 20,
			realYield: 0.015,
			inflationLinked: true,
			bankRatePassThrough: 0.05,
			note: "Principal and coupon uplift with inflation; valuable for investors but exposes the Exchequer to RPI/CPI shocks.",
		},
	],
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
			"Marginal UK debt-financing model. Borrowing is split across Treasury bills, conventional gilts, and index-linked gilts; debt interest responds to the yield curve, inflation, Bank Rate, refinancing, and a debt/GDP risk premium.",
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
			"Borrowing is financing, not free fiscal space. It worsens PSNB when issued, adds to debt stock, and creates debt-interest costs that compound if financed by further borrowing. Large unfunded packages can also raise gilt yields through credibility and issuance-pressure channels.",
	},
};

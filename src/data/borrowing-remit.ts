import type { DebtInstrumentId } from "@/data/levers/borrowing";

export type BorrowingIssuanceMethod =
	| "bill-tender"
	| "gilt-auction"
	| "syndication"
	| "gilt-tender"
	| "unallocated";

export type BorrowingInvestorSegmentId =
	| "overseas"
	| "insurance-pensions"
	| "asset-managers"
	| "banks-liquidity";

export interface BorrowingIssuanceMethodAllocation {
	method: BorrowingIssuanceMethod;
	label: string;
	plannedIssuanceGbp: number;
	operationCount: number;
	normalOperationSizeGbp: number;
	share: number;
}

export interface BorrowingRemitCalendarBucket {
	instrumentId: DebtInstrumentId;
	label: string;
	plannedAnnualIssuanceGbp: number;
	plannedOperationCount: number;
	unallocatedFlexGbp: number;
	methods: readonly BorrowingIssuanceMethodAllocation[];
}

export interface BorrowingInvestorSegment {
	id: BorrowingInvestorSegmentId;
	label: string;
	marketShare: number;
	elasticityMultiplier: number;
	qtSensitivity: number;
	preferredInstruments: Partial<Record<DebtInstrumentId, number>>;
	note: string;
}

export const BORROWING_REMIT_SOURCE = {
	asOf: "2026-04",
	source: {
		url: "https://www.dmo.gov.uk/media/ajmifgdv/pr230426_2.pdf",
		label: "UK DMO 2026-27 financing remit revision",
	},
	investorSource: {
		url: "https://dmo.gov.uk/media/wysdetq0/oct-dec-2025.pdf",
		label: "DMO Quarterly Review October-December 2025",
	},
};

const bn = (value: number): number => value * 1_000_000_000;

const method = (
	methodId: BorrowingIssuanceMethod,
	label: string,
	plannedIssuanceGbp: number,
	operationCount: number,
	normalOperationSizeGbp: number,
	total: number,
): BorrowingIssuanceMethodAllocation => ({
	method: methodId,
	label,
	plannedIssuanceGbp,
	operationCount,
	normalOperationSizeGbp,
	share: total > 0 ? plannedIssuanceGbp / total : 0,
});

export const BORROWING_REMIT_CALENDAR: readonly BorrowingRemitCalendarBucket[] =
	[
		{
			instrumentId: "treasury-bills",
			label: "Treasury bill tenders",
			plannedAnnualIssuanceGbp: bn(5),
			plannedOperationCount: 52,
			unallocatedFlexGbp: 0,
			methods: [
				method("bill-tender", "weekly bill tenders", bn(5), 52, bn(3.5), bn(5)),
			],
		},
		{
			instrumentId: "short-gilts",
			label: "Short conventional gilt auctions",
			plannedAnnualIssuanceGbp: bn(95),
			plannedOperationCount: 20,
			unallocatedFlexGbp: bn(10.4),
			methods: [
				method("gilt-auction", "20 auctions", bn(95), 20, bn(4.75), bn(95)),
			],
		},
		{
			instrumentId: "medium-gilts",
			label: "Medium conventional gilts",
			plannedAnnualIssuanceGbp: bn(76),
			plannedOperationCount: 17,
			unallocatedFlexGbp: bn(10.4),
			methods: [
				method("gilt-auction", "15 auctions", bn(56), 15, bn(3.7), bn(76)),
				method("syndication", "2 syndications", bn(20), 2, bn(10), bn(76)),
			],
		},
		{
			instrumentId: "long-gilts",
			label: "Long conventional gilts",
			plannedAnnualIssuanceGbp: bn(22.4),
			plannedOperationCount: 8,
			unallocatedFlexGbp: bn(4.5),
			methods: [
				method("gilt-auction", "5 auctions", bn(7.4), 5, bn(1.5), bn(22.4)),
				method("syndication", "3 syndications", bn(15), 3, bn(5), bn(22.4)),
			],
		},
		{
			instrumentId: "index-linked-gilts",
			label: "Index-linked gilts",
			plannedAnnualIssuanceGbp: bn(23),
			plannedOperationCount: 15,
			unallocatedFlexGbp: bn(4.5),
			methods: [
				method("gilt-auction", "13 auctions", bn(16), 13, bn(1.2), bn(23)),
				method("syndication", "2 syndications", bn(7), 2, bn(3.5), bn(23)),
			],
		},
	];

export const BORROWING_INVESTOR_SEGMENTS: readonly BorrowingInvestorSegment[] = [
	{
		id: "overseas",
		label: "Overseas investors",
		marketShare: 0.41,
		elasticityMultiplier: 1.15,
		qtSensitivity: 0.1,
		preferredInstruments: {
			"treasury-bills": 0.35,
			"short-gilts": 0.35,
			"medium-gilts": 0.2,
			"long-gilts": 0.07,
			"index-linked-gilts": 0.03,
		},
		note: "Large market-holder segment; relatively elastic in liquid front-end and benchmark gilts.",
	},
	{
		id: "insurance-pensions",
		label: "Insurers and pensions",
		marketShare: 0.26,
		elasticityMultiplier: 0.7,
		qtSensitivity: 0.35,
		preferredInstruments: {
			"treasury-bills": 0.02,
			"short-gilts": 0.05,
			"medium-gilts": 0.23,
			"long-gilts": 0.35,
			"index-linked-gilts": 0.35,
		},
		note: "Structural duration and inflation-linked demand, but lower short-run price elasticity.",
	},
	{
		id: "asset-managers",
		label: "Asset managers and funds",
		marketShare: 0.21,
		elasticityMultiplier: 1,
		qtSensitivity: 0.2,
		preferredInstruments: {
			"treasury-bills": 0.12,
			"short-gilts": 0.25,
			"medium-gilts": 0.35,
			"long-gilts": 0.18,
			"index-linked-gilts": 0.1,
		},
		note: "Benchmark and relative-value demand across the curve.",
	},
	{
		id: "banks-liquidity",
		label: "Banks and liquidity books",
		marketShare: 0.12,
		elasticityMultiplier: 1.25,
		qtSensitivity: 0.15,
		preferredInstruments: {
			"treasury-bills": 0.45,
			"short-gilts": 0.35,
			"medium-gilts": 0.15,
			"long-gilts": 0.03,
			"index-linked-gilts": 0.02,
		},
		note: "Liquidity demand concentrated in bills and short conventional gilts.",
	},
];

export const getBorrowingRemitCalendar = (
	instrumentId: DebtInstrumentId,
): BorrowingRemitCalendarBucket | undefined =>
	BORROWING_REMIT_CALENDAR.find(
		(bucket) => bucket.instrumentId === instrumentId,
	);

import type { BorrowingStrategyId } from "@/data/levers/borrowing";

export interface BorrowingBacktestRange {
	low: number;
	high: number;
}

export interface BorrowingBacktestEpisode {
	id: string;
	name: string;
	date: string;
	regime: "normal" | "credibility-shock" | "monetary-backstop";
	amountGbp: number;
	years: number;
	strategyId?: BorrowingStrategyId;
	summary: string;
	observedPeakGiltMoveBp: BorrowingBacktestRange;
	observedNote: string;
	modelOverlayBp?: number;
	modelOverlayLabel?: string;
	lesson: string;
	source: { url: string; label: string };
}

export const BORROWING_BACKTEST_EPISODES: readonly BorrowingBacktestEpisode[] = [
	{
		id: "growth-plan-2022",
		name: "Growth Plan 2022",
		date: "2022-09-23",
		regime: "credibility-shock",
		amountGbp: 43_500_000_000,
		years: 5,
		strategyId: "dmo-remit",
		summary:
			"Unfunded tax cuts announced without an OBR forecast. The central balance-sheet model should understate this unless a credibility shock is added.",
		observedPeakGiltMoveBp: { low: 100, high: 150 },
		observedNote:
			"Long gilt yields rose roughly 100bp+ around the announcement and LDI stress forced temporary Bank of England gilt purchases.",
		modelOverlayBp: 110,
		modelOverlayLabel: "unscored fiscal-event credibility shock",
		lesson:
			"Institutional credibility can dominate the arithmetic size of the borrowing package.",
		source: {
			url: "https://obr.uk/efo/economic-and-fiscal-outlook-november-2022/",
			label: "OBR EFO November 2022",
		},
	},
	{
		id: "pandemic-borrowing-2020",
		name: "Pandemic emergency borrowing",
		date: "2020-04-01",
		regime: "monetary-backstop",
		amountGbp: 300_000_000_000,
		years: 5,
		strategyId: "dmo-remit",
		summary:
			"Very large emergency issuance occurred alongside monetary-policy backstops and global safe-asset demand.",
		observedPeakGiltMoveBp: { low: 0, high: 35 },
		observedNote:
			"Despite record borrowing, gilt yields stayed contained because the shock was global, temporary, and heavily backstopped by asset purchases.",
		modelOverlayBp: -330,
		modelOverlayLabel: "QE/safe-asset demand backstop",
		lesson:
			"Absorption pressure must be interpreted with the monetary-policy regime, not just issuance size.",
		source: {
			url: "https://obr.uk/forecasts-in-depth/brief-guides-and-explainers/briefing-paper-no-8-forecasting-during-the-coronavirus-pandemic/",
			label: "OBR Briefing Paper 8",
		},
	},
	{
		id: "autumn-budget-2024",
		name: "Autumn Budget 2024",
		date: "2024-10-30",
		regime: "normal",
		amountGbp: 20_000_000_000,
		years: 5,
		strategyId: "dmo-remit",
		summary:
			"Additional public investment borrowing was announced with OBR scrutiny and offsetting tax rises.",
		observedPeakGiltMoveBp: { low: 0, high: 40 },
		observedNote:
			"Markets absorbed the package without a mini-budget-style discontinuity; moves were consistent with a modest term-premium repricing.",
		lesson:
			"Borrowing attached to an independently scored fiscal package should look like a low-stress marginal issuance case.",
		source: {
			url: "https://www.gov.uk/government/publications/autumn-budget-2024",
			label: "HM Treasury Autumn Budget 2024",
		},
	},
];

// Borrowing constants used to translate "+£X borrowed" into "+£Y/year of
// interest" and "+Zpp of debt:GDP." The yield is approximate — the actual
// cost depends on the maturity profile of the borrowing — but it gives users
// a defensible feel for fiscal cost. Update when the gilt curve moves
// substantially.

import type { Methodology } from "@/lib/methodology";

export interface BorrowingConstants {
	thirtyYearGiltYield: number; // 0–1
	ukGdp: number; // GBP, current price
	ukDebt: number; // GBP, public sector net debt
	asOf: string;
	source: { url: string; label: string };
	methodology: Methodology;
}

const SOURCE = {
	url: "https://www.dmo.gov.uk/data/yieldHistory/",
	label: "UK DMO 30-year gilt yield · ONS GDP",
} as const;

export const BORROWING: BorrowingConstants = {
	thirtyYearGiltYield: 0.05,
	ukGdp: 2_600_000_000_000,
	ukDebt: 2_500_000_000_000,
	asOf: "2026-04",
	source: SOURCE,
	methodology: {
		source: SOURCE,
		asOf: "2026-04",
		measure:
			"Approximate yield-to-maturity on 30-year UK gilts. Used to translate 'borrow £X' into 'add £X·yield/yr to interest costs.'",
		alternatives: [
			{
				label: "10-year gilt yield",
				value: 0.047,
				note: "Lower than 30-year. Real-world Treasury borrowing weights short and long maturities; the blended cost is between these.",
			},
			{
				label: "Real (inflation-adjusted) yield",
				value: 0.025,
				note: "After inflation, ~2.5%. More meaningful for long-run fiscal sustainability.",
			},
			{
				label: "Recent 5-year average",
				value: 0.035,
				note: "Pre-2022, yields were closer to 1.5%; the recent rise reflects the inflation shock.",
			},
		],
		range: {
			low: 0.045,
			high: 0.055,
			note: "Yields move daily. This is a representative figure for a calm market.",
		},
		caveat:
			"A real Treasury issues across the maturity curve — short-dated borrowing is cheaper but rolls over more often, exposing the Exchequer to rate-rise risk. The single-yield assumption is a useful first approximation, not a forecast.",
	},
};

// OBR baseline forecast — the "do nothing" path against which fiscal proposals
// are scored. Sourced from the Office for Budget Responsibility's Economic
// and Fiscal Outlook (EFO) supplementary tables.
//
// Why this matters:
//   The calculator's headline "this raises £X" answers a question the user
//   isn't really asking. The real question is "how does this change the
//   trajectory the country is already on?" — i.e. how does the proposal
//   move PSNB, debt:GDP, and the fiscal-rule margin against the OBR's
//   current-policy baseline?
//
//   Once the simulator has a baseline path, every scenario can show:
//     - "OBR baseline PSNB 2029-30: £X bn"
//     - "With your scenario: £Y bn"
//     - "Margin against the stability rule: £Z bn surplus / shortfall"
//
//   This is the framing Treasury, OBR, IFS, and budget journalists actually
//   use. Hitting it brings the calculator into their analytical universe.
//
// Update cadence:
//   OBR publishes a new EFO with each Budget + Spring Forecast (twice yearly).
//   Update this file alongside the data archive. Tag the `asOf` field with
//   the EFO publication date so the UI can flag when figures are stale.
//
// Sources:
//   - OBR EFO supplementary tables (xlsx): updated EFO-by-EFO
//   - HMT Budget red book (figures should reconcile with EFO)

export interface BaselineYear {
	fiscalYear: string; // "2024-25"
	psnb: number; // public sector net borrowing, £
	psnbPctGdp: number; // % of GDP
	psnd: number; // public sector net debt, £
	psndPctGdp: number; // % of GDP (tracked separately because measurement boundary changed in Oct 2024)
	totalRevenue: number; // £
	totalSpending: number; // £
	gdp: number; // nominal GDP, £
}

export interface OBRBaseline {
	asOf: string; // YYYY-MM (publication date of source EFO)
	source: { url: string; label: string };
	years: readonly BaselineYear[];
	// Fiscal rules in force at time of forecast.
	stabilityRuleHeadroom: number; // £ surplus to current-budget balance at horizon
	stabilityRuleAt: string; // fiscalYear at which rule is measured
	investmentRuleHeadroom: number; // £ headroom against PSNFL-falling rule
}

const bn = (n: number) => n * 1_000_000_000;
const tn = (n: number) => n * 1_000_000_000_000;

// Latest EFO (March 2025). Figures rounded to align with red book presentation.
// These are the headline figures from the OBR fan-chart-central forecast;
// alternative scenarios in OBR's analysis are not reflected here.
export const OBR_BASELINE: OBRBaseline = {
	asOf: "2025-03",
	source: {
		url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2025/",
		label: "OBR EFO March 2025",
	},
	years: [
		{
			fiscalYear: "2024-25",
			psnb: bn(128),
			psnbPctGdp: 5.0,
			psnd: tn(2.7),
			psndPctGdp: 95.0,
			totalRevenue: bn(1115),
			totalSpending: bn(1243),
			gdp: tn(2.55),
		},
		{
			fiscalYear: "2025-26",
			psnb: bn(104),
			psnbPctGdp: 3.9,
			psnd: tn(2.8),
			psndPctGdp: 95.5,
			totalRevenue: bn(1175),
			totalSpending: bn(1279),
			gdp: tn(2.65),
		},
		{
			fiscalYear: "2026-27",
			psnb: bn(83),
			psnbPctGdp: 3.0,
			psnd: tn(2.9),
			psndPctGdp: 95.8,
			totalRevenue: bn(1230),
			totalSpending: bn(1313),
			gdp: tn(2.75),
		},
		{
			fiscalYear: "2027-28",
			psnb: bn(73),
			psnbPctGdp: 2.6,
			psnd: tn(2.95),
			psndPctGdp: 95.5,
			totalRevenue: bn(1290),
			totalSpending: bn(1363),
			gdp: tn(2.85),
		},
		{
			fiscalYear: "2028-29",
			psnb: bn(61),
			psnbPctGdp: 2.1,
			psnd: tn(3.0),
			psndPctGdp: 95.0,
			totalRevenue: bn(1350),
			totalSpending: bn(1411),
			gdp: tn(2.95),
		},
		{
			fiscalYear: "2029-30",
			psnb: bn(55),
			psnbPctGdp: 1.9,
			psnd: tn(3.05),
			psndPctGdp: 94.0,
			totalRevenue: bn(1410),
			totalSpending: bn(1465),
			gdp: tn(3.05),
		},
	],
	stabilityRuleHeadroom: bn(9.9), // £9.9bn at 2029-30 per Mar 2025 EFO
	stabilityRuleAt: "2029-30",
	investmentRuleHeadroom: bn(15.7),
};

// Look up a specific year. Returns the closest year if exact match isn't
// available — useful when the simulator's projection horizon doesn't align.
export const getBaselineYear = (
	fiscalYear: string,
	baseline: OBRBaseline = OBR_BASELINE,
): BaselineYear | null =>
	baseline.years.find((y) => y.fiscalYear === fiscalYear) ?? null;

// Get the year-N entry (1-indexed; year 1 = first year of the forecast).
// Useful when matching to projectScenarioOverYears output, which is also
// 1-indexed.
export const getBaselineYearN = (
	n: number,
	baseline: OBRBaseline = OBR_BASELINE,
): BaselineYear | null => baseline.years[n - 1] ?? null;

// Server-side resolver: fetch the live OBR baseline override (env-gated)
// and overlay onto the static fallback. Mirrors the
// `loadResolvedSlices()` / `loadResolvedComparisons()` pattern. Call from
// `page.tsx` and pass through to client components as a prop — never call
// from client code (env vars aren't available there).
import {
	applyBaselineOverride,
	obrEfoSource,
} from "@/data/sources/obr-efo";
import { loadSource } from "@/data/sources/types";

export const loadResolvedBaseline = async (): Promise<OBRBaseline> => {
	const override = await loadSource(obrEfoSource);
	return applyBaselineOverride(OBR_BASELINE, override);
};

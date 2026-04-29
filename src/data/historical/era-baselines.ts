// Era-aware OBR baselines — reconstructions of "what the Chancellor saw" at
// each historical budget. The wizard's HUD uses these instead of today's
// EFO when the user is in a non-current era, so multi-year projection
// shows year-N PSNB shifts against the era's actual forecast trajectory.
//
// Scope: pre-OBR eras (1979, 1988) use HMT's own forecasts (no independent
// scrutiny). Post-OBR (2010-) use the relevant EFO publication.
//
// Sources:
//   - 1979: HM Treasury "Financial Statement and Budget Report 1979"
//     (Howe's emergency budget Red Book) — figures rounded to align with
//     contemporary presentation.
//   - 1988: HMT FSBR 1988 (Lawson) and Medium Term Financial Strategy.
//   - 2010: OBR "Economic and Fiscal Outlook June 2010" (the inaugural EFO).
//   - 2021: OBR "Economic and Fiscal Outlook March 2021" (Sunak's freeze
//     budget).
//
// Caveat: these are projections AS OF that budget — what the Chancellor
// expected. Outturns differed substantially (1981 recession blew up Howe's
// path, ERM crisis blew up Lawson's, slower recovery extended Coalition's,
// energy crisis blew up Sunak's). The wizard is an educational tool —
// these are the targets the Chancellor was working against, not history's
// verdict.

import type { OBRBaseline } from "@/data/baseline/obr-baseline";

const bn = (n: number) => n * 1_000_000_000;
const tn = (n: number) => n * 1_000_000_000_000;

export const BASELINE_1979: OBRBaseline = {
	asOf: "1979-06",
	source: {
		url: "https://www.parliament.uk/business/publications/research/key-issues-2010/economy/the-budget-and-public-spending/",
		label: "HMT FSBR 1979 (Howe Emergency Budget)",
	},
	years: [
		{
			fiscalYear: "1979-80",
			psnb: bn(8.5),
			psnbPctGdp: 4.5,
			psnd: bn(98),
			psndPctGdp: 50,
			totalRevenue: bn(50),
			totalSpending: bn(58),
			gdp: bn(195),
		},
		{
			fiscalYear: "1980-81",
			psnb: bn(6),
			psnbPctGdp: 2.7,
			psnd: bn(108),
			psndPctGdp: 49,
			totalRevenue: bn(60),
			totalSpending: bn(66),
			gdp: bn(220),
		},
		{
			fiscalYear: "1981-82",
			psnb: bn(4),
			psnbPctGdp: 1.6,
			psnd: bn(115),
			psndPctGdp: 47,
			totalRevenue: bn(70),
			totalSpending: bn(74),
			gdp: bn(245),
		},
		{
			fiscalYear: "1982-83",
			psnb: bn(2),
			psnbPctGdp: 0.7,
			psnd: bn(118),
			psndPctGdp: 44,
			totalRevenue: bn(80),
			totalSpending: bn(82),
			gdp: bn(270),
		},
		{
			fiscalYear: "1983-84",
			psnb: 0,
			psnbPctGdp: 0,
			psnd: bn(120),
			psndPctGdp: 41,
			totalRevenue: bn(90),
			totalSpending: bn(90),
			gdp: bn(295),
		},
	],
	stabilityRuleHeadroom: 0, // No formal fiscal rule; PSBR target was the headline
	stabilityRuleAt: "1983-84",
	investmentRuleHeadroom: 0,
};

export const BASELINE_1988: OBRBaseline = {
	asOf: "1988-03",
	source: {
		url: "https://www.parliament.uk/business/publications/research/key-issues-2010/economy/the-budget-and-public-spending/",
		label: "HMT FSBR 1988 (Lawson) + MTFS",
	},
	years: [
		{
			fiscalYear: "1988-89",
			psnb: bn(-3), // surplus (PSDR in 1988 framing)
			psnbPctGdp: -0.7,
			psnd: bn(150),
			psndPctGdp: 30,
			totalRevenue: bn(180),
			totalSpending: bn(177),
			gdp: bn(500),
		},
		{
			fiscalYear: "1989-90",
			psnb: bn(-10),
			psnbPctGdp: -1.8,
			psnd: bn(140),
			psndPctGdp: 26,
			totalRevenue: bn(200),
			totalSpending: bn(190),
			gdp: bn(550),
		},
		{
			fiscalYear: "1990-91",
			psnb: bn(-5),
			psnbPctGdp: -0.8,
			psnd: bn(135),
			psndPctGdp: 23,
			totalRevenue: bn(220),
			totalSpending: bn(215),
			gdp: bn(600),
		},
		{
			fiscalYear: "1991-92",
			psnb: 0,
			psnbPctGdp: 0,
			psnd: bn(135),
			psndPctGdp: 21,
			totalRevenue: bn(240),
			totalSpending: bn(240),
			gdp: bn(640),
		},
		{
			fiscalYear: "1992-93",
			psnb: bn(5),
			psnbPctGdp: 0.7,
			psnd: bn(140),
			psndPctGdp: 20,
			totalRevenue: bn(260),
			totalSpending: bn(265),
			gdp: bn(680),
		},
	],
	stabilityRuleHeadroom: 0, // MTFS target: balanced budget (or surplus); flexibly enforced
	stabilityRuleAt: "1992-93",
	investmentRuleHeadroom: 0,
};

export const BASELINE_2010: OBRBaseline = {
	asOf: "2010-06",
	source: {
		url: "https://obr.uk/efo/economic-and-fiscal-outlook-june-2010/",
		label: "OBR EFO June 2010 (inaugural)",
	},
	years: [
		{
			fiscalYear: "2010-11",
			psnb: bn(155),
			psnbPctGdp: 10.0,
			psnd: bn(1100),
			psndPctGdp: 70,
			totalRevenue: bn(548),
			totalSpending: bn(703),
			gdp: tn(1.58),
		},
		{
			fiscalYear: "2011-12",
			psnb: bn(125),
			psnbPctGdp: 7.5,
			psnd: bn(1230),
			psndPctGdp: 73,
			totalRevenue: bn(590),
			totalSpending: bn(715),
			gdp: tn(1.66),
		},
		{
			fiscalYear: "2012-13",
			psnb: bn(105),
			psnbPctGdp: 6.0,
			psnd: bn(1340),
			psndPctGdp: 76,
			totalRevenue: bn(625),
			totalSpending: bn(730),
			gdp: tn(1.74),
		},
		{
			fiscalYear: "2013-14",
			psnb: bn(85),
			psnbPctGdp: 4.7,
			psnd: bn(1430),
			psndPctGdp: 78,
			totalRevenue: bn(660),
			totalSpending: bn(745),
			gdp: tn(1.83),
		},
		{
			fiscalYear: "2014-15",
			psnb: bn(65),
			psnbPctGdp: 3.4,
			psnd: bn(1500),
			psndPctGdp: 80,
			totalRevenue: bn(700),
			totalSpending: bn(765),
			gdp: tn(1.92),
		},
		{
			fiscalYear: "2015-16",
			psnb: bn(45),
			psnbPctGdp: 2.2,
			psnd: bn(1550),
			psndPctGdp: 81,
			totalRevenue: bn(740),
			totalSpending: bn(785),
			gdp: tn(2.0),
		},
	],
	stabilityRuleHeadroom: bn(5), // Coalition fiscal mandate: cyclically-adjusted balance by 2015-16
	stabilityRuleAt: "2015-16",
	investmentRuleHeadroom: bn(15), // Supplementary debt target
};

export const BASELINE_2021: OBRBaseline = {
	asOf: "2021-03",
	source: {
		url: "https://obr.uk/efo/economic-and-fiscal-outlook-march-2021/",
		label: "OBR EFO March 2021 (Sunak Freeze Budget)",
	},
	years: [
		{
			fiscalYear: "2021-22",
			psnb: bn(128),
			psnbPctGdp: 5.5,
			psnd: tn(2.15),
			psndPctGdp: 95,
			totalRevenue: bn(820),
			totalSpending: bn(948),
			gdp: tn(2.27),
		},
		{
			fiscalYear: "2022-23",
			psnb: bn(75),
			psnbPctGdp: 3.1,
			psnd: tn(2.22),
			psndPctGdp: 95,
			totalRevenue: bn(890),
			totalSpending: bn(965),
			gdp: tn(2.4),
		},
		{
			fiscalYear: "2023-24",
			psnb: bn(55),
			psnbPctGdp: 2.2,
			psnd: tn(2.28),
			psndPctGdp: 95,
			totalRevenue: bn(940),
			totalSpending: bn(995),
			gdp: tn(2.5),
		},
		{
			fiscalYear: "2024-25",
			psnb: bn(45),
			psnbPctGdp: 1.7,
			psnd: tn(2.33),
			psndPctGdp: 94,
			totalRevenue: bn(990),
			totalSpending: tn(1.035),
			gdp: tn(2.6),
		},
		{
			fiscalYear: "2025-26",
			psnb: bn(40),
			psnbPctGdp: 1.5,
			psnd: tn(2.37),
			psndPctGdp: 92,
			totalRevenue: tn(1.04),
			totalSpending: tn(1.08),
			gdp: tn(2.7),
		},
		{
			fiscalYear: "2026-27",
			psnb: bn(35),
			psnbPctGdp: 1.3,
			psnd: tn(2.4),
			psndPctGdp: 90,
			totalRevenue: tn(1.09),
			totalSpending: tn(1.125),
			gdp: tn(2.8),
		},
	],
	stabilityRuleHeadroom: bn(25), // Sunak's stability rule: PSNB falling, current expenditure balanced
	stabilityRuleAt: "2025-26",
	investmentRuleHeadroom: bn(40),
};

// Outturn baselines — what actually happened, recorded by ONS PSF.
// Pairs with the forecast baselines above so the wizard can compare
// "what the Chancellor expected" vs "what the data showed". The
// divergences are pedagogically the entire point: 1981 recession blew
// up Howe's plan, ERM crisis blew up Lawson's, slower recovery extended
// Coalition's, energy crisis blew up Sunak's.
//
// Precision: figures rounded to ±£3-5bn precision based on ONS PSF
// series and IFS Green Budget retrospectives. For sharper precision a
// future iteration could add an env-gated ONS_PSF_HISTORICAL_URL source
// (mirroring obr-baseline.ts's live-override pattern) — leave the
// approximations as static fallback.
//
// Sources: ONS Public Sector Finances historical time-series tables;
// IFS Green Budget retrospective tables; OBR Forecast Evaluation
// Reports (2010 onwards).

export const OUTTURN_1979: OBRBaseline = {
	asOf: "1985-01",
	source: {
		url: "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
		label: "ONS PSF historical series · IFS retrospective (approximate)",
	},
	years: [
		{
			// PSBR outturn 1979-80 was ~£10bn vs Howe's £8.5bn forecast.
			fiscalYear: "1979-80",
			psnb: bn(10),
			psnbPctGdp: 5.1,
			psnd: bn(98),
			psndPctGdp: 50,
			totalRevenue: bn(50),
			totalSpending: bn(59),
			gdp: bn(195),
		},
		{
			fiscalYear: "1980-81",
			psnb: bn(13), // forecast was £6bn — recession blew up plan
			psnbPctGdp: 5.4,
			psnd: bn(115),
			psndPctGdp: 51,
			totalRevenue: bn(60),
			totalSpending: bn(73),
			gdp: bn(240),
		},
		{
			fiscalYear: "1981-82",
			psnb: bn(8),
			psnbPctGdp: 3.0,
			psnd: bn(122),
			psndPctGdp: 47,
			totalRevenue: bn(75),
			totalSpending: bn(83),
			gdp: bn(265),
		},
		{
			fiscalYear: "1982-83",
			psnb: bn(8),
			psnbPctGdp: 2.7,
			psnd: bn(130),
			psndPctGdp: 45,
			totalRevenue: bn(85),
			totalSpending: bn(93),
			gdp: bn(295),
		},
		{
			fiscalYear: "1983-84",
			psnb: bn(10),
			psnbPctGdp: 3.0,
			psnd: bn(140),
			psndPctGdp: 44,
			totalRevenue: bn(95),
			totalSpending: bn(105),
			gdp: bn(330),
		},
	],
	stabilityRuleHeadroom: 0,
	stabilityRuleAt: "1983-84",
	investmentRuleHeadroom: 0,
};

export const OUTTURN_1988: OBRBaseline = {
	asOf: "1995-01",
	source: {
		url: "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
		label: "ONS PSF historical series · IFS retrospective (approximate)",
	},
	years: [
		{
			fiscalYear: "1988-89",
			psnb: bn(-14), // surplus much bigger than forecast — boom
			psnbPctGdp: -2.7,
			psnd: bn(140),
			psndPctGdp: 28,
			totalRevenue: bn(190),
			totalSpending: bn(176),
			gdp: bn(515),
		},
		{
			fiscalYear: "1989-90",
			psnb: bn(-8),
			psnbPctGdp: -1.4,
			psnd: bn(132),
			psndPctGdp: 24,
			totalRevenue: bn(210),
			totalSpending: bn(202),
			gdp: bn(560),
		},
		{
			fiscalYear: "1990-91",
			psnb: bn(0.5), // recession arrives
			psnbPctGdp: 0.1,
			psnd: bn(132),
			psndPctGdp: 22,
			totalRevenue: bn(225),
			totalSpending: bn(225),
			gdp: bn(595),
		},
		{
			fiscalYear: "1991-92",
			psnb: bn(14),
			psnbPctGdp: 2.3,
			psnd: bn(146),
			psndPctGdp: 23,
			totalRevenue: bn(240),
			totalSpending: bn(254),
			gdp: bn(625),
		},
		{
			fiscalYear: "1992-93",
			psnb: bn(36), // ERM crisis Sept 1992
			psnbPctGdp: 5.5,
			psnd: bn(182),
			psndPctGdp: 28,
			totalRevenue: bn(245),
			totalSpending: bn(281),
			gdp: bn(655),
		},
	],
	stabilityRuleHeadroom: 0,
	stabilityRuleAt: "1992-93",
	investmentRuleHeadroom: 0,
};

export const OUTTURN_2010: OBRBaseline = {
	asOf: "2018-01",
	source: {
		url: "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
		label: "ONS PSF · OBR Forecast Evaluation Reports (approximate)",
	},
	years: [
		{
			fiscalYear: "2010-11",
			psnb: bn(137),
			psnbPctGdp: 8.7,
			psnd: bn(1100),
			psndPctGdp: 70,
			totalRevenue: bn(555),
			totalSpending: bn(692),
			gdp: tn(1.58),
		},
		{
			fiscalYear: "2011-12",
			psnb: bn(121),
			psnbPctGdp: 7.4,
			psnd: bn(1230),
			psndPctGdp: 73,
			totalRevenue: bn(595),
			totalSpending: bn(716),
			gdp: tn(1.65),
		},
		{
			// 2012-13 outturn was ~£114bn vs forecast £105bn (modest miss).
			fiscalYear: "2012-13",
			psnb: bn(114),
			psnbPctGdp: 6.6,
			psnd: bn(1360),
			psndPctGdp: 78,
			totalRevenue: bn(625),
			totalSpending: bn(746),
			gdp: tn(1.74),
		},
		{
			fiscalYear: "2013-14",
			psnb: bn(100),
			psnbPctGdp: 5.5,
			psnd: bn(1480),
			psndPctGdp: 81,
			totalRevenue: bn(660),
			totalSpending: bn(760),
			gdp: tn(1.81),
		},
		{
			fiscalYear: "2014-15",
			psnb: bn(92),
			psnbPctGdp: 4.8,
			psnd: bn(1570),
			psndPctGdp: 82,
			totalRevenue: bn(700),
			totalSpending: bn(792),
			gdp: tn(1.92),
		},
		{
			fiscalYear: "2015-16",
			psnb: bn(71), // missed forecast (£45bn) — slower recovery
			psnbPctGdp: 3.6,
			psnd: bn(1640),
			psndPctGdp: 82,
			totalRevenue: bn(740),
			totalSpending: bn(811),
			gdp: tn(2.0),
		},
	],
	stabilityRuleHeadroom: bn(-25), // Coalition missed fiscal mandate
	stabilityRuleAt: "2015-16",
	investmentRuleHeadroom: bn(-10),
};

export const OUTTURN_2021: OBRBaseline = {
	asOf: "2024-09",
	source: {
		url: "https://www.ons.gov.uk/economy/governmentpublicsectorandtaxes/publicsectorfinance",
		label: "ONS PSF · OBR retrospective (2024 outturns; later years still indicative)",
	},
	years: [
		{
			fiscalYear: "2021-22",
			psnb: bn(124),
			psnbPctGdp: 5.4,
			psnd: tn(2.16),
			psndPctGdp: 95,
			totalRevenue: bn(820),
			totalSpending: bn(944),
			gdp: tn(2.27),
		},
		{
			fiscalYear: "2022-23",
			psnb: bn(132), // energy crisis blew up forecast (£75bn)
			psnbPctGdp: 5.5,
			psnd: tn(2.29),
			psndPctGdp: 96,
			totalRevenue: bn(880),
			totalSpending: tn(1.012),
			gdp: tn(2.4),
		},
		{
			fiscalYear: "2023-24",
			psnb: bn(121),
			psnbPctGdp: 4.8,
			psnd: tn(2.41),
			psndPctGdp: 96,
			totalRevenue: bn(940),
			totalSpending: tn(1.061),
			gdp: tn(2.5),
		},
		{
			fiscalYear: "2024-25",
			psnb: bn(128),
			psnbPctGdp: 5.0,
			psnd: tn(2.55),
			psndPctGdp: 95,
			totalRevenue: tn(1.115),
			totalSpending: tn(1.243),
			gdp: tn(2.55),
		},
	],
	stabilityRuleHeadroom: 0,
	stabilityRuleAt: "2024-25",
	investmentRuleHeadroom: 0,
};

import type { EraId } from "@/data/eras";
import {
	type CountryCode,
	type HistoricalOverride,
	applyHistoricalOverride,
	createOnsPsfHistoricalSource,
	onsPsfHistoricalSource,
} from "@/data/sources/ons-psf-historical";

const ERA_BASELINES: Partial<Record<EraId, OBRBaseline>> = {
	"1979": BASELINE_1979,
	"1988": BASELINE_1988,
	"2010": BASELINE_2010,
	"2021": BASELINE_2021,
};

const ERA_OUTTURNS: Partial<Record<EraId, OBRBaseline>> = {
	"1979": OUTTURN_1979,
	"1988": OUTTURN_1988,
	"2010": OUTTURN_2010,
	"2021": OUTTURN_2021,
};

export type BaselineMode = "forecast" | "outturn";

// Server-side loader: resolves any live ONS PSF override and overlays
// onto static outturn baselines. Mirrors loadResolvedBaseline pattern.
// Call from server components; pass the result through to the client.
//
// `country` selects which country's plausibility-bound validator and
// JSON endpoint to use. Defaults to the UK (or the HISTORICAL_COUNTRY
// env var if set — let a deployment pin a different country without
// code changes).
export const loadResolvedOutturns = async (
	country?: CountryCode,
): Promise<Partial<Record<EraId, OBRBaseline>>> => {
	const resolvedCountry =
		country ?? (process.env.HISTORICAL_COUNTRY as CountryCode | undefined);
	const source =
		resolvedCountry && resolvedCountry !== "UK"
			? createOnsPsfHistoricalSource(resolvedCountry)
			: onsPsfHistoricalSource;
	const override = await source.fetch();
	const out: Partial<Record<EraId, OBRBaseline>> = {};
	for (const era of ["1979", "1988", "2010", "2021"] as EraId[]) {
		const staticOutturn = ERA_OUTTURNS[era];
		if (!staticOutturn) continue;
		out[era] = applyHistoricalOverride(staticOutturn, era, override);
	}
	return out;
};

// Resolve the right baseline for an era. Falls back to the live current
// baseline (passed by the server) when era is "current" or undefined.
// `mode` controls whether the forecast or outturn baseline is returned.
// `resolvedOutturns` (optional) carries server-fetched ONS PSF
// overrides — when provided, replaces the static outturn fallback for
// the matching era.
export const getEraBaseline = (
	era: EraId,
	currentBaseline: OBRBaseline,
	mode: BaselineMode = "forecast",
	resolvedOutturns?: Partial<Record<EraId, OBRBaseline>>,
): OBRBaseline => {
	if (era === "current") return currentBaseline;
	if (mode === "outturn") {
		return resolvedOutturns?.[era] ?? ERA_OUTTURNS[era] ?? currentBaseline;
	}
	return ERA_BASELINES[era] ?? currentBaseline;
};

// Re-export so callers can use the helper without importing from sources.
export type { HistoricalOverride };

import { type TaxLever, getTaxLever } from "@/data/levers/tax-rates";
import {
	getProgrammeLegislation,
	getTaxLegislation,
} from "@/data/legislation";
import {
	ERAS,
	type EraId,
	applyEraLeverOverride,
	applyEraProgramme,
	eraGbpPerUnit,
} from "@/data/eras";
import {
	distributeDelta,
	sumDeciles,
	zeroDeciles,
} from "@/lib/distribution";
import { evaluateBehaviouralResponse } from "@/lib/elasticity";
import {
	BANK_RATE_DEVIATION_CEILING_PP,
	BANK_RATE_DEVIATION_FLOOR_PP,
	BANK_RATE_RESPONSE_SMOOTHING,
	BANK_RATE_RESPONSE_TO_CPI_PP,
	BANK_RATE_RESPONSE_TO_GDP_PCT,
	type FiscalMultiplier,
	FREEZE_DRAG_AMPLIFICATION_PER_CPI_PP,
	GILT_YIELD_PER_DEBT_GDP_PP,
	UK_GDP_BASE,
	getProgrammeMultiplier,
	getTaxMultiplier,
	macroFeedback,
	multiplierAtYear,
	secondRoundDelta,
} from "@/lib/macro";
import {
	type PercentileBand,
	computeBand,
	distributionFromRange,
	sampleNormal,
	seededRng,
} from "@/lib/uncertainty";

// Single source of truth for "what should the headline read?" given a tax
// lever and a magnitude. Branches on `lever.unit` so callers don't need to
// re-implement the four unit conventions.
export function describeTaxChange(lever: TaxLever, magnitude: number): string {
	const mag = Math.abs(magnitude);
	if (lever.unit === "yr") {
		return magnitude >= 0
			? `Freeze ${lever.name} for ${mag.toFixed(0)} more year${mag === 1 ? "" : "s"}`
			: `Unfreeze ${lever.name} (${mag.toFixed(0)} year${mag === 1 ? "" : "s"})`;
	}
	if (lever.unit === "k") {
		return magnitude >= 0
			? `Raise ${lever.name} by £${mag.toFixed(2)}k`
			: `Lower ${lever.name} by £${mag.toFixed(2)}k`;
	}
	if (lever.unit === "bn") {
		// tax-other is the catch-all sundry-measures lever — phrasing reflects
		// that it's a bundle, not a discrete instrument. Named "bn" levers
		// (wealth tax, LVT, CBAM, etc.) read as discrete policy choices.
		if (lever.id === "tax-other") {
			return magnitude >= 0
				? `Other tax measures raising £${mag.toFixed(1)}bn`
				: `Other tax measures losing £${mag.toFixed(1)}bn`;
		}
		return magnitude >= 0
			? `Introduce ${lever.name} — £${mag.toFixed(1)}bn`
			: `Repeal ${lever.name} — £${mag.toFixed(1)}bn lost`;
	}
	if (lever.unit === "p-per-litre") {
		return magnitude >= 0
			? `Raise ${lever.name} by ${mag.toFixed(1)}p/litre`
			: `Cut ${lever.name} by ${mag.toFixed(1)}p/litre`;
	}
	// pp (default)
	return magnitude >= 0
		? `Raise ${lever.name} by ${mag.toFixed(2)}pp`
		: `Cut ${lever.name} by ${mag.toFixed(2)}pp`;
}
import {
	type SpendingProgramme,
	getProgramme,
} from "@/data/levers/uk-spending";
import {
	BORROWING,
	type BorrowingStrategyId,
	type DebtInstrument,
	getBorrowingStrategy,
} from "@/data/levers/borrowing";
import type { Methodology } from "@/lib/methodology";
import {
	FUTURE_DEBT_SERVICE_INCIDENCE,
	projectBorrowingPath,
} from "@/lib/borrowing";
import {
	describeBorrowingContext,
	deserializeBorrowingContext,
	isBorrowingContextEmpty,
	serializeBorrowingContext,
	type BorrowingScenarioContext,
} from "@/lib/borrowing-context";

// A scenario is a stack of fiscal-lever adjustments. Each line independently
// produces a £ delta (positive = freed, negative = required). The scenario's
// net effect is the sum.

export type LineType = "programme" | "tax" | "borrow";

export interface ScenarioLine {
	id: string; // local UUID; not part of the URL
	type: LineType;
	leverId: string; // programme id, tax id, or "" for borrow
	magnitude: number; // % for programme, pp for tax, GBP for borrow
	borrowingStrategyId?: BorrowingStrategyId;
	borrowingPortfolio?: readonly DebtInstrument[];
	borrowingContext?: BorrowingScenarioContext;
	// "Break the rules" flag: when set, the lever has been forced through
	// despite a statutory protection or pre-introduction status. The
	// evaluator applies a yield haircut (markets/avoidance) and a fixed
	// risk premium (+£500m/yr debt-servicing). See OVERRIDE_YIELD_FACTOR
	// and OVERRIDE_RISK_PREMIUM below.
	overridden?: boolean;
}

// Override yield haircut: the realised yield is reduced to this fraction
// of nominal when a rule has been overridden. Reflects market reaction,
// avoidance behaviour, partial-reversal risk all rolled into one number.
// Crude but legible — a real model would be per-rule.
export const OVERRIDE_YIELD_FACTOR = 0.7;
// Fixed annual debt-servicing premium per overridden line. Stands in for
// the gilt yield response to a credibility-damaging rule break.
export const OVERRIDE_RISK_PREMIUM = -500_000_000;

export interface LineEvaluation {
	line: ScenarioLine;
	deltaGbp: number;
	description: string;
	methodology: Methodology;
	source: { url: string; label: string };
}

export interface ScenarioResult {
	freed: number; // sum of positive deltas
	required: number; // |sum of negative deltas|
	net: number; // freed - required
	lines: LineEvaluation[];
}

// Look up per-rule override penalties from the legislation registry. Falls
// back to the global defaults if the rule doesn't have rule-specific
// values. Returns { haircut, premium, implementationMonths } where:
//   - haircut: realised yield = nominal × haircut (0..1)
//   - premium: fixed annual debt-servicing cost (negative number, £/yr)
//   - implementationMonths: lag from announcement to full delivery
const getOverridePenalty = (
	type: LineType,
	leverId: string,
): { haircut: number; premium: number; implementationMonths: number } => {
	if (type === "borrow") return { haircut: 1, premium: 0, implementationMonths: 0 };
	const meta =
		type === "tax"
			? getTaxLegislation(leverId)
			: getProgrammeLegislation(leverId);
	const r = meta?.relaxation;
	return {
		haircut: r?.yieldHaircut ?? OVERRIDE_YIELD_FACTOR,
		premium: r?.riskPremium ?? OVERRIDE_RISK_PREMIUM,
		implementationMonths: r?.implementationMonths ?? 0,
	};
};

// Implementation-lag ramp: year-1 yield is partial when implementationMonths
// > 12. Linear from 0 → 1 over implementationMonths from announcement.
//   - implementationMonths = 0 (immediate): ramp = 1 from year 1
//   - implementationMonths = 24 (e.g. wealth tax): year 1 = 0.5, year 2 = 1
//   - implementationMonths >= 999 (anachronistic / undefined): ramp = 1
//     (instrument either truly impossible or no lag applicable)
// Premium is NOT ramped — gilt yields respond on announcement-day.
export const overrideRampFactor = (
	year: number,
	implementationMonths: number,
): number => {
	if (implementationMonths <= 0 || implementationMonths >= 999) return 1;
	const monthsAtEndOfYear = year * 12;
	return Math.min(1, monthsAtEndOfYear / implementationMonths);
};

// Apply override haircut + risk premium when line.overridden. Note: only
// programme + tax lines can carry penalties — borrow override doesn't
// make conceptual sense (no rule is being broken).
//
// `year` (default 1) controls implementation-lag ramping. Year-1 figures
// for an overridden hypothetical (24mo lag) yield only half; year-2+ is
// full. The risk premium applies in full from year 1 — markets price
// the credibility damage on announcement-day.
const applyOverridePenalty = (
	deltaGbp: number,
	overridden: boolean,
	type: LineType,
	leverId: string,
	year = 1,
): number => {
	if (!overridden || type === "borrow") return deltaGbp;
	const { haircut, premium, implementationMonths } = getOverridePenalty(
		type,
		leverId,
	);
	const ramp = overrideRampFactor(year, implementationMonths);
	return deltaGbp * haircut * ramp + premium;
};

const overridePrefix = (overridden: boolean | undefined): string =>
	overridden ? "🔓 (override) " : "";

export function evaluateLine(
	line: ScenarioLine,
	opts?: { year?: number; era?: EraId },
): LineEvaluation {
	const year = opts?.year ?? 1;
	const era = opts?.era ?? "current";
	const isEraScaled = era !== "current";
	const gdpScale = isEraScaled ? ERAS[era].gdpScale : 1;
	if (line.type === "programme") {
		// In non-current eras, prefer the era's actual programme value
		// (NHS £8.4bn in 1979) over a gdpScale approximation (£12.5bn).
		// applyEraProgramme falls back to base when no era override exists.
		const prog: SpendingProgramme = isEraScaled
			? applyEraProgramme(getProgramme(line.leverId), era)
			: getProgramme(line.leverId);
		const fraction = line.magnitude / 100;
		const nominalDelta = -prog.value * fraction;
		const deltaGbp = applyOverridePenalty(
			nominalDelta,
			!!line.overridden,
			"programme",
			line.leverId,
			year,
		);
		const pct = Math.abs(fraction * 100);
		return {
			line,
			deltaGbp,
			description:
				overridePrefix(line.overridden) +
				(fraction >= 0
					? `Increase ${prog.name} by ${pct.toFixed(1)}%`
					: `Cut ${prog.name} by ${pct.toFixed(1)}%`),
			methodology: prog.methodology,
			source: prog.source,
		};
	}
	if (line.type === "tax") {
		// eraGbpPerUnit returns the historical per-pp yield when the lever
		// has a per-era gbpPerUnit override (basic IT, VAT, corp tax for
		// the major eras); otherwise falls back to current × gdpScale.
		const baseLever: TaxLever = getTaxLever(line.leverId);
		const lever = isEraScaled ? applyEraLeverOverride(baseLever, era) : baseLever;
		const effectiveGbpPerUnit = eraGbpPerUnit(baseLever, era);
		const nominalDelta = effectiveGbpPerUnit * line.magnitude;
		const deltaGbp = applyOverridePenalty(
			nominalDelta,
			!!line.overridden,
			"tax",
			line.leverId,
			year,
		);
		return {
			line,
			deltaGbp,
			description: overridePrefix(line.overridden) + describeTaxChange(lever, line.magnitude),
			methodology: lever.methodology,
			source: lever.source,
		};
	}
	// Borrow: positive magnitude = borrow (revenue freed); negative = repay.
	// Magnitude is current-pound input from the user; scale to era-£ when
	// rendering historical eras so "Borrow £20bn" reads as ~£1.5bn in 1979.
	const amount = line.magnitude * gdpScale;
	const strategy =
		line.type === "borrow" && line.borrowingStrategyId
			? getBorrowingStrategy(line.borrowingStrategyId)
			: null;
	const strategySuffix = strategy ? ` (${strategy.label})` : "";
	const contextSuffix = isBorrowingContextEmpty(line.borrowingContext)
		? ""
		: ` · ${describeBorrowingContext(line.borrowingContext)}`;
	return {
		line,
		deltaGbp: amount,
		description:
			amount >= 0
				? `Borrow £${(amount / 1_000_000_000).toFixed(1)}bn${strategySuffix}${contextSuffix}`
				: `Repay £${(Math.abs(amount) / 1_000_000_000).toFixed(1)}bn of debt${strategySuffix}${contextSuffix}`,
		methodology: BORROWING.methodology,
		source: BORROWING.source,
	};
}

export function evaluateScenario(
	lines: ScenarioLine[],
	opts?: { era?: EraId; year?: number },
): ScenarioResult {
	const evaluated = lines.map((line) => evaluateLine(line, opts));
	const freed = evaluated
		.filter((e) => e.deltaGbp > 0)
		.reduce((sum, e) => sum + e.deltaGbp, 0);
	const required = evaluated
		.filter((e) => e.deltaGbp < 0)
		.reduce((sum, e) => sum + Math.abs(e.deltaGbp), 0);
	return {
		freed,
		required,
		net: freed - required,
		lines: evaluated,
	};
}

// Apply a uniform scale to every £ figure in the result. Used to translate
// present-day lever yields into a different era's nominal-GDP basis. Pure
// post-hoc scaling — keeps the evaluator and per-line metadata unchanged
// (descriptions, methodology, source) and just rescales the £ deltas.
//
// Downstream evaluators (distribution, microsim, projection) read deltaGbp
// from each line, so they automatically see scaled figures when called
// with a scaled result.
export function scaleScenarioResult(
	result: ScenarioResult,
	scale: number,
): ScenarioResult {
	if (scale === 1) return result;
	return {
		freed: result.freed * scale,
		required: result.required * scale,
		net: result.net * scale,
		lines: result.lines.map((l) => ({ ...l, deltaGbp: l.deltaGbp * scale })),
	};
}

// URL serialization: "p:state-pension:-3,t:basic-rate-income-tax:1,b:20000000000"
// Compact, doesn't need JSON encoding. Each line is `<type>:<id>:<magnitude>`
// (or `<type>:<magnitude>` for borrow). Lines separated by commas.

const TYPE_CODE: Record<LineType, string> = {
	programme: "p",
	tax: "t",
	borrow: "b",
};

const CODE_TYPE: Record<string, LineType> = {
	p: "programme",
	t: "tax",
	b: "borrow",
};

export function serializeScenario(lines: ScenarioLine[]): string {
	return lines
		.map((line) => {
			const code = TYPE_CODE[line.type];
			const suffix = line.overridden ? ":o" : "";
			if (line.type === "borrow") {
				const strategySuffix = line.borrowingStrategyId
					? `:${line.borrowingStrategyId}`
					: "";
				const context = serializeBorrowingContext(line.borrowingContext);
				const contextSuffix = context ? `:ctx=${context}` : "";
				return `${code}:${line.magnitude}${strategySuffix}${contextSuffix}${suffix}`;
			}
			return `${code}:${line.leverId}:${line.magnitude}${suffix}`;
		})
		.join(",");
}

let counter = 0;
const newId = () => `l${++counter}`;

export function deserializeScenario(s: string): ScenarioLine[] {
	if (!s) return [];
	return s
		.split(",")
		.map((segment): ScenarioLine | null => {
			const parts = segment.split(":");
			const code = parts[0];
			if (!code) return null;
			const type = CODE_TYPE[code];
			if (!type) return null;
			// Trailing "o" marker indicates an overridden line. Strip it for
			// the rest of the parsing pipeline.
			const overridden = parts[parts.length - 1] === "o";
			const dataParts = overridden ? parts.slice(0, -1) : parts;
			if (type === "borrow") {
				if (dataParts.length < 2) return null;
				const mag = Number(dataParts[1]);
				if (!Number.isFinite(mag)) return null;
				let borrowingStrategyId: BorrowingStrategyId | undefined;
				let borrowingContext: BorrowingScenarioContext | undefined;
				for (const token of dataParts.slice(2)) {
					if (token.startsWith("ctx=")) {
						borrowingContext = deserializeBorrowingContext(token.slice(4));
						continue;
					}
					if (getBorrowingStrategy(token).id === token) {
						borrowingStrategyId = token as BorrowingStrategyId;
					}
				}
				return {
					id: newId(),
					type,
					leverId: "",
					magnitude: mag,
					...(borrowingStrategyId && { borrowingStrategyId }),
					...(borrowingContext && { borrowingContext }),
					...(overridden && { overridden: true }),
				};
			}
			if (dataParts.length !== 3) return null;
			const leverId = dataParts[1] ?? "";
			const mag = Number(dataParts[2]);
			if (!Number.isFinite(mag) || !leverId) return null;
			// Validate lever id exists.
			if (type === "programme" && getProgramme(leverId).id !== leverId) {
				return null;
			}
			if (type === "tax" && getTaxLever(leverId).id !== leverId) {
				return null;
			}
			return {
				id: newId(),
				type,
				leverId,
				magnitude: mag,
				...(overridden && { overridden: true }),
			};
		})
		.filter((x): x is ScenarioLine => x !== null);
}

// ---------------------------------------------------------------------------
// Converters from legacy state shapes into ScenarioLine[]
//
// The trade-off engine and counterfactual panel each have their own state
// type (`Allocation`, `Counterfactual`) backed by URL params (`to_*`, `cf_*`).
// These helpers re-encode that state as a Scenario so all three editors can
// live on the same canonical URL key (`?scenario=`). The resulting lines round-
// trip through serialize/deserialize cleanly.
// ---------------------------------------------------------------------------

export interface AllocationLike {
	tax: number; // £ raised via tax
	borrow: number; // £ borrowed
	cut: number; // £ saved by cutting a programme
}

// Triptych = exactly three lines (tax, borrow, cut). Zero-magnitude lines are
// preserved so the shape signals "this scenario originated from the triptych
// view" — useful for routing back to the triptych editor on load.
export function allocationToScenario(
	allocation: AllocationLike,
	taxLeverId: string,
	progLeverId: string,
): ScenarioLine[] {
	const taxLever = getTaxLever(taxLeverId);
	const programme = getProgramme(progLeverId);
	const taxMagnitude =
		taxLever.gbpPerUnit !== 0 ? allocation.tax / taxLever.gbpPerUnit : 0;
	const cutFraction =
		programme.value !== 0 ? allocation.cut / programme.value : 0;
	return [
		{
			id: newId(),
			type: "tax",
			leverId: taxLever.id,
			magnitude: taxMagnitude,
		},
		{
			id: newId(),
			type: "borrow",
			leverId: "",
			magnitude: allocation.borrow,
		},
		{
			id: newId(),
			type: "programme",
			leverId: programme.id,
			// Programme magnitude is signed percent: negative = cut.
			magnitude: -cutFraction * 100,
		},
	];
}

export function counterfactualToScenario(
	cf:
		| { type: "programme"; id: string; deltaFraction: number }
		| { type: "tax"; id: string; deltaPp: number },
): ScenarioLine[] {
	if (cf.type === "programme") {
		// deltaFraction in -1..+1; programme magnitude is signed percent.
		return [
			{
				id: newId(),
				type: "programme",
				leverId: cf.id,
				magnitude: cf.deltaFraction * 100,
			},
		];
	}
	return [
		{
			id: newId(),
			type: "tax",
			leverId: cf.id,
			magnitude: cf.deltaPp,
		},
	];
}

// ---------------------------------------------------------------------------
// Diffing two scenarios.
//
// Used by the templates drawer to preview what loading a budget would do to
// the user's current scenario. Lines are matched by (type, leverId); for
// borrow lines (where leverId is empty), they're matched by type alone (since
// there's only one borrow lever in a scenario).
// ---------------------------------------------------------------------------

export interface ScenarioDiff {
	// In current but absent from incoming — would be lost on replace.
	removed: ScenarioLine[];
	// In incoming but absent from current — would be added on replace.
	added: ScenarioLine[];
	// In both with different magnitudes — would be updated on replace.
	modified: { from: ScenarioLine; to: ScenarioLine }[];
	// In both with same magnitude — would be unchanged.
	unchanged: ScenarioLine[];
}

const lineKey = (l: ScenarioLine): string =>
	l.type === "borrow" ? "borrow" : `${l.type}:${l.leverId}`;

const portfolioKey = (portfolio: readonly DebtInstrument[] | undefined): string =>
	portfolio
		?.map((instrument) => `${instrument.id}:${instrument.share.toFixed(4)}`)
		.join("|") ?? "";

const lineChanged = (a: ScenarioLine, b: ScenarioLine): boolean =>
	a.magnitude !== b.magnitude ||
	!!a.overridden !== !!b.overridden ||
	a.borrowingStrategyId !== b.borrowingStrategyId ||
	portfolioKey(a.borrowingPortfolio) !== portfolioKey(b.borrowingPortfolio) ||
	serializeBorrowingContext(a.borrowingContext) !==
		serializeBorrowingContext(b.borrowingContext);

// ---------------------------------------------------------------------------
// Distributional evaluation: per-line and per-scenario £ impact by income
// decile.
//
// Sign convention (applied uniformly):
//   Positive per-decile value = decile LOSES £ in this scenario
//     (tax raise → households pay more; programme cut → households lose benefit)
//   Negative per-decile value = decile GAINS £ in this scenario
//     (tax cut → households retain income; programme rise → households gain benefit)
//
// Borrowing is shown on a different basis from year-1 fiscal capacity: it is
// allocated as year-5 annual debt service, because the household incidence of
// borrowing lands through future taxes rather than the gilt sale itself.
// Lines without incidence vectors (e.g. tax-other) are skipped and reported
// via `modelledDelta` so callers can flag the unmodelled share.
// ---------------------------------------------------------------------------

export interface ScenarioDistribution {
	perDecile: number[]; // length 10; signed per the convention above
	modelledLines: number;
	totalLines: number;
	modelledDelta: number; // £ impact basis of lines we have incidence for
	totalDelta: number; // £ impact basis of all lines, including unmodelled ones
}

const distributionDeltaForLine = (evaluation: LineEvaluation): number => {
	if (evaluation.line.type !== "borrow") return evaluation.deltaGbp;
	return (
		projectBorrowingPath(evaluation.line.magnitude, 5, {
			strategyId: evaluation.line.borrowingStrategyId,
			portfolio: evaluation.line.borrowingPortfolio,
		})[4]?.interestCostGbp ?? 0
	);
};

export const evaluateLineDistribution = (
	evaluation: LineEvaluation,
	opts?: { era?: EraId },
): number[] | null => {
	const { line, deltaGbp } = evaluation;
	if (line.type === "borrow") {
		return distributeDelta(
			distributionDeltaForLine(evaluation),
			FUTURE_DEBT_SERVICE_INCIDENCE,
		);
	}
	const era = opts?.era ?? "current";
	const incidence =
		line.type === "tax"
			? (era !== "current"
					? applyEraLeverOverride(getTaxLever(line.leverId), era).incidence
					: getTaxLever(line.leverId).incidence)
			: (era !== "current"
					? applyEraProgramme(getProgramme(line.leverId), era).incidence
					: getProgramme(line.leverId).incidence);
	if (!incidence) return null;
	return distributeDelta(deltaGbp, incidence.vector);
};

export const evaluateScenarioDistribution = (
	result: ScenarioResult,
	opts?: { era?: EraId },
): ScenarioDistribution => {
	let perDecile = zeroDeciles();
	let modelledLines = 0;
	let modelledDelta = 0;
	let totalDelta = 0;
	for (const ev of result.lines) {
		const lineDelta = distributionDeltaForLine(ev);
		totalDelta += lineDelta;
		const dist = evaluateLineDistribution(ev, opts);
		if (dist) {
			perDecile = sumDeciles(perDecile, dist);
			modelledLines++;
			modelledDelta += lineDelta;
		}
	}
	return {
		perDecile,
		modelledLines,
		totalLines: result.lines.length,
		modelledDelta,
		totalDelta,
	};
};

// ---------------------------------------------------------------------------
// Dynamic scoring: behavioural-adjusted yield per line and per scenario.
//
// The ready-reckoner yield (`evaluation.deltaGbp`) is linear in the selected
// magnitude. For tax levers with an explicit behavioural model, the dynamic
// layer reconstructs the affected marginal tax base, applies the lever's
// taxable-base elasticity, and reports the nonlinear revenue, output, and
// worker consumption-equivalent effects.
//
// Lines without a behavioural model return their ready-reckoner yield
// unchanged. Methodology fields name the behavioural risk separately for
// threshold-style and direct-£ levers.
// ---------------------------------------------------------------------------

export interface DynamicLineEvaluation {
	staticDelta: number;
	dynamicDelta: number;
	behaviouralAdjustmentGbp: number;
	behaviouralAdjustmentFraction: number;
	haircutFraction: number; // Backward-compatible alias for UI thresholds.
	outputEffectGbp: number;
	workerCevGbp: number;
}

export const evaluateLineDynamic = (
	evaluation: LineEvaluation,
): DynamicLineEvaluation => {
	const { line, deltaGbp } = evaluation;
	if (line.type !== "tax") {
		return {
			staticDelta: deltaGbp,
			dynamicDelta: deltaGbp,
			behaviouralAdjustmentGbp: 0,
			behaviouralAdjustmentFraction: 0,
			haircutFraction: 0,
			outputEffectGbp: 0,
			workerCevGbp: 0,
		};
	}
	const lever = getTaxLever(line.leverId);
	const response = evaluateBehaviouralResponse(
		deltaGbp,
		lever.behaviour,
		line.magnitude,
	);
	return {
		staticDelta: deltaGbp,
		dynamicDelta: response.dynamicDelta,
		behaviouralAdjustmentGbp: response.behaviouralAdjustmentGbp,
		behaviouralAdjustmentFraction: response.adjustmentFraction,
		haircutFraction: response.adjustmentFraction,
		outputEffectGbp: response.outputEffectGbp,
		workerCevGbp: response.workerCevGbp,
	};
};

export interface ScenarioDynamic {
	staticNet: number;
	dynamicNet: number;
	staticFreed: number;
	dynamicFreed: number;
	staticRequired: number;
	dynamicRequired: number;
	outputEffectGbp: number;
	workerCevGbp: number;
	// Lines with non-trivial behavioural adjustments (>5%) — useful for the
	// UI to flag which lines are driving the ready-reckoner/dynamic gap.
	dynamicLines: { line: ScenarioLine; haircutFraction: number }[];
}

export const evaluateScenarioDynamic = (
	result: ScenarioResult,
): ScenarioDynamic => {
	let dynamicFreed = 0;
	let dynamicRequired = 0;
	let outputEffectGbp = 0;
	let workerCevGbp = 0;
	const dynamicLines: { line: ScenarioLine; haircutFraction: number }[] = [];
	for (const ev of result.lines) {
		const d = evaluateLineDynamic(ev);
		if (d.dynamicDelta > 0) dynamicFreed += d.dynamicDelta;
		if (d.dynamicDelta < 0) dynamicRequired += Math.abs(d.dynamicDelta);
		outputEffectGbp += d.outputEffectGbp;
		workerCevGbp += d.workerCevGbp;
		if (d.haircutFraction > 0.05) {
			dynamicLines.push({
				line: ev.line,
				haircutFraction: d.haircutFraction,
			});
		}
	}
	return {
		staticNet: result.net,
		dynamicNet: dynamicFreed - dynamicRequired,
		staticFreed: result.freed,
		dynamicFreed,
		staticRequired: result.required,
		dynamicRequired,
		outputEffectGbp,
		workerCevGbp,
		dynamicLines,
	};
};

// ---------------------------------------------------------------------------
// Multi-year projection.
//
// Project the scenario's net £ over a horizon, applying simple nominal-growth
// scaling for tax/spend/cut lines and accumulating interest for borrow lines.
// Threshold-freeze ("yr") levers are special: their magnitude already encodes
// N years of accumulated drag, so the scenario as-encoded is already a year-N
// figure for those — we don't compound them further (would double-count).
// ---------------------------------------------------------------------------

export interface YearProjection {
	year: number; // 1-indexed; year 1 is the announcement year
	net: number;
	freed: number;
	required: number;
	// Signed: positive improves PSNB, negative worsens PSNB. This differs
	// from `net` for borrow lines because debt issuance provides cash but
	// increases borrowing and debt stock.
	psnbShift: number;
	debtInterestGbp: number;
	debtStockDeltaGbp: number;
	debtGdpDeltaPp: number;
}

export interface ProjectionAssumptions {
	nominalGrowth: number; // annual nominal GDP growth (default 0.04)
	giltYield: number; // annual borrow servicing rate (default 0.045)
	bankRate: number;
	inflation: number;
	yieldCurveShift: number;
	multiplierScale: number;
	taxBuoyancyScale: number;
	debtRiskPremiumScale: number;
	// Era multiplier adjust: per-era regime factor on macro coefficients
	// (1979 stagflation 0.7, 2010 ZLB 1.3, etc.). Default 1.0 (current).
	era?: EraId;
}

const DEFAULT_ASSUMPTIONS: ProjectionAssumptions = {
	nominalGrowth: 0.04,
	giltYield: 0.045,
	bankRate: BORROWING.bankRate,
	inflation: BORROWING.inflation,
	yieldCurveShift: 0,
	multiplierScale: 1,
	taxBuoyancyScale: 1,
	debtRiskPremiumScale: 1,
};

// Apply the era's macro adjust to a multiplier. Three-tier resolution:
//   1. If the override is a capital/current split, build a multiplier
//      with that split — the evaluator's `effectiveCoefficient` will
//      blend per the era's capital share. Used for ZLB-style amplification
//      that affects only capital spending (Blanchard 2013).
//   2. If the override is a number, treat as absolute blended coefficient.
//      Captures composition effects without per-component detail.
//   3. Otherwise, scale the base coefficient by the era's uniform
//      multiplierAdjust (e.g. 1979 × 0.7).
const eraAdjustedMultiplier = (
	m: ReturnType<typeof getTaxMultiplier>,
	era: EraId | undefined,
	type: "tax" | "programme",
	leverId: string,
): ReturnType<typeof getTaxMultiplier> => {
	if (!m || !era || era === "current") return m;
	const def = ERAS[era];
	const overrideMap =
		type === "tax"
			? def.taxMultiplierOverrides
			: def.programmeMultiplierOverrides;
	const override = overrideMap?.[leverId];
	if (override !== undefined) {
		if (typeof override === "number") {
			return { ...m, coefficient: override };
		}
		// Object form: build multiplier with overridden split. capitalShare
		// defaults to the lever's base share, then to a generic 0.2 if the
		// lever has no split data.
		const baseShare =
			m.multiplierSplit?.capitalShare ?? 0.2;
		return {
			...m,
			multiplierSplit: {
				capital: override.capital,
				current: override.current,
				capitalShare: override.capitalShare ?? baseShare,
			},
		};
	}
	const adjust = def.multiplierAdjust;
	if (!adjust || adjust === 1) return m;
	return { ...m, coefficient: m.coefficient * adjust };
};

const scaledMultiplier = (
	m: FiscalMultiplier | undefined,
	scale: number,
): FiscalMultiplier | undefined => {
	if (!m || scale === 1) return m;
	return {
		...m,
		coefficient: m.coefficient * scale,
		...(m.multiplierSplit
			? {
					multiplierSplit: {
						...m.multiplierSplit,
						capital: m.multiplierSplit.capital * scale,
						current: m.multiplierSplit.current * scale,
					},
				}
			: {}),
	};
};

const projectionMultiplier = (
	m: FiscalMultiplier | undefined,
	a: ProjectionAssumptions,
): FiscalMultiplier | undefined => scaledMultiplier(m, a.multiplierScale);

const secondRoundDeltaForAssumptions = (
	firstRoundDelta: number,
	multiplier: FiscalMultiplier | undefined,
	year: number,
	a: ProjectionAssumptions,
): number => {
	const feedback =
		macroFeedback(firstRoundDelta, multiplier, year) * a.taxBuoyancyScale;
	const result = firstRoundDelta + feedback;
	if (Math.sign(result) !== Math.sign(firstRoundDelta) && firstRoundDelta !== 0) {
		return 0;
	}
	return result;
};

// ---------------------------------------------------------------------------
// Uncertainty quantification: net £ as a percentile band rather than a
// single point.
//
// Each rate-style tax lever contributes a normal-distributed yield (mean =
// static figure, sd derived from methodology.range or 10% fallback). Lines
// without an obvious distribution (programmes, borrow, threshold-style) are
// kept deterministic — their uncertainty would be a separate modelling
// exercise. We sample 1000 draws by default; 5/25/50/75/95 percentiles form
// the fan band shown in the UI.
// ---------------------------------------------------------------------------

const DEFAULT_SAMPLE_COUNT = 1000;
const DEFAULT_SEED = 42;

// ---------------------------------------------------------------------------
// Macro feedback (Scope A): fiscal multiplier × tax-to-GDP ratio gives
// second-round revenue feedback. See src/lib/macro.ts for the math + sources.
//
// Per-line: get the lever's multiplier, apply to the dynamic-adjusted £ delta.
// Per-scenario: aggregate. Borrow lines are deterministic (no macro effect on
// the borrow itself; the macro effect is captured by the tax/spend lines that
// the borrow funds).
// ---------------------------------------------------------------------------

export interface MacroLineEvaluation {
	dynamicDelta: number; // first-round (post-behavioural)
	macroFeedbackGbp: number; // signed; revenue gain (+) or loss (−) from macro feedback
	secondRoundDelta: number; // dynamic + macroFeedback
	multiplier: FiscalMultiplier | undefined;
}

const multiplierForLine = (line: ScenarioLine): FiscalMultiplier | undefined => {
	if (line.type === "tax") return getTaxMultiplier(line.leverId);
	if (line.type === "programme") return getProgrammeMultiplier(line.leverId);
	return undefined; // borrow
};

export const evaluateLineMacro = (
	evaluation: LineEvaluation,
): MacroLineEvaluation => {
	const dyn = evaluateLineDynamic(evaluation);
	const multiplier = multiplierForLine(evaluation.line);
	const feedback = macroFeedback(dyn.dynamicDelta, multiplier);
	const second = secondRoundDelta(dyn.dynamicDelta, multiplier);
	return {
		dynamicDelta: dyn.dynamicDelta,
		macroFeedbackGbp: feedback,
		secondRoundDelta: second,
		multiplier,
	};
};

export interface ScenarioMacro {
	dynamicNet: number; // first-round (post-behavioural; without macro feedback)
	macroFeedbackGbp: number; // signed total feedback across all lines
	secondRoundNet: number; // dynamicNet + macroFeedbackGbp
	// Lines with non-trivial macro feedback (>5% of their dynamic delta).
	macroLines: { line: ScenarioLine; feedbackFraction: number }[];
}

// ---------------------------------------------------------------------------
// Scope B macro path: per-year MacroState aggregating GDP, CPI, debt:GDP,
// Bank Rate, and gilt-yield deviations from baseline.
//
// Channels:
//   1. GDP: sum of (line's £ × year-N multiplier) across all lines.
//      Already fed into projection via `projectScenarioOverYears`.
//   2. CPI: VAT and similar levers push CPI directly via passthrough; sum of
//      (line's £ × cpiPassthrough) / (UK GDP × VAT base ratio).
//   3. Debt:GDP: cumulative scenario impact on PSNB / GDP.
//   4. Bank Rate: smoothed reduced-form response to CPI and GDP deviations.
//   5. Gilt yield: change in debt:GDP × per-pp sensitivity.
//
// All deviations are vs OBR baseline. This is reduced-form — no full
// general-equilibrium feedback yet (that's Scope C).
// ---------------------------------------------------------------------------

export interface MacroState {
	year: number;
	cpiDeviationPp: number; // percentage points off baseline CPI level
	gdpDeviationPct: number; // % of GDP impact
	debtGdpDeviationPp: number; // percentage points off baseline debt:GDP
	bankRateDeviationPp: number; // percentage points off baseline Bank Rate
	giltYieldDeviationPp: number; // percentage points off baseline 10-year gilt
}

const cpiPassthroughForLine = (line: ScenarioLine): number => {
	if (line.type !== "tax") return 0;
	const m = getTaxMultiplier(line.leverId);
	return m?.cpiPassthrough ?? 0;
};

const evaluateScenarioMacroPathFromProjection = (
	result: ScenarioResult,
	years: number,
	psnbProjection: readonly YearProjection[],
	assumptions: Partial<ProjectionAssumptions> = {},
): MacroState[] => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const states: MacroState[] = [];
	let cumulativePsnb = 0; // cumulative scenario PSNB shift (positive = scenario reduces borrowing)
	let previousBankRateDeviationPp = 0;

	for (let y = 1; y <= years; y++) {
		// GDP deviation: sum of (dynamic delta × year-N multiplier) across lines.
		// Sign: revenue raise → fiscal contraction → GDP falls (negative).
		let gdpImpactGbp = 0;
		// CPI passthrough: applied only in year 1 directly; year 2+ effects are
		// fading lagged dynamics not modelled here. For Scope B we use:
		//   year-1: direct passthrough × year-1 multiplier path entry
		//   year 2+: linear fade matching the lever's own pathShape
		let cpiImpactGbpScale = 0;
		// Year-N PSNB shift (positive improves borrowing). Borrow lines use
		// their dedicated financing model rather than being treated as policy
		// revenue.
		const yearPsnb = psnbProjection[y - 1]?.psnbShift ?? 0;

		for (const ev of result.lines) {
			const dyn = evaluateLineDynamic(ev);
			let firstRound = dyn.dynamicDelta;
			// Reproduce the projection's per-year scaling for tax/programme/borrow.
			if (ev.line.type === "borrow") {
				firstRound = 0;
			} else if (ev.line.type === "tax") {
				const lever = getTaxLever(ev.line.leverId);
				if (lever.unit === "yr") {
					const tg = ev.line.magnitude;
					firstRound =
						tg > 0 && y < tg ? (y / tg) * dyn.dynamicDelta : dyn.dynamicDelta;
				} else {
					firstRound =
						dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				}
			} else if (ev.line.type === "programme") {
				firstRound = dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
			}

			const multiplier = projectionMultiplier(
				ev.line.type === "tax"
					? getTaxMultiplier(ev.line.leverId)
					: ev.line.type === "programme"
						? getProgrammeMultiplier(ev.line.leverId)
						: undefined,
				a,
			);

			// GDP impact: sign-flipped from revenue (revenue raise = fiscal contraction = GDP loss)
			if (multiplier) {
				const m = multiplierAtYear(multiplier, y);
				gdpImpactGbp -= firstRound * m;
			}

			// CPI passthrough: applies to tax lines with passthrough coefficient.
			// Scale: cpiPassthrough is in "fraction of price level per fraction of GDP".
			// Approximate: cpi shift (pp) ≈ passthrough × (revenue / GDP) × 100, with a
			// year-1 spike fading per the lever's pathShape (use multiplierAtYear / coefficient ratio).
			if (ev.line.type === "tax" && multiplier) {
				const passthrough = cpiPassthroughForLine(ev.line);
				if (passthrough > 0) {
					const shapeFactor =
						multiplier.coefficient > 0
							? multiplierAtYear(multiplier, y) / multiplier.coefficient
							: 0;
					cpiImpactGbpScale +=
						(firstRound / UK_GDP_BASE) * passthrough * shapeFactor * 100;
				}
			}
		}

		// Cumulative PSNB shift accumulates each year (scenario-adjusted PSNB)
		cumulativePsnb += yearPsnb;
		const debtGdpDeviationPp = -(cumulativePsnb / UK_GDP_BASE) * 100;
		const gdpDeviationPct = (gdpImpactGbp / UK_GDP_BASE) * 100;
		const targetBankRateDeviationPp =
			cpiImpactGbpScale * BANK_RATE_RESPONSE_TO_CPI_PP +
			gdpDeviationPct * BANK_RATE_RESPONSE_TO_GDP_PCT;
		const bankRateDeviationPp = Math.max(
			BANK_RATE_DEVIATION_FLOOR_PP,
			Math.min(
				BANK_RATE_DEVIATION_CEILING_PP,
				BANK_RATE_RESPONSE_SMOOTHING * previousBankRateDeviationPp +
					(1 - BANK_RATE_RESPONSE_SMOOTHING) *
						targetBankRateDeviationPp,
			),
		);
		previousBankRateDeviationPp = bankRateDeviationPp;
		// Gilt yield response: sensitivity × debt:GDP shift
		const giltYieldDeviationPp =
			debtGdpDeviationPp *
			GILT_YIELD_PER_DEBT_GDP_PP *
			100 *
			a.debtRiskPremiumScale;

		states.push({
			year: y,
			cpiDeviationPp: cpiImpactGbpScale,
			gdpDeviationPct,
			debtGdpDeviationPp,
			bankRateDeviationPp,
			giltYieldDeviationPp,
		});
	}
	return states;
};

export const evaluateScenarioMacroPath = (
	result: ScenarioResult,
	years: number,
	assumptions: Partial<ProjectionAssumptions> = {},
): MacroState[] =>
	evaluateScenarioMacroPathFromProjection(
		result,
		years,
		projectScenarioOverYears(result, years, assumptions),
		assumptions,
	);

export const evaluateScenarioMacro = (
	result: ScenarioResult,
): ScenarioMacro => {
	let dynamicNet = 0;
	let totalFeedback = 0;
	const macroLines: ScenarioMacro["macroLines"] = [];
	for (const ev of result.lines) {
		const m = evaluateLineMacro(ev);
		dynamicNet += m.dynamicDelta;
		totalFeedback += m.macroFeedbackGbp;
		const fraction =
			Math.abs(m.dynamicDelta) > 0
				? Math.abs(m.macroFeedbackGbp) / Math.abs(m.dynamicDelta)
				: 0;
		if (fraction > 0.05) {
			macroLines.push({ line: ev.line, feedbackFraction: fraction });
		}
	}
	return {
		dynamicNet,
		macroFeedbackGbp: totalFeedback,
		secondRoundNet: dynamicNet + totalFeedback,
		macroLines,
	};
};

// Pull a Distribution for the per-pp yield of a tax line, if applicable.
// Returns null for non-pp levers, programmes, and borrow lines (those are
// deterministic in this model).
const distributionForLine = (line: ScenarioLine) => {
	if (line.type !== "tax") return null;
	const lever = getTaxLever(line.leverId);
	if (lever.unit !== "pp") return null;
	return distributionFromRange(lever.gbpPerUnit, lever.methodology.range);
};

export const evaluateScenarioBand = (
	result: ScenarioResult,
	samples = DEFAULT_SAMPLE_COUNT,
	seed = DEFAULT_SEED,
): PercentileBand & { central: number } => {
	const rng = seededRng(seed);
	const draws: number[] = [];
	for (let i = 0; i < samples; i++) {
		let net = 0;
		for (const ev of result.lines) {
			const dist = distributionForLine(ev.line);
			if (dist) {
				const sampledPerPp = sampleNormal(rng, dist);
				net += sampledPerPp * ev.line.magnitude;
			} else {
				net += ev.deltaGbp;
			}
		}
		draws.push(net);
	}
	const band = computeBand(draws);
	return { ...band, central: result.net };
};

export interface ScenarioBandContribution {
	lineId: string;
	description: string;
	variance: number; // £² — independent-normal variance of this line's net
	sd: number; // £ — sd of this line's net
	share: number; // 0..1 share of the total scenario variance
}

// Per-line variance decomposition of the scenario's parameter-uncertainty
// band. Independent-normal assumption matches `evaluateScenarioBand`'s
// sampling: for a `pp`-tax line with magnitude m and per-pp distribution
// (mean μ, sd σ), the line contributes Var = (m × σ)². Lines without a
// per-pp distribution (programmes, borrow, non-pp tax) are deterministic
// and contribute zero variance — they're returned with share = 0 so the
// caller can still surface them as "no fan contribution".
export const evaluateScenarioBandContributions = (
	result: ScenarioResult,
): ScenarioBandContribution[] => {
	const rows: ScenarioBandContribution[] = [];
	let totalVariance = 0;
	for (const ev of result.lines) {
		const dist = distributionForLine(ev.line);
		const sd = dist ? Math.abs(ev.line.magnitude) * dist.sd : 0;
		const variance = sd * sd;
		totalVariance += variance;
		rows.push({
			lineId: ev.line.id,
			description: ev.description,
			variance,
			sd,
			share: 0,
		});
	}
	if (totalVariance > 0) {
		for (const row of rows) {
			row.share = row.variance / totalVariance;
		}
	}
	return rows;
};

// Multi-year version: same sampling approach but with the full projection
// machinery applied per draw. Each draw samples each lever's per-pp yield
// once, then projects across the full horizon using the existing growth +
// interest + freeze-ramp logic. Per year, percentiles across draws form
// the fan chart band.
//
// Limitation: lever sampling happens ONCE per draw and is held constant
// across years — i.e. we're modelling parameter uncertainty, not stochastic
// year-to-year shocks. That's the right convention for fiscal scoring fan
// charts (OBR's fan-chart framing is also primarily about parameter
// uncertainty in their central forecasts).

// ---------------------------------------------------------------------------
// Scope C: single-pass GE feedback into projection.
//
// Closes the loop from MacroState back into per-line yields. Three channels:
//
//   1. CPI → frozen-threshold drag: when scenario raises CPI (e.g. via VAT),
//      frozen-threshold revenue amplifies because nominal earnings grow
//      faster, pulling more taxpayers across the static threshold.
//
//   2. CPI → indexed spending: state pension cost rises with CPI via the
//      triple lock. Modelled as a proportional increase in state-pension
//      programme cost.
//
//   3. Gilt yield → borrow servicing: borrow lines accumulate at year-N
//      (baseline + scenario-deviation) gilt yield, not the fixed 4.5%.
//      Higher debt → higher yields → higher servicing cost compounds.
//
//   4. Bank Rate → short debt servicing: the endogenous monetary-policy
//      reaction feeds through instrument-specific Bank Rate pass-through.
//
// Convention is iterative but bounded: compute the no-feedback projection,
// derive MacroPath from it, re-project with feedback, then recompute the macro
// state from the updated PSNB/debt path until the projection stabilises. This
// closes the borrowing loop where debt service worsens PSNB, lifts debt:GDP,
// nudges gilt yields, and feeds back into subsequent debt service.
// ---------------------------------------------------------------------------

const TRIPLE_LOCK_AMPLIFICATION_PER_CPI_PP = 0.01; // 1% extra cost per pp CPI
const GE_FEEDBACK_TOLERANCE_GBP = 1_000_000;
const GE_FEEDBACK_MAX_ITERATIONS = 6;

const applyGEFeedback = (
	line: ScenarioLine,
	baseDelta: number,
	macroState: MacroState,
	year: number,
	a: ProjectionAssumptions,
): number => {
	if (line.type === "tax") {
		const lever = getTaxLever(line.leverId);
		// Channel 1: frozen-threshold drag amplification with CPI.
		if (lever.unit === "yr") {
			const amplification =
				1 +
				macroState.cpiDeviationPp * FREEZE_DRAG_AMPLIFICATION_PER_CPI_PP;
			return baseDelta * amplification;
		}
		return baseDelta;
	}

	if (line.type === "programme") {
		// Channel 2: state pension via triple lock.
		if (line.leverId === "state-pension") {
			// Programme line's deltaGbp is signed (positive = revenue freed by
			// cutting). Triple lock amplifies the absolute cost: a positive CPI
			// deviation makes the programme MORE expensive, which means a cut
			// frees MORE revenue (positive baseDelta amplified) AND an increase
			// costs MORE (negative baseDelta amplified in magnitude).
			const amplification =
				1 +
				Math.abs(macroState.cpiDeviationPp) *
					TRIPLE_LOCK_AMPLIFICATION_PER_CPI_PP;
			return baseDelta * amplification;
		}
		return baseDelta;
	}

	return baseDelta;
};

export interface GeneralEquilibriumProjection {
	noFeedback: YearProjection[];
	withFeedback: YearProjection[];
	macroPath: MacroState[];
	iterations: number;
	converged: boolean;
	maxChangeGbp: number;
}

const maxProjectionChangeGbp = (
	previous: readonly YearProjection[],
	next: readonly YearProjection[],
): number =>
	Math.max(
		0,
		...next.map((row, index) => {
			const old = previous[index];
			if (!old) return Math.abs(row.net);
			return Math.max(
				Math.abs(row.net - old.net),
				Math.abs(row.psnbShift - old.psnbShift),
				Math.abs(row.debtInterestGbp - old.debtInterestGbp),
				Math.abs(row.debtStockDeltaGbp - old.debtStockDeltaGbp),
			);
		}),
	);

const projectScenarioWithMacroPath = (
	result: ScenarioResult,
	years: number,
	a: ProjectionAssumptions,
	macroPath: readonly MacroState[],
): YearProjection[] => {
	const withFeedback: YearProjection[] = [];
	for (let y = 1; y <= years; y++) {
		const macroState = macroPath[y - 1]!;
		let freed = 0;
		let required = 0;
		let psnbShift = 0;
		let debtInterestGbp = 0;
		let debtStockDeltaGbp = 0;
		let debtGdpDeltaPp = 0;
		for (const ev of result.lines) {
			const dyn = evaluateLineDynamic(ev);
			let baseDelta = dyn.dynamicDelta;
			// First apply the same Scope A+B per-year scaling that
			// projectScenarioOverYears uses, then layer Scope C feedback on top.
			if (ev.line.type === "borrow") {
				const borrowPath = projectBorrowingPath(ev.line.magnitude, years, {
					nominalGrowth: a.nominalGrowth,
					bankRate: Math.max(
						-0.005,
						a.bankRate + macroState.bankRateDeviationPp / 100,
					),
					inflation: a.inflation,
					strategyId: ev.line.borrowingStrategyId,
					portfolio: ev.line.borrowingPortfolio,
					yieldCurveShift:
						a.yieldCurveShift + macroState.giltYieldDeviationPp / 100,
					cpiDeviationPp: macroState.cpiDeviationPp,
				});
				const row = borrowPath[y - 1]!;
				baseDelta = row.netFundingGbp;
				psnbShift += row.psnbShiftGbp;
				debtInterestGbp += row.interestCostGbp;
				debtStockDeltaGbp += row.debtStockDeltaGbp;
				debtGdpDeltaPp += row.debtGdpDeltaPp;
			} else if (ev.line.type === "tax") {
				const lever = getTaxLever(ev.line.leverId);
				if (lever.unit === "yr") {
					const tg = ev.line.magnitude;
					baseDelta =
						tg > 0 && y < tg
							? (y / tg) * dyn.dynamicDelta
							: dyn.dynamicDelta;
				} else {
					baseDelta = dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				}
				const multiplier = eraAdjustedMultiplier(
					getTaxMultiplier(ev.line.leverId),
					a.era,
					"tax",
					ev.line.leverId,
				);
				baseDelta = secondRoundDeltaForAssumptions(
					baseDelta,
					projectionMultiplier(multiplier, a),
					y,
					a,
				);
			} else if (ev.line.type === "programme") {
				baseDelta = dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				const multiplier = eraAdjustedMultiplier(
					getProgrammeMultiplier(ev.line.leverId),
					a.era,
					"programme",
					ev.line.leverId,
				);
				baseDelta = secondRoundDeltaForAssumptions(
					baseDelta,
					projectionMultiplier(multiplier, a),
					y,
					a,
				);
			}

			const geAdjusted =
				ev.line.type === "borrow"
					? baseDelta
					: applyGEFeedback(ev.line, baseDelta, macroState, y, a);
			if (ev.line.type !== "borrow") psnbShift += geAdjusted;
			if (geAdjusted > 0) freed += geAdjusted;
			if (geAdjusted < 0) required += Math.abs(geAdjusted);
		}
		withFeedback.push({
			year: y,
			freed,
			required,
			net: freed - required,
			psnbShift,
			debtInterestGbp,
			debtStockDeltaGbp,
			debtGdpDeltaPp,
		});
	}

	return withFeedback;
};

export const projectScenarioWithGEFeedback = (
	result: ScenarioResult,
	years: number,
	assumptions: Partial<ProjectionAssumptions> = {},
): GeneralEquilibriumProjection => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const noFeedback = projectScenarioOverYears(result, years, a);
	let withFeedback = noFeedback;
	let macroPath = evaluateScenarioMacroPathFromProjection(
		result,
		years,
		withFeedback,
		a,
	);
	let maxChangeGbp = Number.POSITIVE_INFINITY;
	let iterations = 0;
	let converged = false;

	for (let i = 1; i <= GE_FEEDBACK_MAX_ITERATIONS; i++) {
		const next = projectScenarioWithMacroPath(result, years, a, macroPath);
		maxChangeGbp = maxProjectionChangeGbp(withFeedback, next);
		withFeedback = next;
		iterations = i;
		macroPath = evaluateScenarioMacroPathFromProjection(
			result,
			years,
			withFeedback,
			a,
		);
		if (maxChangeGbp <= GE_FEEDBACK_TOLERANCE_GBP) {
			converged = true;
			break;
		}
	}

	return {
		noFeedback,
		withFeedback,
		macroPath,
		iterations,
		converged,
		maxChangeGbp,
	};
};

export const projectScenarioBandsByYear = (
	result: ScenarioResult,
	years: number,
	assumptions: Partial<ProjectionAssumptions> = {},
	samples = DEFAULT_SAMPLE_COUNT,
	seed = DEFAULT_SEED,
): {
	year: number;
	central: number;
	band: PercentileBand;
}[] => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const central = projectScenarioOverYears(result, years, a);
	const rng = seededRng(seed);

	// For each draw: sample each line's per-pp yield once. Hold constant
	// across years.
	const drawsByYear: number[][] = Array.from({ length: years }, () => []);

	for (let s = 0; s < samples; s++) {
		// Per-line sampled yield (£) for this draw.
		const sampled: { line: ScenarioLine; sampledDelta: number }[] =
			result.lines.map((ev) => {
				const dist = distributionForLine(ev.line);
				if (!dist) return { line: ev.line, sampledDelta: ev.deltaGbp };
				const sampledPerPp = sampleNormal(rng, dist);
				return {
					line: ev.line,
					sampledDelta: sampledPerPp * ev.line.magnitude,
				};
			});

		for (let y = 1; y <= years; y++) {
			let freed = 0;
			let required = 0;
			for (const { line, sampledDelta } of sampled) {
				let delta = sampledDelta;
				if (line.type === "borrow") {
					delta = projectBorrowingPath(line.magnitude, years, {
						nominalGrowth: a.nominalGrowth,
						bankRate: a.bankRate,
						inflation: a.inflation,
						yieldCurveShift: a.yieldCurveShift,
						strategyId: line.borrowingStrategyId,
						portfolio: line.borrowingPortfolio,
					})[y - 1]!.netFundingGbp;
				} else if (line.type === "tax") {
					const lever = getTaxLever(line.leverId);
					if (lever.unit === "yr") {
						const targetYears = line.magnitude;
						if (targetYears > 0 && y < targetYears) {
							delta = (y / targetYears) * sampledDelta;
						} else {
							delta = sampledDelta;
						}
					} else {
						delta = sampledDelta * Math.pow(1 + a.nominalGrowth, y - 1);
					}
				} else if (line.type === "programme") {
					delta = sampledDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				}
				if (delta > 0) freed += delta;
				if (delta < 0) required += Math.abs(delta);
			}
			drawsByYear[y - 1]!.push(freed - required);
		}
	}

	return central.map((c, i) => ({
		year: c.year,
		central: c.net,
		band: computeBand(drawsByYear[i]!),
	}));
};

export const projectScenarioOverYears = (
	result: ScenarioResult,
	years: number,
	assumptions: Partial<ProjectionAssumptions> = {},
): YearProjection[] => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const projections: YearProjection[] = [];

	for (let y = 1; y <= years; y++) {
		let freed = 0;
		let required = 0;
		let psnbShift = 0;
		let debtInterestGbp = 0;
		let debtStockDeltaGbp = 0;
		let debtGdpDeltaPp = 0;
		for (const ev of result.lines) {
			// Overridden lines have an implementation-lag ramp baked into
			// applyOverridePenalty. Re-evaluate the line for year y so the
			// year-1 hypothetical (24mo lag) shows partial yield; year-2+
			// shows full.
			const yearEv = ev.line.overridden
				? evaluateLine(ev.line, { year: y })
				: ev;
			const dyn = evaluateLineDynamic(yearEv);
			let delta = dyn.dynamicDelta;
			if (ev.line.type === "borrow") {
				const borrowing = projectBorrowingPath(ev.line.magnitude, years, {
					nominalGrowth: a.nominalGrowth,
					bankRate: a.bankRate,
					inflation: a.inflation,
					yieldCurveShift: a.yieldCurveShift,
					strategyId: ev.line.borrowingStrategyId,
					portfolio: ev.line.borrowingPortfolio,
				})[y - 1]!;
				delta = borrowing.netFundingGbp;
				psnbShift += borrowing.psnbShiftGbp;
				debtInterestGbp += borrowing.interestCostGbp;
				debtStockDeltaGbp += borrowing.debtStockDeltaGbp;
				debtGdpDeltaPp += borrowing.debtGdpDeltaPp;
			} else if (ev.line.type === "tax") {
				const lever = getTaxLever(ev.line.leverId);
				if (lever.unit === "yr") {
					// Freeze lever: magnitude already encodes year-N total drag.
					// Don't compound — would double-count. Yield is constant after
					// the freeze ends (no further drag).
					// (For year < magnitude, yield grows linearly; we approximate
					// "year y < magnitude" as `y/magnitude × static`.)
					const targetYears = ev.line.magnitude;
					if (targetYears > 0 && y < targetYears) {
						delta = (y / targetYears) * dyn.dynamicDelta;
					} else {
						delta = dyn.dynamicDelta;
					}
				} else {
					// Rate / threshold / commodity / bn levers: scale with nominal
					// GDP each year (revenue base grows with nominal economy).
					delta = dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				}
				// Apply year-N macro feedback (Scope B): the multiplier path
				// determines this year's demand-side feedback.
				const multiplier = eraAdjustedMultiplier(
					getTaxMultiplier(ev.line.leverId),
					a.era,
					"tax",
					ev.line.leverId,
				);
				delta = secondRoundDeltaForAssumptions(
					delta,
					projectionMultiplier(multiplier, a),
					y,
					a,
				);
				psnbShift += delta;
			} else if (ev.line.type === "programme") {
				// Programme line: scaled with nominal growth (departmental spend
				// grows with the economy in real-trend terms).
				delta = dyn.dynamicDelta * Math.pow(1 + a.nominalGrowth, y - 1);
				// Apply year-N macro feedback (era-aware coefficient).
				const multiplier = eraAdjustedMultiplier(
					getProgrammeMultiplier(ev.line.leverId),
					a.era,
					"programme",
					ev.line.leverId,
				);
				delta = secondRoundDeltaForAssumptions(
					delta,
					projectionMultiplier(multiplier, a),
					y,
					a,
				);
				psnbShift += delta;
			}
			if (delta > 0) freed += delta;
			if (delta < 0) required += Math.abs(delta);
		}
		projections.push({
			year: y,
			freed,
			required,
			net: freed - required,
			psnbShift,
			debtInterestGbp,
			debtStockDeltaGbp,
			debtGdpDeltaPp,
		});
	}
	return projections;
};

// Per-year scoring tier exposure. Each year carries the four canonical
// tiers — static (linear, no behavioural, no macro), dynamic (with
// behavioural response, no macro), macro (Scope B), GE (Scope C) — so a
// caller can render the macro scoring bridge for any year of the horizon
// without re-doing the projection logic itself. Mirrors the year-by-year
// scaling rules in projectScenarioOverYears so the static / dynamic
// values agree exactly with the bridge's existing year-1 inputs when y=1.
export interface ScenarioTieredYear {
	year: number;
	staticNet: number;
	dynamicNet: number;
	macroNet: number;
	geNet: number;
}

const scaleNonBorrowDeltaForYear = (
	base: number,
	line: ScenarioLine,
	year: number,
	nominalGrowth: number,
): number => {
	if (line.type === "tax") {
		const lever = getTaxLever(line.leverId);
		if (lever.unit === "yr") {
			const targetYears = line.magnitude;
			if (targetYears > 0 && year < targetYears) {
				return (year / targetYears) * base;
			}
			return base;
		}
		return base * Math.pow(1 + nominalGrowth, year - 1);
	}
	if (line.type === "programme") {
		return base * Math.pow(1 + nominalGrowth, year - 1);
	}
	return base;
};

export const projectScenarioTieredOverYears = (
	result: ScenarioResult,
	years: number,
	assumptions: Partial<ProjectionAssumptions> = {},
): ScenarioTieredYear[] => {
	const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
	const ge = projectScenarioWithGEFeedback(result, years, assumptions);
	const out: ScenarioTieredYear[] = [];

	for (let y = 1; y <= years; y++) {
		let staticNet = 0;
		let dynamicNet = 0;

		for (const ev of result.lines) {
			const yearEv = ev.line.overridden
				? evaluateLine(ev.line, { year: y })
				: ev;
			const dyn = evaluateLineDynamic(yearEv);

			if (ev.line.type === "borrow") {
				const borrowing = projectBorrowingPath(ev.line.magnitude, years, {
					nominalGrowth: a.nominalGrowth,
					bankRate: a.bankRate,
					inflation: a.inflation,
					yieldCurveShift: a.yieldCurveShift,
					strategyId: ev.line.borrowingStrategyId,
					portfolio: ev.line.borrowingPortfolio,
				})[y - 1]!;
				staticNet += borrowing.netFundingGbp;
				dynamicNet += borrowing.netFundingGbp;
				continue;
			}

			staticNet += scaleNonBorrowDeltaForYear(
				yearEv.deltaGbp,
				ev.line,
				y,
				a.nominalGrowth,
			);
			dynamicNet += scaleNonBorrowDeltaForYear(
				dyn.dynamicDelta,
				ev.line,
				y,
				a.nominalGrowth,
			);
		}

		out.push({
			year: y,
			staticNet,
			dynamicNet,
			macroNet: ge.noFeedback[y - 1]?.net ?? 0,
			geNet: ge.withFeedback[y - 1]?.net ?? 0,
		});
	}

	return out;
};

export function diffScenarios(
	current: readonly ScenarioLine[],
	incoming: readonly ScenarioLine[],
): ScenarioDiff {
	const currentByKey = new Map(current.map((l) => [lineKey(l), l]));
	const incomingByKey = new Map(incoming.map((l) => [lineKey(l), l]));

	const removed: ScenarioLine[] = [];
	const added: ScenarioLine[] = [];
	const modified: { from: ScenarioLine; to: ScenarioLine }[] = [];
	const unchanged: ScenarioLine[] = [];

	for (const [key, line] of currentByKey) {
		const other = incomingByKey.get(key);
		if (!other) {
			removed.push(line);
		} else if (lineChanged(line, other)) {
			modified.push({ from: line, to: other });
		} else {
			unchanged.push(line);
		}
	}
	for (const [key, line] of incomingByKey) {
		if (!currentByKey.has(key)) {
			added.push(line);
		}
	}

	return { removed, added, modified, unchanged };
}

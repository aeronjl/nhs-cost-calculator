import {
	type Comparison,
	type ResolvedComparison,
	COMPARISONS,
} from "@/data/comparisons";
import {
	type BudgetSlice,
	NHS_ENGLAND_SLICES,
	getSlice,
} from "@/data/nhs-budget";
import { getTaxLever } from "@/data/levers/tax-rates";
import { getProgramme } from "@/data/levers/uk-spending";
import { FALLBACK_USD_PER_GBP, toGBP } from "@/lib/currency";
import {
	type ScenarioLine,
	allocationToScenario,
	counterfactualToScenario,
	deserializeScenario,
} from "@/lib/scenario";

export type RawParams = {
	// Comparison calculator
	id?: string;
	q?: string;
	a?: string;
	slice?: string;
	// Trade-off engine (legacy — decoded for back-compat, not written any more)
	to_goal?: string;
	to_q?: string;
	to_amount?: string;
	to_tax?: string;
	to_prog?: string;
	to_split?: string; // "tax,borrow,cut" as percentages summing to 100
	// Counterfactual panel (legacy — back-compat decode only)
	cf_mode?: string;
	cf_prog?: string;
	cf_pct?: string;
	cf_tax?: string;
	cf_pp?: string;
	// Unified simulator state
	scenario?: string;
	editor?: string;
	g?: string; // triptych goal comparison id
	gq?: string; // triptych goal quantity multiplier
	ga?: string; // triptych custom amount (no goal id)
};

export type ResolvedState = {
	option: ResolvedComparison | Comparison | null;
	quantity: number;
	amount: number; // canonical GBP
	slice: BudgetSlice;
};

// Pass `usdPerGbp` from the server's FX fetch so USD-native comparisons are
// computed at the live rate. Defaults to FALLBACK_USD_PER_GBP when no rate is
// available (e.g. in tests).
export const resolveState = (
	params: RawParams,
	usdPerGbp: number = FALLBACK_USD_PER_GBP,
	slices: readonly BudgetSlice[] = NHS_ENGLAND_SLICES,
	comparisons: readonly (ResolvedComparison | Comparison)[] = COMPARISONS,
): ResolvedState => {
	const slice = getSlice(params.slice, slices);

	const option = params.id
		? (comparisons.find((c) => c.id === params.id) ?? null)
		: null;

	const quantity = option
		? Math.max(1, Number(params.q) || option.quantity)
		: 1;

	if (option) {
		const costGBP = toGBP(option.cost, option.nativeCurrency, usdPerGbp);
		return { option, quantity, amount: costGBP * quantity, slice };
	}

	// When no option and no explicit amount, default to the selected slice's
	// budget so the headline reads "1 year of <slice>" out of the box.
	const aNum = params.a === undefined ? Number.NaN : Number(params.a);
	const amount =
		Number.isFinite(aNum) && aNum >= 0 ? aNum : slice.value;
	return { option: null, quantity: 1, amount, slice };
};

// ---------------------------------------------------------------------------
// Trade-off engine state (URL <-> typed)
// ---------------------------------------------------------------------------

export {
	DEFAULT_CF_MODE,
	DEFAULT_CF_PCT,
	DEFAULT_CF_PP,
	DEFAULT_CF_PROG,
	DEFAULT_CF_TAX,
	DEFAULT_TO_GOAL,
	DEFAULT_TO_PROG,
	DEFAULT_TO_TAX,
	COUNTERFACTUAL_PARAMS,
	SCENARIO_PARAMS,
	TRADE_OFF_PARAMS,
	buildUrl,
} from "./url-write";

import {
	DEFAULT_TO_GOAL,
	DEFAULT_TO_PROG,
	DEFAULT_TO_TAX,
	DEFAULT_CF_MODE,
	DEFAULT_CF_PCT,
	DEFAULT_CF_PP,
	DEFAULT_CF_PROG,
	DEFAULT_CF_TAX,
} from "./url-write";

export interface ResolvedTradeOff {
	goalId: string | null; // null when custom amount
	customAmount: number | null;
	quantity: number;
	target: number; // GBP
	taxId: string;
	progId: string;
	allocation: { tax: number; borrow: number; cut: number }; // £
}

const parseSplit = (
	s: string | undefined,
	target: number,
): { tax: number; borrow: number; cut: number } | null => {
	if (!s) return null;
	const parts = s.split(",").map(Number);
	if (parts.length !== 3) return null;
	if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) return null;
	const sum = parts[0]! + parts[1]! + parts[2]!;
	if (sum < 99 || sum > 101) return null;
	return {
		tax: target * (parts[0]! / 100),
		borrow: target * (parts[1]! / 100),
		cut: target * (parts[2]! / 100),
	};
};

export const resolveTradeOffState = (
	params: RawParams,
	comparisons: readonly (ResolvedComparison | Comparison)[] = COMPARISONS,
): ResolvedTradeOff => {
	const customAmountRaw = params.to_amount ? Number(params.to_amount) : null;
	const useCustom =
		customAmountRaw !== null &&
		Number.isFinite(customAmountRaw) &&
		customAmountRaw > 0;

	const goalIdRaw = params.to_goal ?? DEFAULT_TO_GOAL;
	const goal = comparisons.find((c) => c.id === goalIdRaw);
	const goalId = useCustom ? null : (goal?.id ?? DEFAULT_TO_GOAL);

	const customAmount = useCustom ? customAmountRaw : null;

	const fallbackQ = goal?.quantity ?? 1;
	const qParsed = params.to_q ? Number(params.to_q) : NaN;
	const quantity = Number.isFinite(qParsed) && qParsed > 0 ? qParsed : fallbackQ;

	const target = useCustom
		? customAmount!
		: (goal?.cost ?? 0) * quantity;

	const taxId = params.to_tax && getTaxLever(params.to_tax).id === params.to_tax
		? params.to_tax
		: DEFAULT_TO_TAX;
	const progId =
		params.to_prog && getProgramme(params.to_prog).id === params.to_prog
			? params.to_prog
			: DEFAULT_TO_PROG;

	const allocation =
		parseSplit(params.to_split, target) ?? {
			tax: target / 3,
			borrow: target / 3,
			cut: target / 3,
		};

	return {
		goalId,
		customAmount,
		quantity,
		target,
		taxId,
		progId,
		allocation,
	};
};

// ---------------------------------------------------------------------------
// Counterfactual panel state (URL <-> typed)
// ---------------------------------------------------------------------------

export type CfMode = "programme" | "tax";

export interface ResolvedCounterfactual {
	mode: CfMode;
	progId: string;
	progPct: number; // -50..50
	taxId: string;
	taxPp: number; // -5..5
}

export const resolveCounterfactualState = (
	params: RawParams,
): ResolvedCounterfactual => {
	const mode: CfMode = params.cf_mode === "tax" ? "tax" : "programme";

	const progId =
		params.cf_prog && getProgramme(params.cf_prog).id === params.cf_prog
			? params.cf_prog
			: DEFAULT_CF_PROG;
	const pctParsed = params.cf_pct ? Number(params.cf_pct) : NaN;
	const progPct =
		Number.isFinite(pctParsed) && pctParsed >= -50 && pctParsed <= 50
			? pctParsed
			: DEFAULT_CF_PCT;

	const taxId = params.cf_tax && getTaxLever(params.cf_tax).id === params.cf_tax
		? params.cf_tax
		: DEFAULT_CF_TAX;
	const ppParsed = params.cf_pp ? Number(params.cf_pp) : NaN;
	const taxPp =
		Number.isFinite(ppParsed) && ppParsed >= -5 && ppParsed <= 5
			? ppParsed
			: DEFAULT_CF_PP;

	return { mode, progId, progPct, taxId, taxPp };
};

// URL writer helpers and namespace-param constants live in `./url-write` so
// the client bundle doesn't pull in the data files this module depends on.
// They're re-exported above for back-compat.

// ---------------------------------------------------------------------------
// Unified simulator state (URL <-> typed)
//
// `resolveSimulatorState` is the canonical decoder. It first looks for the
// unified `?scenario=&editor=…&g=…` shape; if absent, it falls back to the
// legacy namespaces (`?to_*=` / `?cf_*=`) and converts via the scenario
// converters. Always returns a non-null result with editor=stack and an empty
// scenario as the ultimate default.
// ---------------------------------------------------------------------------

import type { EditorMode } from "./url-write";

export interface ResolvedSimulator {
	scenario: ScenarioLine[];
	editor: EditorMode;
	// Triptych anchors — preserved across the legacy → unified migration so a
	// triptych share-link still reads as "funding HS2 with 33/33/34 split".
	goalId: string | null;
	goalQuantity: number;
	customAmount: number | null;
}

const VALID_EDITORS: ReadonlySet<EditorMode> = new Set([
	"triptych",
	"single",
	"stack",
]);

const parseEditor = (raw: string | undefined): EditorMode | null =>
	raw && VALID_EDITORS.has(raw as EditorMode) ? (raw as EditorMode) : null;

const hasLegacyTradeOff = (params: RawParams): boolean =>
	Boolean(
		params.to_goal ||
			params.to_q ||
			params.to_amount ||
			params.to_tax ||
			params.to_prog ||
			params.to_split,
	);

const hasLegacyCounterfactual = (params: RawParams): boolean =>
	Boolean(
		params.cf_mode ||
			params.cf_prog ||
			params.cf_pct ||
			params.cf_tax ||
			params.cf_pp,
	);

export const resolveSimulatorState = (
	params: RawParams,
	comparisons: readonly (ResolvedComparison | Comparison)[] = COMPARISONS,
): ResolvedSimulator => {
	// 1. Unified shape takes precedence.
	if (params.scenario) {
		const scenario = deserializeScenario(params.scenario);
		const editor = parseEditor(params.editor) ?? "stack";
		const goalId = params.g
			? (comparisons.find((c) => c.id === params.g)?.id ?? null)
			: null;
		const gqParsed = params.gq ? Number(params.gq) : NaN;
		const goalQuantity =
			Number.isFinite(gqParsed) && gqParsed > 0 ? gqParsed : 1;
		const gaParsed = params.ga ? Number(params.ga) : NaN;
		const customAmount =
			Number.isFinite(gaParsed) && gaParsed > 0 ? gaParsed : null;
		return { scenario, editor, goalId, goalQuantity, customAmount };
	}
	// 2. Legacy counterfactual → single-line scenario.
	if (hasLegacyCounterfactual(params)) {
		const cf = resolveCounterfactualState(params);
		const scenario =
			cf.mode === "programme"
				? counterfactualToScenario({
						type: "programme",
						id: cf.progId,
						deltaFraction: cf.progPct / 100,
					})
				: counterfactualToScenario({
						type: "tax",
						id: cf.taxId,
						deltaPp: cf.taxPp,
					});
		return {
			scenario,
			editor: "single",
			goalId: null,
			goalQuantity: 1,
			customAmount: null,
		};
	}
	// 3. Legacy trade-off → 3-line triptych.
	if (hasLegacyTradeOff(params)) {
		const to = resolveTradeOffState(params, comparisons);
		const scenario = allocationToScenario(to.allocation, to.taxId, to.progId);
		return {
			scenario,
			editor: "triptych",
			goalId: to.goalId,
			goalQuantity: to.quantity,
			customAmount: to.customAmount,
		};
	}
	// 4. Empty default.
	return {
		scenario: [],
		editor: "stack",
		goalId: null,
		goalQuantity: 1,
		customAmount: null,
	};
};

// ---------------------------------------------------------------------------
// Derivations: simulator state → editor-shaped props.
//
// During Phase 0 the three existing editors keep their separate UIs and prop
// shapes. The page passes a single ResolvedSimulator to each via these
// derivations so legacy editors can stay independent while the URL is unified.
// In Phase 1 this fan-out collapses into a single editor mounted by the
// simulator workspace.
// ---------------------------------------------------------------------------

export const tradeOffPropsFromSimulator = (
	sim: ResolvedSimulator,
	comparisons: readonly (ResolvedComparison | Comparison)[] = COMPARISONS,
): ResolvedTradeOff => {
	if (sim.editor === "triptych" && sim.scenario.length === 3) {
		const taxLine = sim.scenario.find((l) => l.type === "tax");
		const borrowLine = sim.scenario.find((l) => l.type === "borrow");
		const progLine = sim.scenario.find((l) => l.type === "programme");
		const taxId =
			taxLine?.leverId && getTaxLever(taxLine.leverId).id === taxLine.leverId
				? taxLine.leverId
				: DEFAULT_TO_TAX;
		const progId =
			progLine?.leverId &&
			getProgramme(progLine.leverId).id === progLine.leverId
				? progLine.leverId
				: DEFAULT_TO_PROG;
		const taxLever = getTaxLever(taxId);
		const programme = getProgramme(progId);
		const allocation = {
			tax: (taxLine?.magnitude ?? 0) * taxLever.gbpPerUnit,
			borrow: borrowLine?.magnitude ?? 0,
			cut:
				programme.value > 0
					? (-(progLine?.magnitude ?? 0) / 100) * programme.value
					: 0,
		};
		const goal = sim.goalId
			? comparisons.find((c) => c.id === sim.goalId)
			: null;
		const target = sim.customAmount ?? (goal?.cost ?? 0) * sim.goalQuantity;
		return {
			goalId: sim.customAmount !== null ? null : (goal?.id ?? null),
			customAmount: sim.customAmount,
			quantity: sim.goalQuantity,
			target: target || allocation.tax + allocation.borrow + allocation.cut,
			taxId,
			progId,
			allocation,
		};
	}
	// Fall through: defaults for non-triptych state.
	const goal = comparisons.find((c) => c.id === DEFAULT_TO_GOAL);
	const fallbackTarget = (goal?.cost ?? 0) * (goal?.quantity ?? 1);
	return {
		goalId: goal?.id ?? null,
		customAmount: null,
		quantity: goal?.quantity ?? 1,
		target: fallbackTarget,
		taxId: DEFAULT_TO_TAX,
		progId: DEFAULT_TO_PROG,
		allocation: {
			tax: fallbackTarget / 3,
			borrow: fallbackTarget / 3,
			cut: fallbackTarget / 3,
		},
	};
};

export const counterfactualPropsFromSimulator = (
	sim: ResolvedSimulator,
): ResolvedCounterfactual => {
	if (sim.editor === "single" && sim.scenario.length === 1) {
		const line = sim.scenario[0]!;
		if (line.type === "programme") {
			const progId =
				getProgramme(line.leverId).id === line.leverId
					? line.leverId
					: DEFAULT_CF_PROG;
			const progPct = Math.max(-50, Math.min(50, line.magnitude));
			return {
				mode: "programme",
				progId,
				progPct,
				taxId: DEFAULT_CF_TAX,
				taxPp: DEFAULT_CF_PP,
			};
		}
		if (line.type === "tax") {
			const taxId =
				getTaxLever(line.leverId).id === line.leverId
					? line.leverId
					: DEFAULT_CF_TAX;
			const taxPp = Math.max(-5, Math.min(5, line.magnitude));
			return {
				mode: "tax",
				progId: DEFAULT_CF_PROG,
				progPct: DEFAULT_CF_PCT,
				taxId,
				taxPp,
			};
		}
	}
	return {
		mode: DEFAULT_CF_MODE,
		progId: DEFAULT_CF_PROG,
		progPct: DEFAULT_CF_PCT,
		taxId: DEFAULT_CF_TAX,
		taxPp: DEFAULT_CF_PP,
	};
};

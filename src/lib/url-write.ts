// Tiny client-side helpers for URL writing. Imported by the four interactive
// surfaces (calculator, trade-off engine, counterfactual panel, scenario
// builder) on the *write* side. Deliberately has zero data imports so the
// client bundle doesn't pull in methodology prose / tax tables / spending
// programmes via this path. Heavyweight resolvers live in `url-state.ts` and
// are server-only.

export function buildUrl(
	current: URLSearchParams,
	owned: readonly string[],
	next: Record<string, string | undefined>,
): string {
	const params = new URLSearchParams(current);
	for (const p of owned) params.delete(p);
	for (const [k, v] of Object.entries(next)) {
		if (v !== undefined && v !== "") params.set(k, v);
	}
	const qs = params.toString();
	return qs ? `/?${qs}` : "/";
}

// Legacy comparison-calculator namespace. The reference route still decodes
// these, but report URLs should scrub them when canonicalising wizard state.
export const COMPARISON_PARAMS = [
	"id",
	"q",
	"a",
	"slice",
] as const;

// Legacy param names — kept exported for back-compat decoders. Writers no
// longer emit these; everything writes the unified `SIMULATOR_PARAMS` set.
export const TRADE_OFF_PARAMS = [
	"to_goal",
	"to_q",
	"to_amount",
	"to_tax",
	"to_prog",
	"to_split",
] as const;

export const COUNTERFACTUAL_PARAMS = [
	"cf_mode",
	"cf_prog",
	"cf_pct",
	"cf_tax",
	"cf_pp",
] as const;

// Unified namespace for the simulator surface. `scenario` carries the lever
// state; `editor` selects the view (triptych / single / stack); `g`/`gq`/`ga`
// preserve triptych-mode goal anchors so a triptych share round-trips intact.
export const SCENARIO_PARAMS = [
	"scenario",
	"editor",
	"g",
	"gq",
	"ga",
] as const;

// What every simulator-mode editor "owns" on the URL. When a triptych or
// counterfactual editor writes its state, it clears both the unified params
// AND any lingering legacy ones from a back-compat decode — otherwise legacy
// params would stick around as zombies after the user starts editing.
export const SIMULATOR_OWNED_PARAMS = [
	...SCENARIO_PARAMS,
	...TRADE_OFF_PARAMS,
	...COUNTERFACTUAL_PARAMS,
] as const;

export type EditorMode = "triptych" | "single" | "stack";

// Defaults that components compare against when deciding whether to write a
// param to the URL (default values are omitted to keep URLs clean).
export const DEFAULT_TO_GOAL = "hs2-mile";
export const DEFAULT_TO_TAX = "basic-rate-income-tax";
export const DEFAULT_TO_PROG = "defence";

export const DEFAULT_CF_MODE = "programme" as const;
export const DEFAULT_CF_PROG = "nhs-england";
export const DEFAULT_CF_PCT = -5;
export const DEFAULT_CF_TAX = "basic-rate-income-tax";
export const DEFAULT_CF_PP = 1;

export const DEFAULT_EDITOR: EditorMode = "stack";

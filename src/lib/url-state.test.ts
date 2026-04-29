import { describe, expect, it } from "vitest";
import { COMPARISONS } from "@/data/comparisons";
import { NHS_ENGLAND_TOTAL, getSlice } from "@/data/nhs-budget";
import { evaluateScenario } from "./scenario";
import {
	counterfactualPropsFromSimulator,
	resolveSimulatorState,
	resolveState,
	tradeOffPropsFromSimulator,
} from "./url-state";

const RATE = 1.27;

describe("resolveState", () => {
	it("defaults amount to the total NHS England budget when no params are given", () => {
		const r = resolveState({});
		expect(r.option).toBeNull();
		expect(r.quantity).toBe(1);
		expect(r.amount).toBe(NHS_ENGLAND_TOTAL.value);
		expect(r.slice).toBe(NHS_ENGLAND_TOTAL);
	});

	it("ignores unknown ids and falls through to slice default", () => {
		const r = resolveState({ id: "not-a-real-comparison" });
		expect(r.option).toBeNull();
		expect(r.amount).toBe(NHS_ENGLAND_TOTAL.value);
	});

	it("resolves a known id with its default quantity", () => {
		const r = resolveState({ id: "hs2-mile" });
		const hs2 = COMPARISONS.find((c) => c.id === "hs2-mile");
		expect(r.option?.id).toBe("hs2-mile");
		expect(r.quantity).toBe(hs2?.quantity);
		expect(r.amount).toBe((hs2?.cost ?? 0) * (hs2?.quantity ?? 0));
	});

	it("respects an explicit quantity", () => {
		const r = resolveState({ id: "hs2-mile", q: "5" });
		expect(r.quantity).toBe(5);
	});

	it("clamps quantity to a minimum of 1", () => {
		const r = resolveState({ id: "hs2-mile", q: "0" });
		expect(r.quantity).toBeGreaterThan(0);
	});

	it("converts USD-native costs at the supplied FX rate", () => {
		const r = resolveState({ id: "spacex-starship-launch", q: "1" }, RATE);
		const starship = COMPARISONS.find(
			(c) => c.id === "spacex-starship-launch",
		);
		expect(starship?.nativeCurrency).toBe("USD");
		expect(r.amount).toBeCloseTo((starship?.cost ?? 0) / RATE, 2);
	});

	it("uses ?a= as a custom GBP amount when no id is set", () => {
		const r = resolveState({ a: "500000000" });
		expect(r.option).toBeNull();
		expect(r.amount).toBe(500_000_000);
	});

	it("rejects negative ?a= values, falling back to the slice value", () => {
		const r = resolveState({ a: "-100" });
		expect(r.amount).toBe(NHS_ENGLAND_TOTAL.value);
	});

	it("rejects non-numeric ?a= values", () => {
		const r = resolveState({ a: "abc" });
		expect(r.amount).toBe(NHS_ENGLAND_TOTAL.value);
	});

	it("prefers id over a when both are set", () => {
		const r = resolveState({ id: "hs2-mile", a: "999" });
		expect(r.option?.id).toBe("hs2-mile");
	});

	it("reads ?slice= and reflects it in the resolved slice", () => {
		const r = resolveState({ slice: "mental-health" });
		expect(r.slice.id).toBe("mental-health");
	});

	it("auto-fills amount from the selected slice when no a/id is given", () => {
		const r = resolveState({ slice: "mental-health" });
		const mh = getSlice("mental-health");
		expect(r.amount).toBe(mh.value);
	});

	it("an unknown slice falls back to the total slice", () => {
		const r = resolveState({ slice: "not-a-slice" });
		expect(r.slice).toBe(NHS_ENGLAND_TOTAL);
	});

	it("a custom amount overrides the slice's default value", () => {
		const r = resolveState({ slice: "mental-health", a: "100" });
		expect(r.amount).toBe(100);
		expect(r.slice.id).toBe("mental-health");
	});
});

describe("resolveSimulatorState", () => {
	describe("empty / default", () => {
		it("returns an empty stack scenario when no params are present", () => {
			const r = resolveSimulatorState({});
			expect(r.scenario).toEqual([]);
			expect(r.editor).toBe("stack");
			expect(r.goalId).toBeNull();
			expect(r.customAmount).toBeNull();
		});
	});

	describe("unified scenario shape", () => {
		it("decodes a stack scenario from ?scenario=", () => {
			const r = resolveSimulatorState({
				scenario: "p:defence:-10,t:basic-rate-income-tax:1",
			});
			expect(r.scenario).toHaveLength(2);
			expect(r.editor).toBe("stack");
		});

		it("respects ?editor= override", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				editor: "single",
			});
			expect(r.editor).toBe("single");
		});

		it("rejects unknown editor values", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				editor: "garbage",
			});
			expect(r.editor).toBe("stack");
		});

		it("preserves triptych goal anchor (?g= and ?gq=)", () => {
			const r = resolveSimulatorState({
				scenario:
					"t:basic-rate-income-tax:1,b:1000000000,p:defence:-1.85",
				editor: "triptych",
				g: "hs2-mile",
				gq: "2",
			});
			expect(r.goalId).toBe("hs2-mile");
			expect(r.goalQuantity).toBe(2);
		});

		it("preserves triptych custom amount (?ga=)", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				editor: "triptych",
				ga: "5000000000",
			});
			expect(r.customAmount).toBe(5_000_000_000);
		});

		it("rejects unknown goal ids", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				g: "not-a-real-comparison",
			});
			expect(r.goalId).toBeNull();
		});
	});

	describe("legacy back-compat: trade-off (?to_*=)", () => {
		it("converts a goal-based trade-off into a 3-line triptych scenario", () => {
			const r = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_split: "33,33,34",
			});
			expect(r.editor).toBe("triptych");
			expect(r.scenario).toHaveLength(3);
			expect(r.goalId).toBe("hs2-mile");
		});

		it("preserves goal quantity in the migration", () => {
			const r = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_q: "2",
			});
			expect(r.goalQuantity).toBe(2);
		});

		it("preserves custom amount when no goal is set", () => {
			const r = resolveSimulatorState({
				to_amount: "10000000000",
				to_split: "50,30,20",
			});
			expect(r.customAmount).toBe(10_000_000_000);
			expect(r.goalId).toBeNull();
		});

		it("legacy → unified migration preserves £ totals via evaluateScenario", () => {
			// 30bn target split 33/33/34 = ~£10bn each
			const r = resolveSimulatorState({
				to_amount: "30000000000",
				to_split: "33,33,34",
				to_tax: "basic-rate-income-tax",
				to_prog: "defence",
			});
			const result = evaluateScenario(r.scenario);
			// Three lines each freeing ~£10bn → ~£30bn total freed.
			expect(result.net).toBeGreaterThan(29_000_000_000);
			expect(result.net).toBeLessThan(31_000_000_000);
		});

		it("uses default tax/prog ids when to_* params are missing", () => {
			const r = resolveSimulatorState({ to_goal: "hs2-mile" });
			expect(r.scenario[0]?.leverId).toBe("basic-rate-income-tax");
			expect(r.scenario[2]?.leverId).toBe("defence");
		});

		it("an explicit lever id is respected", () => {
			const r = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_tax: "vat-standard",
				to_prog: "international-aid",
			});
			expect(r.scenario[0]?.leverId).toBe("vat-standard");
			expect(r.scenario[2]?.leverId).toBe("international-aid");
		});

		it("rejects malformed to_split", () => {
			// Falls back to even split silently
			const r = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_split: "garbage",
			});
			expect(r.scenario).toHaveLength(3);
		});
	});

	describe("legacy back-compat: counterfactual (?cf_*=)", () => {
		it("converts a programme counterfactual into a 1-line scenario", () => {
			const r = resolveSimulatorState({
				cf_mode: "programme",
				cf_prog: "defence",
				cf_pct: "-10",
			});
			expect(r.editor).toBe("single");
			expect(r.scenario).toHaveLength(1);
			expect(r.scenario[0]?.type).toBe("programme");
			expect(r.scenario[0]?.leverId).toBe("defence");
			expect(r.scenario[0]?.magnitude).toBeCloseTo(-10, 5);
		});

		it("converts a tax counterfactual into a 1-line scenario", () => {
			const r = resolveSimulatorState({
				cf_mode: "tax",
				cf_tax: "basic-rate-income-tax",
				cf_pp: "2",
			});
			expect(r.editor).toBe("single");
			expect(r.scenario).toHaveLength(1);
			expect(r.scenario[0]?.type).toBe("tax");
			expect(r.scenario[0]?.magnitude).toBe(2);
		});

		it("legacy → unified migration preserves the counterfactual £ delta", () => {
			const r = resolveSimulatorState({
				cf_mode: "tax",
				cf_tax: "basic-rate-income-tax",
				cf_pp: "1",
			});
			const result = evaluateScenario(r.scenario);
			expect(result.freed).toBe(6_000_000_000);
		});

		it("uses defaults when cf_* values are absent", () => {
			const r = resolveSimulatorState({ cf_mode: "programme" });
			expect(r.scenario[0]?.leverId).toBe("nhs-england");
			expect(r.scenario[0]?.magnitude).toBe(-5);
		});

		it("rejects out-of-range cf_pct (clamps to default)", () => {
			const r = resolveSimulatorState({
				cf_mode: "programme",
				cf_prog: "defence",
				cf_pct: "999",
			});
			expect(r.scenario[0]?.magnitude).toBe(-5); // default
		});
	});

	describe("priority: unified > legacy", () => {
		it("?scenario= wins over ?to_*= when both are present", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				to_goal: "hs2-mile",
			});
			expect(r.scenario).toHaveLength(1);
			expect(r.editor).toBe("stack");
		});

		it("?scenario= wins over ?cf_*= when both are present", () => {
			const r = resolveSimulatorState({
				scenario: "t:basic-rate-income-tax:1",
				cf_mode: "tax",
				cf_pp: "5",
			});
			expect(r.scenario[0]?.magnitude).toBe(1); // from scenario, not cf_pp
		});
	});

	describe("round-trip: legacy URL → unified state → derived props", () => {
		it("trade-off legacy URL recovers original goal + tax/prog ids", () => {
			const sim = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_split: "33,33,34",
				to_tax: "vat-standard",
				to_prog: "international-aid",
			});
			const props = tradeOffPropsFromSimulator(sim);
			expect(props.goalId).toBe("hs2-mile");
			expect(props.taxId).toBe("vat-standard");
			expect(props.progId).toBe("international-aid");
			// Allocation should sum approximately to the target.
			const allocSum =
				props.allocation.tax +
				props.allocation.borrow +
				props.allocation.cut;
			expect(allocSum).toBeGreaterThan(0);
		});

		it("counterfactual legacy URL recovers original mode + lever", () => {
			const sim = resolveSimulatorState({
				cf_mode: "tax",
				cf_tax: "higher-rate-income-tax",
				cf_pp: "2",
			});
			const props = counterfactualPropsFromSimulator(sim);
			expect(props.mode).toBe("tax");
			expect(props.taxId).toBe("higher-rate-income-tax");
			expect(props.taxPp).toBe(2);
		});

		it("triptych share-link with goal anchor preserves £ allocation", () => {
			// First decode legacy URL.
			const legacy = resolveSimulatorState({
				to_goal: "hs2-mile",
				to_split: "50,30,20",
			});
			const legacyProps = tradeOffPropsFromSimulator(legacy);
			// Now write a unified URL and decode again — should match.
			const unified = resolveSimulatorState({
				scenario: legacy.scenario.map((l) =>
					l.type === "borrow"
						? `b:${l.magnitude}`
						: `${l.type === "tax" ? "t" : "p"}:${l.leverId}:${l.magnitude}`,
				).join(","),
				editor: "triptych",
				g: "hs2-mile",
			});
			const unifiedProps = tradeOffPropsFromSimulator(unified);
			expect(unifiedProps.goalId).toBe(legacyProps.goalId);
			expect(unifiedProps.taxId).toBe(legacyProps.taxId);
			expect(unifiedProps.progId).toBe(legacyProps.progId);
			expect(unifiedProps.allocation.tax).toBeCloseTo(
				legacyProps.allocation.tax,
				-3,
			);
			expect(unifiedProps.allocation.borrow).toBeCloseTo(
				legacyProps.allocation.borrow,
				-3,
			);
			expect(unifiedProps.allocation.cut).toBeCloseTo(
				legacyProps.allocation.cut,
				-3,
			);
		});
	});
});

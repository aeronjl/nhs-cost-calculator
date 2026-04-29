import { describe, expect, it } from "vitest";
import { COMPARISONS } from "./comparisons";
import { COUNTRY_HEALTH } from "./international/health-spending";
import { TAX_LEVERS } from "./levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "./levers/uk-spending";
import { BORROWING } from "./levers/borrowing";
import { NHS_ENGLAND_SLICES } from "./nhs-budget";
import { evaluateBehaviouralResponse } from "@/lib/elasticity";

// Enforces the product principle: every figure that the trade-off engine
// surfaces — every tax lever, every cut programme, every NHS slice, the
// borrowing constants — must carry a substantive methodology object.
//
// "Substantive" means: a `measure` sentence (not just a source URL), and
// either alternatives, a range, or a caveat (or all three). A bare source
// link doesn't count.

const isSubstantive = (m: {
	measure: string;
	alternatives?: unknown[];
	range?: unknown;
	caveat?: string;
}): boolean => {
	if (!m.measure || m.measure.length < 30) return false;
	const hasAlternatives = !!m.alternatives && m.alternatives.length > 0;
	const hasRange = !!m.range;
	const hasCaveat = !!m.caveat && m.caveat.length > 20;
	return hasAlternatives || hasRange || hasCaveat;
};

describe("methodology coverage", () => {
	it("every tax lever has substantive methodology", () => {
		for (const lever of TAX_LEVERS) {
			expect(
				isSubstantive(lever.methodology),
				`${lever.id} methodology is too thin`,
			).toBe(true);
		}
	});

	it("every spending programme has substantive methodology", () => {
		for (const prog of UK_SPENDING_PROGRAMMES) {
			expect(
				isSubstantive(prog.methodology),
				`${prog.id} methodology is too thin`,
			).toBe(true);
		}
	});

	it("every NHS slice has substantive methodology", () => {
		for (const slice of NHS_ENGLAND_SLICES) {
			expect(
				isSubstantive(slice.methodology),
				`${slice.id} methodology is too thin`,
			).toBe(true);
		}
	});

	it("borrowing constants have substantive methodology", () => {
		expect(isSubstantive(BORROWING.methodology)).toBe(true);
	});

	it("every comparison has substantive methodology", () => {
		for (const c of COMPARISONS) {
			expect(
				isSubstantive(c.methodology),
				`${c.id} methodology is too thin`,
			).toBe(true);
		}
	});

	it("every country in the international panel has substantive methodology", () => {
		for (const c of COUNTRY_HEALTH) {
			expect(
				isSubstantive(c.methodology),
				`${c.id} methodology is too thin`,
			).toBe(true);
		}
	});

	it("every methodology asOf is well-formed YYYY-MM", () => {
		const allMethodologies = [
			...TAX_LEVERS.map((l) => l.methodology),
			...UK_SPENDING_PROGRAMMES.map((p) => p.methodology),
			...NHS_ENGLAND_SLICES.map((s) => s.methodology),
			...COMPARISONS.map((c) => c.methodology),
			...COUNTRY_HEALTH.map((c) => c.methodology),
			BORROWING.methodology,
		];
		for (const m of allMethodologies) {
			expect(m.asOf).toMatch(/^\d{4}-\d{2}$/);
		}
	});

	it("tax behavioural models are finite and have sensible output signs", () => {
		for (const lever of TAX_LEVERS) {
			if (!lever.behaviour) continue;
			const oneUnit = evaluateBehaviouralResponse(
				lever.gbpPerUnit,
				lever.behaviour,
				1,
			);
			expect(
				Number.isFinite(oneUnit.dynamicDelta),
				`${lever.id} dynamic delta must be finite`,
			).toBe(true);
			expect(
				Number.isFinite(oneUnit.outputEffectGbp),
				`${lever.id} output effect must be finite`,
			).toBe(true);
			expect(
				Math.sign(oneUnit.dynamicDelta),
				`${lever.id} +1 unit should keep the ready-reckoner sign`,
			).toBe(Math.sign(lever.gbpPerUnit));
			if (
				lever.gbpPerUnit > 0 &&
				"outputShare" in lever.behaviour &&
				lever.behaviour.outputShare > 0
			) {
				expect(
					oneUnit.outputEffectGbp,
					`${lever.id} tax rise should not increase output`,
				).toBeLessThanOrEqual(0);
			}
		}
	});
});

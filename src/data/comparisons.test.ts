import { describe, expect, it } from "vitest";
import { COMPARISONS } from "./comparisons";
import { DYNAMIC_COST_SOURCES } from "./sources/dynamic-costs";

const STALE_THRESHOLD_MONTHS = 24;

const monthsBetween = (from: Date, to: Date): number => {
	const yearDiff = to.getUTCFullYear() - from.getUTCFullYear();
	const monthDiff = to.getUTCMonth() - from.getUTCMonth();
	return yearDiff * 12 + monthDiff;
};

const parseAsOf = (asOf: string): Date => {
	// asOf is YYYY-MM. Anchor to the 1st of the month, UTC.
	const [year, month] = asOf.split("-").map(Number);
	return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
};

describe("comparison catalog freshness", () => {
	it(`every static, non-historical entry has asOf within ${STALE_THRESHOLD_MONTHS} months`, () => {
		const now = new Date();
		const stale = COMPARISONS.filter(
			(c) => !c.dynamic && !c.historical,
		).filter(
			(c) => monthsBetween(parseAsOf(c.asOf), now) > STALE_THRESHOLD_MONTHS,
		);
		// If this fails: refresh the value + asOf, mark the entry `dynamic` with
		// a sourceId, or mark `historical: true` for one-off events.
		expect(
			stale.map((c) => `${c.id} (asOf ${c.asOf})`),
			"static entries past the freshness threshold",
		).toEqual([]);
	});

	it("every comparison has a well-formed asOf", () => {
		for (const c of COMPARISONS) {
			expect(
				c.asOf,
				`comparison ${c.id} has malformed asOf`,
			).toMatch(/^\d{4}-\d{2}$/);
		}
	});

	it("every dynamic entry references a known source id", () => {
		for (const c of COMPARISONS) {
			if (!c.dynamic) continue;
			expect(
				DYNAMIC_COST_SOURCES[c.dynamic.sourceId],
				`comparison ${c.id} references unknown source ${c.dynamic.sourceId}`,
			).toBeDefined();
		}
	});

	it("comparison ids are unique", () => {
		const ids = COMPARISONS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

import { describe, expect, it } from "vitest";
import {
	NHS_ENGLAND_SLICES,
	NHS_ENGLAND_TOTAL,
	applyBudgetOverride,
	getSlice,
} from "./nhs-budget";

describe("NHS England budget", () => {
	it("includes the total as a slice with id 'total'", () => {
		expect(NHS_ENGLAND_SLICES[0]?.id).toBe("total");
		expect(NHS_ENGLAND_SLICES[0]).toBe(NHS_ENGLAND_TOTAL);
	});

	it("non-total slice values sum to within ±2% of the total", () => {
		const breakdown = NHS_ENGLAND_SLICES.filter((s) => s.id !== "total");
		const sum = breakdown.reduce((acc, s) => acc + s.value, 0);
		const tolerance = NHS_ENGLAND_TOTAL.value * 0.02;
		expect(Math.abs(sum - NHS_ENGLAND_TOTAL.value)).toBeLessThanOrEqual(
			tolerance,
		);
	});

	it("every slice has an asOf date and a source URL", () => {
		for (const slice of NHS_ENGLAND_SLICES) {
			expect(slice.asOf).toMatch(/^\d{4}-\d{2}$/);
			expect(slice.source.url.startsWith("http")).toBe(true);
		}
	});

	it("every slice id is unique", () => {
		const ids = NHS_ENGLAND_SLICES.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("getSlice", () => {
	it("returns the total when id is undefined or unknown", () => {
		expect(getSlice(undefined)).toBe(NHS_ENGLAND_TOTAL);
		expect(getSlice("not-a-slice")).toBe(NHS_ENGLAND_TOTAL);
	});

	it("returns the matching slice for a known id", () => {
		const mh = getSlice("mental-health");
		expect(mh.id).toBe("mental-health");
		expect(mh.shortLabel).toContain("mental health");
	});

	it("looks up against a custom slices array when supplied", () => {
		const custom = [{ ...NHS_ENGLAND_TOTAL, value: 999 }];
		expect(getSlice("total", custom).value).toBe(999);
	});
});

describe("applyBudgetOverride", () => {
	it("returns the base unchanged when override is null", () => {
		const result = applyBudgetOverride(NHS_ENGLAND_SLICES, null);
		expect(result).toBe(NHS_ENGLAND_SLICES);
	});

	it("overlays total + per-slice values from the override", () => {
		const result = applyBudgetOverride(NHS_ENGLAND_SLICES, {
			totalValue: 200_000_000_000,
			sliceValues: {
				"mental-health": 20_000_000_000,
				acute: 100_000_000_000,
			},
			asOf: "2025-04",
		});
		const total = result.find((s) => s.id === "total");
		const mh = result.find((s) => s.id === "mental-health");
		const acute = result.find((s) => s.id === "acute");
		const community = result.find((s) => s.id === "community");
		expect(total?.value).toBe(200_000_000_000);
		expect(mh?.value).toBe(20_000_000_000);
		expect(acute?.value).toBe(100_000_000_000);
		// Slice not in override keeps its static fallback value.
		expect(community?.value).toBe(
			NHS_ENGLAND_SLICES.find((s) => s.id === "community")?.value,
		);
	});

	it("propagates the asOf to every slice", () => {
		const result = applyBudgetOverride(NHS_ENGLAND_SLICES, {
			totalValue: NHS_ENGLAND_TOTAL.value,
			sliceValues: {},
			asOf: "2026-04",
		});
		for (const slice of result) expect(slice.asOf).toBe("2026-04");
	});

	it("preserves immutable metadata (id, label, shortLabel)", () => {
		const result = applyBudgetOverride(NHS_ENGLAND_SLICES, {
			totalValue: 1,
			sliceValues: {},
			asOf: "2025-04",
		});
		for (let i = 0; i < NHS_ENGLAND_SLICES.length; i++) {
			expect(result[i]?.id).toBe(NHS_ENGLAND_SLICES[i]?.id);
			expect(result[i]?.label).toBe(NHS_ENGLAND_SLICES[i]?.label);
			expect(result[i]?.shortLabel).toBe(NHS_ENGLAND_SLICES[i]?.shortLabel);
		}
	});
});

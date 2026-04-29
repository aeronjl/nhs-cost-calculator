import { afterEach, describe, expect, it, vi } from "vitest";
import { usMedianSalarySource } from "./us-median-salary";

const realFetch = globalThis.fetch;

const mockFetch = (response: {
	ok?: boolean;
	json?: () => Promise<unknown>;
}) => {
	globalThis.fetch = vi.fn(async () =>
		({
			ok: response.ok ?? true,
			json: response.json ?? (async () => null),
		}) as Response,
	);
};

const blsResponse = (
	data: Array<{ year: string; period: string; periodName: string; value: string }>,
) => ({
	json: async () => ({
		status: "REQUEST_SUCCEEDED",
		Results: { series: [{ seriesID: "LEU0252881500", data }] },
	}),
});

describe("usMedianSalarySource", () => {
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it("prefers the most recent annual estimate (Q05)", async () => {
		mockFetch(
			blsResponse([
				{ year: "2026", period: "Q01", periodName: "1st Quarter", value: "1235" },
				{ year: "2025", period: "Q05", periodName: "Annual", value: "1204" },
				{ year: "2025", period: "Q03", periodName: "3rd Quarter", value: "1214" },
				{ year: "2024", period: "Q05", periodName: "Annual", value: "1159" },
			]),
		);
		const result = await usMedianSalarySource.fetch();
		expect(result?.value).toBe(1204 * 52);
		expect(result?.asOf).toBe("2025-12");
		expect(result?.source?.label).toBe("BLS (Annual 2025)");
	});

	it("falls back to most recent numeric quarterly when no annual is available", async () => {
		mockFetch(
			blsResponse([
				{ year: "2026", period: "Q01", periodName: "1st Quarter", value: "1235" },
				{ year: "2025", period: "Q04", periodName: "4th Quarter", value: "-" },
				{ year: "2025", period: "Q03", periodName: "3rd Quarter", value: "1214" },
			]),
		);
		const result = await usMedianSalarySource.fetch();
		expect(result?.value).toBe(1235 * 52);
		expect(result?.asOf).toBe("2026-03");
	});

	it("ignores BLS placeholder values like '-'", async () => {
		mockFetch(
			blsResponse([
				{ year: "2026", period: "Q05", periodName: "Annual", value: "-" },
				{ year: "2025", period: "Q05", periodName: "Annual", value: "1204" },
			]),
		);
		const result = await usMedianSalarySource.fetch();
		expect(result?.value).toBe(1204 * 52);
		expect(result?.asOf).toBe("2025-12");
	});

	it("returns null when the response shape is unexpected", async () => {
		mockFetch({ json: async () => ({ status: "REQUEST_NOT_PROCESSED" }) });
		expect(await usMedianSalarySource.fetch()).toBeNull();
	});

	it("returns null on a non-OK response", async () => {
		mockFetch({ ok: false });
		expect(await usMedianSalarySource.fetch()).toBeNull();
	});

	it("returns null when fetch throws", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("network");
		});
		expect(await usMedianSalarySource.fetch()).toBeNull();
	});
});

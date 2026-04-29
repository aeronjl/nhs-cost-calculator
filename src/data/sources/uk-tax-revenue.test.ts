import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ukTaxRevenueSource } from "./uk-tax-revenue";

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

describe("ukTaxRevenueSource", () => {
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it("picks the most recent non-null observation", async () => {
		mockFetch({
			json: async () => [
				{ page: 1, total: 3 },
				[
					{ date: "2025", value: null },
					{ date: "2024", value: 777_481_000_000 },
					{ date: "2023", value: 739_608_000_000 },
				],
			],
		});
		const result = await ukTaxRevenueSource.fetch();
		expect(result?.value).toBe(777_481_000_000);
		expect(result?.asOf).toBe("2024-12");
		expect(result?.source?.label).toBe("World Bank (CY 2024)");
	});

	it("returns null when no observation has a non-null value", async () => {
		mockFetch({
			json: async () => [
				{ page: 1, total: 2 },
				[
					{ date: "2025", value: null },
					{ date: "2024", value: null },
				],
			],
		});
		const result = await ukTaxRevenueSource.fetch();
		expect(result).toBeNull();
	});

	it("returns null when the response is not the expected shape", async () => {
		mockFetch({ json: async () => ({ unexpected: "shape" }) });
		const result = await ukTaxRevenueSource.fetch();
		expect(result).toBeNull();
	});

	it("returns null when the response is not ok", async () => {
		mockFetch({ ok: false });
		const result = await ukTaxRevenueSource.fetch();
		expect(result).toBeNull();
	});

	it("returns null when fetch throws", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("network down");
		});
		const result = await ukTaxRevenueSource.fetch();
		expect(result).toBeNull();
	});

	it("ignores observations with zero or negative values", async () => {
		mockFetch({
			json: async () => [
				{ page: 1, total: 3 },
				[
					{ date: "2024", value: 0 },
					{ date: "2023", value: -1 },
					{ date: "2022", value: 685_335_000_000 },
				],
			],
		});
		const result = await ukTaxRevenueSource.fetch();
		expect(result?.value).toBe(685_335_000_000);
		expect(result?.asOf).toBe("2022-12");
	});
});

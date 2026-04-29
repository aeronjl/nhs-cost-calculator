import { afterEach, describe, expect, it, vi } from "vitest";
import { aiTrainingCostSource } from "./ai-training-cost";

const realFetch = globalThis.fetch;

const mockFetch = (response: {
	ok?: boolean;
	text?: () => Promise<string>;
}) => {
	globalThis.fetch = vi.fn(async () =>
		({
			ok: response.ok ?? true,
			text: response.text ?? (async () => ""),
		}) as Response,
	);
};

const csv = (rows: string[][]) =>
	rows
		.map((row) =>
			row
				.map((cell) =>
					/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
				)
				.join(","),
		)
		.join("\n");

const HEADER = [
	"Model",
	"Publication date",
	"Frontier model",
	"Training compute cost (2023 USD)",
];

describe("aiTrainingCostSource", () => {
	afterEach(() => {
		globalThis.fetch = realFetch;
		vi.restoreAllMocks();
	});

	it("picks the most recent frontier model with a numeric cost", async () => {
		mockFetch({
			text: async () =>
				csv([
					HEADER,
					["GPT-4", "2023-03-14", "true", "78000000"],
					["LegacyModel", "2018-01-01", "true", "1000000"],
					["NewerNonFrontier", "2024-06-01", "false", "5000000"],
					["ClaudeNext", "2024-11-01", "true", "150000000"],
				]),
		});
		const result = await aiTrainingCostSource.fetch();
		expect(result?.value).toBe(150_000_000);
		expect(result?.asOf).toBe("2024-11");
		expect(result?.source?.label).toContain("ClaudeNext");
	});

	it("ignores frontier rows without a numeric cost", async () => {
		mockFetch({
			text: async () =>
				csv([
					HEADER,
					["NewModel", "2025-01-01", "true", ""],
					["OlderModel", "2024-01-01", "true", "50000000"],
				]),
		});
		const result = await aiTrainingCostSource.fetch();
		expect(result?.value).toBe(50_000_000);
	});

	it("ignores non-frontier rows even if they're more recent", async () => {
		mockFetch({
			text: async () =>
				csv([
					HEADER,
					["FrontierA", "2023-01-01", "true", "10000000"],
					["NonFrontierB", "2025-12-01", "false", "999999999"],
				]),
		});
		const result = await aiTrainingCostSource.fetch();
		expect(result?.value).toBe(10_000_000);
	});

	it("handles quoted fields containing commas", async () => {
		mockFetch({
			text: async () =>
				[
					HEADER.join(","),
					'"Model, with comma","2024-05-01","true","42000000"',
				].join("\n"),
		});
		const result = await aiTrainingCostSource.fetch();
		expect(result?.value).toBe(42_000_000);
		expect(result?.source?.label).toContain("Model, with comma");
	});

	it("returns null when the CSV has no frontier rows with cost", async () => {
		mockFetch({
			text: async () => csv([HEADER, ["Model", "2024-01-01", "false", "100"]]),
		});
		expect(await aiTrainingCostSource.fetch()).toBeNull();
	});

	it("returns null when required headers are missing", async () => {
		mockFetch({
			text: async () => csv([["Model"], ["GPT-4"]]),
		});
		expect(await aiTrainingCostSource.fetch()).toBeNull();
	});

	it("returns null on non-OK response and on fetch throw", async () => {
		mockFetch({ ok: false });
		expect(await aiTrainingCostSource.fetch()).toBeNull();
		globalThis.fetch = vi.fn(async () => {
			throw new Error("net");
		});
		expect(await aiTrainingCostSource.fetch()).toBeNull();
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deleteSavedScenario,
	listSavedScenarios,
	saveScenario,
} from "./saved-scenarios";

class MemStorage implements Storage {
	private store = new Map<string, string>();
	get length() {
		return this.store.size;
	}
	clear() {
		this.store.clear();
	}
	getItem(k: string) {
		return this.store.has(k) ? this.store.get(k)! : null;
	}
	key(i: number) {
		return Array.from(this.store.keys())[i] ?? null;
	}
	removeItem(k: string) {
		this.store.delete(k);
	}
	setItem(k: string, v: string) {
		this.store.set(k, v);
	}
}

describe("savedScenarios", () => {
	let realLocalStorage: Storage | undefined;

	beforeEach(() => {
		realLocalStorage = globalThis.localStorage;
		const w = globalThis as unknown as { window?: { localStorage: Storage } };
		w.window = w.window ?? ({ localStorage: new MemStorage() } as never);
		w.window.localStorage = new MemStorage();
	});

	afterEach(() => {
		if (realLocalStorage) {
			const w = globalThis as unknown as {
				window?: { localStorage: Storage };
			};
			if (w.window) w.window.localStorage = realLocalStorage;
		}
		vi.restoreAllMocks();
	});

	it("lists saved scenarios in chronological (newest-first) order", () => {
		saveScenario("First", "p:defence:-5");
		saveScenario("Second", "t:basic-rate-income-tax:1");
		const list = listSavedScenarios();
		expect(list.map((s) => s.name)).toEqual(["Second", "First"]);
	});

	it("delete removes the matching scenario", () => {
		const a = saveScenario("Keep", "p:defence:-5");
		const b = saveScenario("Drop", "t:basic-rate-income-tax:1");
		deleteSavedScenario(b.id);
		const list = listSavedScenarios();
		expect(list).toHaveLength(1);
		expect(list[0]?.id).toBe(a.id);
	});

	it("trims name and falls back to a default", () => {
		const e = saveScenario("   ", "p:defence:-5");
		expect(e.name).toBe("Untitled scenario");
	});

	it("survives malformed localStorage data", () => {
		window.localStorage.setItem("nhs-calc-scenarios-v1", "not-json");
		expect(listSavedScenarios()).toEqual([]);
	});

	it("limits to 20 entries (oldest dropped)", () => {
		for (let i = 0; i < 25; i++) saveScenario(`s${i}`, `b:${i}`);
		expect(listSavedScenarios()).toHaveLength(20);
	});
});

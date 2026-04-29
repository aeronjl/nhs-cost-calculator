// localStorage-backed list of user-saved scenarios. Each entry stores the
// serialized scenario string + a name + a timestamp. The component layer
// provides the UI; this module owns the read/write.

const STORAGE_KEY = "nhs-calc-scenarios-v1";
const MAX_SCENARIOS = 20;

export interface SavedScenario {
	id: string;
	name: string;
	scenario: string; // serialized via serializeScenario
	savedAt: string; // ISO timestamp
}

const isSavedScenario = (v: unknown): v is SavedScenario => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.id === "string" &&
		typeof o.name === "string" &&
		typeof o.scenario === "string" &&
		typeof o.savedAt === "string"
	);
};

const isStorageAvailable = (): boolean => {
	if (typeof window === "undefined") return false;
	try {
		const k = "__nhs_calc_test__";
		window.localStorage.setItem(k, "1");
		window.localStorage.removeItem(k);
		return true;
	} catch {
		return false;
	}
};

export function listSavedScenarios(): SavedScenario[] {
	if (!isStorageAvailable()) return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isSavedScenario).slice(0, MAX_SCENARIOS);
	} catch {
		return [];
	}
}

export function saveScenario(name: string, scenario: string): SavedScenario {
	const entry: SavedScenario = {
		id: `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		name: name.trim() || "Untitled scenario",
		scenario,
		savedAt: new Date().toISOString(),
	};
	if (!isStorageAvailable()) return entry;
	const existing = listSavedScenarios();
	const next = [entry, ...existing].slice(0, MAX_SCENARIOS);
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	return entry;
}

export function deleteSavedScenario(id: string): void {
	if (!isStorageAvailable()) return;
	const next = listSavedScenarios().filter((s) => s.id !== id);
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

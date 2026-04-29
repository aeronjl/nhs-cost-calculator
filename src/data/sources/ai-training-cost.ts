import { unstable_cache } from "next/cache";
import type { Source } from "./types";
import type { DynamicCost } from "./dynamic-costs";

// Epoch AI's "Notable AI Models" CSV — the canonical public dataset of
// frontier model training costs. We find the most recent row tagged as a
// Frontier model with a numeric cost in the `Training compute cost (2023 USD)`
// column.
//
// Caveats:
//  - The cost column is normalised to 2023 USD; we don't re-inflate to today.
//    The error from inflation over 1-3 years is negligible compared to the
//    underlying ±0.5–1 OOM uncertainty in any individual training cost
//    estimate.
//  - The CSV is ~3MB, exceeding Next's 2MB fetch-cache limit, so we cache the
//    *parsed result* (tiny) via `unstable_cache` instead of the raw response.
const URL = "https://epoch.ai/data/notable_ai_models.csv";

// Minimal CSV parser. Handles quoted fields with embedded commas and escaped
// quotes (RFC 4180 subset). Doesn't try to handle multi-line quoted fields —
// Epoch's CSV uses a single line per record after the header row.
const parseRow = (line: string): string[] => {
	const fields: string[] = [];
	let current = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (c === "," && !inQuotes) {
			fields.push(current);
			current = "";
		} else {
			current += c;
		}
	}
	fields.push(current);
	return fields;
};

const COL_DATE = "Publication date";
const COL_COST = "Training compute cost (2023 USD)";
const COL_FRONTIER = "Frontier model";
const COL_MODEL = "Model";

const fetchAndParse = async (): Promise<DynamicCost | null> => {
	try {
		const response = await fetch(URL, { cache: "no-store" });
		if (!response.ok) return null;
		const text = await response.text();
		const lines = text.split(/\r?\n/);
		if (lines.length < 2) return null;

		const headers = parseRow(lines[0] ?? "");
		const dateIdx = headers.indexOf(COL_DATE);
		const costIdx = headers.indexOf(COL_COST);
		const frontierIdx = headers.indexOf(COL_FRONTIER);
		const modelIdx = headers.indexOf(COL_MODEL);
		if (dateIdx < 0 || costIdx < 0 || frontierIdx < 0) return null;

		let bestDate = "";
		let bestCost = 0;
		let bestModel = "";
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const row = parseRow(line);
			const frontier = (row[frontierIdx] ?? "").trim().toLowerCase();
			if (frontier !== "true") continue;
			const cost = Number(row[costIdx]);
			if (!Number.isFinite(cost) || cost <= 0) continue;
			const date = (row[dateIdx] ?? "").trim();
			if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
			if (date > bestDate) {
				bestDate = date;
				bestCost = cost;
				bestModel = (row[modelIdx] ?? "").trim();
			}
		}

		if (!bestDate) return null;
		return {
			value: bestCost,
			asOf: bestDate.slice(0, 7),
			source: {
				url: "https://epoch.ai/data/ai-models",
				label: bestModel
					? `Epoch AI (${bestModel}, 2023 USD)`
					: `Epoch AI (${bestDate.slice(0, 7)}, 2023 USD)`,
			},
		};
	} catch {
		return null;
	}
};

// `unstable_cache` memoises across requests in production but interferes with
// per-test `fetch` mocks; bypass it when running tests.
const cachedFetchAndParse =
	process.env.NODE_ENV === "test"
		? fetchAndParse
		: unstable_cache(fetchAndParse, ["epoch-ai-training-cost-v1"], {
				revalidate: 86_400,
			});

export const aiTrainingCostSource: Source<DynamicCost | null> = {
	fallback: null,
	fetch: () => cachedFetchAndParse(),
};

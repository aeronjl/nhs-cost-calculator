import type { Source } from "./types";
import type { DynamicCost } from "./dynamic-costs";

// BLS series LEU0252881500 — "Median usual weekly earnings, employed full time,
// wage and salary workers." Quarterly data plus an annual (Q05) summary. We
// prefer the most recent annual estimate, falling back to the most recent
// quarter if no annual is available, and convert weekly → yearly via × 52.
//
// BLS public API v1 is unauthenticated with a documented rate limit (25
// queries/day per IP). For higher volume, register for a key and switch to
// v2 with `Content-Type: application/json` POST. Cached 24h here so that the
// 25/day limit isn't a real concern for a single deployment.
const URL =
	"https://api.bls.gov/publicAPI/v1/timeseries/data/LEU0252881500";
const WEEKS_PER_YEAR = 52;

interface RawObservation {
	year: string;
	period: string; // "Q01"–"Q05" (Q05 = annual)
	periodName: string;
	value: string; // BLS sometimes returns "-" for unavailable
}

const isObservation = (v: unknown): v is RawObservation => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.year === "string" &&
		typeof o.period === "string" &&
		typeof o.periodName === "string" &&
		typeof o.value === "string"
	);
};

const periodToMonth = (period: string): string => {
	switch (period) {
		case "Q01":
			return "03";
		case "Q02":
			return "06";
		case "Q03":
			return "09";
		case "Q04":
		case "Q05":
		default:
			return "12";
	}
};

export const usMedianSalarySource: Source<DynamicCost | null> = {
	fallback: null,
	fetch: async () => {
		try {
			const response = await fetch(URL, { next: { revalidate: 86_400 } });
			if (!response.ok) return null;
			const data = (await response.json()) as Record<string, unknown>;
			const series = (
				data?.Results as { series?: { data?: unknown[] }[] } | undefined
			)?.series?.[0]?.data;
			if (!Array.isArray(series)) return null;

			const numeric = series
				.filter(isObservation)
				.map((o) => ({ ...o, num: Number(o.value) }))
				.filter(
					(o): o is RawObservation & { num: number } =>
						Number.isFinite(o.num) && o.num > 0,
				);

			// Sort: annual entries first (period === "Q05"), then by year desc, then
			// by period desc. Picks the freshest meaningful value.
			const sorted = numeric.sort((a, b) => {
				if (a.period === "Q05" && b.period !== "Q05") return -1;
				if (a.period !== "Q05" && b.period === "Q05") return 1;
				const yearDiff = Number(b.year) - Number(a.year);
				if (yearDiff !== 0) return yearDiff;
				return b.period.localeCompare(a.period);
			});
			const latest = sorted[0];
			if (!latest) return null;

			return {
				value: latest.num * WEEKS_PER_YEAR,
				asOf: `${latest.year}-${periodToMonth(latest.period)}`,
				source: {
					url: "https://beta.bls.gov/dataViewer/view/timeseries/LEU0252881500",
					label: `BLS (${latest.periodName} ${latest.year})`,
				},
			};
		} catch {
			return null;
		}
	},
};

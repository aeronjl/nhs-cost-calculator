import type { Source } from "./types";
import type { DynamicCost } from "./dynamic-costs";

// World Bank indicator GC.TAX.TOTL.CN — "Tax revenue (current LCU)" for the UK.
// Updated annually by the World Bank from IMF Government Finance Statistics.
//
// Note: this is *narrower* than HMRC's "tax + NICs receipts" — the World Bank
// classifies social contributions separately. So the value here will be lower
// than what you'd get from HMRC. The override's `source.label` makes the
// origin visible in the UI; users who care about the distinction can follow
// the link to the World Bank page.
const URL =
	"https://api.worldbank.org/v2/country/GBR/indicator/GC.TAX.TOTL.CN?format=json&per_page=10&date=2018:2030";

interface Observation {
	date: string;
	value: number | null;
}

const isObservation = (v: unknown): v is Observation => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.date === "string" &&
		(typeof o.value === "number" || o.value === null)
	);
};

export const ukTaxRevenueSource: Source<DynamicCost | null> = {
	fallback: null,
	fetch: async () => {
		try {
			const response = await fetch(URL, { next: { revalidate: 86_400 } });
			if (!response.ok) return null;
			const data = await response.json();
			// Shape: [meta, observations[]]
			if (!Array.isArray(data) || data.length < 2) return null;
			const observations = data[1];
			if (!Array.isArray(observations)) return null;
			const valid = observations
				.filter(isObservation)
				.filter((o): o is Observation & { value: number } => o.value !== null && o.value > 0)
				.sort((a, b) => Number(b.date) - Number(a.date));
			const latest = valid[0];
			if (!latest) return null;
			return {
				value: latest.value,
				asOf: `${latest.date}-12`,
				source: {
					url: "https://data.worldbank.org/indicator/GC.TAX.TOTL.CN?locations=GB",
					label: `World Bank (CY ${latest.date})`,
				},
			};
		} catch {
			return null;
		}
	},
};

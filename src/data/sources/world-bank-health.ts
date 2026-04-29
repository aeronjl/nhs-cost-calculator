import type { Source } from "./types";

// World Bank API for health-spending and outcome indicators across the
// countries in our international comparison panel. Three indicators batch in
// a single multi-country call:
//
//   SH.XPD.CHEX.GD.ZS  Current health expenditure (% of GDP)
//   SH.XPD.CHEX.PP.CD  Current health expenditure per capita (PPP, current $)
//   SP.DYN.LE00.IN     Life expectancy at birth (years)
//
// Treatable mortality isn't republished by World Bank — that's an OECD
// Health at a Glance indicator specifically. Stays static for now; would be
// the natural follow-up if/when an OECD direct integration is added.

const COUNTRY_CODES = ["GBR", "USA", "DEU", "FRA", "NLD", "CAN", "AUS", "JPN"];
const COUNTRIES_PARAM = COUNTRY_CODES.join(";");

const INDICATORS = {
	spendPctGdp: "SH.XPD.CHEX.GD.ZS",
	spendPerCapitaPpp: "SH.XPD.CHEX.PP.CD",
	lifeExpectancy: "SP.DYN.LE00.IN",
} as const;

export interface CountryHealthOverride {
	spendPctGdp?: number;
	spendPerCapitaPpp?: number;
	lifeExpectancy?: number;
	asOf: string; // YYYY-MM (latest year seen across all indicators)
}

export interface CountryHealthOverrideMap {
	overrides: Record<string, CountryHealthOverride>; // keyed by ISO 2-letter (GB, US, …)
	asOf: string; // overall latest year
	source: { url: string; label: string };
}

interface WorldBankObservation {
	countryiso3code: string;
	date: string;
	value: number | null;
}

const isObservation = (v: unknown): v is WorldBankObservation => {
	if (typeof v !== "object" || v === null) return false;
	const o = v as Record<string, unknown>;
	return (
		typeof o.countryiso3code === "string" &&
		typeof o.date === "string" &&
		(typeof o.value === "number" || o.value === null)
	);
};

// ISO 3-letter (World Bank) → ISO 2-letter (our country IDs).
const ISO3_TO_ISO2: Record<string, string> = {
	GBR: "GB",
	USA: "US",
	DEU: "DE",
	FRA: "FR",
	NLD: "NL",
	CAN: "CA",
	AUS: "AU",
	JPN: "JP",
};

async function fetchIndicator(
	indicator: string,
): Promise<Map<string, { value: number; year: string }>> {
	const url = `https://api.worldbank.org/v2/country/${COUNTRIES_PARAM}/indicator/${indicator}?format=json&date=2018:2030&per_page=200`;
	const response = await fetch(url, { next: { revalidate: 86_400 } });
	if (!response.ok) throw new Error(`WB ${indicator} ${response.status}`);
	const data = await response.json();
	if (!Array.isArray(data) || data.length < 2) return new Map();
	const observations = data[1];
	if (!Array.isArray(observations)) return new Map();

	// For each country, pick the most recent non-null observation.
	const latest = new Map<string, { value: number; year: string }>();
	for (const o of observations.filter(isObservation)) {
		if (o.value === null || o.value <= 0) continue;
		const iso2 = ISO3_TO_ISO2[o.countryiso3code];
		if (!iso2) continue;
		const existing = latest.get(iso2);
		if (!existing || o.date > existing.year) {
			latest.set(iso2, { value: o.value, year: o.date });
		}
	}
	return latest;
}

export const worldBankHealthSource: Source<CountryHealthOverrideMap | null> = {
	fallback: null,
	fetch: async () => {
		try {
			const [pctGdp, perCapita, lifeExp] = await Promise.all([
				fetchIndicator(INDICATORS.spendPctGdp),
				fetchIndicator(INDICATORS.spendPerCapitaPpp),
				fetchIndicator(INDICATORS.lifeExpectancy),
			]);

			const overrides: Record<string, CountryHealthOverride> = {};
			let latestYear = "";

			for (const iso2 of Object.values(ISO3_TO_ISO2)) {
				const a = pctGdp.get(iso2);
				const b = perCapita.get(iso2);
				const c = lifeExp.get(iso2);
				const years = [a?.year, b?.year, c?.year].filter(
					(y): y is string => typeof y === "string",
				);
				if (years.length === 0) continue;
				const yearForCountry = years.sort().reverse()[0]!;
				if (yearForCountry > latestYear) latestYear = yearForCountry;
				overrides[iso2] = {
					spendPctGdp: a ? a.value / 100 : undefined, // WB returns % as 11.0; our type expects 0.11
					spendPerCapitaPpp: b?.value,
					lifeExpectancy: c?.value,
					asOf: `${yearForCountry}-12`,
				};
			}

			if (Object.keys(overrides).length === 0) return null;

			return {
				overrides,
				asOf: latestYear ? `${latestYear}-12` : "2022-12",
				source: {
					url: "https://data.worldbank.org/topic/health",
					label: `World Bank (CY ${latestYear || "latest"})`,
				},
			};
		} catch {
			return null;
		}
	},
};

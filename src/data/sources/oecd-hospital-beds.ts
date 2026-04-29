import type { Source } from "./types";

// OECD hospital beds per 1,000 population. The classic capacity benchmark in
// peer-comparison policy debates: UK is famously near the bottom of the OECD.
//
// Dataflow: OECD.ELS.HD,DSD_HEALTH_REAC_HOSP@DF_BEDS_SECT,1.0
// Measure: HB (hospital beds) at 10P3HB (per 1,000 population)
// Ownership: _T (total = public + private) — except countries that report
//   only public (UK NHS). For those we fall back to OWNERSHIP_TYPE=P.
//
// Dimensions: REF_AREA . MEASURE . UNIT_MEASURE . STATISTICAL_OPERATION
//   . OWNERSHIP_TYPE . HEALTH_FUNCTION . CARE_TYPE . MEDICAL_TECH
//   . HEALTH_CARE_PROVIDER

const COUNTRIES = ["GBR", "USA", "DEU", "FRA", "NLD", "CAN", "AUS", "JPN"];
const COUNTRY_KEY = COUNTRIES.join("+");
// Two queries: prefer _T (total), fall back to P (public-only) for countries
// like the UK that don't decompose by ownership.
const URL_TOTAL = `https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_REAC_HOSP@DF_BEDS_SECT,1.0/${COUNTRY_KEY}.HB.10P3HB.._T..../?startPeriod=2018`;
const URL_PUBLIC = `https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_REAC_HOSP@DF_BEDS_SECT,1.0/${COUNTRY_KEY}.HB.10P3HB..P..../?startPeriod=2018`;

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

export interface HospitalBedsOverride {
	byCountry: Record<string, { value: number; year: string }>;
	asOf: string;
	source: { url: string; label: string };
}

const parseCsv = (text: string): Record<string, string>[] => {
	const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
	if (lines.length < 2) return [];
	const headers = lines[0]!.split(",");
	return lines.slice(1).map((line) => {
		const cells = line.split(",");
		const row: Record<string, string> = {};
		for (let i = 0; i < headers.length; i++) {
			row[headers[i] ?? ""] = cells[i] ?? "";
		}
		return row;
	});
};

const fetchBeds = async (
	url: string,
): Promise<Map<string, { value: number; year: string }>> => {
	const response = await fetch(url, {
		headers: { Accept: "application/vnd.sdmx.data+csv;version=1.0" },
		next: { revalidate: 86_400 },
	});
	if (!response.ok) return new Map();
	const text = await response.text();
	const rows = parseCsv(text);
	const latest = new Map<string, { value: number; year: string }>();
	for (const row of rows) {
		const iso3 = row.REF_AREA;
		const year = row.TIME_PERIOD;
		const valueStr = row.OBS_VALUE;
		if (!iso3 || !year || !valueStr) continue;
		const value = Number(valueStr);
		if (!Number.isFinite(value) || value <= 0) continue;
		const iso2 = ISO3_TO_ISO2[iso3];
		if (!iso2) continue;
		const existing = latest.get(iso2);
		if (!existing || year > existing.year) {
			latest.set(iso2, { value, year });
		}
	}
	return latest;
};

export const oecdHospitalBedsSource: Source<HospitalBedsOverride | null> = {
	fallback: null,
	fetch: async () => {
		try {
			const [totals, publics] = await Promise.all([
				fetchBeds(URL_TOTAL),
				fetchBeds(URL_PUBLIC),
			]);

			const byCountry: Record<string, { value: number; year: string }> = {};
			let latestYear = "";

			// Prefer total (_T) where available; fall back to public-only (P).
			// All ISO2 codes the fetcher knows about.
			for (const iso2 of Object.values(ISO3_TO_ISO2)) {
				const t = totals.get(iso2);
				const p = publics.get(iso2);
				const chosen = t ?? p;
				if (!chosen) continue;
				byCountry[iso2] = chosen;
				if (chosen.year > latestYear) latestYear = chosen.year;
			}

			if (Object.keys(byCountry).length === 0) return null;

			return {
				byCountry,
				asOf: `${latestYear}-12`,
				source: {
					url: "https://stats.oecd.org/Index.aspx?DataSetCode=HEALTH_REAC",
					label: `OECD Hospital Beds (CY ${latestYear || "latest"})`,
				},
			};
		} catch {
			return null;
		}
	},
};

import type { Source } from "./types";

// OECD's SDMX-CSV API for treatable mortality — the one indicator World Bank
// doesn't republish. Dataflow `OECD.ELS.HD,DSD_HEALTH_STAT@DF_AM,1.0`,
// measure `TRTM` (treatable mortality), unit `DT_10P5HB` (deaths per 100,000,
// age-standardised), age & sex totals, methodology `STANDARD`.
//
// OECD's API is fiddly: it requires a specific Accept header
// (`application/vnd.sdmx.data+csv;version=1.0`) and the dimension order in
// the URL key matters. The 13-dimension query includes most as wildcards.

const COUNTRIES = ["GBR", "USA", "DEU", "FRA", "NLD", "CAN", "AUS", "JPN"];
const COUNTRY_KEY = COUNTRIES.join("+");

// Order: REF_AREA . FREQ . MEASURE . UNIT_MEASURE . AGE . SEX . SOCIO_ECON_STATUS . DEATH_CAUSE . CALC_METHODOLOGY . GESTATION_THRESHOLD . HEALTH_STATUS . DISEASE . CANCER_SITE
const KEY = `${COUNTRY_KEY}.A.TRTM.DT_10P5HB._T._T.._Z.STANDARD....`;
const URL = `https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_STAT@DF_AM,1.0/${KEY}/?startPeriod=2018`;

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

export interface TreatableMortalityOverride {
	byCountry: Record<string, { value: number; year: string }>;
	asOf: string;
	source: { url: string; label: string };
}

// Minimal CSV parser. OECD's SDMX-CSV escapes nothing tricky in this dataset
// (no quoted fields needed for our columns), so a basic split suffices.
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

export const oecdTreatableMortalitySource: Source<TreatableMortalityOverride | null> =
	{
		fallback: null,
		fetch: async () => {
			try {
				const response = await fetch(URL, {
					headers: {
						Accept: "application/vnd.sdmx.data+csv;version=1.0",
					},
					next: { revalidate: 86_400 },
				});
				if (!response.ok) return null;
				const text = await response.text();
				const rows = parseCsv(text);
				if (rows.length === 0) return null;

				const byCountry: Record<string, { value: number; year: string }> = {};
				let latestYear = "";
				for (const row of rows) {
					const iso3 = row.REF_AREA;
					const year = row.TIME_PERIOD;
					const valueStr = row.OBS_VALUE;
					if (!iso3 || !year || !valueStr) continue;
					const value = Number(valueStr);
					if (!Number.isFinite(value) || value <= 0) continue;
					const iso2 = ISO3_TO_ISO2[iso3];
					if (!iso2) continue;
					const existing = byCountry[iso2];
					if (!existing || year > existing.year) {
						byCountry[iso2] = { value, year };
					}
					if (year > latestYear) latestYear = year;
				}

				if (Object.keys(byCountry).length === 0) return null;

				return {
					byCountry,
					asOf: `${latestYear}-12`,
					source: {
						url: "https://stats.oecd.org/Index.aspx?DataSetCode=HEALTH_STAT",
						label: `OECD Avoidable Mortality (CY ${latestYear || "latest"})`,
					},
				};
			} catch {
				return null;
			}
		},
	};

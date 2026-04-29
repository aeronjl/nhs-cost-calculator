import type { Source } from "./types";

// OECD physicians per 1,000 population — the standard peer-comparison
// measure cited in NHS workforce debates.
//
// Dataflow: OECD.ELS.HD,DSD_HEALTH_EMP_REAC@DF_PHYS,1.0
// Measure: HSE (health sector employment) / 10P3HB (per 1,000 population)
// Health profession: PHYS (physicians)
// Activity status: P (practising — the comparable measure across countries).
//   "LP" (license to practise) is higher because it includes non-practising
//   docs; we explicitly want "P" for cross-country fairness.
//
// Dimension order: REF_AREA . MEASURE . UNIT_MEASURE . AGE . SEX . HEALTH_PROF
//   . WORKER_STATUS . HEALTH_PROF_ACTIVITY_STATUS . PRICE_BASE

const COUNTRIES = ["GBR", "USA", "DEU", "FRA", "NLD", "CAN", "AUS", "JPN"];
const COUNTRY_KEY = COUNTRIES.join("+");
const KEY = `${COUNTRY_KEY}.HSE.10P3HB._Z._Z.PHYS._Z.P._Z`;
const URL = `https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HEALTH_EMP_REAC@DF_PHYS,1.0/${KEY}/?startPeriod=2018`;

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

export interface PhysiciansOverride {
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

export const oecdPhysiciansSource: Source<PhysiciansOverride | null> = {
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
					url: "https://stats.oecd.org/Index.aspx?DataSetCode=HEALTH_REAC",
					label: `OECD Physicians (CY ${latestYear || "latest"})`,
				},
			};
		} catch {
			return null;
		}
	},
};

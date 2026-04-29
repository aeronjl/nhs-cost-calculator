import type { Source } from "./types";

// OECD breast cancer 5-year net survival rate. The most-cited cancer-outcome
// metric in NHS reform debates: UK consistently ranks bottom of OECD peers
// (~86% vs ~90%+ in US/Australia/Japan).
//
// Dataflow: OECD.ELS.HD,DSD_HCQO@DF_CC,1.0 (Cancer Care)
// Measure: CCBRNTSR (breast cancer net 5-year survival rate)
// Unit: PT_POP_COND (percent)
//
// Data is updated periodically as cohorts complete 5-year follow-up. Latest
// edition typically lags ~5 years (e.g. 2014 cohort = cases diagnosed
// 2010-2014, followed through 2019).
//
// Dimensions: REF_AREA . FREQ . MEASURE . UNIT_MEASURE . AGE . SEX
//   . STATISTICAL_OPERATION . INCOME_GROUP . HEALTH_PROF

const COUNTRIES = ["GBR", "USA", "DEU", "FRA", "NLD", "CAN", "AUS", "JPN"];
const COUNTRY_KEY = COUNTRIES.join("+");
const KEY = `${COUNTRY_KEY}.A.CCBRNTSR......`;
const URL = `https://sdmx.oecd.org/public/rest/data/OECD.ELS.HD,DSD_HCQO@DF_CC,1.0/${KEY}/?startPeriod=2010`;

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

export interface CancerSurvivalOverride {
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

export const oecdCancerSurvivalSource: Source<CancerSurvivalOverride | null> =
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
						url: "https://stats.oecd.org/Index.aspx?DataSetCode=HEALTH_HCQI",
						label: `OECD Cancer Survival (cohort ${latestYear || "latest"})`,
					},
				};
			} catch {
				return null;
			}
		},
	};

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(
	ROOT,
	"src/data/generated/borrowing-calibration.json",
);

const INSTRUMENT_IDS = [
	"treasury-bills",
	"short-gilts",
	"medium-gilts",
	"long-gilts",
	"index-linked-gilts",
];

const OFFICIAL_HOSTS = new Set([
	"dmo.gov.uk",
	"www.dmo.gov.uk",
	"bankofengland.co.uk",
	"www.bankofengland.co.uk",
	"obr.uk",
	"www.obr.uk",
]);

const parseArgs = (argv) => {
	const args = { check: false, input: undefined };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--check") {
			args.check = true;
		} else if (arg === "--input") {
			args.input = argv[++i];
		} else if (arg?.startsWith("--input=")) {
			args.input = arg.slice("--input=".length);
		} else if (!arg?.startsWith("--") && !args.input) {
			args.input = arg;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return args;
};

const assert = (condition, message) => {
	if (!condition) throw new Error(message);
};

const asNumber = (value, name, { min = -Infinity, max = Infinity } = {}) => {
	assert(typeof value === "number" && Number.isFinite(value), `${name} must be a finite number`);
	assert(value >= min && value <= max, `${name} must be between ${min} and ${max}`);
	return value;
};

const asString = (value, name, pattern) => {
	assert(typeof value === "string" && value.length > 0, `${name} must be a non-empty string`);
	if (pattern) assert(pattern.test(value), `${name} has invalid format`);
	return value;
};

const validateOfficialUrl = (value, name) => {
	const url = asString(value, name);
	const parsed = new URL(url);
	assert(
		OFFICIAL_HOSTS.has(parsed.hostname),
		`${name} must use an official DMO, OBR, or Bank of England host`,
	);
	return url;
};

const validateSource = (value, name) => {
	assert(typeof value === "object" && value !== null, `${name} must be an object`);
	return {
		url: validateOfficialUrl(value.url, `${name}.url`),
		label: asString(value.label, `${name}.label`),
	};
};

const validateInstrument = (value, id) => {
	assert(typeof value === "object" && value !== null, `instruments.${id} must be an object`);
	const inflationLinked = value.inflationLinked === true;
	const instrument = {
		share: asNumber(value.share, `instruments.${id}.share`, { min: 0, max: 1 }),
		maturityYears: asNumber(value.maturityYears, `instruments.${id}.maturityYears`, {
			min: 0.25,
			max: 100,
		}),
		bankRatePassThrough: asNumber(
			value.bankRatePassThrough,
			`instruments.${id}.bankRatePassThrough`,
			{ min: 0, max: 1 },
		),
	};
	if (inflationLinked) {
		instrument.realYield = asNumber(value.realYield, `instruments.${id}.realYield`, {
			min: -0.05,
			max: 0.15,
		});
		instrument.inflationLinked = true;
	} else {
		instrument.nominalYield = asNumber(
			value.nominalYield,
			`instruments.${id}.nominalYield`,
			{ min: -0.02, max: 0.2 },
		);
	}
	return instrument;
};

const validateCalibration = (value) => {
	assert(typeof value === "object" && value !== null, "calibration must be an object");
	const sourceDetails = value.sourceDetails;
	assert(Array.isArray(sourceDetails) && sourceDetails.length >= 3, "sourceDetails must list at least three official sources");

	const instruments = {};
	for (const id of INSTRUMENT_IDS) {
		instruments[id] = validateInstrument(value.instruments?.[id], id);
	}
	const shareSum = Object.values(instruments).reduce((sum, item) => sum + item.share, 0);
	assert(Math.abs(shareSum - 1) < 0.01, `central instrument shares must sum to 1, got ${shareSum.toFixed(4)}`);

	return {
		asOf: asString(value.asOf, "asOf", /^\d{4}-\d{2}$/),
		source: validateSource(value.source, "source"),
		sourceDetails: sourceDetails.map((source, index) =>
			validateSource(source, `sourceDetails[${index}]`),
		),
		thirtyYearGiltYield: asNumber(value.thirtyYearGiltYield, "thirtyYearGiltYield", {
			min: -0.02,
			max: 0.2,
		}),
		bankRate: asNumber(value.bankRate, "bankRate", { min: -0.01, max: 0.2 }),
		inflation: asNumber(value.inflation, "inflation", { min: -0.02, max: 0.2 }),
		ukGdp: asNumber(value.ukGdp, "ukGdp", { min: 1_000_000_000_000 }),
		ukDebt: asNumber(value.ukDebt, "ukDebt", { min: 1_000_000_000_000 }),
		grossFinancingRequirement: asNumber(
			value.grossFinancingRequirement,
			"grossFinancingRequirement",
			{ min: 1_000_000_000 },
		),
		averageDebtMaturityYears: asNumber(
			value.averageDebtMaturityYears,
			"averageDebtMaturityYears",
			{ min: 1, max: 50 },
		),
		reservesBalances: asNumber(value.reservesBalances, "reservesBalances", {
			min: 0,
		}),
		apfGiltStock: asNumber(value.apfGiltStock, "apfGiltStock", { min: 0 }),
		instruments,
		risk: {
			debtGdpRiskPremiumPerPp: asNumber(
				value.risk?.debtGdpRiskPremiumPerPp,
				"risk.debtGdpRiskPremiumPerPp",
				{ min: -0.01, max: 0.02 },
			),
			issuancePremiumPer100bn: asNumber(
				value.risk?.issuancePremiumPer100bn,
				"risk.issuancePremiumPer100bn",
				{ min: 0, max: 0.02 },
			),
			convexityThresholdDebtGdpPp: asNumber(
				value.risk?.convexityThresholdDebtGdpPp,
				"risk.convexityThresholdDebtGdpPp",
				{ min: 0, max: 50 },
			),
			convexityPremiumPerPpSquared: asNumber(
				value.risk?.convexityPremiumPerPpSquared,
				"risk.convexityPremiumPerPpSquared",
				{ min: 0, max: 0.01 },
			),
		},
	};
};

const readJson = async (input) => {
	const source = input ?? TARGET;
	if (/^https?:\/\//.test(source)) {
		const response = await fetch(source);
		if (!response.ok) {
			throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
		}
		return response.json();
	}
	const file = path.isAbsolute(source) ? source : path.join(ROOT, source);
	return JSON.parse(await readFile(file, "utf8"));
};

const main = async () => {
	const args = parseArgs(process.argv.slice(2));
	const input = args.input ?? process.env.BORROWING_CALIBRATION_URL;
	if (!args.check && !input) {
		throw new Error(
			"Set BORROWING_CALIBRATION_URL or pass --input <file-or-url> to update calibration",
		);
	}
	const raw = await readJson(args.check ? input ?? TARGET : input);
	const normalized = validateCalibration(raw);
	if (args.check) {
		console.log(
			`Borrowing calibration valid: ${normalized.asOf}, ${Object.keys(normalized.instruments).length} instruments`,
		);
		return;
	}
	await writeFile(TARGET, `${JSON.stringify(normalized, null, 2)}\n`);
	console.log(`Updated ${path.relative(ROOT, TARGET)} from ${input}`);
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});

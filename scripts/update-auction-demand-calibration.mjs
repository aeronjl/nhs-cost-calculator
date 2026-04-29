#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(
	ROOT,
	"src/data/generated/auction-demand-calibration.json",
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
	assert(
		typeof value === "number" && Number.isFinite(value),
		`${name} must be a finite number`,
	);
	assert(value >= min && value <= max, `${name} must be between ${min} and ${max}`);
	return value;
};

const asOptionalNumber = (
	value,
	name,
	{ min = -Infinity, max = Infinity } = {},
) => {
	if (value === null || value === undefined) return null;
	return asNumber(value, name, { min, max });
};

const asString = (value, name) => {
	assert(
		typeof value === "string" && value.length > 0,
		`${name} must be a non-empty string`,
	);
	return value;
};

const validateOfficialUrl = (value, name) => {
	const url = asString(value, name);
	const parsed = new URL(url);
	assert(
		OFFICIAL_HOSTS.has(parsed.hostname),
		`${name} must use an official DMO host`,
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

const validateCurve = (value, id) => {
	assert(typeof value === "object" && value !== null, `curves.${id} must be an object`);
	return {
		normalCoverRatio: asNumber(value.normalCoverRatio, `curves.${id}.normalCoverRatio`, {
			min: 1,
			max: 10,
		}),
		elasticityShareOfAnnualIssuancePerBp: asNumber(
			value.elasticityShareOfAnnualIssuancePerBp,
			`curves.${id}.elasticityShareOfAnnualIssuancePerBp`,
			{ min: 0.0001, max: 0.05 },
		),
		tailShareOfConcession: asNumber(value.tailShareOfConcession, `curves.${id}.tailShareOfConcession`, {
			min: 0,
			max: 1,
		}),
	};
};

const validateObservation = (value, id) => {
	assert(
		typeof value === "object" && value !== null,
		`observations.${id} must be an object`,
	);
	const observation = {
		latestCoverRatio: asNumber(
			value.latestCoverRatio,
			`observations.${id}.latestCoverRatio`,
			{ min: 1, max: 10 },
		),
		previousCoverRatio: asNumber(
			value.previousCoverRatio,
			`observations.${id}.previousCoverRatio`,
			{ min: 1, max: 10 },
		),
		latestTailBp: asOptionalNumber(
			value.latestTailBp,
			`observations.${id}.latestTailBp`,
			{ min: 0, max: 20 },
		),
		previousTailBp: asOptionalNumber(
			value.previousTailBp,
			`observations.${id}.previousTailBp`,
			{ min: 0, max: 20 },
		),
	};
	if (value.note !== undefined) observation.note = asString(value.note, `observations.${id}.note`);
	return observation;
};

const validateCalibration = (value) => {
	assert(typeof value === "object" && value !== null, "calibration must be an object");
	assert(
		Array.isArray(value.sourceDetails) && value.sourceDetails.length >= 2,
		"sourceDetails must list at least two official DMO sources",
	);
	const observations = {};
	const curves = {};
	for (const id of INSTRUMENT_IDS) {
		observations[id] = validateObservation(value.observations?.[id], id);
		curves[id] = validateCurve(value.curves?.[id], id);
	}
	return {
		asOf: asString(value.asOf, "asOf"),
		source: validateSource(value.source, "source"),
		sourceDetails: value.sourceDetails.map((source, index) =>
			validateSource(source, `sourceDetails[${index}]`),
		),
		method: asString(value.method, "method"),
		observations,
		curves,
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
	const input = args.input ?? process.env.AUCTION_DEMAND_CALIBRATION_URL;
	if (!args.check && !input) {
		throw new Error(
			"Set AUCTION_DEMAND_CALIBRATION_URL or pass --input <file-or-url> to update calibration",
		);
	}
	const raw = await readJson(args.check ? input ?? TARGET : input);
	const normalized = validateCalibration(raw);
	if (args.check) {
		console.log(
			`Auction demand calibration valid: ${normalized.asOf}, ${Object.keys(normalized.curves).length} curves`,
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

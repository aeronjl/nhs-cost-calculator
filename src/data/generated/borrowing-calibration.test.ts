import { describe, expect, it } from "vitest";
import calibration from "./borrowing-calibration.json";
import { BORROWING, BORROWING_CALIBRATION } from "@/data/levers/borrowing";

const OFFICIAL_HOSTS = new Set([
	"dmo.gov.uk",
	"www.dmo.gov.uk",
	"bankofengland.co.uk",
	"www.bankofengland.co.uk",
	"obr.uk",
	"www.obr.uk",
]);

describe("borrowing calibration", () => {
	it("feeds the borrowing constants from the generated calibration artifact", () => {
		expect(BORROWING_CALIBRATION).toEqual(calibration);
		expect(BORROWING.asOf).toBe(calibration.asOf);
		expect(BORROWING.bankRate).toBe(calibration.bankRate);
		expect(BORROWING.inflation).toBe(calibration.inflation);
		expect(BORROWING.grossFinancingRequirement).toBe(
			calibration.grossFinancingRequirement,
		);
	});

	it("central portfolio shares are complete and sum to one", () => {
		expect(BORROWING.portfolio.map((instrument) => instrument.id)).toEqual([
			"treasury-bills",
			"short-gilts",
			"medium-gilts",
			"long-gilts",
			"index-linked-gilts",
		]);
		const share = BORROWING.portfolio.reduce(
			(sum, instrument) => sum + instrument.share,
			0,
		);
		expect(share).toBeCloseTo(1, 2);
	});

	it("references official source domains", () => {
		for (const source of [BORROWING.source, ...BORROWING.sourceDetails]) {
			const hostname = new URL(source.url).hostname;
			expect(OFFICIAL_HOSTS.has(hostname)).toBe(true);
		}
	});
});

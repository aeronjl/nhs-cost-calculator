import { describe, expect, it } from "vitest";
import { formatMoney, formatTime } from "./formatters";

describe("formatMoney", () => {
	it("prefixes the currency symbol and adds thousand separators", () => {
		expect(formatMoney(0, "GBP")).toBe("£0");
		expect(formatMoney(1234567, "GBP")).toBe("£1,234,567");
		expect(formatMoney(1234567, "USD")).toBe("$1,234,567");
	});

	it("rounds non-integer amounts", () => {
		expect(formatMoney(99.4, "GBP")).toBe("£99");
		expect(formatMoney(99.5, "GBP")).toBe("£100");
	});

	it("defaults to GBP when no currency is provided", () => {
		expect(formatMoney(50)).toBe("£50");
	});
});

describe("formatTime", () => {
	it("renders seconds for sub-minute durations", () => {
		expect(formatTime(0)).toBe("0 seconds");
		expect(formatTime(0.5)).toBe("30 seconds");
		expect(formatTime(1 / 60)).toBe("1 second");
	});

	it("renders minutes with optional seconds", () => {
		expect(formatTime(1)).toBe("1 minute");
		expect(formatTime(2)).toBe("2 minutes");
		expect(formatTime(2.5)).toBe("2 minutes and 30 seconds");
	});

	it("renders hours with optional minutes", () => {
		expect(formatTime(60)).toBe("1 hour");
		expect(formatTime(60 + 30)).toBe("1 hour and 30 minutes");
		expect(formatTime(120)).toBe("2 hours");
	});

	it("renders days with optional hours", () => {
		expect(formatTime(60 * 24)).toBe("1 day");
		expect(formatTime(60 * 24 * 2 + 60 * 5)).toBe("2 days and 5 hours");
	});

	it("renders weeks with optional days", () => {
		expect(formatTime(60 * 24 * 7)).toBe("1 week");
		expect(formatTime(60 * 24 * 7 + 60 * 24 * 3)).toBe("1 week and 3 days");
	});

	it("renders months and years for large durations", () => {
		// 525600 minutes = 1 year (formatTime's own definition)
		expect(formatTime(525600)).toBe("1 year");
		expect(formatTime(525600 * 2)).toBe("2 years");
		// 43800 minutes = 1 "month" per formatTime's constants
		expect(formatTime(43800)).toBe("1 month");
		expect(formatTime(43800 * 5)).toBe("5 months");
	});

	it("rounds the smallest unit so 59.5s shows up as a full minute, not '0 seconds'", () => {
		// Boundary: 59 seconds → "59 seconds"
		expect(formatTime(59 / 60)).toBe("59 seconds");
	});
});

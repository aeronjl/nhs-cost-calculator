import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ChartCallout,
	calloutAnchor,
	calloutXPct,
} from "./chart-callout";

describe("calloutAnchor", () => {
	it("returns middle when only one slot exists", () => {
		expect(calloutAnchor(0, 1)).toBe("middle");
	});

	it("anchors start at the first slot", () => {
		expect(calloutAnchor(0, 5)).toBe("start");
	});

	it("anchors end at the last slot", () => {
		expect(calloutAnchor(4, 5)).toBe("end");
	});

	it("anchors middle for interior slots", () => {
		expect(calloutAnchor(2, 5)).toBe("middle");
		expect(calloutAnchor(3, 5)).toBe("middle");
	});
});

describe("calloutXPct", () => {
	it("returns 50% for a single-slot chart", () => {
		expect(calloutXPct(0, 1)).toBe(50);
	});

	it("maps the first slot to 0%", () => {
		expect(calloutXPct(0, 5)).toBe(0);
	});

	it("maps the last slot to 100%", () => {
		expect(calloutXPct(4, 5)).toBe(100);
	});

	it("interpolates linearly between slots", () => {
		expect(calloutXPct(2, 5)).toBe(50);
	});
});

describe("ChartCallout", () => {
	it("renders a positioned tooltip box with pointer-events disabled", () => {
		const html = renderToStaticMarkup(
			React.createElement(ChartCallout, {
				xPct: 33,
				anchor: "middle",
				children: "Hello",
			}),
		);
		expect(html).toContain('role="status"');
		expect(html).toContain('aria-live="polite"');
		expect(html).toContain("pointer-events-none");
		expect(html).toContain("translateX(-50%)");
		expect(html).toContain("33.000%");
		expect(html).toContain("Hello");
	});

	it("flips anchor at the right edge", () => {
		const html = renderToStaticMarkup(
			React.createElement(ChartCallout, {
				xPct: 100,
				anchor: "end",
				children: "End",
			}),
		);
		expect(html).toContain("translateX(-100%)");
		expect(html).toContain("100.000%");
	});

	it("clamps overflow values", () => {
		const html = renderToStaticMarkup(
			React.createElement(ChartCallout, {
				xPct: 250,
				anchor: "middle",
				children: "Out of range",
			}),
		);
		expect(html).toContain("100.000%");
	});
});

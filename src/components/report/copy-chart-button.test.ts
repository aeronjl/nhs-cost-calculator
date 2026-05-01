import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyChartButton } from "./copy-chart-button";

describe("CopyChartButton", () => {
	it("renders with the chart title in the aria-label", () => {
		const ref: React.RefObject<HTMLElement | null> = { current: null };
		const html = renderToStaticMarkup(
			React.createElement(CopyChartButton, {
				targetRef: ref,
				chartTitle: "Multi-year projection",
			}),
		);
		expect(html).toContain('aria-label="Save Multi-year projection as PNG"');
		expect(html).toContain("Save as PNG");
	});

	it("applies an additional className when provided", () => {
		const ref: React.RefObject<HTMLElement | null> = { current: null };
		const html = renderToStaticMarkup(
			React.createElement(CopyChartButton, {
				targetRef: ref,
				chartTitle: "Signature",
				className: "ml-auto",
			}),
		);
		expect(html).toContain("ml-auto");
	});
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScenarioSignatureRadar } from "./scenario-signature";

describe("ScenarioSignatureRadar", () => {
	it("renders an svg with axis labels and percentages", () => {
		const html = renderToStaticMarkup(
			React.createElement(ScenarioSignatureRadar, {
				signature: {
					tax: 0.6,
					spend: 0.3,
					borrow: 0.1,
					progressive: 0.7,
					longRun: 0.5,
				},
			}),
		);
		expect(html).toContain('aria-label="Scenario signature radar"');
		expect(html).toContain("Tax");
		expect(html).toContain("Spend");
		expect(html).toContain("Borrow");
		expect(html).toContain("Progressive");
		expect(html).toContain("Long-run");
		// Title text exposes percentages for screen readers.
		expect(html).toContain("tax 60%");
		expect(html).toContain("spend 30%");
		expect(html).toContain("borrow 10%");
		expect(html).toContain("progressive 70%");
		expect(html).toContain("long-run 50%");
		// Five axis vertices + five guide rings + one signature polygon.
		const polygons = html.match(/<polygon /g) ?? [];
		// Four guide rings + one signature polygon = 5.
		expect(polygons.length).toBe(5);
	});
});

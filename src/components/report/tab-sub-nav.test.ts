import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TabSubNav } from "./tab-sub-nav";

describe("TabSubNav", () => {
	it("renders nothing when given a single section", () => {
		const html = renderToStaticMarkup(
			React.createElement(TabSubNav, {
				sections: [{ id: "only", label: "Only" }],
			}),
		);
		expect(html).toBe("");
	});

	it("renders a nav with one button per section", () => {
		const html = renderToStaticMarkup(
			React.createElement(TabSubNav, {
				sections: [
					{ id: "overview", label: "Overview" },
					{ id: "deciles", label: "Decile shares" },
					{ id: "households", label: "Households" },
				],
			}),
		);
		expect(html).toContain('aria-label="Tab section navigation"');
		expect(html).toContain("Overview");
		expect(html).toContain("Decile shares");
		expect(html).toContain("Households");
		// In SSR the first section is the initial active id (from useScrollSpy).
		expect(html).toContain('aria-current="true"');
	});
});

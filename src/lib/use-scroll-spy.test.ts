import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useScrollSpy } from "./use-scroll-spy";

const Probe = ({ ids }: { ids: readonly string[] }) => {
	const active = useScrollSpy(ids);
	return React.createElement("div", { "data-active": active ?? "null" });
};

describe("useScrollSpy", () => {
	it("returns the first id as the initial active section", () => {
		const html = renderToStaticMarkup(
			React.createElement(Probe, { ids: ["alpha", "beta", "gamma"] }),
		);
		expect(html).toContain('data-active="alpha"');
	});

	it("returns null when given an empty list", () => {
		const html = renderToStaticMarkup(
			React.createElement(Probe, { ids: [] }),
		);
		expect(html).toContain('data-active="null"');
	});
});

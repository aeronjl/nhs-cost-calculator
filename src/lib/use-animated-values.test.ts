import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useAnimatedValues } from "./use-animated-values";

interface ProbeProps {
	values: readonly number[];
}

const Probe = ({ values }: ProbeProps) => {
	const animated = useAnimatedValues(values);
	return React.createElement("div", {
		"data-animated": JSON.stringify(animated),
	});
};

describe("useAnimatedValues", () => {
	it("returns input values directly on the SSR render", () => {
		const html = renderToStaticMarkup(
			React.createElement(Probe, { values: [1, 2, 3] }),
		);
		expect(html).toContain('data-animated="[1,2,3]"');
	});

	it("preserves length when the input has a single value", () => {
		const html = renderToStaticMarkup(
			React.createElement(Probe, { values: [42] }),
		);
		expect(html).toContain('data-animated="[42]"');
	});

	it("preserves an empty input", () => {
		const html = renderToStaticMarkup(
			React.createElement(Probe, { values: [] }),
		);
		expect(html).toContain('data-animated="[]"');
	});
});

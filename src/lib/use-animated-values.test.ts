import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	useAnimatedPerLineValues,
	useAnimatedValues,
} from "./use-animated-values";

interface ProbeProps {
	values: readonly number[];
}

const Probe = ({ values }: ProbeProps) => {
	const animated = useAnimatedValues(values);
	return React.createElement("div", {
		"data-animated": JSON.stringify(animated),
	});
};

interface KeyedProbeProps {
	lines: readonly { id: string; values: readonly number[] }[];
}

const KeyedProbe = ({ lines }: KeyedProbeProps) => {
	const animated = useAnimatedPerLineValues(lines);
	const out: Record<string, readonly number[]> = {};
	for (const [id, values] of animated) out[id] = values;
	return React.createElement("div", {
		"data-animated": JSON.stringify(out),
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

describe("useAnimatedPerLineValues", () => {
	it("returns the input values keyed by id on first render", () => {
		const html = renderToStaticMarkup(
			React.createElement(KeyedProbe, {
				lines: [
					{ id: "a", values: [1, 2] },
					{ id: "b", values: [3, 4] },
				],
			}),
		);
		expect(html).toContain(
			'data-animated="{&quot;a&quot;:[1,2],&quot;b&quot;:[3,4]}"',
		);
	});

	it("preserves an empty input as an empty map", () => {
		const html = renderToStaticMarkup(
			React.createElement(KeyedProbe, { lines: [] }),
		);
		expect(html).toContain('data-animated="{}"');
	});

	it("keeps lines independent — each id maps to its own values", () => {
		const html = renderToStaticMarkup(
			React.createElement(KeyedProbe, {
				lines: [
					{ id: "alpha", values: [10, 20, 30] },
					{ id: "beta", values: [-5, -10, -15] },
				],
			}),
		);
		expect(html).toContain("alpha");
		expect(html).toContain("beta");
		expect(html).toContain("[10,20,30]");
		expect(html).toContain("[-5,-10,-15]");
	});
});

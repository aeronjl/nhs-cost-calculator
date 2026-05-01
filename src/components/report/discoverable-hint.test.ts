import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiscoverableHint } from "./discoverable-hint";

describe("DiscoverableHint", () => {
	it("renders nothing in SSR (default-dismissed) so returning visitors don't flash", () => {
		const html = renderToStaticMarkup(
			React.createElement(DiscoverableHint, {
				storageKey: "test-hint",
				children: "Hello",
			}),
		);
		// SSR should output an empty string — the post-hydration effect decides
		// whether to reveal the hint based on localStorage.
		expect(html).toBe("");
	});
});

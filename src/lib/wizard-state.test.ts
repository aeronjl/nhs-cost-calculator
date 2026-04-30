import { describe, expect, it } from "vitest";
import { buildWizardUrl, encodeWizardState } from "./wizard-state";

describe("buildWizardUrl", () => {
	it("rewrites legacy simulator state into canonical wizard params", () => {
		const current = new URLSearchParams({
			scenario: "t:basic-rate-income-tax:1",
			editor: "stack",
			id: "hs2-mile",
			q: "2",
			utm_source: "newsletter",
		});

		const url = buildWizardUrl(current, {
			wstep: "5",
			wiz: "t:basic-rate-income-tax:1",
		});

		expect(url).toBe(
			"/?utm_source=newsletter&wstep=5&wiz=t%3Abasic-rate-income-tax%3A1",
		);
	});

	it("strips old trade-off and counterfactual namespaces", () => {
		const current = new URLSearchParams({
			to_goal: "hs2-mile",
			to_split: "33,33,34",
			cf_mode: "tax",
			cf_pp: "1",
			wstep: "2",
			share: "keep",
		});

		const url = buildWizardUrl(current, { wstep: "5" });

		expect(url).toBe("/?share=keep&wstep=5");
	});
});

describe("encodeWizardState", () => {
	it("keeps result-step scenario links compact", () => {
		const encoded = encodeWizardState({
			step: 5,
			goal: null,
			committedScenario: [
				{
					id: "a",
					type: "tax",
					leverId: "basic-rate-income-tax",
					magnitude: 1,
				},
			],
			previewLines: [],
			era: "current",
			baselineMode: "forecast",
			mobileSparklineCollapsed: false,
		});

		expect(encoded).toEqual({
			wstep: "5",
			wiz: "t:basic-rate-income-tax:1",
		});
	});
});

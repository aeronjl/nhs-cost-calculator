import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import { buildMacroStressLab } from "@/lib/macro-stress-lab";
import { evaluateScenario, type ScenarioLine } from "@/lib/scenario";
import { MacroStressLabPanel } from "./macro-stress-lab";

const scenario: ScenarioLine[] = [
	{
		id: "tax",
		type: "tax",
		leverId: "basic-rate-income-tax",
		magnitude: 2,
	},
	{
		id: "borrow",
		type: "borrow",
		leverId: "",
		magnitude: 80_000_000_000,
		borrowingContext: {
			fiscalEvent: "unscored",
			duration: "persistent",
		},
	},
];

describe("MacroStressLabPanel", () => {
	it("renders stress sensitivities as graph-first outputs", () => {
		const lab = buildMacroStressLab(evaluateScenario(scenario), OBR_BASELINE);
		const html = renderToStaticMarkup(
			React.createElement(MacroStressLabPanel, { lab }),
		);

		expect(html).toContain("Rule-headroom tornado");
		expect(html).toContain("low/high cases, delta from central");
		expect(html).toContain("Downside impact ranking");
		expect(html).toContain("worst case vs central headroom");
		expect(html).toContain("Show sensitivity matrix");
		expect(html).toContain("Nominal GDP growth headroom tornado");
		expect(html).toContain("Nominal GDP growth downside headroom impact");
		expect(html.indexOf("Downside impact ranking")).toBeLessThan(
			html.indexOf("Show sensitivity matrix"),
		);
	});
});

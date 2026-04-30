import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import {
	evaluateScenario,
	projectScenarioWithGEFeedback,
	type ScenarioLine,
} from "@/lib/scenario";
import { BaselineComparisonPanel } from "./baseline-comparison";

const scenario: ScenarioLine[] = [
	{
		id: "test-borrow",
		type: "borrow",
		leverId: "",
		magnitude: 80_000_000_000,
		borrowingContext: {
			fiscalEvent: "unscored",
			duration: "persistent",
		},
	},
];

describe("BaselineComparisonPanel counterfactual chart", () => {
	it("labels baseline and policy scenario paths explicitly", () => {
		const result = evaluateScenario(scenario);
		const projection = projectScenarioWithGEFeedback(
			result,
			OBR_BASELINE.years.length,
		).withFeedback;
		const comparison = projectAgainstBaseline(projection, OBR_BASELINE);
		const fiscalRuleFan = projectFiscalRuleFan(result, OBR_BASELINE, 80, 7);
		const fiscalRuleUncertaintyDecomposition =
			projectFiscalRuleUncertaintyDecomposition(result, OBR_BASELINE, 80, 7);
		const html = renderToStaticMarkup(
			React.createElement(BaselineComparisonPanel, {
				comparison,
				fiscalRuleFan,
				fiscalRuleUncertaintyDecomposition,
			}),
		);

		expect(html).toContain("Fiscal counterfactual paths");
		expect(html).toContain("current-policy baseline");
		expect(html).toContain("policy scenario");
		expect(html).toContain("PSNB delta");
		expect(html).toContain("debt:GDP delta");
		expect(html).toContain("scenario delta");
		expect(html).toContain("vs baseline");
		expect(html).toContain("90% pre-reaction fan");
		expect(html).toContain("90% post-reaction fan");
		expect(html).toContain("Rule-year uncertainty layers");
		expect(html).toContain(
			"central estimate, baseline forecast error, macro shocks, borrowing-regime tails, and post-reaction outcomes",
		);
		expect(html).toContain("rule year");
		expect(html).toContain(
			'aria-label="PSNB baseline and scenario counterfactual path"',
		);
		expect(html).toContain(
			'aria-label="Debt to GDP baseline and scenario counterfactual path"',
		);
	});
});

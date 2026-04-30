import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
	projectFiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import { buildMacroStressLab } from "@/lib/macro-stress-lab";
import { buildModelAuditEvidencePack } from "@/lib/model-audit";
import { evaluateScenario, projectScenarioWithGEFeedback } from "@/lib/scenario";
import { ModelAuditPanel } from "./model-audit-panel";

const buildBorrowingAudit = () => {
	const result = evaluateScenario([
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
	]);
	const ge = projectScenarioWithGEFeedback(result, OBR_BASELINE.years.length);
	const baselineComparison = projectAgainstBaseline(
		ge.withFeedback,
		OBR_BASELINE,
	);
	const fiscalRuleFan = projectFiscalRuleFan(result, OBR_BASELINE, 120, 7);
	const fiscalRulePriorSensitivity = projectFiscalRulePriorSensitivity(
		result,
		OBR_BASELINE,
		80,
		7,
	);
	const fiscalRuleUncertaintyDecomposition =
		projectFiscalRuleUncertaintyDecomposition(result, OBR_BASELINE, 80, 7);

	return buildModelAuditEvidencePack({
		result,
		baseline: OBR_BASELINE,
		baselineComparison,
		macroStressLab: buildMacroStressLab(result, OBR_BASELINE),
		fiscalRuleFan,
		fiscalRulePriorSensitivity,
		fiscalRuleUncertaintyDecomposition,
	});
};

describe("ModelAuditPanel report quality checklist", () => {
	it("summarizes the evidence modules present for a full borrowing audit", () => {
		const html = renderToStaticMarkup(
			React.createElement(ModelAuditPanel, { audit: buildBorrowingAudit() }),
		);

		expect(html).toContain("Report quality checklist");
		expect(html).toContain("10 present");
		for (const label of [
			"Scenario summary",
			"Baseline &amp; fiscal rule",
			"Provenance ledger",
			"Macro stress lab",
			"Borrowing matrix",
			"Borrowing regime",
			"Fiscal-rule risk",
			"Prior sensitivity",
			"Uncertainty layers",
			"Calibration &amp; backtests",
		]) {
			expect(html).toContain(label);
		}
	});
});

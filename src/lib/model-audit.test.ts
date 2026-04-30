import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
	projectFiscalRuleUncertaintyDecomposition,
} from "./baseline-projection";
import { buildModelAuditEvidencePack } from "./model-audit";
import { evaluateScenario } from "./scenario";

describe("model audit evidence pack", () => {
	it("collects scenario, calibration, backtest, regime, and risk evidence", () => {
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
		const fiscalRuleFan = projectFiscalRuleFan(result, OBR_BASELINE, 120, 7);
		const fiscalRulePriorSensitivity = projectFiscalRulePriorSensitivity(
			result,
			OBR_BASELINE,
			80,
			7,
		);
		const fiscalRuleUncertaintyDecomposition =
			projectFiscalRuleUncertaintyDecomposition(result, OBR_BASELINE, 80, 7);

		const audit = buildModelAuditEvidencePack({
			result,
			baseline: OBR_BASELINE,
			fiscalRuleFan,
			fiscalRulePriorSensitivity,
			fiscalRuleUncertaintyDecomposition,
		});

		expect(audit.scenario.lineCount).toBe(1);
		expect(audit.scenario.borrowingLineCount).toBe(1);
		expect(audit.scenario.borrowingAmountGbp).toBe(80_000_000_000);
		expect(audit.calibration.map((item) => item.label)).toContain(
			"Borrowing balance-sheet calibration",
		);
		expect(audit.calibration.map((item) => item.label)).toContain(
			"Auction demand calibration",
		);
		expect(audit.backtests.borrowingOverlayFit).toMatch(/^\d+\/\d+$/);
		expect(audit.backtests.fiscalReactionPriorFit).toMatch(/^\d+\/\d+$/);
		expect(audit.liveRisk.regimeProbabilities.length).toBeGreaterThan(0);
		expect(
			audit.liveRisk.regimeProbabilities.reduce(
				(sum, row) => sum + row.probability,
				0,
			),
		).toBeCloseTo(1, 6);
		expect(audit.liveRisk.priorSensitivityRows).toHaveLength(4);
		expect(audit.liveRisk.uncertaintyLayers.map((row) => row.label)).toEqual([
			"Central path",
			"Baseline forecast error",
			"Macro shocks",
			"Borrowing regime",
			"Policy reaction",
		]);
		expect(audit.limitations.length).toBeGreaterThan(0);
	});
});

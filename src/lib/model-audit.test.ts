import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
	projectFiscalRuleUncertaintyDecomposition,
} from "./baseline-projection";
import {
	buildModelAuditEvidencePack,
	buildModelAuditJsonExport,
	buildModelAuditMarkdownAppendix,
} from "./model-audit";
import { buildMacroStressLab } from "./macro-stress-lab";
import { evaluateScenario, projectScenarioWithGEFeedback } from "./scenario";

describe("model audit evidence pack", () => {
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
		const macroStressLab = buildMacroStressLab(result, OBR_BASELINE);

		const audit = buildModelAuditEvidencePack({
			result,
			baseline: OBR_BASELINE,
			baselineComparison,
			macroStressLab,
			fiscalRuleFan,
			fiscalRulePriorSensitivity,
			fiscalRuleUncertaintyDecomposition,
		});
		return { audit, baselineComparison };
	};

	it("collects scenario, baseline comparison, calibration, backtest, regime, and risk evidence", () => {
		const { audit, baselineComparison } = buildBorrowingAudit();

		expect(audit.scenario.lineCount).toBe(1);
		expect(audit.scenario.borrowingLineCount).toBe(1);
		expect(audit.scenario.borrowingAmountGbp).toBe(80_000_000_000);
		expect(audit.baselineComparison?.years).toHaveLength(
			OBR_BASELINE.years.length,
		);
		expect(audit.baselineComparison?.rule.adjustedHeadroomGbp).toBe(
			baselineComparison.adjustedStabilityHeadroom,
		);
		expect(audit.borrowingScenarioComparison?.amountGbp).toBe(
			80_000_000_000,
		);
		expect(audit.borrowingScenarioComparison?.rows.map((row) => row.id)).toEqual([
			"current",
			"obr-scored-dmo",
			"unscored-persistent",
			"emergency-backstop",
			"short-funded-unscored",
			"long-funded-scored",
		]);
		expect(
			audit.borrowingScenarioComparison?.rows.every(
				(row) =>
					Number.isFinite(row.adjustedHeadroomGbp) &&
					Number.isFinite(row.finalYearInterestGbp) &&
					row.breachProbability >= 0 &&
					row.breachProbability <= 1,
			),
		).toBe(true);
		expect(audit.macroStressLab?.parameters.map((row) => row.id)).toEqual([
			"growth",
			"inflation",
			"bank-rate",
			"multipliers",
			"tax-buoyancy",
			"debt-risk-premium",
		]);
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

	it("exports a deterministic markdown appendix and JSON evidence bundle", () => {
		const { audit } = buildBorrowingAudit();
		const generatedAt = "2026-04-30T12:00:00.000Z";
		const shareUrl =
			"https://example.test/sandbox?scenario=b::80000000000&editor=stack";

		const markdown = buildModelAuditMarkdownAppendix(audit, {
			generatedAt,
			shareUrl,
		});
		expect(markdown).toContain("# Model Audit Research Appendix");
		expect(markdown).toContain(`Generated: ${generatedAt}`);
		expect(markdown).toContain(`Share URL: ${shareUrl}`);
		expect(markdown).toContain("| Fiscal year | Baseline PSNB |");
		expect(markdown).toContain("## Borrowing Scenario Matrix");
		expect(markdown).toContain("Unscored persistent");
		expect(markdown).toContain("## Macro Stress Lab");
		expect(markdown).toContain("Gilt risk premium");
		expect(markdown).toContain("## Calibration Evidence");
		expect(markdown).toContain("### Uncertainty Decomposition");

		const json = buildModelAuditJsonExport(audit, { generatedAt, shareUrl });
		const parsed = JSON.parse(json);
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.generatedAt).toBe(generatedAt);
		expect(parsed.shareUrl).toBe(shareUrl);
		expect(parsed.audit.baselineComparison.years).toHaveLength(
			OBR_BASELINE.years.length,
		);
		expect(parsed.audit.borrowingScenarioComparison.rows).toHaveLength(6);
		expect(parsed.audit.macroStressLab.parameters).toHaveLength(6);
	});
});

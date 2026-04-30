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

const markdownTables = (markdown: string): readonly (readonly string[])[] => {
	const tables: string[][] = [];
	let current: string[] = [];
	for (const line of markdown.split("\n")) {
		if (line.startsWith("| ") && line.endsWith(" |")) {
			current.push(line);
			continue;
		}
		if (current.length > 0) {
			tables.push(current);
			current = [];
		}
	}
	if (current.length > 0) tables.push(current);
	return tables;
};

const markdownCellCount = (line: string): number =>
	line.replace(/\\\|/g, "").split("|").length - 2;

const LONG_AUDIT_TEST_TIMEOUT_MS = 30_000;

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
		expect(audit.provenanceLedger.rows).toHaveLength(1);
		expect(audit.provenanceLedger.sourceLinkedRows).toBe(1);
		expect(audit.provenanceLedger.rows[0]?.riskContributionLabel).toContain(
			"pressure",
		);
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
	}, LONG_AUDIT_TEST_TIMEOUT_MS);

	it("exports a deterministic markdown appendix and JSON evidence bundle", () => {
		const { audit } = buildBorrowingAudit();
		const generatedAt = "2026-04-30T12:00:00.000Z";
		const shareUrl =
			"https://example.test/?wstep=5&wiz=b:80000000000";

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
		expect(markdown).toContain("## Scenario Provenance Ledger");
		expect(markdown).toContain("## Calibration Evidence");
		expect(markdown).toContain("### Uncertainty Decomposition");
		expect(markdown).toContain("## Limitations");

		const tables = markdownTables(markdown);
		expect(tables.length).toBeGreaterThan(10);
		for (const table of tables) {
			const counts = table.map(markdownCellCount);
			expect(new Set(counts).size).toBe(1);
			expect(counts[0]).toBeGreaterThanOrEqual(2);
		}

		const json = buildModelAuditJsonExport(audit, { generatedAt, shareUrl });
		const parsed = JSON.parse(json);
		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.generatedAt).toBe(generatedAt);
		expect(parsed.shareUrl).toBe(shareUrl);
		expect(parsed.audit.scenario).toEqual(audit.scenario);
		expect(parsed.audit.baselineComparison.years).toHaveLength(
			OBR_BASELINE.years.length,
		);
		expect(parsed.audit.borrowingScenarioComparison.rows).toHaveLength(6);
		expect(parsed.audit.macroStressLab.parameters).toHaveLength(6);
		expect(parsed.audit.provenanceLedger.rows).toHaveLength(1);
		expect(parsed.audit.liveRisk.priorSensitivityRows).toHaveLength(4);
		expect(
			parsed.audit.liveRisk.uncertaintyLayers.map(
				(row: { label: string }) => row.label,
			),
		).toEqual([
			"Central path",
			"Baseline forecast error",
			"Macro shocks",
			"Borrowing regime",
			"Policy reaction",
		]);
		expect(
			parsed.audit.calibration.map((item: { label: string }) => item.label),
		).toEqual(audit.calibration.map((item) => item.label));
	}, LONG_AUDIT_TEST_TIMEOUT_MS);

	it("exports top-level research appendix payloads with the same evidence contract", () => {
		const { audit } = buildBorrowingAudit();
		const generatedAt = "2026-04-30T12:30:00.000Z";
		const shareUrl =
			"https://example.test/?wstep=5&wiz=b:80000000000#report-audit";

		const markdown = buildModelAuditMarkdownAppendix(audit, {
			generatedAt,
			shareUrl,
			title: "Research Appendix",
		});
		expect(markdown).toContain("# Research Appendix");
		expect(markdown).toContain(`Generated: ${generatedAt}`);
		expect(markdown).toContain(`Share URL: ${shareUrl}`);
		for (const section of [
			"## Scenario",
			"## Baseline vs Scenario",
			"## Borrowing Scenario Matrix",
			"## Macro Stress Lab",
			"## Scenario Provenance Ledger",
			"## Calibration Evidence",
			"## Historical Backtests",
			"## Live Risk",
			"### Borrowing Regime Probabilities",
			"### Prior Sensitivity",
			"### Uncertainty Decomposition",
			"## Limitations",
		]) {
			expect(markdown).toContain(section);
		}

		const json = JSON.parse(
			buildModelAuditJsonExport(audit, { generatedAt, shareUrl }),
		);
		expect(json.audit.baselineComparison.rule).toEqual(
			audit.baselineComparison?.rule,
		);
		expect(json.audit.borrowingScenarioComparison).toMatchObject({
			amountGbp: audit.borrowingScenarioComparison?.amountGbp,
			years: audit.borrowingScenarioComparison?.years,
			bestHeadroomRowLabel:
				audit.borrowingScenarioComparison?.bestHeadroomRowLabel,
			worstBreachRowLabel:
				audit.borrowingScenarioComparison?.worstBreachRowLabel,
			highestInterestRowLabel:
				audit.borrowingScenarioComparison?.highestInterestRowLabel,
		});
		expect(
			json.audit.macroStressLab.parameters.map((row: { id: string }) => row.id),
		).toEqual(audit.macroStressLab?.parameters.map((row) => row.id));
		expect(json.audit.provenanceLedger).toMatchObject({
			sourceLinkedRows: audit.provenanceLedger.sourceLinkedRows,
			rangeBackedRows: audit.provenanceLedger.rangeBackedRows,
			behaviouralRows: audit.provenanceLedger.behaviouralRows,
		});
		expect(json.audit.provenanceLedger.rows[0]).toMatchObject({
			description: audit.provenanceLedger.rows[0]?.description,
			sourceLabel: audit.provenanceLedger.rows[0]?.sourceLabel,
			methodologyAsOf: audit.provenanceLedger.rows[0]?.methodologyAsOf,
			riskContributionLabel:
				audit.provenanceLedger.rows[0]?.riskContributionLabel,
		});
		expect(json.audit.liveRisk).toMatchObject({
			breachProbability: audit.liveRisk.breachProbability,
			postReactionBreachProbability:
				audit.liveRisk.postReactionBreachProbability,
			topReactionPackageLabel: audit.liveRisk.topReactionPackageLabel,
			borrowingRegimeLabel: audit.liveRisk.borrowingRegimeLabel,
			borrowingStressRating: audit.liveRisk.borrowingStressRating,
			largestDownsideLayerLabel: audit.liveRisk.largestDownsideLayerLabel,
		});
	}, LONG_AUDIT_TEST_TIMEOUT_MS);
});

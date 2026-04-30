import { describe, expect, it } from "vitest";
import { OBR_BASELINE } from "@/data/baseline/obr-baseline";
import {
	RESEARCH_SCENARIO_FIXTURES,
	type ResearchScenarioFixture,
} from "@/data/research-scenarios";
import {
	projectAgainstBaseline,
	projectFiscalRuleFan,
	projectFiscalRulePriorSensitivity,
	projectFiscalRuleUncertaintyDecomposition,
} from "./baseline-projection";
import { buildMacroStressLab } from "./macro-stress-lab";
import { buildModelAuditEvidencePack } from "./model-audit";
import {
	deserializeScenario,
	evaluateScenario,
	projectScenarioWithGEFeedback,
	serializeScenario,
} from "./scenario";

const REGRESSION_SAMPLES = 32;
const REGRESSION_SEED = 29;

const buildFixtureAudit = (fixture: ResearchScenarioFixture) => {
	const lines = deserializeScenario(fixture.scenario);
	const result = evaluateScenario(lines);
	const ge = projectScenarioWithGEFeedback(result, OBR_BASELINE.years.length);
	const baselineComparison = projectAgainstBaseline(
		ge.withFeedback,
		OBR_BASELINE,
	);
	const fiscalRuleFan = projectFiscalRuleFan(
		result,
		OBR_BASELINE,
		REGRESSION_SAMPLES,
		REGRESSION_SEED,
	);
	const fiscalRulePriorSensitivity = projectFiscalRulePriorSensitivity(
		result,
		OBR_BASELINE,
		REGRESSION_SAMPLES,
		REGRESSION_SEED,
	);
	const fiscalRuleUncertaintyDecomposition =
		projectFiscalRuleUncertaintyDecomposition(
			result,
			OBR_BASELINE,
			REGRESSION_SAMPLES,
			REGRESSION_SEED,
		);
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
	return { lines, result, audit };
};

const expectFinite = (value: number, label: string) => {
	expect(Number.isFinite(value), label).toBe(true);
};

describe("research scenario fixtures", () => {
	it.each(RESEARCH_SCENARIO_FIXTURES)(
		"keeps $name wired into the professional modelling stack",
		(fixture) => {
			const { lines, result, audit } = buildFixtureAudit(fixture);
			const { expected } = fixture;

			expect(lines).toHaveLength(expected.lineCount);
			expect(serializeScenario(lines)).toBe(fixture.scenario);
			expect(audit.scenario.lineCount).toBe(expected.lineCount);
			expect(audit.scenario.taxLineCount).toBe(expected.taxLineCount);
			expect(audit.scenario.programmeLineCount).toBe(
				expected.programmeLineCount,
			);
			expect(audit.scenario.borrowingLineCount).toBe(
				expected.borrowingLineCount,
			);
			expect(audit.scenario.borrowingAmountGbp).toBe(
				expected.borrowingAmountGbp,
			);
			expect(result.net).toBeGreaterThanOrEqual(0);

			const rule = audit.baselineComparison?.rule;
			expect(rule).toBeDefined();
			expectFinite(rule?.adjustedHeadroomGbp ?? Number.NaN, "headroom");
			if (expected.headroomEffect === "improves") {
				expect(rule?.adjustedHeadroomGbp).toBeGreaterThan(
					rule?.baselineHeadroomGbp ?? Number.POSITIVE_INFINITY,
				);
			} else {
				expect(rule?.adjustedHeadroomGbp).toBeLessThan(
					rule?.baselineHeadroomGbp ?? Number.NEGATIVE_INFINITY,
				);
			}

			expect(audit.provenanceLedger.rows).toHaveLength(expected.lineCount);
			expect(audit.provenanceLedger.sourceLinkedRows).toBe(expected.lineCount);
			for (const row of audit.provenanceLedger.rows) {
				expectFinite(row.staticDeltaGbp, `${fixture.id} static delta`);
				expectFinite(row.dynamicDeltaGbp, `${fixture.id} dynamic delta`);
				expectFinite(row.macroFeedbackGbp, `${fixture.id} macro feedback`);
				expectFinite(row.finalYearGeNetGbp, `${fixture.id} GE net`);
			}

			if (expected.requiredContextLabel) {
				expect(
					audit.provenanceLedger.rows.some((row) =>
						row.borrowingContextLabel?.includes(
							expected.requiredContextLabel ?? "",
						),
					),
				).toBe(true);
			}

			if (expected.minBehaviouralTaxLines !== undefined) {
				expect(audit.scenario.behaviouralTaxLines).toBeGreaterThanOrEqual(
					expected.minBehaviouralTaxLines,
				);
			}

			if (expected.requiresBorrowingScenarioMatrix) {
				expect(audit.borrowingScenarioComparison?.amountGbp).toBe(
					expected.borrowingAmountGbp,
				);
				expect(
					audit.borrowingScenarioComparison?.rows.map((row) => row.id),
				).toEqual([
					"current",
					"obr-scored-dmo",
					"unscored-persistent",
					"emergency-backstop",
					"short-funded-unscored",
					"long-funded-scored",
				]);
				expect(
					audit.liveRisk.regimeProbabilities.reduce(
						(sum, row) => sum + row.probability,
						0,
					),
				).toBeCloseTo(1, 6);
			} else {
				expect(audit.borrowingScenarioComparison).toBeNull();
				expect(audit.liveRisk.regimeProbabilities).toHaveLength(0);
			}

			expect(audit.macroStressLab?.parameters.map((row) => row.id)).toEqual([
				"growth",
				"inflation",
				"bank-rate",
				"multipliers",
				"tax-buoyancy",
				"debt-risk-premium",
			]);
			expect(audit.liveRisk.priorSensitivityRows).toHaveLength(4);
			expect(audit.liveRisk.uncertaintyLayers.map((row) => row.label)).toEqual([
				"Central path",
				"Baseline forecast error",
				"Macro shocks",
				"Borrowing regime",
				"Policy reaction",
			]);
		},
	);

	it("distinguishes identical borrowing by institutional context", () => {
		const unscored = buildFixtureAudit(
			RESEARCH_SCENARIO_FIXTURES.find(
				(fixture) => fixture.id === "research-unscored-80bn-borrowing",
			)!,
		).audit.provenanceLedger.rows[0];
		const emergency = buildFixtureAudit(
			RESEARCH_SCENARIO_FIXTURES.find(
				(fixture) =>
					fixture.id === "research-emergency-backstopped-borrowing",
			)!,
		).audit.provenanceLedger.rows[0];

		expect(unscored?.borrowingContextLabel).toContain("Unscored");
		expect(emergency?.borrowingContextLabel).toContain("Emergency");
		expect(emergency?.borrowingExpectedPeakPressureBp ?? 0).toBeLessThan(
			unscored?.borrowingExpectedPeakPressureBp ?? 0,
		);
	});
});

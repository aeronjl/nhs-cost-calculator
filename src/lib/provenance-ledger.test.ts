import { describe, expect, it } from "vitest";
import { buildProvenanceLedger } from "./provenance-ledger";
import { evaluateScenario } from "./scenario";

describe("provenance ledger", () => {
	it("links each scenario line to source, scoring layers, and risk evidence", () => {
		const result = evaluateScenario([
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
		]);

		const ledger = buildProvenanceLedger(result, 5);

		expect(ledger.rows).toHaveLength(2);
		expect(ledger.sourceLinkedRows).toBe(2);
		expect(ledger.totalStaticDeltaGbp).toBe(result.net);
		expect(Number.isFinite(ledger.totalMacroFeedbackGbp)).toBe(true);

		const taxRow = ledger.rows.find((row) => row.lineType === "tax")!;
		expect(taxRow.leverLabel).toBe("basic-rate income tax");
		expect(taxRow.sourceUrl).toMatch(/^https?:\/\//);
		expect(taxRow.methodologyAsOf).toMatch(/^\d{4}-/);
		expect(taxRow.behaviouralAdjustmentGbp).not.toBe(0);
		expect(taxRow.macroFeedbackGbp).not.toBe(0);
		expect(taxRow.uncertaintyBasis).toMatch(/range|estimate/i);

		const borrowRow = ledger.rows.find((row) => row.lineType === "borrow")!;
		expect(borrowRow.borrowingStrategyLabel).toBeTruthy();
		expect(borrowRow.borrowingContextLabel).toContain("Unscored");
		expect(borrowRow.borrowingRegimeLabel).toBeTruthy();
		expect(borrowRow.borrowingRegimeProbability).toBeGreaterThan(0);
		expect(borrowRow.finalYearDebtInterestGbp).toBeGreaterThan(0);
		expect(borrowRow.riskContributionLabel).toContain("pressure");
	});
});

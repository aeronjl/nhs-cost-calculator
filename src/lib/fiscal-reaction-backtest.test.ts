import { describe, expect, it } from "vitest";
import {
	auditFiscalReactionBacktests,
	evaluateFiscalReactionBacktestEpisode,
} from "./fiscal-reaction-backtest";
import { FISCAL_REACTION_BACKTEST_EPISODES } from "@/data/fiscal-reaction-backtests";

describe("fiscal reaction backtests", () => {
	it("audits curated historical consolidation episodes", () => {
		const audit = auditFiscalReactionBacktests();
		expect(audit.rows).toHaveLength(FISCAL_REACTION_BACKTEST_EPISODES.length);
		expect(audit.matches).toBeGreaterThan(0);
		expect(audit.misses).toBeGreaterThan(0);
		expect(audit.meanLeverOverlap).toBeGreaterThanOrEqual(0);
		expect(audit.meanLeverOverlap).toBeLessThanOrEqual(1);
		expect(audit.meanShareDistance).toBeGreaterThanOrEqual(0);
	});

	it("matches the 2022 credibility-repair episode as tax-led", () => {
		const episode = FISCAL_REACTION_BACKTEST_EPISODES.find(
			(item) => item.id === "hunt-2022-autumn-statement",
		)!;
		const row = evaluateFiscalReactionBacktestEpisode(episode);
		expect(row.selectedPackageId).toBe("tax-led");
		expect(row.actualPackageId).toBe("tax-led");
		expect(row.status).toBe("match");
		expect(row.modelComposition?.taxShare).toBeGreaterThan(0.65);
		expect(row.actualComposition.taxShare).toBeGreaterThan(0.65);
	});

	it("flags large spending-led austerity episodes as model misses", () => {
		const episode = FISCAL_REACTION_BACKTEST_EPISODES.find(
			(item) => item.id === "osborne-2010-emergency-budget",
		)!;
		const row = evaluateFiscalReactionBacktestEpisode(episode);
		expect(row.actualPackageId).toBe("spending-led");
		expect(row.selectedPackageId).not.toBe("spending-led");
		expect(row.status).toBe("miss");
		expect(row.diagnosis).toMatch(/politically spending-led/i);
	});

	it("computes share distance and lever overlap for each row", () => {
		const audit = auditFiscalReactionBacktests();
		for (const row of audit.rows) {
			expect(row.actualComposition.grossTighteningGbp).toBeGreaterThan(0);
			expect(row.shareDistance).not.toBeNull();
			expect(row.shareDistance!).toBeGreaterThanOrEqual(0);
			expect(row.shareDistance!).toBeLessThanOrEqual(1);
			expect(row.leverOverlap).toBeGreaterThanOrEqual(0);
			expect(row.leverOverlap).toBeLessThanOrEqual(1);
		}
	});
});

import { describe, expect, it } from "vitest";
import { BORROWING_BACKTEST_EPISODES } from "@/data/borrowing-backtests";
import {
	auditBorrowingRegimeCalibration,
	evaluateBorrowingBacktestEpisode,
	evaluateBorrowingBacktests,
	summarizeBorrowingBacktests,
} from "./borrowing-backtest";

describe("borrowing backtests", () => {
	it("evaluates every curated historical borrowing episode", () => {
		const results = evaluateBorrowingBacktests();
		expect(results).toHaveLength(BORROWING_BACKTEST_EPISODES.length);
		expect(results.every((result) => result.centralPeakPressureBp >= 0)).toBe(
			true,
		);
		expect(results.every((result) => result.finalDebtGdpDeltaPp > 0)).toBe(
			true,
		);
	});

	it("flags the 2022 Growth Plan as requiring a credibility overlay", () => {
		const episode = BORROWING_BACKTEST_EPISODES.find(
			(item) => item.id === "growth-plan-2022",
		)!;
		const result = evaluateBorrowingBacktestEpisode(episode);
		expect(result.centralDiagnosis).toBe("understates");
		expect(result.status).toBe("overlay");
		expect(result.overlayMissBp).toBe(0);
	});

	it("flags pandemic borrowing as requiring a monetary backstop overlay", () => {
		const episode = BORROWING_BACKTEST_EPISODES.find(
			(item) => item.id === "pandemic-borrowing-2020",
		)!;
		const result = evaluateBorrowingBacktestEpisode(episode);
		expect(result.centralDiagnosis).toBe("overstates");
		expect(result.status).toBe("overlay");
		expect(result.overlayMissBp).toBe(0);
	});

	it("passes low-stress scored borrowing through the central model", () => {
		const episode = BORROWING_BACKTEST_EPISODES.find(
			(item) => item.id === "autumn-budget-2024",
		)!;
		const result = evaluateBorrowingBacktestEpisode(episode);
		expect(result.status).toBe("pass");
		expect(result.centralMissBp).toBe(0);
	});

	it("summarises central and overlay audit performance", () => {
		const summary = summarizeBorrowingBacktests();
		expect(summary.centralPasses).toBeLessThan(summary.overlayPasses);
		expect(summary.overlayPasses).toBe(summary.results.length);
		expect(summary.meanOverlayAbsMissBp).toBeLessThan(
			summary.meanCentralAbsMissBp,
		);
		expect(summary.largestMiss?.episode.id).toBe("pandemic-borrowing-2020");
	});

	it("audits regime calibration against labelled historical episodes", () => {
		const audit = auditBorrowingRegimeCalibration();
		expect(audit.rows).toHaveLength(BORROWING_BACKTEST_EPISODES.length);
		expect(audit.triggerWindows.map((window) => window.id).sort()).toEqual([
			"credibility-shock",
			"monetary-backstop",
			"normal",
		]);
		expect(audit.classifierMatches).toBe(audit.rows.length);
		expect(audit.meanLabelProbability).toBeGreaterThan(0.8);
		for (const row of audit.rows) {
			const probabilityTotal = Object.values(row.regimeProbabilities).reduce(
				(sum, value) => sum + value,
				0,
			);
			expect(probabilityTotal).toBeCloseTo(1);
			expect(row.labelledRegimeProbability).toBeGreaterThan(0.7);
		}
	});
});

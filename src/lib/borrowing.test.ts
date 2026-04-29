import { describe, expect, it } from "vitest";
import {
	annualApfCompetingSupplyGbp,
	borrowingRiskPremium,
	effectiveBorrowingRate,
	estimateMonetaryFiscalExposure,
	projectBorrowingFan,
	projectBorrowingMarketReactionPath,
	projectBorrowingPath,
	projectBorrowingStrategyCases,
	projectBorrowingStrategyFrontier,
	projectBorrowingStressCases,
} from "./borrowing";

describe("borrowing model", () => {
	it("treats borrowing as year-1 financing plus ongoing interest cost", () => {
		const path = projectBorrowingPath(10_000_000_000, 5);
		expect(path).toHaveLength(5);
		expect(path[0]!.primaryFinancingGbp).toBe(10_000_000_000);
		expect(path[0]!.netFundingGbp).toBeGreaterThan(9_000_000_000);
		expect(path[1]!.primaryFinancingGbp).toBe(0);
		expect(path[1]!.netFundingGbp).toBeLessThan(0);
		expect(path[4]!.closingDebtGbp).toBeGreaterThan(10_000_000_000);
	});

	it("separates fiscal capacity from PSNB impact", () => {
		const [year1] = projectBorrowingPath(10_000_000_000, 1);
		expect(year1!.netFundingGbp).toBeGreaterThan(0);
		expect(year1!.psnbShiftGbp).toBeLessThan(-10_000_000_000);
	});

	it("debt repayment has the opposite signs", () => {
		const [year1, year2] = projectBorrowingPath(-5_000_000_000, 2);
		expect(year1!.netFundingGbp).toBeLessThan(0);
		expect(year1!.psnbShiftGbp).toBeGreaterThan(5_000_000_000);
		expect(year2!.netFundingGbp).toBeGreaterThan(0);
		expect(year2!.closingDebtGbp).toBeLessThan(-5_000_000_000);
	});

	it("large debt shocks attract higher risk premia", () => {
		const small = borrowingRiskPremium(10_000_000_000, 1, 10_000_000_000);
		const large = borrowingRiskPremium(100_000_000_000, 1, 100_000_000_000);
		expect(large).toBeGreaterThan(small);
	});

	it("Bank Rate and inflation shocks affect the marginal portfolio rate", () => {
		const base = effectiveBorrowingRate(20_000_000_000, 1, 20_000_000_000);
		const stressed = effectiveBorrowingRate(
			20_000_000_000,
			1,
			20_000_000_000,
			{ nominalGrowth: 0.04, bankRate: 0.05, inflation: 0.06 },
		);
		expect(stressed.rate).toBeGreaterThan(base.rate);
		expect(
			stressed.instruments.find((i) => i.id === "index-linked-gilts")?.rate,
		).toBeGreaterThan(
			base.instruments.find((i) => i.id === "index-linked-gilts")?.rate ?? 0,
		);
	});

	it("reports debt sustainability metrics", () => {
		const [year1] = projectBorrowingPath(10_000_000_000, 1);
		expect(Number.isFinite(year1!.rMinusG)).toBe(true);
		expect(Number.isFinite(year1!.stabilisingPrimaryBalanceGbp)).toBe(true);
		expect(year1!.debtInterestPctGdp).toBeGreaterThan(0);
		expect(year1!.refinancingPctGdp).toBeGreaterThan(0);
	});

	it("reports market-absorption metrics without charging small packages", () => {
		const [year1] = projectBorrowingPath(10_000_000_000, 1);
		expect(year1!.absorptionStressIndex).toBeLessThan(1);
		expect(year1!.absorptionPremium).toBe(0);
		expect(year1!.absorptionBottleneck).toBe("none");
		expect(
			year1!.instruments.some(
				(instrument) => instrument.competingApfSupplyGbp > 0,
			),
		).toBe(true);
	});

	it("adds an absorption concession when issuance overloads a maturity bucket", () => {
		const [year1] = projectBorrowingPath(150_000_000_000, 1, {
			strategyId: "short-funded",
		});
		const billSlice = year1!.instruments.find(
			(instrument) => instrument.id === "treasury-bills",
		)!;
		expect(year1!.absorptionStressIndex).toBeGreaterThan(1);
		expect(year1!.absorptionPremium).toBeGreaterThan(0);
		expect(year1!.absorptionBottleneck).toBe("treasury-bills");
		expect(billSlice.absorptionRatio).toBeGreaterThan(1);
		expect(billSlice.absorptionPremium).toBeGreaterThan(0);
		expect(billSlice.netMarketSupplyGbp).toBe(billSlice.marginalIssuanceGbp);
		const longSlice = year1!.instruments.find(
			(instrument) => instrument.id === "long-gilts",
		)!;
		expect(longSlice.netMarketSupplyGbp).toBeGreaterThan(
			longSlice.marginalIssuanceGbp,
		);
	});

	it("estimates monetary-fiscal exposure from reserves and APF stock", () => {
		const exposure = estimateMonetaryFiscalExposure(0.01);
		expect(exposure.reserveInterestCostGbp).toBeGreaterThan(0);
		expect(exposure.apfCashflowProxyGbp).toBeGreaterThan(0);
		expect(exposure.totalExposureGbp).toBe(
			exposure.reserveInterestCostGbp + exposure.apfCashflowProxyGbp,
		);
		expect(exposure.annualApfCompetingSupplyGbp).toBe(
			annualApfCompetingSupplyGbp(),
		);
	});

	it("builds stress cases for rate, inflation, and credibility shocks", () => {
		const cases = projectBorrowingStressCases(20_000_000_000, 5);
		expect(cases.map((c) => c.id)).toEqual([
			"central",
			"rate-shock",
			"inflation-shock",
			"credibility-shock",
		]);
		const centralFinal = cases[0]!.path.at(-1)!;
		const credibilityFinal = cases[3]!.path.at(-1)!;
		expect(credibilityFinal.interestCostGbp).toBeGreaterThan(
			centralFinal.interestCostGbp,
		);
	});

	it("compares financing strategies", () => {
		const cases = projectBorrowingStrategyCases(20_000_000_000, 5);
		expect(cases.map((c) => c.id)).toEqual([
			"dmo-remit",
			"short-funded",
			"long-funded",
			"index-linked-heavy",
		]);
		const short = cases.find((c) => c.id === "short-funded")!.path.at(-1)!;
		const long = cases.find((c) => c.id === "long-funded")!.path.at(-1)!;
		expect(short.refinancingGbp).toBeGreaterThan(long.refinancingGbp);
	});

	it("scores a financing strategy cost-risk frontier", () => {
		const frontier = projectBorrowingStrategyFrontier(20_000_000_000, 5);
		expect(frontier.cases.map((item) => item.id)).toEqual([
			"dmo-remit",
			"short-funded",
			"long-funded",
			"index-linked-heavy",
		]);
		expect(frontier.recommended.objectiveGbp).toBe(
			Math.min(...frontier.cases.map((item) => item.objectiveGbp)),
		);
		const short = frontier.cases.find((item) => item.id === "short-funded")!;
		const long = frontier.cases.find((item) => item.id === "long-funded")!;
		expect(short.refinancingRiskScoreGbp).toBeGreaterThan(
			long.refinancingRiskScoreGbp,
		);
		expect(short.bankRateRiskScoreGbp).toBeGreaterThan(
			long.bankRateRiskScoreGbp,
		);
	});

	it("generates deterministic stochastic borrowing fan bands", () => {
		const a = projectBorrowingFan(20_000_000_000, 5, {}, 200, 99);
		const b = projectBorrowingFan(20_000_000_000, 5, {}, 200, 99);
		expect(a).toEqual(b);
		expect(a).toHaveLength(5);
		const final = a.at(-1)!;
		expect(final.interestCostBand.p95).toBeGreaterThan(
			final.interestCostBand.p5,
		);
		expect(final.centralDebtStockGbp).toBeGreaterThan(20_000_000_000);
	});

	it("adds an endogenous market premium for large borrowing packages", () => {
		const central = projectBorrowingPath(150_000_000_000, 5);
		const reaction = projectBorrowingMarketReactionPath(150_000_000_000, 5);
		expect(reaction.at(-1)!.marketReactionPremium).toBeGreaterThan(0);
		expect(reaction.at(-1)!.interestCostGbp).toBeGreaterThan(
			central.at(-1)!.interestCostGbp,
		);
		expect(reaction.some((year) => year.marketReactionTrigger !== "none")).toBe(
			true,
		);
	});
});

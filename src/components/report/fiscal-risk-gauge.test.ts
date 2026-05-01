import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
	FiscalRuleFan,
	FiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";
import type { PercentileBand } from "@/lib/uncertainty";
import { FiscalRiskGauge } from "./fiscal-risk-gauge";

const flatBand = (value: number): PercentileBand => ({
	p5: value,
	p25: value,
	p50: value,
	p75: value,
	p95: value,
});

const stubFan = (overrides?: Partial<FiscalRuleFan>): FiscalRuleFan => ({
	samples: 500,
	breachProbability: 0.27,
	tightOrBreachProbability: 0.4,
	debtRisingProbability: 0.6,
	pathBands: [],
	headroomBand: {
		p5: -5_000_000_000,
		p25: 1_000_000_000,
		p50: 10_000_000_000,
		p75: 20_000_000_000,
		p95: 30_000_000_000,
	},
	ruleYearPsnbBand: flatBand(20_000_000_000),
	ruleYearDebtGdpBand: flatBand(95),
	policyReactionBand: flatBand(0),
	policyReactionTriggeredProbability: 0.6,
	endogenousReactionGrossBand: {
		p5: 0,
		p25: 0,
		p50: 5_000_000_000,
		p75: 10_000_000_000,
		p95: 18_000_000_000,
	},
	endogenousReactionGdpDragBand: flatBand(0),
	endogenousReactionResidualGapBand: flatBand(0),
	postReactionBreachProbability: 0.11,
	postReactionTightOrBreachProbability: 0.2,
	postReactionDebtRisingProbability: 0.5,
	postReactionHeadroomBand: {
		p5: -1_000_000_000,
		p25: 5_000_000_000,
		p50: 12_000_000_000,
		p75: 22_000_000_000,
		p95: 32_000_000_000,
	},
	postReactionRuleYearPsnbBand: flatBand(15_000_000_000),
	postReactionRuleYearDebtGdpBand: flatBand(93),
	postReactionPolicyReactionBand: flatBand(0),
	reactionPackageMix: [],
	centralHeadroomGbp: 10_000_000_000,
	centralRiskRating: "watch",
	...overrides,
});

describe("FiscalRiskGauge", () => {
	it("returns null when no fan is provided", () => {
		const html = renderToStaticMarkup(
			React.createElement(FiscalRiskGauge, { fiscalRuleFan: undefined }),
		);
		expect(html).toBe("");
	});

	it("renders raw and post-reaction probabilities + dial", () => {
		const html = renderToStaticMarkup(
			React.createElement(FiscalRiskGauge, { fiscalRuleFan: stubFan() }),
		);
		expect(html).toContain("Fiscal-rule breach risk");
		expect(html).toContain("27%");
		expect(html).toContain("11%");
		expect(html).toContain('aria-label="Fiscal-rule breach probability 27%"');
		expect(html).toContain("Raw breach");
		expect(html).toContain("After reaction");
	});

	it("renders the uncertainty layer decomposition when provided", () => {
		const decomposition: FiscalRuleUncertaintyDecomposition = {
			samples: 300,
			centralHeadroomGbp: 10_000_000_000,
			layers: [
				{
					id: "central",
					label: "Central",
					description: "Deterministic central estimate.",
					samples: 1,
					breachProbability: 0,
					tightOrBreachProbability: 0,
					p5DeltaFromPreviousGbp: 0,
					p50DeltaFromPreviousGbp: 0,
					p95DeltaFromPreviousGbp: 0,
					headroomBand: flatBand(10_000_000_000),
				},
				{
					id: "baseline-forecast-error",
					label: "Baseline forecast error",
					description: "OBR forecast tails.",
					samples: 100,
					breachProbability: 0.05,
					tightOrBreachProbability: 0.1,
					p5DeltaFromPreviousGbp: -3_000_000_000,
					p50DeltaFromPreviousGbp: 0,
					p95DeltaFromPreviousGbp: 3_000_000_000,
					headroomBand: {
						p5: 7_000_000_000,
						p25: 9_000_000_000,
						p50: 10_000_000_000,
						p75: 11_000_000_000,
						p95: 13_000_000_000,
					},
				},
				{
					id: "macro-shocks",
					label: "Macro shocks",
					description: "Macro multipliers.",
					samples: 100,
					breachProbability: 0.18,
					tightOrBreachProbability: 0.25,
					p5DeltaFromPreviousGbp: -4_000_000_000,
					p50DeltaFromPreviousGbp: 0,
					p95DeltaFromPreviousGbp: 4_000_000_000,
					headroomBand: {
						p5: 3_000_000_000,
						p25: 7_000_000_000,
						p50: 10_000_000_000,
						p75: 13_000_000_000,
						p95: 17_000_000_000,
					},
				},
				{
					id: "borrowing-regime",
					label: "Borrowing regime",
					description: "Tail-risk gilt regimes.",
					samples: 100,
					breachProbability: 0.27,
					tightOrBreachProbability: 0.35,
					p5DeltaFromPreviousGbp: -2_500_000_000,
					p50DeltaFromPreviousGbp: 0,
					p95DeltaFromPreviousGbp: 2_500_000_000,
					headroomBand: {
						p5: 500_000_000,
						p25: 5_000_000_000,
						p50: 9_500_000_000,
						p75: 13_000_000_000,
						p95: 17_500_000_000,
					},
				},
			],
		};
		const html = renderToStaticMarkup(
			React.createElement(FiscalRiskGauge, {
				fiscalRuleFan: stubFan(),
				fiscalRuleUncertaintyDecomposition: decomposition,
			}),
		);
		expect(html).toContain("Where the risk comes from");
		expect(html).toContain("Baseline forecast error");
		expect(html).toContain("Macro shocks");
		expect(html).toContain("Borrowing regime");
	});
});

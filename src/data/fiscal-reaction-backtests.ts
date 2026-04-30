export type FiscalReactionPackageId =
	| "balanced"
	| "tax-led"
	| "spending-led"
	| "delayed";

export interface FiscalReactionBacktestEpisode {
	id: string;
	budgetId: string;
	label: string;
	date: string;
	chancellor: string;
	targetCorrectionGbp: number;
	actualPackageId: FiscalReactionPackageId;
	actualScenario: string;
	stabilityRuleBreached: boolean;
	growthShock: number;
	inflationShock: number;
	rateStress: number;
	context: string;
	lesson: string;
}

export const FISCAL_REACTION_BACKTEST_EPISODES: readonly FiscalReactionBacktestEpisode[] =
	[
		{
			id: "hunt-2022-autumn-statement",
			budgetId: "autumn-2022",
			label: "Autumn Statement 2022",
			date: "2022-11-17",
			chancellor: "Jeremy Hunt",
			targetCorrectionGbp: 55_000_000_000,
			actualPackageId: "tax-led",
			actualScenario:
				"t:freeze-personal-allowance:2,t:freeze-higher-rate-threshold:2,t:raise-additional-rate-threshold:-25,t:energy-profits-levy:10,t:dividend-allowance:-1.5,t:tax-other:3.55",
			stabilityRuleBreached: true,
			growthShock: -0.006,
			inflationShock: 0.03,
			rateStress: 0.018,
			context:
				"Post-mini-budget credibility repair with high inflation, higher gilt yields, and a large stated consolidation target.",
			lesson:
				"The model should choose tax-led action when fiscal credibility and rate stress dominate.",
		},
		{
			id: "sunak-2021-budget",
			budgetId: "spring-2021",
			label: "Budget 2021",
			date: "2021-03-03",
			chancellor: "Rishi Sunak",
			targetCorrectionGbp: 38_000_000_000,
			actualPackageId: "tax-led",
			actualScenario:
				"t:freeze-personal-allowance:5,t:freeze-higher-rate-threshold:5,t:corporation-tax:6",
			stabilityRuleBreached: true,
			growthShock: -0.003,
			inflationShock: 0.002,
			rateStress: 0.002,
			context:
				"Pandemic borrowing unwind with tax rises announced for later years rather than immediate spending cuts.",
			lesson:
				"The model should still lean tax-led for a large correction, but it cannot yet identify delayed tax implementation as a separate tax-led subtype.",
		},
		{
			id: "osborne-2010-emergency-budget",
			budgetId: "emergency-2010",
			label: "Emergency Budget 2010",
			date: "2010-06-22",
			chancellor: "George Osborne",
			targetCorrectionGbp: 40_000_000_000,
			actualPackageId: "spending-led",
			actualScenario:
				"t:vat-standard:2.5,t:capital-gains-tax:10,t:tax-other:2,p:working-age-welfare:-7,p:education:-3,p:defence:-3",
			stabilityRuleBreached: true,
			growthShock: -0.012,
			inflationShock: 0.006,
			rateStress: 0.003,
			context:
				"Post-financial-crisis consolidation with Coalition preference for welfare and departmental restraint despite a material VAT rise.",
			lesson:
				"This is the key political-economy miss: a rule-only selector tends to choose tax-led for very large gaps, while 2010 was strategically spending-led over the parliament.",
		},
		{
			id: "osborne-2015-summer-budget",
			budgetId: "summer-2015",
			label: "Summer Budget 2015",
			date: "2015-07-08",
			chancellor: "George Osborne",
			targetCorrectionGbp: 12_000_000_000,
			actualPackageId: "spending-led",
			actualScenario: "p:working-age-welfare:-3,t:bank-surcharge:8",
			stabilityRuleBreached: false,
			growthShock: 0.002,
			inflationShock: 0.001,
			rateStress: 0.001,
			context:
				"Medium-sized consolidation framed around a Conservative welfare target rather than market stress.",
			lesson:
				"The model lacks party-preference priors, so it should show this as an expected mismatch.",
		},
		{
			id: "reeves-2024-autumn-budget",
			budgetId: "autumn-2024",
			label: "Autumn Budget 2024",
			date: "2024-10-30",
			chancellor: "Rachel Reeves",
			targetCorrectionGbp: 40_000_000_000,
			actualPackageId: "tax-led",
			actualScenario:
				"t:employer-nics-main:1.2,t:employer-nics-secondary-threshold:-4.1,t:capital-gains-tax:4,t:stamp-duty:0.3,t:energy-profits-levy:3,t:tax-other:2.5",
			stabilityRuleBreached: true,
			growthShock: -0.002,
			inflationShock: 0.004,
			rateStress: 0.006,
			context:
				"Large tax package used to repair inherited headroom while preserving public-service spending plans.",
			lesson:
				"The selector should identify the broad tax-led shape, even if the exact instrument choice differs.",
		},
	];

import type { AnnotatedBudget } from "./budgets/annotated";

export type ResearchScenarioId =
	| "research-unscored-80bn-borrowing"
	| "research-tax-funded-consolidation"
	| "research-emergency-backstopped-borrowing";

export interface ResearchScenarioExpectation {
	lineCount: number;
	taxLineCount: number;
	programmeLineCount: number;
	borrowingLineCount: number;
	borrowingAmountGbp: number;
	headroomEffect: "improves" | "worsens";
	requiredContextLabel?: string;
	minBehaviouralTaxLines?: number;
	requiresBorrowingScenarioMatrix: boolean;
}

export interface ResearchScenarioFixture extends AnnotatedBudget {
	id: ResearchScenarioId;
	templateKind: "research";
	expected: ResearchScenarioExpectation;
}

const BORROWING_METHOD_SOURCE = {
	url: "https://github.com/aeronjl/nhs-cost-calculator/blob/main/docs/borrowing-methodology.md",
	label: "Borrowing methodology appendix",
} as const;

export const RESEARCH_SCENARIO_FIXTURES: readonly ResearchScenarioFixture[] = [
	{
		id: "research-unscored-80bn-borrowing",
		templateKind: "research",
		name: "Research: unscored £80bn borrowing",
		date: "2026-04-30",
		chancellor: "Research fixture",
		party: "Other",
		scenario: "b:80000000000:dmo-remit:ctx=unp",
		shortDescription:
			"Persistent £80bn DMO-style borrowing outside OBR scoring; benchmark for credibility-stress tails.",
		notes:
			"Use this case to check the full borrowing stack: central debt service, market-absorption pressure, regime priors, fiscal-rule fan, policy reaction, and provenance ledger. It deliberately carries explicit unscored/persistent metadata so the classifier does not infer institutional context from issuance arithmetic alone.",
		source: BORROWING_METHOD_SOURCE,
		caveats:
			"This is a reduced-form benchmark, not a forecast of a specific fiscal event. It holds the underlying economy and OBR baseline fixed while changing only the marginal financing package and context metadata.",
		expected: {
			lineCount: 1,
			taxLineCount: 0,
			programmeLineCount: 0,
			borrowingLineCount: 1,
			borrowingAmountGbp: 80_000_000_000,
			headroomEffect: "worsens",
			requiredContextLabel: "Unscored",
			requiresBorrowingScenarioMatrix: true,
		},
	},
	{
		id: "research-tax-funded-consolidation",
		templateKind: "research",
		name: "Research: tax-funded consolidation",
		date: "2026-04-30",
		chancellor: "Research fixture",
		party: "Other",
		scenario:
			"t:basic-rate-income-tax:1,t:employer-nics-main:1,t:vat-standard:0.5,p:working-age-welfare:-2,p:transport:-5",
		shortDescription:
			"Tax-led package with targeted programme restraint; benchmark for headroom repair without new borrowing.",
		notes:
			"Use this case to check marginal-tax-rate elasticities, worker CEV/output effects, distributional incidence, macro feedback, and fiscal-rule headroom repair. The package is intentionally mixed so both tax and programme provenance rows are exercised.",
		source: BORROWING_METHOD_SOURCE,
		caveats:
			"The package is stylised and not a recommendation. Programme cuts are represented as same-year percentage changes; real consolidation would phase measures in and face delivery constraints.",
		expected: {
			lineCount: 5,
			taxLineCount: 3,
			programmeLineCount: 2,
			borrowingLineCount: 0,
			borrowingAmountGbp: 0,
			headroomEffect: "improves",
			minBehaviouralTaxLines: 3,
			requiresBorrowingScenarioMatrix: false,
		},
	},
	{
		id: "research-emergency-backstopped-borrowing",
		templateKind: "research",
		name: "Research: emergency backstopped borrowing",
		date: "2026-04-30",
		chancellor: "Research fixture",
		party: "Other",
		scenario: "b:80000000000:dmo-remit:ctx=eqt",
		shortDescription:
			"Temporary emergency £80bn borrowing with QE/backstop metadata; benchmark for backstop-sensitive risk tails.",
		notes:
			"Use this alongside the unscored case to verify that identical central borrowing can produce different stochastic tails when institutional context changes. The central cash/debt path should still worsen headroom, but backstop metadata should reduce expected market-pressure risk relative to unscored persistent borrowing.",
		source: BORROWING_METHOD_SOURCE,
		caveats:
			"The QE/backstop marker changes regime probabilities and stochastic tails, not the central mechanical debt path. It is a context sensitivity, not an assumption that the Bank of England will finance a given policy.",
		expected: {
			lineCount: 1,
			taxLineCount: 0,
			programmeLineCount: 0,
			borrowingLineCount: 1,
			borrowingAmountGbp: 80_000_000_000,
			headroomEffect: "worsens",
			requiredContextLabel: "Emergency",
			requiresBorrowingScenarioMatrix: true,
		},
	},
];

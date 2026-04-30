import type { EraId } from "@/data/eras";
import type { BaselineMode } from "@/data/historical/era-baselines";
import type { BorrowingScenarioContext } from "./borrowing-context";
import type { ScenarioLine } from "./scenario";
import type { WizardGoal } from "./wizard-goals";

type PolicyScenarioLine = Omit<ScenarioLine, "id">;

export type PolicyScenarioTone =
	| "services"
	| "investment"
	| "consolidation"
	| "tax-switch";

export interface PolicyScenarioPreset {
	id: string;
	era: EraId;
	label: string;
	shortLabel: string;
	description: string;
	fiscalLogic: string;
	badge: string;
	tone: PolicyScenarioTone;
	goal: WizardGoal | null;
	baselineMode?: BaselineMode;
	lines: readonly PolicyScenarioLine[];
}

const emergencyTemporaryBackstop: BorrowingScenarioContext = {
	fiscalEvent: "emergency",
	monetaryBackstop: "qe-backstopped",
	duration: "temporary",
};

const unscoredPersistent: BorrowingScenarioContext = {
	fiscalEvent: "unscored",
	monetaryBackstop: "none",
	duration: "persistent",
};

const obrScoredPersistent: BorrowingScenarioContext = {
	fiscalEvent: "obr-scored",
	monetaryBackstop: "none",
	duration: "persistent",
};

export const POLICY_SCENARIOS_BY_ERA: Readonly<
	Record<EraId, readonly PolicyScenarioPreset[]>
> = {
	current: [
		{
			id: "current-nhs-broad-tax",
			era: "current",
			label: "NHS repair, broad-tax funded",
			shortLabel: "NHS repair",
			description:
				"Materialise the NHS-expansion goal, then pay for it with a mix of income tax, employer NICs, VAT, and fiscal drag.",
			fiscalLogic:
				"Tests a broad, scored funding package against worker CEV, incidence, fiscal-rule headroom, and macro feedback.",
			badge: "Fund NHS",
			tone: "services",
			goal: "fund-nhs",
			lines: [
				{ type: "tax", leverId: "basic-rate-income-tax", magnitude: 1 },
				{ type: "tax", leverId: "employer-nics-main", magnitude: 1 },
				{ type: "tax", leverId: "vat-standard", magnitude: 0.75 },
				{ type: "tax", leverId: "freeze-personal-allowance", magnitude: 1 },
			],
		},
		{
			id: "current-borrow-investment",
			era: "current",
			label: "Borrow to invest",
			shortLabel: "Borrow/invest",
			description:
				"Use long-funded borrowing for a visible capital and services package rather than pretending debt is free fiscal space.",
			fiscalLogic:
				"Exercises the borrowing scenario matrix, debt-service path, market-pressure feedback, and investment multipliers.",
			badge: "Debt financed",
			tone: "investment",
			goal: null,
			lines: [
				{ type: "programme", leverId: "transport", magnitude: 15 },
				{ type: "programme", leverId: "education", magnitude: 5 },
				{ type: "programme", leverId: "nhs-england", magnitude: 5 },
				{
					type: "borrow",
					leverId: "",
					magnitude: 30_000_000_000,
					borrowingStrategyId: "long-funded",
					borrowingContext: obrScoredPersistent,
				},
			],
		},
		{
			id: "current-headroom-repair",
			era: "current",
			label: "Repair fiscal headroom",
			shortLabel: "Headroom repair",
			description:
				"Combine a VAT rise, payroll-tax rise, targeted programme restraint, and modest debt repayment.",
			fiscalLogic:
				"Good for seeing how a consolidation improves fiscal-rule headroom while distributing pain across consumers, employers, and benefit recipients.",
			badge: "Consolidate",
			tone: "consolidation",
			goal: "reduce-borrowing",
			lines: [
				{ type: "tax", leverId: "vat-standard", magnitude: 1 },
				{ type: "tax", leverId: "employer-nics-main", magnitude: 0.5 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -3 },
				{ type: "programme", leverId: "international-aid", magnitude: -10 },
				{ type: "borrow", leverId: "", magnitude: -5_000_000_000 },
			],
		},
	],
	"2021": [
		{
			id: "2021-pandemic-health-catchup",
			era: "2021",
			label: "Pandemic health catch-up",
			shortLabel: "Pandemic catch-up",
			description:
				"Temporary emergency borrowing funds NHS backlogs and working-age support in the Covid fiscal regime.",
			fiscalLogic:
				"Contrasts emergency/QE-backed borrowing tails with the central debt-service path and high-debt fiscal-rule fan.",
			badge: "Emergency",
			tone: "services",
			goal: null,
			lines: [
				{ type: "programme", leverId: "nhs-england", magnitude: 10 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: 3 },
				{
					type: "borrow",
					leverId: "",
					magnitude: 80_000_000_000,
					borrowingStrategyId: "dmo-remit",
					borrowingContext: emergencyTemporaryBackstop,
				},
			],
		},
		{
			id: "2021-levy-funded-recovery",
			era: "2021",
			label: "Levy-funded NHS recovery",
			shortLabel: "Health levy",
			description:
				"Materialise an NHS-expansion goal funded by employee NICs, employer NICs, and the corporation-tax rise legislated after the pandemic.",
			fiscalLogic:
				"Tests payroll-tax incidence against corporation-tax behavioural response in the 2021 high-debt regime.",
			badge: "Fund NHS",
			tone: "services",
			goal: "fund-nhs",
			lines: [
				{ type: "tax", leverId: "nics-main", magnitude: 1.25 },
				{ type: "tax", leverId: "employer-nics-main", magnitude: 1.25 },
				{ type: "tax", leverId: "corporation-tax", magnitude: 6 },
			],
		},
		{
			id: "2021-post-pandemic-consolidation",
			era: "2021",
			label: "Post-pandemic consolidation",
			shortLabel: "Consolidation",
			description:
				"Repair the fiscal position through threshold freezes, corporation tax, aid restraint, and a small debt repayment.",
			fiscalLogic:
				"Surfaces fiscal-drag distribution, business-tax output feedback, and the debt-stock benefit of early repayment.",
			badge: "Debt repair",
			tone: "consolidation",
			goal: "reduce-borrowing",
			lines: [
				{ type: "tax", leverId: "freeze-personal-allowance", magnitude: 4 },
				{ type: "tax", leverId: "freeze-higher-rate-threshold", magnitude: 4 },
				{ type: "tax", leverId: "corporation-tax", magnitude: 6 },
				{ type: "programme", leverId: "international-aid", magnitude: -10 },
				{ type: "borrow", leverId: "", magnitude: -10_000_000_000 },
			],
		},
	],
	"2010": [
		{
			id: "2010-emergency-consolidation",
			era: "2010",
			label: "Emergency consolidation",
			shortLabel: "Austerity mix",
			description:
				"A VAT-led deficit package with welfare, local-government, and education restraint under the post-crisis borrowing baseline.",
			fiscalLogic:
				"Designed to show fiscal-rule repair, weak-demand multiplier damage, and distributional losses in lower deciles.",
			badge: "Deficit cut",
			tone: "consolidation",
			goal: "reduce-borrowing",
			lines: [
				{ type: "tax", leverId: "vat-standard", magnitude: 2.5 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -5 },
				{ type: "programme", leverId: "local-govt-grants", magnitude: -10 },
				{ type: "programme", leverId: "education", magnitude: -3 },
			],
		},
		{
			id: "2010-slower-adjustment",
			era: "2010",
			label: "Slower adjustment path",
			shortLabel: "Go slower",
			description:
				"Use a smaller VAT rise, top-rate income tax, softer programme restraint, and persistent borrowing to phase the adjustment.",
			fiscalLogic:
				"Compares austerity timing against borrowing-cost feedback and the 2010 zero-lower-bound multiplier regime.",
			badge: "Phase-in",
			tone: "investment",
			goal: null,
			lines: [
				{ type: "tax", leverId: "vat-standard", magnitude: 1 },
				{ type: "tax", leverId: "additional-rate-income-tax", magnitude: 5 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -2 },
				{ type: "programme", leverId: "local-govt-grants", magnitude: -3 },
				{
					type: "borrow",
					leverId: "",
					magnitude: 20_000_000_000,
					borrowingStrategyId: "dmo-remit",
					borrowingContext: obrScoredPersistent,
				},
			],
		},
		{
			id: "2010-protect-nhs",
			era: "2010",
			label: "Protect NHS, cut elsewhere",
			shortLabel: "Protect NHS",
			description:
				"Materialise an NHS-protection goal while funding it with VAT and non-health programme cuts.",
			fiscalLogic:
				"Makes the trade-off explicit: service protection is scored against household incidence and delivery-risk in other departments.",
			badge: "Ring-fence",
			tone: "services",
			goal: "fund-nhs",
			lines: [
				{ type: "tax", leverId: "vat-standard", magnitude: 1 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -3 },
				{ type: "programme", leverId: "local-govt-grants", magnitude: -5 },
				{ type: "programme", leverId: "international-aid", magnitude: -20 },
			],
		},
	],
	"1988": [
		{
			id: "1988-lawson-tax-switch",
			era: "1988",
			label: "Lawson-style tax switch",
			shortLabel: "Tax switch",
			description:
				"Cut the top and basic income-tax rates, partly offset through VAT and lower debt repayment.",
			fiscalLogic:
				"Shows a boom-era tax-cut package when baseline borrowing is already in surplus and macro overheating risk is rising.",
			badge: "Tax cut",
			tone: "tax-switch",
			goal: null,
			lines: [
				{ type: "tax", leverId: "additional-rate-income-tax", magnitude: -20 },
				{ type: "tax", leverId: "basic-rate-income-tax", magnitude: -2 },
				{ type: "tax", leverId: "vat-standard", magnitude: 1 },
				{ type: "borrow", leverId: "", magnitude: -5_000_000_000 },
			],
		},
		{
			id: "1988-bank-surplus",
			era: "1988",
			label: "Bank the surplus",
			shortLabel: "Bank surplus",
			description:
				"Use the surplus to repay debt rather than cut tax rates or expand programmes.",
			fiscalLogic:
				"Creates a clean debt-stock sensitivity for a low-borrowing era with smaller marginal risk premia.",
			badge: "Repay debt",
			tone: "consolidation",
			goal: "reduce-borrowing",
			lines: [
				{ type: "borrow", leverId: "", magnitude: -20_000_000_000 },
				{ type: "programme", leverId: "transport", magnitude: -5 },
			],
		},
		{
			id: "1988-spend-the-surplus",
			era: "1988",
			label: "Spend the surplus",
			shortLabel: "Invest surplus",
			description:
				"Convert part of the fiscal surplus into health, education, and transport investment.",
			fiscalLogic:
				"Useful for comparing public-investment multipliers with the lost debt-repayment benefit in a boom regime.",
			badge: "Invest",
			tone: "investment",
			goal: null,
			lines: [
				{ type: "programme", leverId: "nhs-england", magnitude: 5 },
				{ type: "programme", leverId: "education", magnitude: 5 },
				{ type: "programme", leverId: "transport", magnitude: 15 },
				{ type: "borrow", leverId: "", magnitude: -5_000_000_000 },
			],
		},
	],
	"1979": [
		{
			id: "1979-howe-tax-switch",
			era: "1979",
			label: "Howe-style tax switch",
			shortLabel: "Howe switch",
			description:
				"Cut basic and top income-tax rates, raise VAT sharply, and squeeze welfare in a stagflation regime.",
			fiscalLogic:
				"Highlights high-inflation VAT passthrough, very high top-rate behavioural response, and low real multipliers.",
			badge: "Tax switch",
			tone: "tax-switch",
			goal: null,
			lines: [
				{ type: "tax", leverId: "basic-rate-income-tax", magnitude: -3 },
				{ type: "tax", leverId: "additional-rate-income-tax", magnitude: -23 },
				{ type: "tax", leverId: "vat-standard", magnitude: 7 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -3 },
			],
		},
		{
			id: "1979-anti-inflation-squeeze",
			era: "1979",
			label: "Anti-inflation squeeze",
			shortLabel: "Fiscal squeeze",
			description:
				"Raise VAT further, cut current spending, and repay some debt to lean against PSBR.",
			fiscalLogic:
				"Shows the fiscal side of a monetarist squeeze: debt improvement against regressive incidence and output drag.",
			badge: "PSBR repair",
			tone: "consolidation",
			goal: "reduce-borrowing",
			lines: [
				{ type: "tax", leverId: "vat-standard", magnitude: 2 },
				{ type: "programme", leverId: "working-age-welfare", magnitude: -5 },
				{ type: "programme", leverId: "local-govt-grants", magnitude: -5 },
				{ type: "borrow", leverId: "", magnitude: -5_000_000_000 },
			],
		},
		{
			id: "1979-protect-services",
			era: "1979",
			label: "Protect services through borrowing",
			shortLabel: "Protect services",
			description:
				"Protect NHS and pension spending during high inflation, using persistent unscored borrowing to carry the cost.",
			fiscalLogic:
				"A stress case for credibility: it improves services but worsens debt tails in a stagflation setting.",
			badge: "Borrow",
			tone: "services",
			goal: null,
			lines: [
				{ type: "programme", leverId: "nhs-england", magnitude: 8 },
				{ type: "programme", leverId: "state-pension", magnitude: 5 },
				{
					type: "borrow",
					leverId: "",
					magnitude: 20_000_000_000,
					borrowingStrategyId: "short-funded",
					borrowingContext: unscoredPersistent,
				},
			],
		},
	],
};

export const getPolicyScenariosForEra = (
	era: EraId,
): readonly PolicyScenarioPreset[] => POLICY_SCENARIOS_BY_ERA[era];

export const buildPolicyScenarioLines = (
	preset: PolicyScenarioPreset,
): ScenarioLine[] =>
	preset.lines.map((line, index) => ({
		id: `policy-${preset.id}-${index + 1}`,
		...line,
	}));

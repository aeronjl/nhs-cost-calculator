export type FiscalReactionPackageShapeId =
	| "balanced"
	| "tax-led"
	| "spending-led"
	| "delayed";

export type FiscalReactionPriorProfileId =
	| "neutral"
	| "credibility-repair"
	| "public-service-protection"
	| "spending-restraint-mandate"
	| "tax-lock"
	| "late-parliament";

export type FiscalReactionPriorSensitivityCaseId =
	| "neutral"
	| "credibility-repair"
	| "service-protection"
	| "spending-restraint";

export interface FiscalReactionPriorProfile {
	id: FiscalReactionPriorProfileId;
	label: string;
	description: string;
	scoreAdjustments: Partial<Record<FiscalReactionPackageShapeId, number>>;
}

export interface FiscalReactionPriorSensitivityCase {
	id: FiscalReactionPriorSensitivityCaseId;
	label: string;
	description: string;
	priorProfileIds: readonly FiscalReactionPriorProfileId[];
}

export const FISCAL_REACTION_PRIOR_PROFILES: readonly FiscalReactionPriorProfile[] =
	[
		{
			id: "neutral",
			label: "Neutral institutions",
			description:
				"No explicit political-economy tilt beyond fiscal stress, inflation, growth, and rate pressure.",
			scoreAdjustments: {},
		},
		{
			id: "credibility-repair",
			label: "Credibility repair",
			description:
				"Markets, OBR scrutiny, or a fiscal reset favour visible up-front revenue measures over delay.",
			scoreAdjustments: {
				"tax-led": 1.25,
				balanced: 0.25,
				delayed: -0.75,
			},
		},
		{
			id: "public-service-protection",
			label: "Public-service protection",
			description:
				"Protected NHS, schools, defence, or investment commitments make broad programme restraint less available.",
			scoreAdjustments: {
				"tax-led": 1.15,
				balanced: 0.35,
				"spending-led": -0.85,
			},
		},
		{
			id: "spending-restraint-mandate",
			label: "Spending-restraint mandate",
			description:
				"Manifesto, coalition agreement, or spending-review strategy favours welfare and departmental restraint.",
			scoreAdjustments: {
				"spending-led": 2.35,
				balanced: 0.2,
				"tax-led": -0.45,
			},
		},
		{
			id: "tax-lock",
			label: "Tax-lock constraint",
			description:
				"Political pledges or salience constraints make broad headline tax rises less likely.",
			scoreAdjustments: {
				"spending-led": 1.2,
				delayed: 0.45,
				"tax-led": -1,
			},
		},
		{
			id: "late-parliament",
			label: "Late-parliament timing",
			description:
				"A short implementation window favours phased or delayed measures over immediate large packages.",
			scoreAdjustments: {
				delayed: 1.1,
				balanced: 0.25,
				"tax-led": -0.25,
				"spending-led": -0.25,
			},
		},
	];

export const getFiscalReactionPriorProfile = (
	id: FiscalReactionPriorProfileId,
): FiscalReactionPriorProfile =>
	FISCAL_REACTION_PRIOR_PROFILES.find((profile) => profile.id === id) ??
	FISCAL_REACTION_PRIOR_PROFILES[0]!;

export const FISCAL_REACTION_PRIOR_SENSITIVITY_CASES: readonly FiscalReactionPriorSensitivityCase[] =
	[
		{
			id: "neutral",
			label: "Neutral",
			description:
				"Rule arithmetic only; no explicit political or institutional tilt.",
			priorProfileIds: [],
		},
		{
			id: "credibility-repair",
			label: "Credibility repair",
			description:
				"Visible repair after market, OBR, or fiscal-framework pressure.",
			priorProfileIds: ["credibility-repair"],
		},
		{
			id: "service-protection",
			label: "Service protection",
			description:
				"Protected public-service or investment commitments constrain spending cuts.",
			priorProfileIds: ["public-service-protection"],
		},
		{
			id: "spending-restraint",
			label: "Spending restraint",
			description:
				"Mandate or spending-review strategy favours welfare and departmental restraint.",
			priorProfileIds: ["spending-restraint-mandate"],
		},
	];

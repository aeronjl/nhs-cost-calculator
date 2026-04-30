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

export interface FiscalReactionPriorProfile {
	id: FiscalReactionPriorProfileId;
	label: string;
	description: string;
	scoreAdjustments: Partial<Record<FiscalReactionPackageShapeId, number>>;
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

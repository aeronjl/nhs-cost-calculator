import { describe, expect, it } from "vitest";
import { explainPolicyReactionSelection } from "./policy-reaction-packages";

describe("policy reaction package selection", () => {
	it("keeps the rule-only selector tax-led for large credibility-sensitive gaps", () => {
		const selection = explainPolicyReactionSelection({
			policyReactionGbp: 40_000_000_000,
			stabilityRuleBreached: true,
			growthShock: -0.004,
			inflationShock: 0.004,
			rateStress: 0.012,
			mode: "stress-contingent",
		});
		expect(selection.mechanicalSelectedId).toBe("tax-led");
		expect(selection.selectedId).toBe("tax-led");
		expect(
			selection.scores.find((score) => score.id === "tax-led")?.mechanicalScore,
		).toBeGreaterThan(
			selection.scores.find((score) => score.id === "balanced")
				?.mechanicalScore ?? 0,
		);
	});

	it("lets spending-restraint priors override rule-only tax arithmetic", () => {
		const selection = explainPolicyReactionSelection({
			policyReactionGbp: 40_000_000_000,
			stabilityRuleBreached: true,
			growthShock: -0.012,
			inflationShock: 0.006,
			rateStress: 0.003,
			mode: "stress-contingent",
			institutionalPriorProfileIds: ["spending-restraint-mandate"],
		});
		expect(selection.mechanicalSelectedId).toBe("tax-led");
		expect(selection.selectedId).toBe("spending-led");
		expect(
			selection.scores.find((score) => score.id === "spending-led")?.priorScore,
		).toBeGreaterThan(0);
	});

	it("keeps public-service protection on the tax-led side", () => {
		const selection = explainPolicyReactionSelection({
			policyReactionGbp: 35_000_000_000,
			stabilityRuleBreached: true,
			growthShock: -0.002,
			inflationShock: 0.004,
			rateStress: 0.006,
			mode: "stress-contingent",
			institutionalPriorProfileIds: ["public-service-protection"],
		});
		expect(selection.selectedId).toBe("tax-led");
		expect(
			selection.scores.find((score) => score.id === "spending-led")?.priorScore,
		).toBeLessThan(0);
	});
});

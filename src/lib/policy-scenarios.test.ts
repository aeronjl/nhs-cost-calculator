import { describe, expect, it } from "vitest";
import { ERA_ORDER } from "@/data/eras";
import {
	POLICY_SCENARIOS_BY_ERA,
	buildPolicyScenarioLines,
	getPolicyScenariosForEra,
} from "./policy-scenarios";
import { materialiseGoalLine } from "./wizard-goals";
import {
	deserializeScenario,
	evaluateScenario,
	serializeScenario,
} from "./scenario";

describe("policy scenario quick starts", () => {
	it("provides era-specific packages for every wizard era", () => {
		const allIds = new Set<string>();

		for (const era of ERA_ORDER) {
			const presets = getPolicyScenariosForEra(era);
			expect(presets).toHaveLength(3);

			for (const preset of presets) {
				expect(preset.era).toBe(era);
				expect(preset.label).not.toHaveLength(0);
				expect(preset.description).not.toHaveLength(0);
				expect(preset.fiscalLogic).not.toHaveLength(0);
				expect(allIds.has(preset.id)).toBe(false);
				allIds.add(preset.id);
			}
		}
	});

	it("round-trips every preset through scenario encoding and evaluation", () => {
		for (const presets of Object.values(POLICY_SCENARIOS_BY_ERA)) {
			for (const preset of presets) {
				const lines = buildPolicyScenarioLines(preset);
				const goalLine = materialiseGoalLine(preset.goal);
				const fullScenario = goalLine ? [goalLine, ...lines] : lines;
				const encoded = serializeScenario(lines);
				const roundTrip = deserializeScenario(encoded);
				const result = evaluateScenario(fullScenario, { era: preset.era });

				expect(lines.length).toBeGreaterThan(0);
				expect(roundTrip).toHaveLength(lines.length);
				expect(result.lines).toHaveLength(fullScenario.length);
				for (const row of result.lines) {
					expect(Number.isFinite(row.deltaGbp)).toBe(true);
				}
			}
		}
	});

	it("uses materially different packages across fiscal epochs", () => {
		expect(getPolicyScenariosForEra("1979").map((preset) => preset.shortLabel))
			.toEqual(["Howe switch", "Fiscal squeeze", "Protect services"]);
		expect(getPolicyScenariosForEra("2010").map((preset) => preset.shortLabel))
			.toEqual(["Austerity mix", "Go slower", "Protect NHS"]);
		expect(getPolicyScenariosForEra("current").map((preset) => preset.shortLabel))
			.toEqual(["NHS repair", "Borrow/invest", "Headroom repair"]);
	});
});

import { describe, expect, it } from "vitest";
import {
	type ScenarioLine,
	allocationToScenario,
	counterfactualToScenario,
	deserializeScenario,
	diffScenarios,
	evaluateLine,
	evaluateLineDistribution,
	evaluateLineDynamic,
	evaluateScenario,
	evaluateScenarioBand,
	evaluateScenarioDistribution,
	evaluateScenarioDynamic,
	evaluateScenarioMacroPath,
	projectScenarioOverYears,
	projectScenarioWithGEFeedback,
	serializeScenario,
} from "./scenario";

const line = (
	type: ScenarioLine["type"],
	leverId: string,
	magnitude: number,
): ScenarioLine => ({ id: "x", type, leverId, magnitude });

describe("evaluateLine", () => {
	it("a programme cut frees revenue", () => {
		const r = evaluateLine(line("programme", "defence", -10));
		expect(r.deltaGbp).toBeCloseTo(54_000_000_000 * 0.1, -6);
		expect(r.description).toMatch(/^Cut defence by 10\.0%/);
	});

	it("a programme increase requires revenue", () => {
		const r = evaluateLine(line("programme", "nhs-england", 5));
		expect(r.deltaGbp).toBeCloseTo(-165_000_000_000 * 0.05, -6);
		expect(r.description).toMatch(/^Increase NHS England by 5\.0%/);
	});

	it("a tax raise frees revenue", () => {
		const r = evaluateLine(line("tax", "basic-rate-income-tax", 1));
		expect(r.deltaGbp).toBeCloseTo(6_000_000_000, -6);
	});

	it("a threshold freeze raises revenue (years × per-year drag)", () => {
		const r = evaluateLine(line("tax", "freeze-personal-allowance", 3));
		expect(r.deltaGbp).toBeCloseTo(1_500_000_000 * 3, -6);
		expect(r.description).toMatch(/Freeze personal allowance for 3 more years/);
	});

	it("a freeze description uses singular for 1 year", () => {
		const r = evaluateLine(line("tax", "freeze-personal-allowance", 1));
		expect(r.description).toBe("Freeze personal allowance for 1 more year");
	});

	it("an unfreeze (negative magnitude) reads sensibly", () => {
		const r = evaluateLine(line("tax", "freeze-higher-rate-threshold", -2));
		expect(r.deltaGbp).toBeCloseTo(-1_000_000_000 * 2, -6);
		expect(r.description).toMatch(/Unfreeze higher-rate threshold/);
	});

	it("raising a threshold (k unit) loses revenue", () => {
		// raise-personal-allowance: gbpPerUnit = -3bn per £k. Magnitude +1 = raise by £1k.
		const r = evaluateLine(line("tax", "raise-personal-allowance", 1));
		expect(r.deltaGbp).toBe(-3_000_000_000);
		expect(r.description).toMatch(/Raise personal allowance by £1\.00k/);
	});

	it("lowering a threshold gains revenue", () => {
		const r = evaluateLine(line("tax", "raise-personal-allowance", -2));
		expect(r.deltaGbp).toBe(6_000_000_000);
		expect(r.description).toMatch(/Lower personal allowance by £2\.00k/);
	});

	it("the tax-other lever uses bn unit and direct GBP magnitude", () => {
		const r = evaluateLine(line("tax", "tax-other", 2.2));
		expect(r.deltaGbp).toBeCloseTo(2_200_000_000);
		expect(r.description).toMatch(/Other tax measures raising £2\.2bn/);
	});

	it("tax-other negative reads as 'losing'", () => {
		const r = evaluateLine(line("tax", "tax-other", -5));
		expect(r.deltaGbp).toBe(-5_000_000_000);
		expect(r.description).toMatch(/Other tax measures losing £5\.0bn/);
	});

	it("a borrow line frees revenue equal to the magnitude", () => {
		const r = evaluateLine(line("borrow", "", 20_000_000_000));
		expect(r.deltaGbp).toBe(20_000_000_000);
		expect(r.description).toMatch(/^Borrow £20\.0bn/);
	});

	it("a negative borrow line is a debt repayment", () => {
		const r = evaluateLine(line("borrow", "", -5_000_000_000));
		expect(r.deltaGbp).toBe(-5_000_000_000);
		expect(r.description).toMatch(/^Repay £5\.0bn/);
	});
});

describe("evaluateScenario", () => {
	it("an empty scenario has zero net", () => {
		const r = evaluateScenario([]);
		expect(r).toEqual({ freed: 0, required: 0, net: 0, lines: [] });
	});

	it("sums positive and negative deltas separately", () => {
		const r = evaluateScenario([
			line("programme", "defence", -5),
			line("tax", "basic-rate-income-tax", 1),
			line("programme", "nhs-england", 2),
		]);
		expect(r.freed).toBeCloseTo(54_000_000_000 * 0.05 + 6_000_000_000, -6);
		expect(r.required).toBeCloseTo(165_000_000_000 * 0.02, -6);
		expect(r.net).toBeCloseTo(r.freed - r.required, 0);
	});

	it("combining borrow with cuts compounds the freed revenue", () => {
		const r = evaluateScenario([
			line("borrow", "", 10_000_000_000),
			line("programme", "international-aid", -50),
		]);
		// 10bn borrow + 50% of 15bn aid = 7.5bn → total 17.5bn
		expect(r.freed).toBeCloseTo(17_500_000_000, -6);
		expect(r.required).toBe(0);
	});
});

describe("serializeScenario / deserializeScenario", () => {
	it("round-trips a multi-line scenario", () => {
		const lines: ScenarioLine[] = [
			{ id: "a", type: "programme", leverId: "state-pension", magnitude: -3 },
			{
				id: "b",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
			{ id: "c", type: "borrow", leverId: "", magnitude: 20_000_000_000 },
		];
		const s = serializeScenario(lines);
		expect(s).toBe(
			"p:state-pension:-3,t:basic-rate-income-tax:1,b:20000000000",
		);
		const back = deserializeScenario(s);
		expect(back.map(({ id, ...rest }) => rest)).toEqual(
			lines.map(({ id, ...rest }) => rest),
		);
	});

	it("ignores invalid lines", () => {
		const r = deserializeScenario(
			"p:not-a-programme:5,t:basic-rate-income-tax:1,garbage,p::5",
		);
		expect(r).toHaveLength(1);
		expect(r[0]?.leverId).toBe("basic-rate-income-tax");
	});

	it("returns empty for empty input", () => {
		expect(deserializeScenario("")).toEqual([]);
	});

	it("round-trips an overridden line via the :o suffix", () => {
		const lines: ScenarioLine[] = [
			{
				id: "a",
				type: "programme",
				leverId: "state-pension",
				magnitude: -5,
				overridden: true,
			},
			{
				id: "b",
				type: "tax",
				leverId: "basic-rate-income-tax",
				magnitude: 1,
			},
		];
		const s = serializeScenario(lines);
		expect(s).toBe("p:state-pension:-5:o,t:basic-rate-income-tax:1");
		const back = deserializeScenario(s);
		expect(back).toHaveLength(2);
		expect(back[0]?.overridden).toBe(true);
		expect(back[1]?.overridden).toBeUndefined();
	});
});

describe("override penalty", () => {
	it("uses per-rule haircut + premium for state-pension (0.85, -£1.5bn)", () => {
		const normal = evaluateLine({
			id: "a",
			type: "programme",
			leverId: "state-pension",
			magnitude: -5,
		});
		const overridden = evaluateLine({
			id: "b",
			type: "programme",
			leverId: "state-pension",
			magnitude: -5,
			overridden: true,
		});
		// Nominal cut yields ~£6.9bn (5% of £138bn). Per-rule override
		// for triple-lock break: 0.85 haircut, -£1.5bn risk premium.
		// Overridden = 6.9 × 0.85 - 1.5 = 5.865 - 1.5 = 4.365bn.
		expect(normal.deltaGbp).toBeCloseTo(6_900_000_000, -6);
		expect(overridden.deltaGbp).toBeCloseTo(
			6_900_000_000 * 0.85 - 1_500_000_000,
			-6,
		);
		expect(overridden.description).toMatch(/^🔓 \(override\)/);
	});

	it("uses per-rule haircut for wealth-tax (0.65, -£1bn) with 24mo ramp", () => {
		const line = {
			id: "a",
			type: "tax" as const,
			leverId: "wealth-tax",
			magnitude: 11, // £11bn estimated yield
			overridden: true,
		};
		// Year-1 (default): ramp = 12/24 = 0.5 → 11bn × 0.65 × 0.5 - 1bn = 2.575bn
		const year1 = evaluateLine(line);
		expect(year1.deltaGbp).toBeCloseTo(
			11_000_000_000 * 0.65 * 0.5 - 1_000_000_000,
			-6,
		);
		// Year-2: ramp = 24/24 = 1.0 → 11bn × 0.65 - 1bn = 6.15bn
		const year2 = evaluateLine(line, { year: 2 });
		expect(year2.deltaGbp).toBeCloseTo(
			11_000_000_000 * 0.65 - 1_000_000_000,
			-6,
		);
		// Year-3+: same as year-2 (already fully implemented)
		const year5 = evaluateLine(line, { year: 5 });
		expect(year5.deltaGbp).toBeCloseTo(year2.deltaGbp, -6);
	});

	it("falls back to defaults (0.7, -£500m) when relaxation has no override calibration", () => {
		// basic-rate-income-tax has status "available" with no relaxation
		// data, so should use the global defaults.
		const overridden = evaluateLine({
			id: "a",
			type: "tax",
			leverId: "basic-rate-income-tax",
			magnitude: 1,
			overridden: true,
		});
		expect(overridden.deltaGbp).toBe(6_000_000_000 * 0.7 - 500_000_000);
	});

	it("state-pension override has no ramp (12mo lag = full year-1)", () => {
		// implementationMonths=12 → year-1 ramp = 12/12 = 1.0, no ramp.
		const line = {
			id: "a",
			type: "programme" as const,
			leverId: "state-pension",
			magnitude: -5,
			overridden: true,
		};
		const year1 = evaluateLine(line);
		const year2 = evaluateLine(line, { year: 2 });
		expect(year1.deltaGbp).toBeCloseTo(year2.deltaGbp, -6);
	});

	it("LVT override (36mo lag) takes 3 years to fully implement", () => {
		const line = {
			id: "a",
			type: "tax" as const,
			leverId: "land-value-tax",
			magnitude: 30,
			overridden: true,
		};
		// 30bn × 0.75 = 22.5bn nominal yield. Premium -1.5bn.
		// Year 1: ramp = 12/36 = 1/3 → 22.5/3 - 1.5 = 7.5 - 1.5 = 6bn
		// Year 2: ramp = 24/36 = 2/3 → 22.5×2/3 - 1.5 = 15 - 1.5 = 13.5bn
		// Year 3: ramp = 1.0 → 22.5 - 1.5 = 21bn
		const y1 = evaluateLine(line, { year: 1 });
		const y2 = evaluateLine(line, { year: 2 });
		const y3 = evaluateLine(line, { year: 3 });
		expect(y1.deltaGbp).toBeCloseTo(6_000_000_000, -6);
		expect(y2.deltaGbp).toBeCloseTo(13_500_000_000, -6);
		expect(y3.deltaGbp).toBeCloseTo(21_000_000_000, -6);
	});

	it("borrow lines ignore the overridden flag (no rule to break)", () => {
		const normal = evaluateLine({
			id: "a",
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
		});
		const flagged = evaluateLine({
			id: "b",
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
			overridden: true,
		});
		expect(normal.deltaGbp).toBe(10_000_000_000);
		expect(flagged.deltaGbp).toBe(10_000_000_000);
	});
});

describe("allocationToScenario", () => {
	it("produces three lines (tax, borrow, programme cut)", () => {
		const lines = allocationToScenario(
			{ tax: 6_000_000_000, borrow: 10_000_000_000, cut: 5_400_000_000 },
			"basic-rate-income-tax",
			"defence",
		);
		expect(lines).toHaveLength(3);
		const [tax, borrow, prog] = lines;
		expect(tax?.type).toBe("tax");
		expect(tax?.leverId).toBe("basic-rate-income-tax");
		expect(tax?.magnitude).toBeCloseTo(1, 5); // 6bn / 6bn-per-pp = 1pp
		expect(borrow?.type).toBe("borrow");
		expect(borrow?.magnitude).toBe(10_000_000_000);
		expect(prog?.type).toBe("programme");
		expect(prog?.leverId).toBe("defence");
		expect(prog?.magnitude).toBeCloseTo(-10, 5); // 5.4bn / 54bn = 10% cut → -10
	});

	it("preserves the £ totals via evaluateScenario", () => {
		const lines = allocationToScenario(
			{ tax: 3_000_000_000, borrow: 3_000_000_000, cut: 3_000_000_000 },
			"basic-rate-income-tax",
			"defence",
		);
		const result = evaluateScenario(lines);
		// Three lines each freeing £3bn; net should be £9bn freed.
		expect(result.net).toBeCloseTo(9_000_000_000, -6);
		expect(result.freed).toBeCloseTo(9_000_000_000, -6);
		expect(result.required).toBe(0);
	});

	it("survives zero magnitudes (preserves triptych shape)", () => {
		const lines = allocationToScenario(
			{ tax: 0, borrow: 1_000_000_000, cut: 0 },
			"basic-rate-income-tax",
			"defence",
		);
		expect(lines).toHaveLength(3);
		expect(lines[0]?.magnitude).toBeCloseTo(0);
		expect(lines[1]?.magnitude).toBe(1_000_000_000);
		expect(lines[2]?.magnitude).toBeCloseTo(0);
	});
});

describe("counterfactualToScenario", () => {
	it("converts a programme counterfactual to a single-line scenario", () => {
		const lines = counterfactualToScenario({
			type: "programme",
			id: "nhs-england",
			deltaFraction: -0.05,
		});
		expect(lines).toHaveLength(1);
		expect(lines[0]?.type).toBe("programme");
		expect(lines[0]?.leverId).toBe("nhs-england");
		expect(lines[0]?.magnitude).toBeCloseTo(-5, 5);
	});

	it("converts a tax counterfactual to a single-line scenario", () => {
		const lines = counterfactualToScenario({
			type: "tax",
			id: "basic-rate-income-tax",
			deltaPp: 2,
		});
		expect(lines).toHaveLength(1);
		expect(lines[0]?.type).toBe("tax");
		expect(lines[0]?.leverId).toBe("basic-rate-income-tax");
		expect(lines[0]?.magnitude).toBe(2);
	});

	it("preserves the counterfactual's £ delta via evaluateLine", () => {
		const lines = counterfactualToScenario({
			type: "tax",
			id: "basic-rate-income-tax",
			deltaPp: 1,
		});
		const r = evaluateLine(lines[0]!);
		expect(r.deltaGbp).toBe(6_000_000_000);
	});
});

describe("diffScenarios", () => {
	const tax = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}-${magnitude}`,
		type: "tax",
		leverId: id,
		magnitude,
	});
	const programme = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}-${magnitude}`,
		type: "programme",
		leverId: id,
		magnitude,
	});
	const borrow = (magnitude: number): ScenarioLine => ({
		id: `id-borrow-${magnitude}`,
		type: "borrow",
		leverId: "",
		magnitude,
	});

	it("identical scenarios produce no changes (all unchanged)", () => {
		const a = [tax("basic-rate-income-tax", 1)];
		const b = [tax("basic-rate-income-tax", 1)];
		const diff = diffScenarios(a, b);
		expect(diff.removed).toHaveLength(0);
		expect(diff.added).toHaveLength(0);
		expect(diff.modified).toHaveLength(0);
		expect(diff.unchanged).toHaveLength(1);
	});

	it("identifies added lines from incoming scenario", () => {
		const a = [tax("basic-rate-income-tax", 1)];
		const b = [
			tax("basic-rate-income-tax", 1),
			programme("defence", -10),
		];
		const diff = diffScenarios(a, b);
		expect(diff.added).toHaveLength(1);
		expect(diff.added[0]?.leverId).toBe("defence");
	});

	it("identifies removed lines from current scenario", () => {
		const a = [
			tax("basic-rate-income-tax", 1),
			programme("defence", -10),
		];
		const b = [tax("basic-rate-income-tax", 1)];
		const diff = diffScenarios(a, b);
		expect(diff.removed).toHaveLength(1);
		expect(diff.removed[0]?.leverId).toBe("defence");
	});

	it("identifies modified lines (same lever, different magnitude)", () => {
		const a = [tax("basic-rate-income-tax", 1)];
		const b = [tax("basic-rate-income-tax", 2)];
		const diff = diffScenarios(a, b);
		expect(diff.modified).toHaveLength(1);
		expect(diff.modified[0]?.from.magnitude).toBe(1);
		expect(diff.modified[0]?.to.magnitude).toBe(2);
	});

	it("matches borrow lines by type alone (leverId is always empty)", () => {
		const a = [borrow(10_000_000_000)];
		const b = [borrow(20_000_000_000)];
		const diff = diffScenarios(a, b);
		expect(diff.modified).toHaveLength(1);
	});

	it("handles a complex diff with all categories", () => {
		const a = [
			tax("basic-rate-income-tax", 1),
			tax("vat-standard", 2),
			programme("defence", -10),
		];
		const b = [
			tax("basic-rate-income-tax", 1), // unchanged
			tax("vat-standard", 3), // modified
			programme("nhs-england", 5), // added (defence is removed)
		];
		const diff = diffScenarios(a, b);
		expect(diff.unchanged).toHaveLength(1);
		expect(diff.unchanged[0]?.leverId).toBe("basic-rate-income-tax");
		expect(diff.modified).toHaveLength(1);
		expect(diff.modified[0]?.from.leverId).toBe("vat-standard");
		expect(diff.removed).toHaveLength(1);
		expect(diff.removed[0]?.leverId).toBe("defence");
		expect(diff.added).toHaveLength(1);
		expect(diff.added[0]?.leverId).toBe("nhs-england");
	});

	it("empty current vs non-empty incoming = all added", () => {
		const diff = diffScenarios([], [tax("basic-rate-income-tax", 1)]);
		expect(diff.added).toHaveLength(1);
		expect(diff.removed).toHaveLength(0);
	});

	it("non-empty current vs empty incoming = all removed", () => {
		const diff = diffScenarios([tax("basic-rate-income-tax", 1)], []);
		expect(diff.removed).toHaveLength(1);
		expect(diff.added).toHaveLength(0);
	});
});

describe("evaluateLineDistribution", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});
	const progLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "programme",
		leverId: id,
		magnitude,
	});

	it("distributes borrow lines as future debt-service incidence", () => {
		const r = evaluateLine({
			id: "x",
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
		});
		const dist = evaluateLineDistribution(r);
		expect(dist).not.toBeNull();
		expect(dist).toHaveLength(10);
		expect(dist!.every((v) => v > 0)).toBe(true);
		expect(dist![9]).toBeGreaterThan(dist![0]!);
	});

	it("returns null for tax-other (no incidence vector populated)", () => {
		const r = evaluateLine(taxLine("tax-other", 5));
		expect(evaluateLineDistribution(r)).toBeNull();
	});

	it("distributes a basic-rate IT raise across deciles", () => {
		const r = evaluateLine(taxLine("basic-rate-income-tax", 1));
		const dist = evaluateLineDistribution(r);
		expect(dist).not.toBeNull();
		expect(dist).toHaveLength(10);
		// Sum approximately equals the £6bn delta.
		const sum = dist!.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(6_000_000_000, -3);
		// Bottom decile has very small share; middle deciles dominate.
		expect(dist![0]).toBeLessThan(dist![5]!);
	});

	it("distributes a programme cut as positive losses on benefiting deciles", () => {
		const r = evaluateLine(progLine("working-age-welfare", -10));
		// Programme cut → positive deltaGbp → positive per-decile (deciles lose benefit).
		const dist = evaluateLineDistribution(r);
		expect(dist).not.toBeNull();
		expect(dist![0]).toBeGreaterThan(0); // bottom decile loses benefit
		expect(dist![0]).toBeGreaterThan(dist![9]!); // bottom hit hardest
	});

	it("distributes a programme INCREASE as gains (negative per-decile values)", () => {
		const r = evaluateLine(progLine("nhs-england", 5));
		// Programme increase → negative deltaGbp → negative per-decile (deciles gain).
		const dist = evaluateLineDistribution(r);
		expect(dist!.every((v) => v < 0)).toBe(true);
	});
});

describe("evaluateScenarioDistribution", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("aggregates two tax lines per decile", () => {
		const result = evaluateScenario([
			taxLine("basic-rate-income-tax", 1),
			taxLine("vat-standard", 1),
		]);
		const sd = evaluateScenarioDistribution(result);
		expect(sd.modelledLines).toBe(2);
		expect(sd.totalLines).toBe(2);
		expect(sd.perDecile).toHaveLength(10);
		// Sum equals total revenue (basic IT £6bn + VAT £8bn = £14bn)
		const sum = sd.perDecile.reduce((a, b) => a + b, 0);
		expect(sum).toBeCloseTo(14_000_000_000, -3);
	});

	it("reports modelled vs total when some lines lack incidence", () => {
		const result = evaluateScenario([
			taxLine("basic-rate-income-tax", 1),
			taxLine("tax-other", 2), // no incidence
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 5_000_000_000,
			},
		]);
		const sd = evaluateScenarioDistribution(result);
		expect(sd.modelledLines).toBe(2);
		expect(sd.totalLines).toBe(3);
		// modelledDelta includes the basic-rate IT line plus year-5 borrow
		// debt service. tax-other remains unallocated.
		expect(sd.modelledDelta).toBeGreaterThan(6_000_000_000);
		expect(sd.modelledDelta).toBeLessThan(7_000_000_000);
		expect(sd.totalDelta - sd.modelledDelta).toBeCloseTo(2_000_000_000, -3);
	});
});

describe("evaluateLineDynamic", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("calibrates +1pp ready-reckoner tax moves unchanged", () => {
		const r = evaluateLine(taxLine("basic-rate-income-tax", 1));
		const d = evaluateLineDynamic(r);
		expect(d.staticDelta).toBe(6_000_000_000);
		expect(d.dynamicDelta).toBeCloseTo(6_000_000_000);
		expect(d.haircutFraction).toBeCloseTo(0);
		expect(d.outputEffectGbp).toBeLessThan(0);
		expect(d.workerCevGbp).toBeLessThan(0);
	});

	it("CGT shows a nonlinear behavioural adjustment at modest magnitudes", () => {
		const r = evaluateLine(taxLine("capital-gains-tax", 4));
		const d = evaluateLineDynamic(r);
		expect(d.staticDelta).toBeCloseTo(400_000_000);
		expect(d.dynamicDelta).toBeLessThan(d.staticDelta);
		expect(d.dynamicDelta).toBeGreaterThan(300_000_000);
		expect(d.haircutFraction).toBeGreaterThan(0.05);
	});

	it("additional-rate IT uses the marginal-rate model at large moves", () => {
		const r = evaluateLine(taxLine("additional-rate-income-tax", 5));
		const d = evaluateLineDynamic(r);
		expect(d.dynamicDelta).toBeLessThan(d.staticDelta);
		expect(d.haircutFraction).toBeGreaterThan(0.2);
		expect(d.outputEffectGbp).toBeLessThan(0);
	});

	it("returns static unchanged for programme + borrow lines", () => {
		const progEv = evaluateLine({
			id: "x",
			type: "programme",
			leverId: "defence",
			magnitude: -10,
		});
		expect(evaluateLineDynamic(progEv).dynamicDelta).toBe(progEv.deltaGbp);
		expect(evaluateLineDynamic(progEv).haircutFraction).toBe(0);
		expect(evaluateLineDynamic(progEv).workerCevGbp).toBe(0);

		const borrowEv = evaluateLine({
			id: "b",
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
		});
		expect(evaluateLineDynamic(borrowEv).dynamicDelta).toBe(borrowEv.deltaGbp);
	});
});

describe("evaluateScenarioDynamic", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("aggregates dynamic yield across multiple lines", () => {
		const result = evaluateScenario([
			taxLine("basic-rate-income-tax", 5),
			taxLine("capital-gains-tax", 4),
		]);
		const d = evaluateScenarioDynamic(result);
		// Static: £30bn + £400m = £30.4bn
		expect(d.staticNet).toBeCloseTo(30_400_000_000, -3);
		expect(d.dynamicNet).toBeLessThan(d.staticNet);
		expect(d.dynamicNet).toBeGreaterThan(30_000_000_000);
		expect(d.outputEffectGbp).toBeLessThan(0);
		expect(d.workerCevGbp).toBeLessThan(0);
	});

	it("flags lines with non-trivial behavioural adjustments (>5%)", () => {
		const result = evaluateScenario([
			taxLine("basic-rate-income-tax", 1), // calibrated +1pp, not flagged
			taxLine("capital-gains-tax", 4), // nonlinear response, flagged
		]);
		const d = evaluateScenarioDynamic(result);
		expect(d.dynamicLines).toHaveLength(1);
		expect(d.dynamicLines[0]?.line.leverId).toBe("capital-gains-tax");
	});
});

describe("projectScenarioOverYears", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("scales rate-style tax lines with nominal growth + applies year-N macro feedback (Scope B)", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const proj = projectScenarioOverYears(result, 5);
		expect(proj).toHaveLength(5);
		// Year 1: dynamic £6bn × (1 - 0.5 × 0.38) = £6bn × 0.81 = £4.86bn
		expect(proj[0]?.net).toBeCloseTo(6_000_000_000 * 0.81, -3);
		// Year 5: fade shape multiplier = 0.5 × 0.15 = 0.075
		// £6bn × (1.04)^4 × (1 - 0.075 × 0.38) = £6bn × 1.17 × 0.9715
		expect(proj[4]?.net).toBeCloseTo(
			6_000_000_000 * 1.04 ** 4 * (1 - 0.075 * 0.38),
			-3,
		);
	});

	it("borrow line: year-1 cash turns into ongoing debt-service drag", () => {
		const result = evaluateScenario([
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const proj = projectScenarioOverYears(result, 5);
		// Borrowing supplies cash only in year 1. After that it is an
		// interest-cost drag, while PSNB worsens from issuance + debt service.
		expect(proj[0]?.net).toBeGreaterThan(9_000_000_000);
		expect(proj[1]?.net).toBeLessThan(0);
		expect(proj[4]?.net).toBeLessThan(0);
		expect(proj[0]?.psnbShift).toBeLessThan(-10_000_000_000);
		expect(proj[4]?.debtStockDeltaGbp).toBeGreaterThan(10_000_000_000);
	});

	it("freeze line: yield ramps to year-N target then stays (with macro feedback)", () => {
		const result = evaluateScenario([taxLine("freeze-personal-allowance", 3)]);
		const proj = projectScenarioOverYears(result, 5);
		// Freeze multiplier 0.5, fade shape: year multipliers [0.5, 0.35, 0.25, 0.15, 0.075]
		// Year 1: £1.5bn × (1 - 0.5 × 0.38) = £1.5bn × 0.81 = £1.215bn
		expect(proj[0]?.net).toBeCloseTo(1_500_000_000 * 0.81, -3);
		// Year 3: £4.5bn × (1 - 0.25 × 0.38) = £4.5bn × 0.905 = £4.0725bn
		expect(proj[2]?.net).toBeCloseTo(4_500_000_000 * (1 - 0.25 * 0.38), -3);
		// Year 5: £4.5bn × (1 - 0.075 × 0.38) = £4.5bn × 0.9715 = £4.372bn
		expect(proj[4]?.net).toBeCloseTo(
			4_500_000_000 * (1 - 0.075 * 0.38),
			-3,
		);
	});

	it("custom assumptions override defaults", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const high = projectScenarioOverYears(result, 5, {
			nominalGrowth: 0.10,
		});
		const low = projectScenarioOverYears(result, 5, { nominalGrowth: 0.0 });
		expect(high[4]!.net).toBeGreaterThan(low[4]!.net);
	});
});

describe("evaluateScenarioBand", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `id-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("p50 is close to the central estimate for a single rate-style lever", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const band = evaluateScenarioBand(result, 1000, 42);
		expect(band.central).toBeCloseTo(6_000_000_000, -3);
		// p50 should be within ~10% of central for symmetric distribution
		expect(band.p50).toBeGreaterThan(band.central * 0.9);
		expect(band.p50).toBeLessThan(band.central * 1.1);
	});

	it("p5 < p25 < p50 < p75 < p95", () => {
		const result = evaluateScenario([
			taxLine("basic-rate-income-tax", 5),
			taxLine("vat-standard", 2),
		]);
		const band = evaluateScenarioBand(result, 1000, 42);
		expect(band.p5).toBeLessThan(band.p25);
		expect(band.p25).toBeLessThan(band.p50);
		expect(band.p50).toBeLessThan(band.p75);
		expect(band.p75).toBeLessThan(band.p95);
	});

	it("borrow lines stay deterministic (no uncertainty added)", () => {
		const result = evaluateScenario([
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const band = evaluateScenarioBand(result, 1000, 42);
		// Pure borrow → all draws identical
		expect(band.p5).toBe(band.p95);
		expect(band.p50).toBe(10_000_000_000);
	});

	it("scaled magnitude widens the band proportionally", () => {
		const small = evaluateScenarioBand(
			evaluateScenario([taxLine("basic-rate-income-tax", 1)]),
			1000,
			42,
		);
		const big = evaluateScenarioBand(
			evaluateScenario([taxLine("basic-rate-income-tax", 5)]),
			1000,
			42,
		);
		const smallBandWidth = small.p95 - small.p5;
		const bigBandWidth = big.p95 - big.p5;
		expect(bigBandWidth).toBeGreaterThan(smallBandWidth);
	});

	it("is deterministic for the same seed", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const a = evaluateScenarioBand(result, 1000, 42);
		const b = evaluateScenarioBand(result, 1000, 42);
		expect(a).toEqual(b);
	});
});

describe("evaluateScenarioMacro", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `t-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});
	const progLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `p-${id}`,
		type: "programme",
		leverId: id,
		magnitude,
	});

	it("revenue raise produces negative feedback (demand contraction)", async () => {
		const { evaluateScenarioMacro } = await import("./scenario");
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const macro = evaluateScenarioMacro(result);
		// £6bn × 0.5 multiplier × 0.38 tax-to-GDP = ~£1.14bn negative feedback
		// (modulo dynamic adjustment, which is small for basic-rate IT 1pp)
		expect(macro.macroFeedbackGbp).toBeLessThan(0);
		expect(macro.macroFeedbackGbp).toBeGreaterThan(-2_000_000_000);
		expect(macro.secondRoundNet).toBeLessThan(macro.dynamicNet);
	});

	it("revenue cut produces positive feedback (stimulus boosts tax base)", async () => {
		const { evaluateScenarioMacro } = await import("./scenario");
		const result = evaluateScenario([taxLine("basic-rate-income-tax", -1)]);
		const macro = evaluateScenarioMacro(result);
		expect(macro.macroFeedbackGbp).toBeGreaterThan(0);
		expect(macro.secondRoundNet).toBeGreaterThan(macro.dynamicNet);
	});

	it("working-age welfare cut has higher multiplier than IT raise", async () => {
		const { evaluateScenarioMacro } = await import("./scenario");
		const ucCut = evaluateScenario([progLine("working-age-welfare", -10)]);
		const itRaise = evaluateScenario([taxLine("basic-rate-income-tax", 5)]);
		const macroUC = evaluateScenarioMacro(ucCut);
		const macroIT = evaluateScenarioMacro(itRaise);
		// Compare feedback fraction (relative to dynamic delta)
		const ucFraction =
			Math.abs(macroUC.macroFeedbackGbp / macroUC.dynamicNet);
		const itFraction =
			Math.abs(macroIT.macroFeedbackGbp / macroIT.dynamicNet);
		// UC multiplier (0.9) should give larger feedback fraction than IT (0.5)
		expect(ucFraction).toBeGreaterThan(itFraction);
	});

	it("flags lines with significant macro feedback (>5% of dynamic)", async () => {
		const { evaluateScenarioMacro } = await import("./scenario");
		const result = evaluateScenario([
			taxLine("vat-standard", 1), // multiplier 0.7 → ~26% feedback
		]);
		const macro = evaluateScenarioMacro(result);
		expect(macro.macroLines.length).toBe(1);
		expect(macro.macroLines[0]!.feedbackFraction).toBeGreaterThan(0.2);
	});

	it("borrow lines have no macro feedback (financing, not policy)", async () => {
		const { evaluateScenarioMacro } = await import("./scenario");
		const result = evaluateScenario([
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const macro = evaluateScenarioMacro(result);
		expect(macro.macroFeedbackGbp).toBe(0);
		expect(macro.secondRoundNet).toBe(macro.dynamicNet);
	});
});

describe("evaluateScenarioMacroPath (Scope B)", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `t-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("returns one MacroState per year", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 1)]);
		const path = evaluateScenarioMacroPath(result, 5);
		expect(path).toHaveLength(5);
		expect(path[0]?.year).toBe(1);
		expect(path[4]?.year).toBe(5);
	});

	it("VAT raise produces a year-1 CPI deviation > 0 (passthrough)", () => {
		const result = evaluateScenario([taxLine("vat-standard", 2)]);
		const path = evaluateScenarioMacroPath(result, 5);
		expect(path[0]!.cpiDeviationPp).toBeGreaterThan(0);
	});

	it("Income tax raise has zero direct CPI passthrough", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 5)]);
		const path = evaluateScenarioMacroPath(result, 5);
		// Income tax has no cpiPassthrough → year-1 CPI deviation = 0
		expect(path[0]!.cpiDeviationPp).toBeCloseTo(0, 5);
	});

	it("VAT spike-shape CPI fades quickly across years", () => {
		const result = evaluateScenario([taxLine("vat-standard", 2)]);
		const path = evaluateScenarioMacroPath(result, 5);
		// Year 1 spike, year 2+ much smaller (spike pathShape: [1.0, 0.3, 0.1, 0.05, 0.02])
		expect(path[0]!.cpiDeviationPp).toBeGreaterThan(
			path[1]!.cpiDeviationPp * 2,
		);
	});

	it("revenue raise produces negative GDP deviation", () => {
		const result = evaluateScenario([taxLine("basic-rate-income-tax", 5)]);
		const path = evaluateScenarioMacroPath(result, 5);
		// Tax raise → fiscal contraction → GDP falls
		expect(path[0]!.gdpDeviationPct).toBeLessThan(0);
	});

	it("debt:GDP shifts down for revenue-raising scenarios", () => {
		const result = evaluateScenario([taxLine("vat-standard", 2)]);
		const path = evaluateScenarioMacroPath(result, 5);
		// Sustained revenue raise → cumulative PSNB reduction → debt:GDP falls
		expect(path[4]!.debtGdpDeviationPp).toBeLessThan(0);
	});

	it("gilt yield response is proportional to debt:GDP shift", () => {
		const result = evaluateScenario([taxLine("vat-standard", 5)]);
		const path = evaluateScenarioMacroPath(result, 5);
		const ratio =
			path[4]!.giltYieldDeviationPp / path[4]!.debtGdpDeviationPp;
		// Gilt response coefficient ≈ 0.0005 × 100 (pp scale) = 0.05
		expect(ratio).toBeCloseTo(0.05, 4);
	});

	it("empty scenario produces zero macro state every year", () => {
		const result = evaluateScenario([]);
		const path = evaluateScenarioMacroPath(result, 5);
		for (const s of path) {
			expect(s.cpiDeviationPp).toBeCloseTo(0);
			expect(s.gdpDeviationPct).toBeCloseTo(0);
			expect(s.debtGdpDeviationPp).toBeCloseTo(0);
		}
	});
});

describe("projectScenarioWithGEFeedback (Scope C)", () => {
	const taxLine = (id: string, magnitude: number): ScenarioLine => ({
		id: `t-${id}`,
		type: "tax",
		leverId: id,
		magnitude,
	});

	it("returns both no-feedback and with-feedback paths + macro path", () => {
		const result = evaluateScenario([taxLine("vat-standard", 2)]);
		const r = projectScenarioWithGEFeedback(result, 5);
		expect(r.noFeedback).toHaveLength(5);
		expect(r.withFeedback).toHaveLength(5);
		expect(r.macroPath).toHaveLength(5);
	});

	it("VAT raise → CPI up → freeze drag amplifies (CPI feedback channel)", () => {
		const result = evaluateScenario([
			taxLine("vat-standard", 2),
			taxLine("freeze-personal-allowance", 3),
		]);
		const r = projectScenarioWithGEFeedback(result, 5);
		// With CPI deviation > 0 from VAT, the freeze line should produce more
		// revenue under feedback than without.
		expect(r.withFeedback[2]!.net).toBeGreaterThan(r.noFeedback[2]!.net);
	});

	it("revenue-raising scenario → debt:GDP down → gilt yields fall (gilt feedback channel)", () => {
		const result = evaluateScenario([
			taxLine("vat-standard", 5),
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 10_000_000_000,
			},
		]);
		const r = projectScenarioWithGEFeedback(result, 5);
		// debt:GDP shifts down, so gilt yield deviation is negative,
		// so borrow servicing cost is lower → withFeedback net > noFeedback net
		// (year 5)
		expect(r.macroPath[4]!.giltYieldDeviationPp).toBeLessThan(0);
		expect(r.withFeedback[4]!.net).toBeGreaterThan(r.noFeedback[4]!.net);
	});

	it("scenario with no CPI shock → freeze line yield matches no-feedback", () => {
		// Freeze alone with no VAT/fuel-duty contributors → cpiDeviation ≈ 0
		// → no CPI amplification on freeze line.
		const result = evaluateScenario([
			taxLine("freeze-personal-allowance", 3),
		]);
		const r = projectScenarioWithGEFeedback(result, 5);
		// Should be very close (some tiny differences from gilt feedback round)
		expect(Math.abs(r.withFeedback[2]!.net - r.noFeedback[2]!.net)).toBeLessThan(
			Math.abs(r.noFeedback[2]!.net) * 0.01,
		);
	});

	it("empty scenario → zero everywhere", () => {
		const r = projectScenarioWithGEFeedback(evaluateScenario([]), 5);
		for (const y of r.withFeedback) {
			expect(y.net).toBe(0);
		}
	});

	it("borrow line uses year-N gilt yield rather than fixed 4.5%", () => {
		const result = evaluateScenario([
			taxLine("vat-standard", 5),
			{
				id: "b",
				type: "borrow",
				leverId: "",
				magnitude: 20_000_000_000,
			},
		]);
		const r = projectScenarioWithGEFeedback(result, 5);
		// The macro path should have non-zero gilt yield deviation at year 5
		expect(Math.abs(r.macroPath[4]!.giltYieldDeviationPp)).toBeGreaterThan(0);
		// And with-feedback borrow servicing should differ from no-feedback
		// (this is hard to isolate at the year-net level, but checking that
		// at least the with-feedback path doesn't equal no-feedback)
		expect(r.withFeedback[4]!.net).not.toBe(r.noFeedback[4]!.net);
	});
});

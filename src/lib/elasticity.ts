// Behavioural response model per tax lever.
//
// HMRC ready-reckoner figures are usually "direct effects": they already
// include the standard policy-costing behavioural response for a small
// illustrative change, but not the wider macro feedback modelled in
// macro.ts. To avoid double-counting, most levers calibrate the tax base so
// that a +1 unit move reproduces the ready-reckoner value, then use the
// marginal tax wedge and the government-style elasticity to score larger or
// opposite-signed moves.

export type BehaviouralTaxType =
	| "labour-income"
	| "payroll"
	| "dividends"
	| "corporate-profits"
	| "capital-gains"
	| "inheritance"
	| "consumption"
	| "commodity-duty";

export type BehaviouralCalibration =
	| "post-behavioural-ready-reckoner"
	| "mechanical";

interface BehaviouralBase {
	taxType: BehaviouralTaxType;
	calibration: BehaviouralCalibration;
	// Share of incidence that falls on workers. Used for a reduced-form
	// consumption-equivalent welfare line; distribution.ts still owns the
	// decile split.
	workerIncidenceShare: number;
	// Share of the behavioural base movement treated as UK output/supply
	// rather than timing, avoidance, imported consumption, or pure shifting.
	outputShare: number;
	note: string;
	source?: { url: string; label: string };
}

export interface MarginalRateBehaviour extends BehaviouralBase {
	kind: "marginal-rate";
	// Full marginal wedge affected by the lever. For income tax this can be
	// statutory IT plus NICs when the relevant behavioural margin is labour.
	currentMarginalRate: number;
	// Elasticity of the taxable base with respect to the net-of-tax rate
	// (or gross consumer price for VAT-style taxes).
	taxableBaseElasticity: number;
	response: "net-of-tax" | "gross-price";
}

export interface UnitPriceBehaviour extends BehaviouralBase {
	kind: "unit-price";
	// Duty and pump/consumer price are in pounds per physical unit.
	currentDutyPerUnit: number;
	taxInclusivePricePerUnit: number;
	demandElasticity: number;
}

export interface PostBehaviouralReadyReckoner extends BehaviouralBase {
	kind: "post-behavioural-ready-reckoner";
}

// Backward-compatible shape for older tests/fixtures. New tax levers should
// use MarginalRateBehaviour or UnitPriceBehaviour instead.
export interface LinearElasticity {
	kind?: "linear-haircut";
	coefficient: number;
	note: string;
	source?: { url: string; label: string };
}

export type BehaviouralModel =
	| MarginalRateBehaviour
	| UnitPriceBehaviour
	| PostBehaviouralReadyReckoner
	| LinearElasticity;

export type Elasticity = BehaviouralModel;

export interface BehaviouralEvaluation {
	staticDelta: number;
	dynamicDelta: number;
	behaviouralAdjustmentGbp: number;
	adjustmentFraction: number;
	outputEffectGbp: number;
	workerCevGbp: number;
	model: BehaviouralModel | undefined;
}

export interface BehaviouralModelSummary {
	title: string;
	rows: { label: string; value: string }[];
	note?: string;
	source?: { url: string; label: string };
}

const clampRate = (rate: number): number =>
	Math.max(0, Math.min(0.99, rate));

const safePow = (base: number, exponent: number): number =>
	Math.pow(Math.max(0.0001, base), exponent);

const adjustmentFraction = (staticDelta: number, dynamicDelta: number): number =>
	staticDelta === 0
		? 0
		: Math.abs(dynamicDelta - staticDelta) / Math.abs(staticDelta);

const workerCev = (
	dynamicDelta: number,
	outputEffectGbp: number,
	model: BehaviouralBase,
): number =>
	-dynamicDelta * model.workerIncidenceShare +
	outputEffectGbp * model.workerIncidenceShare;

const baseRatioForRate = (
	model: MarginalRateBehaviour,
	newRate: number,
): number => {
	if (model.response === "gross-price") {
		return safePow(
			(1 + model.currentMarginalRate) / (1 + newRate),
			model.taxableBaseElasticity,
		);
	}
	return safePow(
		(1 - newRate) / (1 - model.currentMarginalRate),
		model.taxableBaseElasticity,
	);
};

const rawRevenueDeltaForRate = (
	model: MarginalRateBehaviour,
	magnitude: number,
): { rawDelta: number; baseRatio: number; newRate: number } => {
	const oldRate = clampRate(model.currentMarginalRate);
	const newRate = clampRate(oldRate + magnitude / 100);
	const baseRatio = baseRatioForRate(
		{ ...model, currentMarginalRate: oldRate },
		newRate,
	);
	return {
		rawDelta: newRate * baseRatio - oldRate,
		baseRatio,
		newRate,
	};
};

const evaluateMarginalRate = (
	staticDelta: number,
	model: MarginalRateBehaviour,
	magnitude: number,
): BehaviouralEvaluation => {
	if (magnitude === 0 || staticDelta === 0) {
		return emptyEvaluation(staticDelta, model);
	}
	const perUnitDelta = staticDelta / magnitude;
	const unitDirection = magnitude < 0 ? -1 : 1;
	const calibrationRaw =
		model.calibration === "mechanical"
			? 0.01
			: rawRevenueDeltaForRate(model, unitDirection).rawDelta / unitDirection;
	if (calibrationRaw === 0) return emptyEvaluation(staticDelta, model);
	const base = perUnitDelta / calibrationRaw;
	const { rawDelta, baseRatio } = rawRevenueDeltaForRate(model, magnitude);
	const dynamicDelta = base * rawDelta;
	const outputEffectGbp = base * (baseRatio - 1) * model.outputShare;
	return {
		staticDelta,
		dynamicDelta,
		behaviouralAdjustmentGbp: dynamicDelta - staticDelta,
		adjustmentFraction: adjustmentFraction(staticDelta, dynamicDelta),
		outputEffectGbp,
		workerCevGbp: workerCev(dynamicDelta, outputEffectGbp, model),
		model,
	};
};

const rawRevenueDeltaForUnitPrice = (
	model: UnitPriceBehaviour,
	magnitude: number,
): { rawDelta: number; volumeRatio: number; newDuty: number } => {
	const oldDuty = Math.max(0, model.currentDutyPerUnit);
	const newDuty = Math.max(0, oldDuty + magnitude / 100);
	const newPrice = Math.max(
		0.01,
		model.taxInclusivePricePerUnit + (newDuty - oldDuty),
	);
	const volumeRatio = safePow(
		model.taxInclusivePricePerUnit / newPrice,
		model.demandElasticity,
	);
	return {
		rawDelta: newDuty * volumeRatio - oldDuty,
		volumeRatio,
		newDuty,
	};
};

const evaluateUnitPrice = (
	staticDelta: number,
	model: UnitPriceBehaviour,
	magnitude: number,
): BehaviouralEvaluation => {
	if (magnitude === 0 || staticDelta === 0) {
		return emptyEvaluation(staticDelta, model);
	}
	const perUnitDelta = staticDelta / magnitude;
	const unitDirection = magnitude < 0 ? -1 : 1;
	const calibrationRaw =
		model.calibration === "mechanical"
			? 0.01
			: rawRevenueDeltaForUnitPrice(model, unitDirection).rawDelta /
				unitDirection;
	if (calibrationRaw === 0) return emptyEvaluation(staticDelta, model);
	const volume = perUnitDelta / calibrationRaw;
	const { rawDelta, volumeRatio } = rawRevenueDeltaForUnitPrice(
		model,
		magnitude,
	);
	const dynamicDelta = volume * rawDelta;
	const outputEffectGbp =
		volume *
		(volumeRatio - 1) *
		model.taxInclusivePricePerUnit *
		model.outputShare;
	return {
		staticDelta,
		dynamicDelta,
		behaviouralAdjustmentGbp: dynamicDelta - staticDelta,
		adjustmentFraction: adjustmentFraction(staticDelta, dynamicDelta),
		outputEffectGbp,
		workerCevGbp: workerCev(dynamicDelta, outputEffectGbp, model),
		model,
	};
};

const evaluateLinear = (
	staticDelta: number,
	model: LinearElasticity,
	magnitude: number,
): BehaviouralEvaluation => {
	const haircut = Math.min(0.95, model.coefficient * Math.abs(magnitude));
	const dynamicDelta = staticDelta * (1 - haircut);
	return {
		staticDelta,
		dynamicDelta,
		behaviouralAdjustmentGbp: dynamicDelta - staticDelta,
		adjustmentFraction: haircut,
		outputEffectGbp: 0,
		workerCevGbp: 0,
		model,
	};
};

const emptyEvaluation = (
	staticDelta: number,
	model?: BehaviouralModel,
): BehaviouralEvaluation => ({
	staticDelta,
	dynamicDelta: staticDelta,
	behaviouralAdjustmentGbp: 0,
	adjustmentFraction: 0,
	outputEffectGbp: 0,
	workerCevGbp: 0,
	model,
});

const formatPct = (n: number, digits = 1): string =>
	`${(n * 100).toFixed(digits)}%`;

const formatSignedPct = (n: number, digits = 1): string => {
	const sign = n > 0 ? "+" : "";
	return `${sign}${formatPct(n, digits)}`;
};

const formatPence = (n: number): string => `${(n * 100).toFixed(2)}p`;

const taxTypeLabel = (type: BehaviouralTaxType): string => {
	switch (type) {
		case "labour-income":
			return "Labour income";
		case "payroll":
			return "Payroll";
		case "dividends":
			return "Dividends";
		case "corporate-profits":
			return "Corporate profits";
		case "capital-gains":
			return "Capital gains";
		case "inheritance":
			return "Inheritance";
		case "consumption":
			return "Consumption";
		case "commodity-duty":
			return "Commodity duty";
	}
};

const calibrationLabel = (calibration: BehaviouralCalibration): string =>
	calibration === "post-behavioural-ready-reckoner"
		? "Calibrated to HMRC direct effect"
		: "Mechanical base";

export const describeBehaviouralModel = (
	model: BehaviouralModel | undefined,
	magnitude = 1,
): BehaviouralModelSummary | null => {
	if (!model) return null;
	if ("coefficient" in model) {
		return {
			title: "Behavioural model",
			rows: [
				{ label: "Type", value: "Linear haircut" },
				{
					label: "Coefficient",
					value: `${formatPct(model.coefficient, 1)} per unit`,
				},
				{
					label: "Adjustment",
					value: formatPct(
						Math.min(0.95, model.coefficient * Math.abs(magnitude)),
						1,
					),
				},
			],
			note: model.note,
			source: model.source,
		};
	}
	if (model.kind === "post-behavioural-ready-reckoner") {
		return {
			title: "Behavioural model",
			rows: [
				{ label: "Type", value: taxTypeLabel(model.taxType) },
				{ label: "Calibration", value: calibrationLabel(model.calibration) },
				{
					label: "Worker incidence",
					value: formatPct(model.workerIncidenceShare, 0),
				},
				{ label: "Output share", value: formatPct(model.outputShare, 0) },
			],
			note: model.note,
			source: model.source,
		};
	}
	if (model.kind === "unit-price") {
		const oldDuty = model.currentDutyPerUnit;
		const newDuty = Math.max(0, oldDuty + magnitude / 100);
		const newPrice = Math.max(0.01, model.taxInclusivePricePerUnit + newDuty - oldDuty);
		const { volumeRatio } = rawRevenueDeltaForUnitPrice(model, magnitude);
		return {
			title: "Behavioural model",
			rows: [
				{ label: "Type", value: taxTypeLabel(model.taxType) },
				{ label: "Duty", value: `${formatPence(oldDuty)} → ${formatPence(newDuty)}` },
				{
					label: "Price",
					value: `£${model.taxInclusivePricePerUnit.toFixed(2)} → £${newPrice.toFixed(2)}`,
				},
				{ label: "Demand elasticity", value: model.demandElasticity.toFixed(2) },
				{ label: "Volume response", value: formatSignedPct(volumeRatio - 1, 1) },
				{ label: "Calibration", value: calibrationLabel(model.calibration) },
				{
					label: "Worker incidence",
					value: formatPct(model.workerIncidenceShare, 0),
				},
				{ label: "Output share", value: formatPct(model.outputShare, 0) },
			],
			note: model.note,
			source: model.source,
		};
	}
	const oldRate = clampRate(model.currentMarginalRate);
	const newRate = clampRate(oldRate + magnitude / 100);
	const { baseRatio } = rawRevenueDeltaForRate(model, magnitude);
	const elasticityLabel =
		model.response === "gross-price" ? "Demand elasticity" : "ETI";
	return {
		title: "Behavioural model",
		rows: [
			{ label: "Type", value: taxTypeLabel(model.taxType) },
			{ label: "Marginal rate", value: `${formatPct(oldRate, 1)} → ${formatPct(newRate, 1)}` },
			{ label: elasticityLabel, value: model.taxableBaseElasticity.toFixed(2) },
			{
				label: "Base response",
				value: formatSignedPct(baseRatio - 1, 1),
			},
			{
				label: "Response margin",
				value: model.response === "gross-price" ? "Gross price" : "Net-of-tax rate",
			},
			{ label: "Calibration", value: calibrationLabel(model.calibration) },
			{
				label: "Worker incidence",
				value: formatPct(model.workerIncidenceShare, 0),
			},
			{ label: "Output share", value: formatPct(model.outputShare, 0) },
		],
		note: model.note,
		source: model.source,
	};
};

export const evaluateBehaviouralResponse = (
	staticDelta: number,
	model: BehaviouralModel | undefined,
	magnitude: number,
): BehaviouralEvaluation => {
	if (!model) return emptyEvaluation(staticDelta);
	if ("coefficient" in model) return evaluateLinear(staticDelta, model, magnitude);
	if (model.kind === "post-behavioural-ready-reckoner") {
		return emptyEvaluation(staticDelta, model);
	}
	if (model.kind === "unit-price") {
		return evaluateUnitPrice(staticDelta, model, magnitude);
	}
	return evaluateMarginalRate(staticDelta, model, magnitude);
};

export const dynamicAdjust = (
	staticDelta: number,
	model: BehaviouralModel | undefined,
	magnitude: number,
): number => evaluateBehaviouralResponse(staticDelta, model, magnitude).dynamicDelta;

export const haircutAmount = (
	staticDelta: number,
	model: BehaviouralModel | undefined,
	magnitude: number,
): number =>
	staticDelta -
	evaluateBehaviouralResponse(staticDelta, model, magnitude).dynamicDelta;

export const haircutFraction = (
	model: BehaviouralModel | undefined,
	magnitude: number,
	staticDelta = magnitude,
): number =>
	evaluateBehaviouralResponse(staticDelta, model, magnitude).adjustmentFraction;

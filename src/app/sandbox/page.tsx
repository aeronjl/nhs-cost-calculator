import type { Metadata } from "next";
import SimulatorWorkspace from "../SimulatorWorkspace";
import {
	evaluateScenario,
	serializeScenario,
} from "@/lib/scenario";
import { loadResolvedComparisons } from "@/data/comparisons";
import { loadResolvedBaseline } from "@/data/baseline/obr-baseline";
import {
	type ResolvedSimulator,
	counterfactualPropsFromSimulator,
	resolveSimulatorState,
	tradeOffPropsFromSimulator,
} from "@/lib/url-state";
import { evaluateCounterfactual } from "@/lib/counterfactual";
import { getUsdPerGbp } from "@/lib/fx";
import { formatMoney } from "../utils/formatters";

// Free-form scenario sandbox — power-user editor with the full lever rail
// (25+ taxes, 10 programmes, borrowing), templates drawer, and three
// editor modes (triptych / single / stack). Sits behind the wizard at /
// (which is now the main entry); kept reachable here for users who want
// to skip the guided flow or refine a scenario at full lever depth.

type SearchParams = Promise<{
	id?: string;
	q?: string;
	a?: string;
	slice?: string;
	to_goal?: string;
	to_q?: string;
	to_amount?: string;
	to_tax?: string;
	to_prog?: string;
	to_split?: string;
	cf_mode?: string;
	cf_prog?: string;
	cf_pct?: string;
	cf_tax?: string;
	cf_pp?: string;
	scenario?: string;
	editor?: string;
	g?: string;
	gq?: string;
	ga?: string;
}>;

const buildScenarioOgQuery = (sim: ResolvedSimulator): string => {
	const qs = new URLSearchParams();
	const scenarioStr = serializeScenario(sim.scenario);
	if (scenarioStr) qs.set("scenario", scenarioStr);
	if (sim.editor !== "stack") qs.set("editor", sim.editor);
	if (sim.goalId) qs.set("g", sim.goalId);
	if (sim.goalQuantity > 1) qs.set("gq", String(sim.goalQuantity));
	if (sim.customAmount !== null) qs.set("ga", String(sim.customAmount));
	const s = qs.toString();
	return s ? `/og/scenario?${s}` : "/og/scenario";
};

export async function generateMetadata({
	searchParams,
}: { searchParams: SearchParams }): Promise<Metadata> {
	const params = await searchParams;
	const comparisons = await loadResolvedComparisons();

	let title: string;
	let description: string;
	let ogUrl: string;

	const sim = resolveSimulatorState(params, comparisons);
	const hasSimulatorState = sim.scenario.length > 0;

	if (hasSimulatorState && sim.editor === "single" && sim.scenario[0]) {
		const line = sim.scenario[0];
		const ev = evaluateCounterfactual(
			line.type === "programme"
				? {
						type: "programme",
						id: line.leverId,
						deltaFraction: line.magnitude / 100,
					}
				: { type: "tax", id: line.leverId, deltaPp: line.magnitude },
		);
		const direction = ev.isRevenue ? "frees" : "requires";
		title = `${ev.description} ${direction} ${formatMoney(Math.abs(Math.round(ev.deltaGbp)), "GBP")}`;
		description = ev.isRevenue
			? `Move one fiscal lever and see what's freed. ${ev.methodology.measure}`
			: `Move one fiscal lever and see what it'd cost. ${ev.methodology.measure}`;
		ogUrl = buildScenarioOgQuery(sim);
	} else if (hasSimulatorState && sim.editor === "triptych") {
		const to = tradeOffPropsFromSimulator(sim, comparisons);
		const goal = to.goalId
			? comparisons.find((c) => c.id === to.goalId)
			: null;
		const subject = goal
			? to.quantity > 1
				? `${to.quantity.toLocaleString()} ${goal.pluralName}`
				: goal.name
			: formatMoney(to.target, "GBP");
		title = `Funding ${subject} (${formatMoney(to.target, "GBP")}) — choose how to pay`;
		description = `Trade-off proposal: ${formatMoney(Math.round(to.allocation.tax), "GBP")} tax + ${formatMoney(Math.round(to.allocation.borrow), "GBP")} borrow + ${formatMoney(Math.round(to.allocation.cut), "GBP")} cut.`;
		ogUrl = buildScenarioOgQuery(sim);
	} else if (hasSimulatorState) {
		const result = evaluateScenario(sim.scenario);
		const direction =
			result.net > 0
				? "frees"
				: result.net < 0
					? "shortfall of"
					: "balanced";
		title =
			result.net === 0
				? `Fiscal scenario (${sim.scenario.length} line${sim.scenario.length === 1 ? "" : "s"}): balanced`
				: `Fiscal scenario: ${direction} ${formatMoney(Math.abs(Math.round(result.net)), "GBP")}`;
		description = `${sim.scenario.length} fiscal lever change${sim.scenario.length === 1 ? "" : "s"} stacked.`;
		ogUrl = buildScenarioOgQuery(sim);
	} else {
		title = `Scenario sandbox — NHS Cost Calculator`;
		description = `Free-form lever editor with full tax + spending catalog. The wizard at / is the main entry; this is the power-user surface.`;
		ogUrl = `/og`;
	}

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: "/sandbox",
			images: [
				{
					url: ogUrl,
					width: 1200,
					height: 630,
					alt: title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogUrl],
		},
	};
}

export default async function Sandbox({
	searchParams,
}: { searchParams: SearchParams }) {
	const params = await searchParams;

	const [usdPerGbp, comparisons, baseline] = await Promise.all([
		getUsdPerGbp(),
		loadResolvedComparisons(),
		loadResolvedBaseline(),
	]);
	const sim = resolveSimulatorState(params, comparisons);
	const tradeOff = tradeOffPropsFromSimulator(sim, comparisons);
	const counterfactual = counterfactualPropsFromSimulator(sim);
	const initialScenario = serializeScenario(sim.scenario);

	return (
		<SimulatorWorkspace
			comparisons={comparisons}
			usdPerGbp={usdPerGbp}
			baseline={baseline}
			initialScenario={initialScenario}
			initialMode={sim.editor}
			initialTradeOffProps={{
				goalId: tradeOff.goalId,
				customAmount: tradeOff.customAmount,
				quantity: tradeOff.quantity,
				taxId: tradeOff.taxId,
				progId: tradeOff.progId,
				allocation: tradeOff.allocation,
			}}
			initialCounterfactualProps={{
				mode: counterfactual.mode,
				progId: counterfactual.progId,
				progPct: counterfactual.progPct,
				taxId: counterfactual.taxId,
				taxPp: counterfactual.taxPp,
			}}
		/>
	);
}

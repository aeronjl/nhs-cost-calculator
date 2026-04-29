"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/simulator/workspace-shell";
import {
	HeaderAction,
	SimulatorHeader,
} from "@/components/simulator/header";
import {
	LeverRail,
	type PickerLever,
} from "@/components/simulator/lever-rail";
import { LeverDropZone } from "@/components/simulator/lever-drop-zone";
import { OutputRail } from "@/components/simulator/output-rail";
import { EditorTabs } from "@/components/simulator/editor-tabs";
import { TemplatesDrawer } from "@/components/simulator/templates-drawer";
import {
	type ScenarioLine,
	deserializeScenario,
	serializeScenario,
} from "@/lib/scenario";
import {
	SIMULATOR_OWNED_PARAMS,
	type EditorMode,
	buildUrl,
} from "@/lib/url-write";
import type { ResolvedComparison } from "@/data/comparisons";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import TradeOffEngine from "./TradeOffEngine";
import CounterfactualPanel from "./CounterfactualPanel";
import ScenarioBuilder from "./ScenarioBuilder";

interface Props {
	comparisons: readonly ResolvedComparison[];
	usdPerGbp: number;
	baseline: OBRBaseline;
	initialScenario: string;
	initialMode: EditorMode;
	initialTradeOffProps: {
		goalId: string | null;
		customAmount: number | null;
		quantity: number;
		taxId: string;
		progId: string;
		allocation: { tax: number; borrow: number; cut: number };
	};
	initialCounterfactualProps: {
		mode: "programme" | "tax";
		progId: string;
		progPct: number;
		taxId: string;
		taxPp: number;
	};
}

let nextLocalId = 1;
const newLocalId = () => `wsl${nextLocalId++}`;

const defaultLineForLever = (lever: PickerLever): ScenarioLine => {
	if (lever.type === "borrow") {
		return {
			id: newLocalId(),
			type: "borrow",
			leverId: "",
			magnitude: 10_000_000_000,
		};
	}
	if (lever.type === "programme") {
		return {
			id: newLocalId(),
			type: "programme",
			leverId: lever.id,
			magnitude: -5,
		};
	}
	return {
		id: newLocalId(),
		type: "tax",
		leverId: lever.id,
		magnitude: 1,
	};
};

export default function SimulatorWorkspace({
	comparisons,
	usdPerGbp,
	baseline,
	initialScenario,
	initialMode,
	initialTradeOffProps,
	initialCounterfactualProps,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [templatesOpen, setTemplatesOpen] = useState(
		searchParams.get("drawer") === "templates",
	);

	// Persist drawer state in the URL so a "browse the budget catalog" share
	// can land with the drawer already open. Debounced so opening + closing
	// in quick succession doesn't thrash history.
	useEffect(() => {
		const handle = setTimeout(() => {
			const params = new URLSearchParams(searchParams.toString());
			if (templatesOpen) {
				params.set("drawer", "templates");
			} else {
				params.delete("drawer");
			}
			const qs = params.toString();
			router.replace(qs ? `/?${qs}` : "/", { scroll: false });
		}, 200);
		return () => clearTimeout(handle);
	}, [templatesOpen, router, searchParams]);

	// Derive the *current* scenario from the URL — this is the single source
	// of truth, so adding a lever from the rail composes with whatever the
	// active editor has written.
	const currentScenarioStr = searchParams.get("scenario") ?? initialScenario;
	const currentMode: EditorMode =
		(searchParams.get("editor") as EditorMode | null) ?? initialMode;
	const currentScenario: ScenarioLine[] =
		deserializeScenario(currentScenarioStr);

	// Adding a lever: appends to the active scenario, switches mode to "stack"
	// (only stack supports arbitrary lever lists), writes URL.
	const addLever = useCallback(
		(lever: PickerLever) => {
			const newLine = defaultLineForLever(lever);
			const newScenario = [...currentScenario, newLine];
			const url = buildUrl(
				new URLSearchParams(searchParams.toString()),
				SIMULATOR_OWNED_PARAMS,
				{
					scenario: serializeScenario(newScenario),
					editor: "stack",
				},
			);
			router.push(url, { scroll: false });
		},
		[currentScenario, router, searchParams],
	);

	let editorBody;
	if (currentMode === "triptych") {
		editorBody = (
			<TradeOffEngine
				comparisons={comparisons}
				initialGoalId={initialTradeOffProps.goalId}
				initialCustomAmount={initialTradeOffProps.customAmount}
				initialQuantity={initialTradeOffProps.quantity}
				initialTaxId={initialTradeOffProps.taxId}
				initialProgId={initialTradeOffProps.progId}
				initialAllocation={initialTradeOffProps.allocation}
			/>
		);
	} else if (currentMode === "single") {
		editorBody = (
			<CounterfactualPanel
				comparisons={comparisons}
				usdPerGbp={usdPerGbp}
				initialMode={initialCounterfactualProps.mode}
				initialProgId={initialCounterfactualProps.progId}
				initialProgPct={initialCounterfactualProps.progPct}
				initialTaxId={initialCounterfactualProps.taxId}
				initialTaxPp={initialCounterfactualProps.taxPp}
			/>
		);
	} else {
		editorBody = (
			<ScenarioBuilder
				comparisons={comparisons}
				usdPerGbp={usdPerGbp}
				initialScenario={currentScenarioStr}
			/>
		);
	}

	// Wizard back-link preserves the current scenario AND any wizard
	// state (goal/era/mode). Push `wiz=` directly — the wizard's native
	// scenario param — instead of `scenario=` (which the wizard's URL
	// effect would otherwise rewrite, producing a one-frame flicker).
	// Also push `wstep=5` so the user lands on the Result step
	// pre-populated.
	const wizardBackHref = (() => {
		const qs = new URLSearchParams();
		if (currentScenarioStr) {
			qs.set("wiz", currentScenarioStr);
			qs.set("wstep", "5");
		}
		const wgoal = searchParams.get("wgoal");
		const wera = searchParams.get("wera");
		const wmode = searchParams.get("wmode");
		if (wgoal) qs.set("wgoal", wgoal);
		if (wera) qs.set("wera", wera);
		if (wmode) qs.set("wmode", wmode);
		const s = qs.toString();
		return s ? `/?${s}` : "/";
	})();

	return (
		<>
			<WorkspaceShell
				header={
					<SimulatorHeader
						actions={
							<>
								<HeaderAction href={wizardBackHref}>← Wizard</HeaderAction>
								<HeaderAction onClick={() => setTemplatesOpen(true)}>
									Templates
								</HeaderAction>
								<HeaderAction href="/reference">Reference</HeaderAction>
							</>
						}
					/>
				}
				leverRail={<LeverRail onAdd={addLever} />}
				editor={
					<LeverDropZone onDrop={addLever}>
						<EditorTabs currentMode={currentMode}>{editorBody}</EditorTabs>
					</LeverDropZone>
				}
				outputRail={
					<OutputRail
						scenario={currentScenario}
						comparisons={comparisons}
						usdPerGbp={usdPerGbp}
						baseline={baseline}
					/>
				}
			/>
			<TemplatesDrawer open={templatesOpen} onOpenChange={setTemplatesOpen} />
		</>
	);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListChecks } from "lucide-react";
import { TemplatesDrawer } from "./templates-drawer";
import { createDismissManager } from "./sparkline-dismiss-manager";
import { cn } from "@/lib/utils";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import { getEraBaseline } from "@/data/historical/era-baselines";
import type { EraId } from "@/data/eras";
import { deserializeScenario } from "@/lib/scenario";
import {
	buildPolicyScenarioLines,
	type PolicyScenarioPreset,
} from "@/lib/policy-scenarios";
import type { ResolvedComparison } from "@/data/comparisons";
import {
	STEP_LABELS,
	STEPS,
	WIZARD_PARAMS,
	buildWizardUrl,
	decodeWizardState,
	encodeWizardState,
	useWizardState,
} from "@/lib/wizard-state";
import { ChancellorHUD } from "./chancellor-hud";
import {
	StepBorrow,
	StepBriefing,
	StepGoal,
	StepResult,
	StepSpending,
	StepTaxes,
} from "./steps";

// Wizard shell: progress indicator + step container + Chancellor HUD.
//
// Desktop widescreen: side-by-side layout. Wizard left (~60%), HUD right
// (~40%, sticky). Mobile: HUD compresses to a sticky banner; wizard takes
// the screen below.

interface Props {
	baseline: OBRBaseline;
	// Server-resolved ONS PSF historical outturns (overlay on top of the
	// static OUTTURN_xxxx baselines). Optional — falls back to static when
	// ONS_PSF_HISTORICAL_URL is unset.
	resolvedOutturns?: Partial<Record<EraId, OBRBaseline>>;
	// Comparison catalog for the Result step's "what £X buys" list and
	// the per-line breakdown panels. Server-resolved so live override
	// flows through.
	comparisons: readonly ResolvedComparison[];
	// FX rate (from server, cached). Used by comparisons rendering when
	// the user toggles between GBP and USD displays.
	usdPerGbp: number;
	// Legacy share-link override: when a `?scenario=` URL lands here
	// (back-compat with the old simulator route), the server pre-decodes
	// the scenario string and pushes the wizard to its Result step.
	initialScenarioOverride?: string;
	initialStepOverride?: number;
}

export function WizardShell({
	baseline,
	resolvedOutturns,
	comparisons,
	usdPerGbp,
	initialScenarioOverride,
	initialStepOverride,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();

	// Decode URL params into initial wizard state once on mount. Lets a
	// shared link like /wizard?wera=1979&wgoal=fund-nhs&wstep=2 land in the
	// correct era/goal/step. We deliberately read once — subsequent state
	// changes write to the URL, but URL changes from the writer don't loop
	// back into setState.
	//
	// State-source precedence (resolved at mount, then URL is authoritative):
	//   1. URL params (wera/wgoal/wstep/wmode/wsparkline/wiz) — explicit
	//      values from the share-link or the user's previous wizard state.
	//   2. localStorage (currently only `hud-sparkline-collapsed`) —
	//      personal device preference; loaded only when the URL doesn't
	//      set the corresponding param.
	//   3. Hardcoded defaults — first-visit initial state.
	// Once mounted, every state change writes back to the URL via the
	// debounced effect below; localStorage is updated as a side effect by
	// `setMobileSparklineCollapsed`. The URL stays the single source of
	// truth during a session.
	const initialWizardState = useMemo(() => {
		const params: Record<string, string | undefined> = {};
		for (const k of WIZARD_PARAMS) {
			const v = searchParams.get(k);
			if (v !== null) params[k] = v;
		}
		const decoded = decodeWizardState(params);
		// Server-side override: legacy ?scenario= URL pre-populates
		// committedScenario and jumps to Result step. Wizard params win
		// when present (the user explicitly navigated to a specific
		// wizard step).
		if (
			initialScenarioOverride &&
			!decoded.committedScenario &&
			decoded.step === undefined
		) {
			decoded.committedScenario = deserializeScenario(initialScenarioOverride);
			decoded.step = initialStepOverride ?? 5;
		}
		if (decoded.mobileSparklineCollapsed === undefined) {
			try {
				if (
					typeof localStorage !== "undefined" &&
					localStorage.getItem("hud-sparkline-collapsed") === "true"
				) {
					decoded.mobileSparklineCollapsed = true;
				}
			} catch {
				// no localStorage — fall through to default false
			}
		}
		return decoded;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const { state, actions, effectiveScenario } = useWizardState(initialWizardState);

	// Persist wizard state to the URL so progress survives reloads and is
	// shareable. Debounced + only writes when the encoded URL actually
	// differs, so back-to-back state changes don't thrash history.
	useEffect(() => {
		const handle = setTimeout(() => {
			const encoded = encodeWizardState(state);
			// Wizard is mounted at / now (was /wizard before the route swap).
			// The canonical writer also strips legacy simulator params so old
			// ?scenario= links hydrate into clean ?wiz=&wstep= report links.
			const newUrl = buildWizardUrl(
				new URLSearchParams(searchParams.toString()),
				encoded,
			);
			const currentUrl =
				typeof window !== "undefined"
					? window.location.pathname + window.location.search
					: "";
			if (newUrl !== currentUrl) {
				router.replace(newUrl, { scroll: false });
			}
		}, 200);
		return () => clearTimeout(handle);
	}, [state, router, searchParams]);

	const advance = () => {
		const next = Math.min(state.step + 1, 5);
		actions.setStep(next);
	};

	const back = () => {
		const prev = Math.max(state.step - 1, 0);
		actions.setStep(prev);
	};

	const showPolicyScenarios = () => {
		actions.setStep(0);
		if (typeof window !== "undefined") {
			window.setTimeout(() => {
				document
					.getElementById("policy-scenario-quick-starts")
					?.scrollIntoView({ behavior: "smooth", block: "start" });
			}, 0);
		}
	};

	const applyPolicyScenario = (preset: PolicyScenarioPreset) => {
		const lines = buildPolicyScenarioLines(preset);
		const nextState = {
			...state,
			step: 5,
			goal: preset.goal,
			committedScenario: lines,
			previewLines: [],
			era: preset.era,
			baselineMode: preset.baselineMode ?? state.baselineMode,
			policyScenarioId: preset.id,
		};
		const newUrl = buildWizardUrl(
			new URLSearchParams(searchParams.toString()),
			encodeWizardState(nextState),
		);
		router.replace(newUrl, { scroll: false });
		if (preset.era !== state.era) actions.setEra(preset.era);
		if (preset.baselineMode) actions.setBaselineMode(preset.baselineMode);
		actions.setGoal(preset.goal);
		actions.replaceScenario(lines);
		actions.setPolicyScenarioId(preset.id);
		actions.setStep(5);
	};

	// Era-aware baseline: in non-current eras, use the historical forecast
	// the Chancellor would have been working against (HMT FSBR for pre-OBR
	// eras, the relevant EFO for 2010+). When the user toggles to
	// "outturn", switch to the ONS PSF actuals — what actually happened.
	// Falls back to live OBR for "current".
	const effectiveBaseline = getEraBaseline(
		state.era,
		baseline,
		state.baselineMode,
		resolvedOutturns,
	);
	// Alternate-mode baseline so the HUD can show "plan vs reality" in a
	// single tile (e.g. when the user is in 1979/forecast mode, surface
	// the outturn year-5 PSNB inline alongside the forecast).
	const alternateBaseline = getEraBaseline(
		state.era,
		baseline,
		state.baselineMode === "forecast" ? "outturn" : "forecast",
		resolvedOutturns,
	);

	// Trajectory browser dismiss manager — created once per WizardShell
	// mount so its identity survives navigation between wizard steps.
	// The user stepping from Briefing → Goal → Briefing reuses the same
	// manager (registered sparklines re-attach on remount).
	const browserDismissManager = useMemo(() => createDismissManager(), []);

	const stepProps = {
		state: state,
		actions,
		baseline: effectiveBaseline,
		liveBaseline: baseline,
		comparisons,
		usdPerGbp,
		browserDismissManager,
		onAdvance: advance,
		onBack: back,
		onApplyPolicyScenario: applyPolicyScenario,
		onShowPolicyScenarios: showPolicyScenarios,
	};

	const isResultStep = state.step === 5;
	const [templatesOpen, setTemplatesOpen] = useState(false);

	let stepContent;
	switch (state.step) {
		case 0:
			stepContent = <StepBriefing {...stepProps} />;
			break;
		case 1:
			stepContent = <StepGoal {...stepProps} />;
			break;
		case 2:
			stepContent = <StepTaxes {...stepProps} />;
			break;
		case 3:
			stepContent = <StepSpending {...stepProps} />;
			break;
		case 4:
			stepContent = <StepBorrow {...stepProps} />;
			break;
		case 5:
			stepContent = <StepResult {...stepProps} />;
			break;
		default:
			stepContent = <StepBriefing {...stepProps} />;
	}

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Header */}
			<header className="bg-blue-500 text-white drop-shadow-sm flex flex-row items-center justify-between w-full py-2 px-4 sm:px-6 shrink-0">
				<a href="/" className="font-semibold flex items-center gap-2">
					<span aria-hidden="true">💰</span>
					<span className="hidden sm:inline">NHSCostCalculator.com</span>
					<span className="sm:hidden">NHS</span>
				</a>
				<div className="flex items-center gap-1 sm:gap-2">
					<button
						type="button"
						onClick={() => setTemplatesOpen(true)}
						className="text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-white/15 transition-colors whitespace-nowrap"
					>
						Templates
					</button>
					<button
						type="button"
						onClick={showPolicyScenarios}
						className="inline-flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-white/15 transition-colors whitespace-nowrap"
					>
						<ListChecks aria-hidden="true" className="size-3.5" />
						Policy scenarios
					</button>
				</div>
			</header>

			{/* Progress indicator */}
			<div className="border-b bg-muted/30 px-4 sm:px-6 py-2 shrink-0">
				<div className="max-w-screen-xl mx-auto flex items-center gap-2 overflow-x-auto">
					{STEPS.map((s) => {
						const active = s === state.step;
						const past = s < state.step;
						return (
							<button
								key={s}
								type="button"
								onClick={() => actions.setStep(s)}
								className={cn(
									"flex items-center gap-1.5 text-[10px] uppercase tracking-wider whitespace-nowrap py-1 transition-colors",
									active
										? "text-foreground font-semibold"
										: past
											? "text-blue-700 hover:text-foreground"
											: "text-muted-foreground hover:text-foreground",
								)}
							>
								<span
									className={cn(
										"size-4 rounded-full inline-flex items-center justify-center text-[9px]",
										active
											? "bg-blue-500 text-white"
											: past
												? "bg-blue-500/30 text-blue-700"
												: "bg-muted text-muted-foreground",
									)}
								>
									{past ? "✓" : s + 1}
								</span>
								{STEP_LABELS[s]}
								{s < STEPS.length - 1 && (
									<span className="text-muted-foreground/50 mx-0.5">·</span>
								)}
							</button>
						);
					})}
				</div>
			</div>

			{/* Mobile sticky HUD banner — hidden on Result step where the
			    OutputRail's TopZone provides the same at-a-glance summary
			    (and the report itself is the focus). */}
			{!isResultStep && (
				<div className="lg:hidden sticky top-0 z-30 bg-background">
					<ChancellorHUD
						committedScenario={state.committedScenario}
						previewLines={state.previewLines}
						goal={state.goal}
						baseline={effectiveBaseline}
						alternateBaseline={alternateBaseline}
						era={state.era}
						baselineMode={state.baselineMode}
						mobileSparklineCollapsed={state.mobileSparklineCollapsed}
						onToggleMobileSparkline={() =>
							actions.setMobileSparklineCollapsed(!state.mobileSparklineCollapsed)
						}
						onRemoveChoice={actions.removeChoice}
						compact
					/>
				</div>
			)}

			{/* Body: split-pane on desktop, stacked on mobile.
			    On the Result step the report fills full width — sidebar HUD
			    is suppressed and main loses the lg:max-w-2xl constraint so
			    the report's tables / charts / multi-column layouts breathe. */}
			<div className="flex-1 flex flex-col lg:flex-row max-w-screen-xl w-full mx-auto">
				<main
					className={cn(
						"flex-1 min-w-0 px-4 sm:px-6 py-6",
						!isResultStep && "lg:max-w-2xl",
					)}
				>
					{stepContent}
				</main>

				{!isResultStep && (
					<aside className="hidden lg:block w-[360px] border-l bg-muted/20 sticky top-0 h-screen overflow-y-auto p-4">
						<ChancellorHUD
							committedScenario={state.committedScenario}
							previewLines={state.previewLines}
							goal={state.goal}
							baseline={effectiveBaseline}
							era={state.era}
							onRemoveChoice={actions.removeChoice}
						/>
					</aside>
				)}
			</div>
			{/* Templates drawer — annotated UK budgets. In wizard context
			    we push wiz=<scenario>&wstep=5 directly so the URL writer
			    doesn't have to do a same-frame rewrite from scenario=. */}
			<TemplatesDrawer
				open={templatesOpen}
				onOpenChange={setTemplatesOpen}
				targetParam="wiz"
			/>
		</div>
	);
}

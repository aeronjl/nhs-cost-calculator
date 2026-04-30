"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
	BORROW_LEGISLATION,
	HYPOTHETICAL_LEVERS,
	type LegislativeMeta,
	getProgrammeLegislation,
	getTaxLegislation,
} from "@/data/legislation";
import {
	ERA_ORDER,
	ERAS,
	type EraId,
	applyEraLegislation,
	applyEraLeverOverride,
	applyEraProgramme,
	eraGbpPerUnit,
} from "@/data/eras";
import { getEraBaseline } from "@/data/historical/era-baselines";
import { EraSparkline } from "./era-sparkline";
import { DismissManagerContext } from "./sparkline-dismiss-manager";
import { getTaxLever } from "@/data/levers/tax-rates";
import { getProgramme } from "@/data/levers/uk-spending";
import type { OBRBaseline } from "@/data/baseline/obr-baseline";
import type { ScenarioLine } from "@/lib/scenario";
import {
	GOAL_DEFINITIONS,
	type WizardActions,
	type WizardGoal,
	type WizardState,
	materialiseGoalLine,
	wizardLineId,
} from "@/lib/wizard-state";
import { ChoiceCard } from "./choice-card";
import type { OutputRailProps } from "@/components/simulator/output-rail";
import type { RefineScenarioPanelProps } from "./refine-scenario-panel";

const RefineScenarioPanel = dynamic<RefineScenarioPanelProps>(
	() =>
		import("./refine-scenario-panel").then(
			(mod) => mod.RefineScenarioPanel,
		),
	{
		loading: () => <ScenarioWorkspaceSkeleton />,
	},
);

const OutputRail = dynamic<OutputRailProps>(
	() =>
		import("@/components/simulator/output-rail").then((mod) => mod.OutputRail),
	{
		loading: () => <ReportSkeleton />,
	},
);

function ScenarioWorkspaceSkeleton() {
	return (
		<div className="rounded-lg border bg-background shadow-sm px-4 py-3">
			<div className="h-4 w-36 rounded bg-muted" />
			<div className="mt-2 h-3 w-64 max-w-full rounded bg-muted/70" />
		</div>
	);
}

function ReportSkeleton() {
	return (
		<div className="space-y-3">
			<div className="rounded-lg border bg-background p-4">
				<div className="h-5 w-44 rounded bg-muted" />
				<div className="mt-3 h-3 w-full rounded bg-muted/70" />
				<div className="mt-2 h-3 w-2/3 rounded bg-muted/70" />
			</div>
			<div className="rounded-md border bg-background p-3">
				<div className="h-4 w-28 rounded bg-muted" />
			</div>
		</div>
	);
}

const getTaxLegislationForEra = (
	leverId: string,
	era: EraId,
): LegislativeMeta | undefined => {
	const base = getTaxLegislation(leverId);
	return base ? applyEraLegislation(base, leverId, era) : undefined;
};

const getProgrammeLegislationForEra = (
	leverId: string,
	era: EraId,
): LegislativeMeta | undefined => {
	const base = getProgrammeLegislation(leverId);
	return base ? applyEraLegislation(base, leverId, era) : undefined;
};

// Each step renders the relevant choice cards + nav. Step components share
// the same props (wizard state + actions + baseline) for consistency.

interface StepProps {
	state: WizardState;
	actions: WizardActions;
	baseline: OBRBaseline;
	// Comparison catalog ("what £X buys") + FX rate. Used by the Result
	// step's analytics report and any per-step comparison previews.
	comparisons: readonly import("@/data/comparisons").ResolvedComparison[];
	usdPerGbp: number;
	// Stable trajectory-browser dismiss manager, owned by wizard-shell.
	// Lifted there so its identity survives navigation between steps —
	// stepping away from briefing and back doesn't recreate the manager.
	// (Per-sparkline activeTooltip state is still per-mount; persisting
	// the visible tooltip across navigation would require a state-lift
	// of activeTooltip itself, deferred.)
	browserDismissManager: import("./sparkline-dismiss-manager").DismissManager;
	onAdvance: () => void;
	onBack: () => void;
	onSkipToResults: () => void;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(abs / 1_000_000_000).toFixed(1)}bn`;
	return `£${Math.round(abs / 1_000_000).toLocaleString()}m`;
};

// Compute an era-aware subtitle for a tax choice. Returns null when era is
// "current" (caller falls back to the static subtitle, preserving the
// carefully-written copy on the live mode). For past eras, generates from
// era-overridden lever data + gdpScale so "Basic rate +1pp" reads
// "33% → 34% · ~£500m/yr" in 1979 mode.
const eraTaxSubtitle = (
	leverId: string,
	magnitude: number,
	era: EraId,
): string | null => {
	if (era === "current") return null;
	const baseLever = getTaxLever(leverId);
	const lever = applyEraLeverOverride(baseLever, era);
	// Use the era-aware yield helper: per-era gbpPerUnit override when
	// available (IT bands, VAT, corp tax in 1979/1988/2010/2021), else
	// gdpScale × current.
	const yieldEra = eraGbpPerUnit(baseLever, era) * magnitude;
	const yieldStr = formatBn(Math.abs(yieldEra));
	if (lever.unit === "pp" && lever.currentRate !== undefined) {
		const fromPct = lever.currentRate * 100;
		const toPct = fromPct + magnitude;
		return `${fromPct.toFixed(0)}% → ${toPct.toFixed(0)}% · ~${yieldStr}/yr`;
	}
	if (lever.unit === "yr") {
		return `~${yieldStr}/yr extra by year ${Math.abs(magnitude)}`;
	}
	if (lever.unit === "bn") {
		return `~${yieldStr}/yr`;
	}
	if (lever.unit === "k" && lever.currentValue !== undefined) {
		const fromValue = lever.currentValue;
		const toValue = fromValue + magnitude * 1000;
		return `£${fromValue.toLocaleString()} → £${toValue.toLocaleString()} · ~${yieldStr}/yr`;
	}
	return `~${yieldStr}/yr`;
};

// Era-aware programme subtitle. Uses the era's actual programme value (in
// era-£) when available; falls back to gdpScale × current-£ for programmes
// without a per-era override.
//
// Sign convention matches the existing static subtitles ("NHS +5% · +£8.25bn"):
// positive number = more spent, negative = less spent. This is the *spending*
// convention, opposite of the evaluator's *Treasury* convention where more
// spending is a negative deltaGbp.
const eraProgrammeSubtitle = (
	leverId: string,
	magnitude: number,
	era: EraId,
): string | null => {
	if (era === "current") return null;
	const base = getProgramme(leverId);
	const overridden = applyEraProgramme(base, era);
	const hasEraValue = overridden.value !== base.value;
	const gdpScale = ERAS[era].gdpScale;
	const eraValue = hasEraValue ? overridden.value : base.value * gdpScale;
	const spendingDelta = eraValue * (magnitude / 100);
	const sign = spendingDelta >= 0 ? "+" : "−";
	return `${sign}${formatBn(Math.abs(spendingDelta))}/yr`;
};

// Era-aware borrow card title + subtitle. The underlying magnitude stays
// current-pound (the scenario lever doesn't track era), but the displayed
// figure scales so the user sees era-faithful amounts. A "(1979 £)"
// suffix on the subtitle makes the basis explicit.
const eraBorrowDisplay = (
	c: { title: string; subtitle: string; magnitude: number },
	era: EraId,
): { title: string; subtitle: string } => {
	if (era === "current") return { title: c.title, subtitle: c.subtitle };
	const scale = ERAS[era].gdpScale;
	const eraMagnitude = c.magnitude * scale;
	const verb = c.magnitude >= 0 ? "Borrow" : "Repay";
	const eraStr = formatBn(Math.abs(eraMagnitude));
	return {
		title: c.magnitude >= 0
			? `${verb} ${eraStr}`
			: `Repay ${eraStr} of debt`,
		subtitle: `${c.subtitle} (${ERAS[era].year} £)`,
	};
};

const isCommitted = (state: WizardState, leverId: string): boolean =>
	state.committedScenario.some((l) => l.leverId === leverId);

const isCommittedOverridden = (state: WizardState, leverId: string): boolean =>
	state.committedScenario.some(
		(l) => l.leverId === leverId && l.overridden === true,
	);

const removeByLeverId = (
	state: WizardState,
	actions: WizardActions,
	leverId: string,
) => {
	const line = state.committedScenario.find((l) => l.leverId === leverId);
	if (line) actions.removeChoice(line.id);
};

// ---------------------------------------------------------------------------
// Step 0 · Briefing
// ---------------------------------------------------------------------------

export function StepBriefing({
	state,
	actions,
	baseline,
	browserDismissManager,
	onAdvance,
	onSkipToResults,
}: StepProps) {
	const era = ERAS[state.era];
	const isCurrent = state.era === "current";
	// `baseline` is era-aware (passed via wizard-shell's effectiveBaseline),
	// so all figures come from a single source of truth — the era's
	// historical OBRBaseline (or live OBR for current).
	const lastYear = baseline.years[baseline.years.length - 1]!;
	const yearLabel = baseline.years[0]!.fiscalYear;
	const psnb = baseline.years[0]!.psnb;
	const psnbPctGdp = baseline.years[0]!.psnbPctGdp;
	const psndPctGdp = baseline.years[0]!.psndPctGdp;
	const ruleHeadroom = baseline.stabilityRuleHeadroom;

	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
					Step 1 of 6
				</div>
				<h1 className="text-2xl font-light">Briefing</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{isCurrent
						? `Where the UK fiscal position stands today (per ${baseline.source.label}).`
						: `${era.label}. Stepping into the Treasury as ${era.chancellor} (${era.party}).`}
				</p>
				<p className="text-[11px] text-muted-foreground mt-1 italic">
					Forecasts: {baseline.source.label}
					{!isCurrent && state.era !== "current" && (
						state.era === "1979" || state.era === "1988"
							? " — pre-OBR. The Treasury's own forecast, presented to Parliament alongside the budget; no independent fiscal scrutiny existed."
							: " — independent OBR forecast (introduced May 2010)."
					)}
				</p>
				<AnimatePresence initial={false}>
					{!isCurrent && era.multiplierSource && (
						<motion.details
							key="mult-source"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{
								height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
								opacity: { duration: 0.18, delay: 0.04 },
							}}
							className="text-[11px] text-muted-foreground mt-1.5 overflow-hidden"
						>
							<summary className="cursor-pointer hover:text-foreground italic">
								Why these macro multipliers? ▸
							</summary>
							<div className="mt-1.5 pl-3 border-l-2 border-muted leading-snug space-y-1">
								{era.multiplierSource.note && (
									<p>{era.multiplierSource.note}</p>
								)}
								<a
									href={era.multiplierSource.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:underline"
								>
									{era.multiplierSource.label} →
								</a>
							</div>
						</motion.details>
					)}
				</AnimatePresence>
			</div>

			{/* Era picker — single grid combining selection + trajectory
			    visualisation. Each card shows the era's chancellor + a
			    tiny sparkline of the baseline PSNB shape. State.baselineMode
			    drives forecast vs outturn (current era always uses the live
			    OBR baseline regardless of mode). Wrapped in its own
			    DismissManagerContext so the trajectory tooltips coordinate
			    among themselves but don't disturb the main HUD's sparkline. */}
			<div className="rounded-lg border bg-card p-3 space-y-2">
				<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
					Historical era
				</div>
				<DismissManagerContext.Provider value={browserDismissManager}>
				<div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5">
					{ERA_ORDER.map((eraId) => {
						const eraBaseline = getEraBaseline(
							eraId,
							baseline,
							state.baselineMode,
						);
						const isSelected = state.era === eraId;
						const isOutturnMode = state.baselineMode === "outturn";
						const e = ERAS[eraId];
						return (
							<button
								key={eraId}
								type="button"
								onClick={() => actions.setEra(eraId)}
								className={`text-left rounded-md border p-1.5 transition-all ${
									isSelected
										? isOutturnMode && eraId !== "current"
											? "bg-amber-50 border-amber-400 ring-1 ring-amber-300"
											: "bg-blue-50 border-blue-400 ring-1 ring-blue-300"
										: "bg-background hover:bg-accent/40 border-muted"
								}`}
							>
								<div className="text-[9px] font-semibold mb-1">
									{e.year}
									<span className="hidden sm:inline">
										{" · "}
										{e.chancellor.split(" ").pop()}
									</span>
								</div>
								<EraSparkline
									compact
									id={`trajectory-${eraId}-${state.baselineMode}`}
									height={28}
									xLabels={eraBaseline.years.map((y) => y.fiscalYear)}
									series={[
										{
											label: `${e.year} ${
												isOutturnMode && eraId !== "current"
													? "outturn"
													: "forecast"
											} PSNB`,
											values: eraBaseline.years.map((y) => y.psnb),
											color: isSelected
												? isOutturnMode && eraId !== "current"
													? "rgb(217 119 6)"
													: "rgb(37 99 235)"
												: "rgb(107 114 128)",
											width: 1.5,
										},
									]}
								/>
							</button>
						);
					})}
				</div>
				</DismissManagerContext.Provider>

				<AnimatePresence initial={false}>
					{!isCurrent && (
						<motion.div
							key="era-mode-controls"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{
								height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
								opacity: { duration: 0.18, delay: 0.04 },
							}}
							className="overflow-hidden space-y-2"
						>
							<p className="text-[11px] text-muted-foreground italic leading-snug">
								Educational mode: legislation badges reflect what existed
								(or didn't) in {era.year}. Lever calibration uses
								present-day figures — see methodology.
							</p>
							{/* Forecast vs outturn toggle */}
							<div className="flex items-center gap-2 pt-1.5 border-t">
								<span className="text-[10px] uppercase tracking-wider text-muted-foreground">
									View
								</span>
								<div className="inline-flex rounded-md border overflow-hidden text-[11px]">
									<button
										type="button"
										onClick={() => actions.setBaselineMode("forecast")}
										className={`px-2.5 py-1 transition-colors ${
											state.baselineMode === "forecast"
												? "bg-blue-500 text-white"
												: "bg-background hover:bg-accent/50"
										}`}
									>
										Forecast
									</button>
									<button
										type="button"
										onClick={() => actions.setBaselineMode("outturn")}
										className={`px-2.5 py-1 transition-colors ${
											state.baselineMode === "outturn"
												? "bg-amber-500 text-white"
												: "bg-background hover:bg-accent/50"
										}`}
									>
										Actual outturn
									</button>
								</div>
								<span className="text-[10px] text-muted-foreground italic">
									{state.baselineMode === "forecast"
										? "What the Chancellor planned"
										: "What ONS PSF actually recorded"}
								</span>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<motion.div
				layout
				transition={{ layout: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
				className="rounded-lg border bg-card p-4 space-y-3"
			>
				<div className="text-sm leading-snug">
					{isCurrent
						? "You're stepping into the Treasury. Here's what's on the briefing note this morning."
						: era.longContext}
				</div>
				<dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
					<div className="rounded-md bg-muted/40 p-2.5">
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Borrowing {yearLabel}
						</dt>
						<dd className="text-base font-semibold">
							{formatBn(psnb)}
							<span className="text-xs font-normal text-muted-foreground ml-1">
								({psnbPctGdp.toFixed(1)}% GDP)
							</span>
						</dd>
					</div>
					<div className="rounded-md bg-muted/40 p-2.5">
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							Debt:GDP {yearLabel}
						</dt>
						<dd className="text-base font-semibold">
							{psndPctGdp.toFixed(0)}%
						</dd>
					</div>
					{isCurrent && (
						<div className="rounded-md bg-muted/40 p-2.5">
							<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
								Year-{lastYear.fiscalYear} forecast PSNB
							</dt>
							<dd className="text-base font-semibold">
								{formatBn(lastYear.psnb)}
								<span className="text-xs font-normal text-muted-foreground ml-1">
									({lastYear.psnbPctGdp.toFixed(1)}% GDP)
								</span>
							</dd>
						</div>
					)}
					<div className="rounded-md bg-muted/40 p-2.5">
						<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
							{ruleHeadroom > 0 ? "Fiscal-rule headroom" : "Fiscal rule"}
						</dt>
						<dd className="text-base font-semibold">
							{ruleHeadroom > 0 ? formatBn(ruleHeadroom) : "—"}
							{ruleHeadroom === 0 && (
								<span className="text-xs font-normal text-muted-foreground ml-1">
									no formal rule
								</span>
							)}
						</dd>
					</div>
				</dl>
				<p className="text-[11px] text-muted-foreground italic">
					{era.yearNote}
				</p>

				<div className="rounded-md bg-muted/30 p-3 text-xs leading-snug">
					<p className="font-medium mb-1">Pressures on this morning's note:</p>
					<ul className="space-y-1 text-muted-foreground">
						{era.pressures.map((p) => (
							<li key={p.label}>
								• <strong>{p.label}</strong> — {p.detail}
							</li>
						))}
					</ul>
				</div>
			</motion.div>

			<div className="flex items-center justify-between gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onSkipToResults}>
					Skip to results →
				</Button>
				<Button onClick={onAdvance}>Begin →</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 1 · Goal
// ---------------------------------------------------------------------------

const GOAL_ORDER: WizardGoal[] = [
	"reduce-borrowing",
	"fund-nhs",
	"fund-defence",
	"cut-taxes-basic",
	"cut-taxes-business",
	"hold-steady",
];

export function StepGoal({ state, actions, onAdvance, onBack }: StepProps) {
	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
					Step 2 of 6
				</div>
				<h1 className="text-2xl font-light">What's your fiscal goal?</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Pick a direction. Choose freely — you can always change later.
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
				{GOAL_ORDER.map((g) => {
					const def = GOAL_DEFINITIONS[g];
					const selected = state.goal === g;
					return (
						<button
							key={g}
							type="button"
							onClick={() => actions.setGoal(g)}
							className={`text-left rounded-lg border p-3 transition-all ${
								selected
									? "bg-blue-50 border-blue-400 ring-1 ring-blue-300"
									: "bg-card hover:bg-accent/40 hover:border-foreground/20"
							}`}
						>
							<div className="text-sm font-semibold">{def.label}</div>
							<div className="text-xs text-muted-foreground leading-snug mt-1">
								{def.description}
							</div>
						</button>
					);
				})}
			</div>

			<div className="flex items-center justify-between gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onBack}>
					← Back
				</Button>
				<Button onClick={onAdvance} disabled={!state.goal}>
					Next: Taxes →
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 2 · Taxes
// ---------------------------------------------------------------------------

// Direction = whether the choice raises or cuts revenue/spending. Used for
// goal-based filtering so we don't show tax-cut cards on a "find £30bn"
// goal, or NHS raise cards on a goal whose implicit action is already an
// NHS raise.
type ChoiceDirection =
	| "raise-revenue"
	| "cut-revenue"
	| "raise-spending"
	| "cut-spending";

// Burden = who pays. Lets us hide perverse offsets — e.g. a basic-rate
// freeze under a "cut basic-rate IT" goal, where the same workers would
// lose via fiscal drag what they'd gain from the cut.
type ChoiceBurden =
	| "workers"
	| "business"
	| "wealth"
	| "consumers"
	| "priority-nhs"
	| "priority-defence"
	| "general";

interface TaxChoice {
	leverId: string;
	title: string;
	subtitle: string;
	context: string;
	magnitude: number;
	direction: ChoiceDirection;
	burden: ChoiceBurden;
}

const isChoiceVisibleForGoal = (
	direction: ChoiceDirection,
	burden: ChoiceBurden,
	goal: WizardGoal | null,
): boolean => {
	if (!goal || goal === "hold-steady" || goal === "free-play") return true;

	switch (goal) {
		case "reduce-borrowing":
			return direction === "raise-revenue" || direction === "cut-spending";

		case "fund-nhs":
		case "fund-defence":
			// Implicit: priority spending raise. Wizard helps find offsets.
			// Hide all spending raises (would double-count or wander off-topic)
			// and tax cuts (perverse — needs offsetting).
			if (direction === "raise-spending") return false;
			if (direction === "cut-revenue") return false;
			return true;

		case "cut-taxes-basic":
			// Implicit: basic-rate cut targeting workers. Hide perverse offsets
			// (raises on the same group), tax cuts (already implicit), spending
			// raises (off-topic for a tax cut).
			if (direction === "raise-revenue" && burden === "workers") return false;
			if (direction === "raise-spending") return false;
			if (direction === "cut-revenue") return false;
			return true;

		case "cut-taxes-business":
			if (direction === "raise-revenue" && burden === "business") return false;
			if (direction === "raise-spending") return false;
			if (direction === "cut-revenue") return false;
			return true;
	}
};

// Curated set of tax moves, grouped by sub-category. Sign convention: positive
// magnitude = revenue-raising move (positive deltaGbp).
const TAX_CHOICES: { group: string; choices: TaxChoice[] }[] = [
	{
		group: "Income tax",
		choices: [
			{
				leverId: "basic-rate-income-tax",
				title: "Basic rate +1pp",
				subtitle: "20% → 21% · ~£6bn/yr",
				context: "Affects ~33M basic-rate taxpayers. Highly visible politically.",
				magnitude: 1,
				direction: "raise-revenue",
				burden: "workers",
			},
			{
				leverId: "higher-rate-income-tax",
				title: "Higher rate +2pp",
				subtitle: "40% → 42% · ~£3.2bn/yr",
				context: "Above £50,270. Marginal-rate response starts to bite.",
				magnitude: 2,
				direction: "raise-revenue",
				burden: "workers",
			},
			{
				leverId: "additional-rate-income-tax",
				title: "Additional rate +5pp",
				subtitle: "45% → 50% · ~£1bn/yr before response",
				context:
					"50p rate experience (2010-13): yielded much less than scored. Top earners adjust aggressively.",
				magnitude: 5,
				direction: "raise-revenue",
				burden: "workers",
			},
		],
	},
	{
		group: "Consumption + payroll",
		choices: [
			{
				leverId: "vat-standard",
				title: "VAT +1pp",
				subtitle: "20% → 21% · ~£8bn/yr",
				context:
					"Largest per-pp revenue lever. Regressive on disposable income; year-1 CPI passthrough ~0.85.",
				magnitude: 1,
				direction: "raise-revenue",
				burden: "consumers",
			},
			{
				leverId: "nics-main",
				title: "Employee NICs +1pp",
				subtitle: "8% → 9% · ~£5bn/yr",
				context:
					"Hits middle deciles (employees earning £12.5k-£50k). Politically distinct from IT.",
				magnitude: 1,
				direction: "raise-revenue",
				burden: "workers",
			},
			{
				leverId: "employer-nics-main",
				title: "Employer NICs +1pp",
				subtitle: "15% → 16% · ~£8bn/yr",
				context:
					"Economic incidence on workers via wages. 'Tax on jobs' framing.",
				magnitude: 1,
				direction: "raise-revenue",
				burden: "business",
			},
		],
	},
	{
		group: "Asset + wealth",
		choices: [
			{
				leverId: "capital-gains-tax",
				title: "CGT higher rate +4pp",
				subtitle: "24% → 28% · ~£400m/yr",
				context:
					"Heavily concentrated top decile. Realisations are highly elastic and timing-sensitive.",
				magnitude: 4,
				direction: "raise-revenue",
				burden: "wealth",
			},
			{
				leverId: "inheritance-tax",
				title: "IHT +5pp",
				subtitle: "40% → 45% · ~£1bn/yr",
				context:
					"Only ~4-5% of estates pay any IHT. Highly avoidable via gifts + reliefs.",
				magnitude: 5,
				direction: "raise-revenue",
				burden: "wealth",
			},
			{
				leverId: "stamp-duty",
				title: "Stamp duty +£1bn",
				subtitle: "Various band changes",
				context:
					"Devolved in Scotland (LBTT) and Wales (LTT) — only England + NI affected.",
				magnitude: 1,
				direction: "raise-revenue",
				burden: "wealth",
			},
		],
	},
	{
		group: "Threshold freeze (fiscal drag)",
		choices: [
			{
				leverId: "freeze-personal-allowance",
				title: "Freeze PA for 2 more years",
				subtitle: "~£3bn/yr extra by year 2",
				context:
					"Already frozen until 2031. Each extra year of freeze raises ~£1.5bn at maturity. The 'stealth tax' instrument.",
				magnitude: 2,
				direction: "raise-revenue",
				burden: "workers",
			},
			{
				leverId: "freeze-higher-rate-threshold",
				title: "Freeze HRT for 2 more years",
				subtitle: "~£2bn/yr extra by year 2",
				context: "Pulls more earners into higher-rate IT.",
				magnitude: 2,
				direction: "raise-revenue",
				burden: "workers",
			},
		],
	},
];

// Hypothetical-lever burden tags for goal filtering. Mirrors HYPOTHETICAL_LEVERS
// in /src/data/legislation.ts.
const HYPOTHETICAL_BURDEN: Record<string, ChoiceBurden> = {
	"wealth-tax": "wealth",
	"land-value-tax": "wealth",
	"frequent-flyer-levy": "consumers",
	"carbon-border-tax": "consumers",
	"online-services-tax-expansion": "business",
};

const goalSubtitle = (goal: WizardGoal | null, kind: "tax" | "spending"): string => {
	if (!goal) return kind === "tax"
		? "Choose tax moves. Hover to see impact, click to commit."
		: "Where to cut, where to spend. Hover to preview, click to commit.";
	const def = GOAL_DEFINITIONS[goal];
	switch (goal) {
		case "fund-nhs":
			return kind === "tax"
				? `Find £20bn of tax raises (or skip) to fund the implicit NHS expansion. Cards perverse to the goal are hidden.`
				: `Find offsetting spending cuts. The implicit NHS raise is materialised when you reach the simulator.`;
		case "fund-defence":
			return kind === "tax"
				? `Find £15bn to fund the implicit defence raise. Cards perverse to the goal are hidden.`
				: `Find offsetting spending cuts.`;
		case "cut-taxes-basic":
			return kind === "tax"
				? `Find £15bn to fund the implicit basic-rate cut. Worker-burden raises are hidden (they undo the cut).`
				: `Find offsetting spending cuts.`;
		case "cut-taxes-business":
			return kind === "tax"
				? `Find £20bn to fund the implicit business-tax cut. Business-burden raises are hidden.`
				: `Find offsetting spending cuts.`;
		case "reduce-borrowing":
			return kind === "tax"
				? `Pick tax raises toward the £30bn target. Tax cuts are hidden.`
				: `Pick spending cuts toward the £30bn target. Spending raises are hidden.`;
		case "hold-steady":
			return kind === "tax"
				? `Rebalance — pick raises and cuts that net to zero.`
				: `Rebalance spending priorities.`;
		case "free-play":
			return def.description;
	}
};

export function StepTaxes({ state, actions, onAdvance, onBack }: StepProps) {
	const buildLines = (c: TaxChoice): ScenarioLine[] => [
		{
			id: wizardLineId(),
			type: "tax",
			leverId: c.leverId,
			magnitude: c.magnitude,
		},
	];

	const structuralNote = ERAS[state.era].taxStructuralNote;

	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
					Step 3 of 6
				</div>
				<h1 className="text-2xl font-light">Tax decisions</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{goalSubtitle(state.goal, "tax")}
				</p>
			</div>

			{structuralNote && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-900">
					<span className="font-semibold">{ERAS[state.era].year} structure: </span>
					{structuralNote
						.split(/(\*\*[^*]+\*\*)/g)
						.map((part, i) =>
							part.startsWith("**") && part.endsWith("**") ? (
								<strong key={i}>{part.slice(2, -2)}</strong>
							) : (
								<span key={i}>{part}</span>
							),
						)}
				</div>
			)}

			{TAX_CHOICES.map((group) => {
				const visible = group.choices.filter((c) =>
					isChoiceVisibleForGoal(c.direction, c.burden, state.goal),
				);
				if (visible.length === 0) return null;
				return (
					<div key={group.group} className="space-y-2">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
							{group.group}
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{visible.map((c) => {
								const legislation = getTaxLegislationForEra(c.leverId, state.era);
								if (!legislation) return null;
								const eraSubtitle = eraTaxSubtitle(
									c.leverId,
									c.magnitude,
									state.era,
								);
								return (
									<ChoiceCard
										key={c.leverId}
										title={c.title}
										subtitle={eraSubtitle ?? c.subtitle}
										context={c.context}
										legislation={legislation}
										lines={buildLines(c)}
										committed={isCommitted(state, c.leverId)}
										committedOverridden={isCommittedOverridden(state, c.leverId)}
										onPreview={actions.setPreview}
										onClearPreview={actions.clearPreview}
										onCommit={(lines) => {
											if (isCommitted(state, c.leverId)) {
												removeByLeverId(state, actions, c.leverId);
											} else {
												actions.addChoice(lines[0]!);
											}
										}}
										onOverride={(lines) => {
											if (isCommitted(state, c.leverId)) {
												removeByLeverId(state, actions, c.leverId);
											}
											actions.addChoice({ ...lines[0]!, overridden: true });
										}}
									/>
								);
							})}
						</div>
					</div>
				);
			})}

			{/* Hypothetical levers — proper tax-bn lines so they're committable
			    (via override) and the evaluator handles them like any tax raise. */}
			{(() => {
				const visibleHypotheticals = HYPOTHETICAL_LEVERS.slice(0, 4).filter(
					(h) =>
						isChoiceVisibleForGoal(
							"raise-revenue",
							HYPOTHETICAL_BURDEN[h.id] ?? "general",
							state.goal,
						),
				);
				if (visibleHypotheticals.length === 0) return null;
				return (
					<div className="space-y-2">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
							Hypothetical (require new legislation)
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{visibleHypotheticals.map((h) => {
								const legislation = getTaxLegislationForEra(h.id, state.era);
								if (!legislation) return null;
								const magnitudeBn = h.estimatedYield / 1_000_000_000;
								const buildLine = (): ScenarioLine => ({
									id: wizardLineId(),
									type: "tax",
									leverId: h.id,
									magnitude: magnitudeBn,
								});
								return (
									<ChoiceCard
										key={h.id}
										title={h.name}
										subtitle={`Estimated ~£${magnitudeBn.toFixed(0)}bn/yr`}
										context={h.explainer}
										legislation={legislation}
										lines={[buildLine()]}
										committed={isCommitted(state, h.id)}
										committedOverridden={isCommittedOverridden(state, h.id)}
										onPreview={actions.setPreview}
										onClearPreview={actions.clearPreview}
										onCommit={(lines) => {
											if (isCommitted(state, h.id)) {
												removeByLeverId(state, actions, h.id);
											} else {
												actions.addChoice(lines[0]!);
											}
										}}
										onOverride={(lines) => {
											if (isCommitted(state, h.id)) {
												removeByLeverId(state, actions, h.id);
											}
											actions.addChoice({ ...lines[0]!, overridden: true });
										}}
									/>
								);
							})}
						</div>
					</div>
				);
			})()}

			<div className="flex items-center justify-between gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onBack}>
					← Back
				</Button>
				<Button onClick={onAdvance}>Next: Spending →</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 3 · Spending
// ---------------------------------------------------------------------------

interface ProgrammeChoice {
	leverId: string;
	title: string;
	subtitle: string;
	context: string;
	magnitude: number;
	direction: ChoiceDirection;
	burden: ChoiceBurden;
}

const SPENDING_CHOICES: { group: string; choices: ProgrammeChoice[] }[] = [
	{
		group: "Increase spending",
		choices: [
			{
				leverId: "nhs-england",
				title: "NHS +5%",
				subtitle: "+£8.25bn/yr · slight rise above demographic baseline",
				context:
					"Demographic pressure pushes ~3% real growth required to stand still; +5% = real-terms expansion.",
				magnitude: 5,
				direction: "raise-spending",
				burden: "priority-nhs",
			},
			{
				leverId: "education",
				title: "Education +5%",
				subtitle: "+£4.6bn/yr",
				context:
					"DfE budget. Per-pupil funding restored to 2010 levels by 2024-25.",
				magnitude: 5,
				direction: "raise-spending",
				burden: "general",
			},
			{
				leverId: "defence",
				title: "Defence +5%",
				subtitle: "+£2.7bn/yr · contributes to 2.5% pledge",
				context:
					"NATO 2.5% by 2030 pledge implies ~£20bn additional. This is one step toward that.",
				magnitude: 5,
				direction: "raise-spending",
				burden: "priority-defence",
			},
			{
				leverId: "transport",
				title: "Transport +10%",
				subtitle: "+£3.5bn/yr · capital + rail subsidy",
				context: "Investment-shape multiplier (peak year 2-3).",
				magnitude: 10,
				direction: "raise-spending",
				burden: "general",
			},
		],
	},
	{
		group: "Cut spending",
		choices: [
			{
				leverId: "working-age-welfare",
				title: "Working-age welfare −5%",
				subtitle: "−£7bn/yr",
				context:
					"UC + disability + housing benefit. Caseload-driven; 1-2 year lag to deliver. Sharply regressive.",
				magnitude: -5,
				direction: "cut-spending",
				burden: "general",
			},
			{
				leverId: "international-aid",
				title: "Aid −20%",
				subtitle: "−£3bn/yr",
				context:
					"Already at 0.5% (statute is 0.7%). Further cuts would deepen the political controversy.",
				magnitude: -20,
				direction: "cut-spending",
				burden: "general",
			},
			{
				leverId: "local-govt-grants",
				title: "Local govt grants −5%",
				subtitle: "−£2bn/yr",
				context:
					"Already cut ~40% since 2010. Further cuts likely trigger Section 114 (effective bankruptcy) notices in more councils.",
				magnitude: -5,
				direction: "cut-spending",
				burden: "general",
			},
		],
	},
	{
		group: "Statutorily protected",
		choices: [
			{
				leverId: "state-pension",
				title: "State pension −5%",
				subtitle: "+£6.9bn/yr",
				context:
					"Triple lock (Pensions Act 2014). Cutting below CPI requires repealing or suspending the lock.",
				magnitude: -5,
				direction: "cut-spending",
				burden: "general",
			},
			{
				leverId: "defence",
				title: "Defence −10%",
				subtitle: "+£5.4bn/yr",
				context:
					"NATO 2% commitment. Below this would breach the alliance commitment.",
				magnitude: -10,
				direction: "cut-spending",
				burden: "priority-defence",
			},
		],
	},
];

export function StepSpending({
	state,
	actions,
	onAdvance,
	onBack,
}: StepProps) {
	const buildLines = (c: ProgrammeChoice): ScenarioLine[] => [
		{
			id: wizardLineId(),
			type: "programme",
			leverId: c.leverId,
			magnitude: c.magnitude,
		},
	];

	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
					Step 4 of 6
				</div>
				<h1 className="text-2xl font-light">Spending decisions</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{goalSubtitle(state.goal, "spending")}
				</p>
			</div>

			{SPENDING_CHOICES.map((group) => {
				// Statutorily-protected group is always visible — disabled cards
				// teach the user about constraints regardless of their goal.
				const isProtected = group.group === "Statutorily protected";
				const visible = isProtected
					? group.choices
					: group.choices.filter((c) =>
							isChoiceVisibleForGoal(c.direction, c.burden, state.goal),
						);
				if (visible.length === 0) return null;
				return (
					<div key={group.group} className="space-y-2">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
							{group.group}
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{visible.map((c) => {
								const legislation = getProgrammeLegislationForEra(
									c.leverId,
									state.era,
								);
								if (!legislation) return null;
								// For the "Statutorily protected" group, treat as new-legislation-style
								// disabled. Otherwise honour the lever's status.
								const overrideMeta =
									isProtected &&
									legislation.status !== "statutorily-protected"
										? {
												...legislation,
												status: "statutorily-protected" as const,
											}
										: legislation;
								const eraSubtitle = eraProgrammeSubtitle(
									c.leverId,
									c.magnitude,
									state.era,
								);
								return (
									<ChoiceCard
										key={`${c.leverId}-${c.magnitude}`}
										title={c.title}
										subtitle={eraSubtitle ?? c.subtitle}
										context={c.context}
										legislation={overrideMeta}
										lines={buildLines(c)}
										committed={isCommitted(state, c.leverId)}
										committedOverridden={isCommittedOverridden(state, c.leverId)}
										onPreview={actions.setPreview}
										onClearPreview={actions.clearPreview}
										onCommit={(lines) => {
											if (isCommitted(state, c.leverId)) {
												removeByLeverId(state, actions, c.leverId);
											} else {
												actions.addChoice(lines[0]!);
											}
										}}
										onOverride={(lines) => {
											if (isCommitted(state, c.leverId)) {
												removeByLeverId(state, actions, c.leverId);
											}
											actions.addChoice({ ...lines[0]!, overridden: true });
										}}
									/>
								);
							})}
						</div>
					</div>
				);
			})}

			<div className="flex items-center justify-between gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onBack}>
					← Back
				</Button>
				<Button onClick={onAdvance}>Next: Borrow →</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 4 · Borrow
// ---------------------------------------------------------------------------

interface BorrowChoice {
	title: string;
	subtitle: string;
	context: string;
	magnitude: number;
}

const BORROW_CHOICES: BorrowChoice[] = [
	{
		title: "Borrow £20bn",
		subtitle: "Plug the gap with debt issuance",
		context:
			"Year-1 financing; debt interest then follows the marginal gilt portfolio and risk premium.",
		magnitude: 20_000_000_000,
	},
	{
		title: "Borrow £10bn",
		subtitle: "Smaller debt-funded plug",
		context: "Supplies cash up front, then worsens PSNB through interest costs.",
		magnitude: 10_000_000_000,
	},
	{
		title: "Repay £5bn of debt",
		subtitle: "Reduce gilt issuance",
		context: "Uses cash now, improves PSNB and saves debt interest later.",
		magnitude: -5_000_000_000,
	},
];

// borrow more = magnitude > 0 (treated as a freed-up obligation in the lever
// but actually adds debt-servicing cost). For reduce-borrowing goal, the
// raise-borrowing options would directly undo the goal — hide them.
const isBorrowVisibleForGoal = (
	magnitude: number,
	goal: WizardGoal | null,
): boolean => {
	if (goal === "reduce-borrowing") return magnitude < 0; // only "repay" cards
	return true;
};

export function StepBorrow({ state, actions, onAdvance, onBack }: StepProps) {
	return (
		<div className="space-y-4">
			<div>
				<div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
					Step 5 of 6
				</div>
				<h1 className="text-2xl font-light">Borrowing decision</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Plug any remaining gap, or repay debt if you're over-funded.
					(Optional — skip if your scenario balances.)
				</p>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
				{BORROW_CHOICES.filter((c) =>
					isBorrowVisibleForGoal(c.magnitude, state.goal),
				).map((c) => {
					const lines: ScenarioLine[] = [
						{
							id: wizardLineId(),
							type: "borrow",
							leverId: "",
							magnitude: c.magnitude,
						},
					];
					const committed = state.committedScenario.some(
						(l) => l.type === "borrow" && l.magnitude === c.magnitude,
					);
					const display = eraBorrowDisplay(c, state.era);
					return (
						<ChoiceCard
							key={c.title}
							title={display.title}
							subtitle={display.subtitle}
							context={c.context}
							legislation={BORROW_LEGISLATION}
							lines={lines}
							committed={committed}
							onPreview={actions.setPreview}
							onClearPreview={actions.clearPreview}
							onCommit={(ls) => {
								if (committed) {
									const existing = state.committedScenario.find(
										(l) =>
											l.type === "borrow" && l.magnitude === c.magnitude,
									);
									if (existing) actions.removeChoice(existing.id);
								} else {
									actions.addChoice(ls[0]!);
								}
							}}
						/>
					);
				})}
			</div>

			<div className="flex items-center justify-between gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onBack}>
					← Back
				</Button>
				<Button onClick={onAdvance}>Review →</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 5 · Result
// ---------------------------------------------------------------------------

export function StepResult({
	state,
	actions,
	baseline,
	comparisons,
	usdPerGbp,
	onBack,
}: StepProps) {
	const goalDef = state.goal ? GOAL_DEFINITIONS[state.goal] : null;
	const era = ERAS[state.era];
	const isCurrent = state.era === "current";

	// Materialise the goal's implicit action (e.g. NHS +12% for fund-nhs)
	// so the report reflects the full trade — implicit cost + offsets.
	// Without this, fund-nhs users see "balanced" when reality includes
	// the £20bn NHS spend they committed to via the goal.
	const goalLine = materialiseGoalLine(state.goal);
	const fullScenario = goalLine
		? [goalLine, ...state.committedScenario]
		: state.committedScenario;

	const choiceCount = fullScenario.length;
	const hasChoices = choiceCount > 0;
	const editableCount = state.committedScenario.length;

	return (
		<div className="space-y-5">
			<header className="border-b pb-4">
				<div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Step 6 of 6</span>
					<span aria-hidden="true">·</span>
					<span>Report</span>
					{goalDef && (
						<>
							<span aria-hidden="true">·</span>
							<span>{goalDef.label}</span>
						</>
					)}
				</div>
				<div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<h1 className="text-3xl font-light tracking-normal">
							Fiscal report
						</h1>
						<p className="text-sm text-muted-foreground mt-1">
							{hasChoices
								? `${choiceCount} ${choiceCount === 1 ? "decision" : "decisions"}${goalLine ? ", including the goal action" : ""}.`
								: "No decisions yet."}
						</p>
					</div>
					<div className="flex flex-wrap gap-1.5">
						<span className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
							{editableCount} editable
						</span>
						<span className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
							{baseline.stabilityRuleAt}
						</span>
						{!isCurrent && (
							<span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">
								{era.year} era
							</span>
						)}
					</div>
				</div>
			</header>

			{!isCurrent && hasChoices && (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-snug text-amber-900">
					<span className="font-semibold">Era note:</span> figures in the
					report below use present-day lever calibration scaled by{" "}
					{era.year}'s nominal-GDP basis — the era multiplier framework
					applies marginal-rate behavioural response and macro feedback per the
					regime-specific calibration. Compare the HUD's era-£ summary
					against the report's detail to see what the same scenario
					looks like in today's pounds.
				</div>
			)}

			{/* Refine inline — full lever catalog (25+ taxes, 10 programmes,
			    borrow) accessible without leaving the report. */}
			<RefineScenarioPanel
				committedScenario={state.committedScenario}
				onAdd={(line) => actions.addChoice(line)}
				onRemove={actions.removeChoice}
				onUpdate={actions.updateChoice}
				onReplace={actions.replaceScenario}
			/>

			{/* The report itself — OutputRail is the existing simulator
			    sidebar promoted to the wizard's main surface. Progressive
			    disclosure: TopZone always visible (~6 lines), 4 collapsible
			    sections beneath (Trajectory, Who pays, Macro, Assumptions). */}
			<OutputRail
				scenario={fullScenario}
				comparisons={comparisons}
				usdPerGbp={usdPerGbp}
				baseline={baseline}
				emptyMessage="No decisions yet."
			/>

			<div className="flex items-center justify-start gap-2 pt-2">
				<Button variant="outline" size="sm" onClick={onBack}>
					← Back to borrowing
				</Button>
			</div>
		</div>
	);
}

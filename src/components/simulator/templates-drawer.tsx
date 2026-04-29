"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	type AnnotatedBudget,
	ANNOTATED_BUDGETS,
} from "@/data/budgets/annotated";
import {
	type ScenarioDiff,
	deserializeScenario,
	diffScenarios,
} from "@/lib/scenario";
import { ScenarioDiffModal } from "./scenario-diff-modal";

const PARTY_COLOURS: Record<AnnotatedBudget["party"], string> = {
	Labour: "bg-red-50 text-red-800 border-red-200",
	Conservative: "bg-blue-50 text-blue-800 border-blue-200",
	"Lib Dem": "bg-amber-50 text-amber-800 border-amber-200",
	SNP: "bg-yellow-50 text-yellow-800 border-yellow-200",
	Coalition: "bg-purple-50 text-purple-800 border-purple-200",
	Other: "bg-neutral-50 text-neutral-800 border-neutral-200",
};

type PartyFilter = "all" | AnnotatedBudget["party"];

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// Where the budget's scenario lands in the URL. "scenario" is the
	// sandbox's editor param (legacy default). "wiz" is the wizard's
	// committed-scenario param — pushing wiz= directly avoids the
	// brief scenario= → wiz= rewrite that the wizard's URL effect
	// would do otherwise. Defaults to "scenario" for back-compat.
	targetParam?: "scenario" | "wiz";
}

interface PendingLoad {
	budget: AnnotatedBudget;
	diff: ScenarioDiff;
}

export function TemplatesDrawer({
	open,
	onOpenChange,
	targetParam = "scenario",
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [pendingLoad, setPendingLoad] = useState<PendingLoad | null>(null);
	const [search, setSearch] = useState("");
	const [partyFilter, setPartyFilter] = useState<PartyFilter>("all");

	// Close on Escape.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	const availableParties = useMemo<readonly PartyFilter[]>(() => {
		const set = new Set<AnnotatedBudget["party"]>();
		for (const b of ANNOTATED_BUDGETS) set.add(b.party);
		return ["all", ...Array.from(set)];
	}, []);

	const filteredBudgets = useMemo(() => {
		const q = search.trim().toLowerCase();
		return ANNOTATED_BUDGETS.filter((b) => {
			if (partyFilter !== "all" && b.party !== partyFilter) return false;
			if (!q) return true;
			return (
				b.name.toLowerCase().includes(q) ||
				b.chancellor.toLowerCase().includes(q) ||
				b.shortDescription.toLowerCase().includes(q)
			);
		});
	}, [search, partyFilter]);

	const applyBudget = (budget: AnnotatedBudget) => {
		const params = new URLSearchParams(searchParams.toString());
		// Both shapes of scenario param get cleared so the new budget is
		// the single source of truth in the URL regardless of which one
		// the surface uses.
		params.delete("scenario");
		params.delete("wiz");
		params.delete("editor");
		params.delete("g");
		params.delete("gq");
		params.delete("ga");
		if (budget.scenario) params.set(targetParam, budget.scenario);
		// In wizard context, also jump to the Result step so the report
		// is the user's destination after loading a budget.
		if (targetParam === "wiz" && budget.scenario) {
			params.set("wstep", "5");
		}
		const qs = params.toString();
		router.push(qs ? `/?${qs}` : "/", { scroll: false });
		onOpenChange(false);
		setPendingLoad(null);
	};

	const loadBudget = (budget: AnnotatedBudget) => {
		if (budget.placeholder) return;
		// If the user has any current scenario state, show the diff modal so
		// they can confirm before their work is replaced. Read from
		// whichever URL param the surface uses (sandbox: scenario=, wizard:
		// wiz=); empty scenario means no-friction load.
		const currentScenarioStr =
			searchParams.get(targetParam) ?? "";
		const currentLines = deserializeScenario(currentScenarioStr);
		if (currentLines.length > 0) {
			const incomingLines = deserializeScenario(budget.scenario ?? "");
			const diff = diffScenarios(currentLines, incomingLines);
			setPendingLoad({ budget, diff });
			return;
		}
		applyBudget(budget);
	};

	const drawerPanel = open ? (
		<div
			className="fixed inset-0 z-50"
			role="dialog"
			aria-modal="true"
			aria-label="Replay a UK budget"
		>
			{/* Overlay */}
			<button
				type="button"
				className="absolute inset-0 bg-background/80 backdrop-blur-sm cursor-default"
				onClick={() => onOpenChange(false)}
				aria-label="Close drawer"
			/>

			{/* Drawer panel */}
			<div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-background border-l shadow-xl flex flex-col">
				<div className="px-4 py-3 border-b flex items-center justify-between gap-4">
					<div>
						<h2 className="font-semibold">Replay a budget</h2>
						<p className="text-xs text-muted-foreground">
							{filteredBudgets.length} of {ANNOTATED_BUDGETS.length} budgets,
							2010–2026
						</p>
					</div>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="text-muted-foreground hover:text-foreground text-sm"
					>
						Close
					</button>
				</div>

				<div className="px-4 py-3 border-b space-y-2 bg-muted/20">
					<input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search by name, chancellor, or description…"
						className="w-full px-2.5 py-1.5 text-sm border rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
						aria-label="Search budgets"
					/>
					<div
						role="group"
						aria-label="Filter by party"
						className="flex flex-wrap gap-1"
					>
						{availableParties.map((p) => (
							<button
								key={p}
								type="button"
								aria-pressed={partyFilter === p}
								onClick={() => setPartyFilter(p)}
								className={cn(
									"text-[11px] px-2 py-0.5 rounded-full border transition-colors",
									partyFilter === p
										? p === "all"
											? "bg-foreground text-background border-foreground"
											: PARTY_COLOURS[p as AnnotatedBudget["party"]]
										: "bg-background text-muted-foreground border-input hover:bg-accent",
								)}
							>
								{p === "all" ? "All parties" : p}
							</button>
						))}
					</div>
				</div>

				<div className="flex-1 overflow-y-auto p-4 space-y-3">
					{filteredBudgets.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-8">
							No budgets match. Try clearing the search or party filter.
						</p>
					)}
					{filteredBudgets.map((budget) => (
						<div
							key={budget.id}
							className={cn(
								"rounded-lg border bg-card p-3",
								budget.placeholder && "opacity-70 border-dashed",
							)}
						>
							<div className="flex items-start justify-between gap-2 flex-wrap">
								<div className="flex-1 min-w-[200px]">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="font-semibold text-sm">{budget.name}</h3>
										<span className="text-[11px] text-muted-foreground tabular-nums">
											{formatDate(budget.date)}
										</span>
										<span
											className={cn(
												"text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
												PARTY_COLOURS[budget.party],
											)}
										>
											{budget.party}
										</span>
									</div>
									<p className="text-[11px] text-muted-foreground mt-0.5">
										{budget.chancellor}
									</p>
									<p className="text-xs mt-1.5">{budget.shortDescription}</p>
									<details className="mt-1.5 text-[11px] text-muted-foreground">
										<summary className="cursor-pointer hover:text-foreground">
											More on this budget
										</summary>
										<div className="mt-1.5 space-y-1.5 leading-snug">
											<p>{budget.notes}</p>
											<p className="italic">
												<strong>What this scenario simplifies:</strong>{" "}
												{budget.caveats}
											</p>
											<p>
												<a
													href={budget.source.url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-blue-600 hover:underline"
												>
													{budget.source.label} →
												</a>
											</p>
										</div>
									</details>
								</div>
								<Button
									type="button"
									variant={budget.placeholder ? "outline" : "default"}
									size="sm"
									disabled={budget.placeholder}
									onClick={() => loadBudget(budget)}
									className="shrink-0"
								>
									{budget.placeholder ? "Awaiting" : "Load"}
								</Button>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	) : null;

	return (
		<>
			{drawerPanel}
			<ScenarioDiffModal
				open={pendingLoad !== null}
				onOpenChange={(o) => {
					if (!o) setPendingLoad(null);
				}}
				budgetName={pendingLoad?.budget.name ?? ""}
				diff={
					pendingLoad?.diff ?? {
						removed: [],
						added: [],
						modified: [],
						unchanged: [],
					}
				}
				onConfirm={() => {
					if (pendingLoad) applyBudget(pendingLoad.budget);
				}}
			/>
		</>
	);
}

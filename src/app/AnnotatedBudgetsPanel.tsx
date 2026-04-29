"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	type AnnotatedBudget,
	ANNOTATED_BUDGETS,
} from "@/data/budgets/annotated";

const PARTY_COLOURS: Record<AnnotatedBudget["party"], string> = {
	Labour: "bg-red-50 text-red-800 border-red-200",
	Conservative: "bg-blue-50 text-blue-800 border-blue-200",
	"Lib Dem": "bg-amber-50 text-amber-800 border-amber-200",
	SNP: "bg-yellow-50 text-yellow-800 border-yellow-200",
	Coalition: "bg-purple-50 text-purple-800 border-purple-200",
	Other: "bg-neutral-50 text-neutral-800 border-neutral-200",
};

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	return d.toLocaleDateString("en-GB", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export default function AnnotatedBudgetsPanel() {
	const router = useRouter();

	const loadBudget = (budget: AnnotatedBudget) => {
		if (budget.placeholder) return;
		const params = new URLSearchParams(window.location.search);
		// Replay should reset scenario state cleanly, but preserve unrelated params.
		params.delete("scenario");
		if (budget.scenario) params.set("scenario", budget.scenario);
		const qs = params.toString();
		router.push(qs ? `/?${qs}` : "/", { scroll: false });
		// Smooth-scroll to the scenario builder so users see the load take effect.
		requestAnimationFrame(() => {
			document
				.getElementById("scenario-builder")
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	};

	return (
		<Card className="mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light text-center">
					Replay a real budget
					<br />
					<span className="text-base text-muted-foreground font-normal">
						See how recent fiscal events look in this framework.
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{ANNOTATED_BUDGETS.map((budget) => (
					<div
						key={budget.id}
						className={cn(
							"rounded-lg border bg-card p-4",
							budget.placeholder && "opacity-70 border-dashed",
						)}
					>
						<div className="flex items-start justify-between gap-3 flex-wrap">
							<div className="flex-1 min-w-[200px]">
								<div className="flex items-center gap-2 flex-wrap">
									<h3 className="font-semibold">{budget.name}</h3>
									<span className="text-xs text-muted-foreground tabular-nums">
										{formatDate(budget.date)}
									</span>
									<span
										className={cn(
											"text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border",
											PARTY_COLOURS[budget.party],
										)}
									>
										{budget.party}
									</span>
									{budget.placeholder && (
										<span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border bg-amber-50 text-amber-900 border-amber-200">
											placeholder
										</span>
									)}
								</div>
								<p className="text-xs text-muted-foreground mt-0.5">
									{budget.chancellor}
								</p>
								<p className="text-sm mt-2">{budget.shortDescription}</p>
								<details className="mt-2 text-xs text-muted-foreground">
									<summary className="cursor-pointer hover:text-foreground">
										More on this budget
									</summary>
									<div className="mt-2 space-y-2 leading-snug">
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
								title={
									budget.placeholder
										? "This entry is a placeholder; edit src/data/budgets/annotated.ts to populate it."
										: "Load this budget into the scenario builder above."
								}
							>
								{budget.placeholder ? "Awaiting authoring" : "Replay"}
							</Button>
						</div>
					</div>
				))}
				<p className="text-xs text-muted-foreground text-center pt-2 border-t">
					Each replay is an approximation — the calculator's six tax levers and
					ten programmes can't capture every Budget measure. The "What this
					scenario simplifies" disclosure on each entry names what's missing.
				</p>
			</CardContent>
		</Card>
	);
}

"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { REPRESENTATIVE_HOUSEHOLDS } from "@/data/households";
import type { ScenarioResult } from "@/lib/scenario";
import { evaluateHouseholdImpact } from "@/lib/household-impact";

// Renders the scenario's £/yr impact across ~9 representative UK households.
// This is the "what does this mean for me?" framing IFS, Resolution Foundation
// and Treasury tables use — concrete archetypes (single mum on UC, pensioner
// couple, top-decile) rather than aggregate decile shares.
//
// The figures are "back of envelope but credible": direct calculation for
// the major income-tax / NICs / VAT / dividend / state pension / working-age
// welfare channels, with decile-share fallback for public-good levers where
// per-household attribution doesn't have a clean theory.

interface Props {
	result: ScenarioResult;
}

const formatGbp = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${Math.round(abs).toLocaleString()}`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}`;
	if (abs > 0) return `${sign}£${abs.toFixed(1)}`;
	return "£0";
};

const formatPct = (n: number): string => {
	const abs = Math.abs(n) * 100;
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 0.005) return `${sign}${abs.toFixed(2)}%`;
	return "0%";
};

export function HouseholdImpactPanel({ result }: Props) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	if (result.lines.length === 0) return null;

	const impacts = REPRESENTATIVE_HOUSEHOLDS.map((h) => ({
		household: h,
		impact: evaluateHouseholdImpact(h, result),
	}));

	// All-zero scenario? Don't render.
	if (impacts.every((i) => Math.abs(i.impact.totalImpactGbp) < 1)) {
		return null;
	}

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Household impact
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{REPRESENTATIVE_HOUSEHOLDS.length} archetypes
				</span>
			</div>

			<div className="rounded-md border bg-background/60 overflow-hidden">
				<table className="w-full text-[11px] tabular-nums">
					<thead>
						<tr className="bg-muted/30 text-muted-foreground">
							<th className="text-left px-2 py-1 font-medium">Household</th>
							<th className="text-right px-2 py-1 font-medium">£/yr</th>
							<th className="text-right px-2 py-1 font-medium pr-2">
								% net income
							</th>
						</tr>
					</thead>
					<tbody>
						{impacts.map(({ household, impact }) => {
							const isExpanded = expandedId === household.id;
							const hasImpact = Math.abs(impact.totalImpactGbp) >= 1;
							const colour =
								impact.totalImpactGbp > 0
									? "text-amber-700"
									: impact.totalImpactGbp < 0
										? "text-blue-700"
										: "text-muted-foreground";
							return (
								<Fragment key={household.id}>
									<tr
										className={cn(
											"border-t cursor-pointer hover:bg-accent/30 transition-colors",
											isExpanded && "bg-accent/20",
										)}
										onClick={() =>
											setExpandedId(isExpanded ? null : household.id)
										}
									>
										<td className="px-2 py-1.5">
											<div className="text-foreground/90 leading-tight">
												{household.label}
											</div>
											<div className="text-[10px] text-muted-foreground">
												decile {household.decile} · net £
												{(household.netIncome / 1000).toFixed(0)}k
											</div>
										</td>
										<td className={cn("text-right px-2 py-1.5", colour)}>
											{hasImpact ? formatGbp(impact.totalImpactGbp) : "·"}
										</td>
										<td
											className={cn(
												"text-right px-2 py-1.5 pr-2",
												colour,
											)}
										>
											{hasImpact
												? formatPct(impact.asPercentOfNetIncome)
												: "·"}
										</td>
									</tr>
									{isExpanded && (
										<tr className="bg-muted/20">
											<td colSpan={3} className="px-2 py-2">
												<div className="text-[10px] text-muted-foreground italic mb-1.5">
													{household.description}
												</div>
												<ul className="space-y-0.5 text-[10px]">
													{impact.perLine
														.filter(
															(p) =>
																Math.abs(p.impactGbp) >= 0.5 ||
																p.method !== "skipped",
														)
														.map((p, i) => (
															<li
																key={i}
																className="flex items-baseline justify-between gap-2"
															>
																<span className="truncate">
																	{p.description}
																</span>
																<span className="flex items-baseline gap-1.5 shrink-0">
																	<span
																		className={cn(
																			"text-[9px] uppercase tracking-wider",
																			p.method === "direct"
																				? "text-blue-600"
																				: p.method === "decile"
																					? "text-amber-600"
																					: "text-muted-foreground",
																		)}
																	>
																		{p.method}
																	</span>
																	<span
																		className={cn(
																			"tabular-nums w-16 text-right",
																			p.impactGbp > 0
																				? "text-amber-700"
																				: p.impactGbp < 0
																					? "text-blue-700"
																					: "text-muted-foreground",
																		)}
																	>
																		{Math.abs(p.impactGbp) >= 0.5
																			? formatGbp(p.impactGbp)
																			: "·"}
																	</span>
																</span>
															</li>
														))}
												</ul>
											</td>
										</tr>
									)}
								</Fragment>
							);
						})}
					</tbody>
				</table>
			</div>

			<p className="text-[10px] text-muted-foreground leading-snug">
				Tap a row for the per-line breakdown. <strong>direct</strong> = computed
				from the household's actual income exposure; <strong>decile</strong> =
				allocated by the lever's incidence vector at this household's decile
				(used for public-good levers like NHS, defence). Pseudo-microsimulation
				— a full FRS-microdata model would capture UC taper interactions, child
				benefit charge thresholds, and within-decile heterogeneity not reflected
				here. Sign convention: positive £ = household loses; negative = household
				gains.
			</p>
		</div>
	);
}

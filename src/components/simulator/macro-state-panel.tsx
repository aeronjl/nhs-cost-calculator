"use client";

import { cn } from "@/lib/utils";
import type { MacroState } from "@/lib/scenario";

// Renders the year-by-year macro state of the scenario: CPI deviation, GDP
// deviation, debt:GDP shift, Bank Rate response, and gilt yield response.
// This is the Scope B macro model output — moves the calculator from
// "single multiplier" to "endogenous macro state" framing.
//
// All deviations are vs OBR baseline. Scope C feeds this state back into
// per-line yields; Scope B exposes the macro state for transparency.

interface Props {
	path: readonly MacroState[];
	convergence?: {
		iterations: number;
		converged: boolean;
		maxChangeGbp: number;
	};
}

const formatPp = (n: number, digits = 2): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs < 0.005) return "0pp";
	return `${sign}${abs.toFixed(digits)}pp`;
};

const formatPct = (n: number, digits = 2): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs < 0.005) return "0%";
	return `${sign}${abs.toFixed(digits)}%`;
};

const formatGbp = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(abs / 1_000_000)}m`;
	return `£${Math.round(abs).toLocaleString()}`;
};

const significantState = (s: MacroState): boolean =>
	Math.abs(s.cpiDeviationPp) > 0.005 ||
	Math.abs(s.gdpDeviationPct) > 0.005 ||
	Math.abs(s.debtGdpDeviationPp) > 0.005 ||
	Math.abs(s.bankRateDeviationPp) > 0.0005 ||
	Math.abs(s.giltYieldDeviationPp) > 0.0005;

export function MacroStatePanel({ path, convergence }: Props) {
	if (path.length === 0) return null;
	if (!path.some(significantState)) return null;

	const lastYear = path[path.length - 1]!;
	const convergenceText = convergence
		? ` over ${convergence.iterations} iteration${
				convergence.iterations === 1 ? "" : "s"
			}; ${convergence.converged ? "converged" : "bounded stop"} with ${formatGbp(
				convergence.maxChangeGbp,
			)} residual change.`
		: " once.";

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Macro state path
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{convergence ? "Scope C · iterated" : "Scope B · reduced-form"}
				</span>
			</div>

			<div className="rounded-md border bg-background/60 overflow-hidden">
				<table className="w-full tabular-nums text-[10px]">
					<thead>
						<tr className="bg-muted/30 text-muted-foreground">
							<th className="text-left px-2 py-1">Year</th>
							<th className="text-right px-2 py-1">CPI</th>
							<th className="text-right px-2 py-1">GDP</th>
							<th className="text-right px-2 py-1">Debt:GDP</th>
							<th className="text-right px-2 py-1">Bank</th>
							<th className="text-right px-2 py-1 pr-2">Gilt</th>
						</tr>
					</thead>
					<tbody>
						{path.map((s) => (
							<tr key={s.year} className="border-t">
								<td className="px-2 py-1 text-muted-foreground">
									{s.year}
								</td>
								<td
									className={cn(
										"text-right px-2 py-1",
										s.cpiDeviationPp > 0.01
											? "text-amber-700"
											: s.cpiDeviationPp < -0.01
												? "text-blue-700"
												: "",
									)}
								>
									{formatPp(s.cpiDeviationPp)}
								</td>
								<td
									className={cn(
										"text-right px-2 py-1",
										s.gdpDeviationPct > 0.01
											? "text-blue-700"
											: s.gdpDeviationPct < -0.01
												? "text-amber-700"
												: "",
									)}
								>
									{formatPct(s.gdpDeviationPct)}
								</td>
								<td
									className={cn(
										"text-right px-2 py-1",
										s.debtGdpDeviationPp > 0.01
											? "text-amber-700"
											: s.debtGdpDeviationPp < -0.01
												? "text-blue-700"
												: "",
									)}
								>
									{formatPp(s.debtGdpDeviationPp, 2)}
								</td>
								<td
									className={cn(
										"text-right px-2 py-1 pr-2",
										s.bankRateDeviationPp > 0.001
											? "text-amber-700"
											: s.bankRateDeviationPp < -0.001
												? "text-blue-700"
												: "",
									)}
								>
									{formatPp(s.bankRateDeviationPp, 3)}
								</td>
								<td
									className={cn(
										"text-right px-2 py-1 pr-2",
										s.giltYieldDeviationPp > 0.001
											? "text-amber-700"
											: s.giltYieldDeviationPp < -0.001
												? "text-blue-700"
												: "",
									)}
								>
									{formatPp(s.giltYieldDeviationPp, 3)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p className="text-[10px] text-muted-foreground leading-snug">
				Reduced-form Scope B macro path: GDP deviation from per-lever multiplier
				path, CPI deviation from VAT/fuel duty pass-through, debt:GDP shift from
				cumulative scenario PSNB impact, gilt yield response at ~5bp per 1pp
				debt:GDP. <strong>Year {lastYear.year}</strong>: GDP{" "}
				{formatPct(lastYear.gdpDeviationPct, 2)} vs baseline; CPI{" "}
				{formatPp(lastYear.cpiDeviationPp)}; debt:GDP{" "}
				{formatPp(lastYear.debtGdpDeviationPp)}; Bank Rate{" "}
				{formatPp(lastYear.bankRateDeviationPp, 3)}.
			</p>
			<p className="text-[10px] text-muted-foreground leading-snug">
				Scope C feeds CPI, Bank Rate, and gilt-yield deviations back into
				per-line yields and borrowing costs
				{convergenceText}
			</p>
		</div>
	);
}

"use client";

import { type PointerEvent, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MacroState } from "@/lib/scenario";
import { pointerToYearIndex, useYearFocus } from "@/lib/year-focus";

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

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? n.toFixed(4) : "0.0000"}%`;

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

			<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
				<MacroStatePathChart
					title="GDP"
					subtitle="output gap"
					path={path}
					values={path.map((s) => s.gdpDeviationPct)}
					formatValue={(value) => formatPct(value, 2)}
					positiveTone="blue"
					ariaLabel="GDP deviation path versus baseline"
				/>
				<MacroStatePathChart
					title="CPI"
					subtitle="price level"
					path={path}
					values={path.map((s) => s.cpiDeviationPp)}
					formatValue={(value) => formatPp(value, 2)}
					positiveTone="amber"
					ariaLabel="CPI deviation path versus baseline"
				/>
				<MacroStatePathChart
					title="Debt:GDP"
					subtitle="debt proxy"
					path={path}
					values={path.map((s) => s.debtGdpDeviationPp)}
					formatValue={(value) => formatPp(value, 2)}
					positiveTone="amber"
					ariaLabel="Debt to GDP deviation path versus baseline"
				/>
				<MacroStatePathChart
					title="Bank Rate"
					subtitle="policy response"
					path={path}
					values={path.map((s) => s.bankRateDeviationPp)}
					formatValue={(value) => formatPp(value, 3)}
					positiveTone="amber"
					ariaLabel="Bank Rate deviation path versus baseline"
				/>
				<MacroStatePathChart
					title="Gilt yield"
					subtitle="market rate"
					path={path}
					values={path.map((s) => s.giltYieldDeviationPp)}
					formatValue={(value) => formatPp(value, 3)}
					positiveTone="amber"
					ariaLabel="Gilt yield deviation path versus baseline"
				/>
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

			<details className="rounded-md border bg-background/60 text-[10px] text-muted-foreground">
				<summary className="cursor-pointer list-none px-2 py-1.5">
					<div className="flex items-baseline justify-between gap-2">
						<span className="font-medium text-foreground">
							Show year-by-year macro state table
						</span>
						<span className="tabular-nums">{path.length} years</span>
					</div>
				</summary>
				<div className="overflow-x-auto border-t">
					<table className="w-full min-w-[520px] tabular-nums">
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
			</details>
		</div>
	);
}

function MacroStatePathChart({
	title,
	subtitle,
	path,
	values,
	formatValue,
	positiveTone,
	ariaLabel,
}: {
	title: string;
	subtitle: string;
	path: readonly MacroState[];
	values: readonly number[];
	formatValue: (value: number) => string;
	positiveTone: "blue" | "amber";
	ariaLabel: string;
}) {
	const width = 160;
	const height = 72;
	const padX = 8;
	const padY = 8;
	const innerWidth = width - padX * 2;
	const innerHeight = height - padY * 2;
	const rawMin = Math.min(...values, 0);
	const rawMax = Math.max(...values, 0);
	const rawRange = rawMax - rawMin;
	const padding =
		rawRange > 0 ? rawRange * 0.18 : Math.max(Math.abs(rawMax), 0.01);
	const min = rawMin - padding;
	const max = rawMax + padding;
	const range = max - min || 1;
	const xAt = (index: number): number =>
		padX + (innerWidth * index) / Math.max(1, values.length - 1);
	const yAt = (value: number): number =>
		padY + innerHeight - ((value - min) / range) * innerHeight;
	const points = values
		.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`)
		.join(" ");
	const areaPoints =
		values.length > 0
			? [
					`${xAt(0)},${yAt(0)}`,
					...values.map((value, index) => `${xAt(index)},${yAt(value)}`),
					`${xAt(values.length - 1)},${yAt(0)}`,
				].join(" ")
			: "";
	const finalValue = values[values.length - 1] ?? 0;
	const finalTone =
		finalValue > 0
			? positiveTone
			: finalValue < 0
				? positiveTone === "blue"
					? "amber"
					: "blue"
				: "muted";
	const color =
		finalTone === "blue"
			? "#2563eb"
			: finalTone === "amber"
				? "#d97706"
				: "#6b7280";

	const { year: focusedYear, setYear, clear } = useYearFocus();
	const svgRef = useRef<SVGSVGElement | null>(null);
	const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const svg = svgRef.current;
		if (!svg) return;
		const next = pointerToYearIndex({
			clientX: event.clientX,
			rect: svg.getBoundingClientRect(),
			years: values.length,
			padX,
			innerWidth,
			viewBoxWidth: width,
		});
		if (next !== null) setYear(next);
	};
	const focusedIndex =
		focusedYear !== null && focusedYear >= 1 && focusedYear <= values.length
			? focusedYear - 1
			: null;
	const focusedValue =
		focusedIndex !== null ? values[focusedIndex] ?? null : null;
	const headlineValue = focusedValue ?? finalValue;
	const headlineLabel = focusedIndex !== null
		? `Y${path[focusedIndex]?.year ?? focusedIndex + 1}`
		: `Y${path.at(-1)?.year ?? values.length}`;
	const headlineTone =
		focusedValue !== null
			? focusedValue > 0
				? positiveTone
				: focusedValue < 0
					? positiveTone === "blue"
						? "amber"
						: "blue"
					: "muted"
			: finalTone;

	return (
		<div className="rounded-md border bg-background/60 p-2">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-xs font-medium">{title}</div>
					<div className="truncate text-[10px] text-muted-foreground">
						{subtitle}
					</div>
				</div>
				<div
					className={cn(
						"text-right text-xs font-semibold tabular-nums",
						headlineTone === "blue"
							? "text-blue-700"
							: headlineTone === "amber"
								? "text-amber-700"
								: "text-muted-foreground",
					)}
				>
					<span className="mr-1 text-[9px] uppercase tracking-wider text-muted-foreground">
						{headlineLabel}
					</span>
					{formatValue(headlineValue)}
				</div>
			</div>
			<svg
				ref={svgRef}
				viewBox={`0 0 ${width} ${height}`}
				className="mt-2 h-20 w-full touch-none"
				preserveAspectRatio="none"
				role="img"
				aria-label={ariaLabel}
				onPointerMove={handlePointerMove}
				onPointerLeave={clear}
				onPointerDown={handlePointerMove}
			>
				<line
					x1={padX}
					x2={width - padX}
					y1={yAt(0)}
					y2={yAt(0)}
					stroke="currentColor"
					strokeDasharray="3 3"
					strokeWidth="0.8"
					vectorEffect="non-scaling-stroke"
					className="text-foreground/35"
				/>
				{areaPoints && (
					<polygon points={areaPoints} fill={color} opacity="0.1">
						<title>{`${title} deviation area versus baseline`}</title>
					</polygon>
				)}
				<path
					d={points}
					fill="none"
					stroke={color}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
				{values.map((value, index) => {
					const isFocused = focusedIndex === index;
					return (
						<circle
							key={`${title}-${path[index]?.year ?? index}`}
							cx={xAt(index)}
							cy={yAt(value)}
							r={isFocused ? 3 : index === values.length - 1 ? 2.4 : 1.6}
							fill={color}
							stroke={isFocused ? "white" : undefined}
							strokeWidth={isFocused ? 0.8 : 0}
							vectorEffect="non-scaling-stroke"
						>
							<title>{`${title} · year ${path[index]?.year ?? index + 1}: ${formatValue(value)} vs baseline`}</title>
						</circle>
					);
				})}
				{focusedIndex !== null && (
					<line
						x1={xAt(focusedIndex)}
						x2={xAt(focusedIndex)}
						y1={padY}
						y2={height - padY}
						stroke="currentColor"
						strokeDasharray="2 2"
						strokeWidth="0.8"
						vectorEffect="non-scaling-stroke"
						className="text-foreground/60 pointer-events-none"
					/>
				)}
			</svg>
			<div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground">
				<span
					className={cn(focusedIndex === 0 && "font-semibold text-foreground")}
				>
					Y{path[0]?.year ?? 1}
				</span>
				<span>baseline = 0</span>
				<span
					className={cn(
						focusedIndex === values.length - 1 && "font-semibold text-foreground",
					)}
				>
					Y{path.at(-1)?.year ?? values.length}
				</span>
			</div>
		</div>
	);
}

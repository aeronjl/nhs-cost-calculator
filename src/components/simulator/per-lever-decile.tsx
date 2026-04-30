"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	type LineEvaluation,
	evaluateLineDistribution,
} from "@/lib/scenario";

// Per-lever decile breakdown. Today the DistributionalImpact / WhoPaysOverview
// charts show the *aggregate* per-decile delta — they answer "what does each
// decile lose or gain overall?" but not "which lever drives that for D1, vs.
// for D10?".
//
// This panel breaks each decile bar into per-lever segments so the user can
// see, for example, that the basic-rate cut accounts for 80% of the bottom-
// decile hit while the corp-tax raise accounts for 90% of the top-decile
// hit. Lines without an incidence vector are excluded and surfaced as a
// muted unmodelled marker.
//
// Sign convention follows the rest of the codebase:
//   positive £ per decile = decile LOSES income (tax raise / programme cut)
//   negative £ per decile = decile GAINS income (tax cut / programme spend).

interface Props {
	lines: readonly LineEvaluation[];
}

const HOUSEHOLDS_PER_DECILE = 2_800_000;

const PER_LEVER_PALETTE: readonly string[] = [
	"#2563eb", // blue-600
	"#d97706", // amber-600
	"#0891b2", // cyan-600
	"#be185d", // pink-700
	"#7c3aed", // violet-600
	"#15803d", // green-700
	"#c2410c", // orange-700
	"#4f46e5", // indigo-600
];

const fallbackColor = "#475569"; // slate-600

const formatPerHousehold = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(1)}k`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}`;
	if (abs >= 1) return `${sign}£${abs.toFixed(1)}`;
	return "£0";
};

const formatStylePct = (n: number): string =>
	`${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1_000_000_000) return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

interface ModelledLine {
	id: string;
	description: string;
	color: string;
	perDecile: readonly number[];
}

export function PerLeverDecileBreakdown({ lines }: Props) {
	const { modelledLines, unmodelledLines, modelledDelta } = useMemo(() => {
		const modelled: ModelledLine[] = [];
		const unmodelled: { id: string; description: string }[] = [];
		let aggregate = 0;
		let colorIndex = 0;
		for (const ev of lines) {
			const dist = evaluateLineDistribution(ev);
			if (!dist) {
				unmodelled.push({ id: ev.line.id, description: ev.description });
				continue;
			}
			const color = PER_LEVER_PALETTE[colorIndex % PER_LEVER_PALETTE.length] ?? fallbackColor;
			modelled.push({
				id: ev.line.id,
				description: ev.description,
				color,
				perDecile: dist,
			});
			aggregate += dist.reduce((s, v) => s + v, 0);
			colorIndex++;
		}
		return {
			modelledLines: modelled,
			unmodelledLines: unmodelled,
			modelledDelta: aggregate,
		};
	}, [lines]);

	if (modelledLines.length === 0) return null;

	// Determine per-decile maxAbs for scaling. The chart uses a symmetric
	// axis so positive (loss) and negative (gain) bars share the same px:£
	// scale and cross at the centre.
	let maxAbsPerHousehold = 0;
	for (let d = 0; d < 10; d++) {
		let posSum = 0;
		let negSum = 0;
		for (const line of modelledLines) {
			const v = (line.perDecile[d] ?? 0) / HOUSEHOLDS_PER_DECILE;
			if (v > 0) posSum += v;
			else negSum += v;
		}
		maxAbsPerHousehold = Math.max(
			maxAbsPerHousehold,
			Math.abs(posSum),
			Math.abs(negSum),
		);
	}
	if (maxAbsPerHousehold <= 0) return null;

	return (
		<section
			aria-label="Per-lever decile breakdown"
			className="rounded-md border bg-background/70 p-3"
		>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<div>
					<h3 className="text-sm font-semibold">Decile bars by lever</h3>
					<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
						Each decile bar is split into the lever-level contribution. Loss
						extends right, gain left, baseline = £0/yr per household.
					</p>
				</div>
				<div className="text-[10px] text-muted-foreground">
					{modelledLines.length}/{lines.length} lines with incidence
				</div>
			</div>

			<div className="mt-3 space-y-1" role="img" aria-label="Per-lever decile contribution stack">
				{Array.from({ length: 10 }, (_, decile) => (
					<DecileRow
						key={decile}
						decile={decile + 1}
						modelledLines={modelledLines}
						maxAbsPerHousehold={maxAbsPerHousehold}
					/>
				))}
			</div>

			<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
				{modelledLines.map((line) => (
					<span key={line.id} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="inline-block h-2 w-2 rounded-sm"
							style={{ backgroundColor: line.color }}
						/>
						<span className="text-muted-foreground">{line.description}</span>
					</span>
				))}
			</div>

			{unmodelledLines.length > 0 && (
				<p className="mt-2 text-[10px] leading-snug text-amber-700">
					{unmodelledLines.length} line
					{unmodelledLines.length === 1 ? "" : "s"} excluded for lack of an
					incidence vector — totalling {formatBn(modelledDelta)} of modelled
					basis only.
				</p>
			)}
		</section>
	);
}

function DecileRow({
	decile,
	modelledLines,
	maxAbsPerHousehold,
}: {
	decile: number;
	modelledLines: readonly ModelledLine[];
	maxAbsPerHousehold: number;
}) {
	// Build positive (loss) and negative (gain) segment lists, ordered by
	// magnitude descending so the largest contributor is closest to zero
	// and easiest to read.
	const decileIdx = decile - 1;
	const positives: { id: string; color: string; valuePerHh: number; description: string }[] = [];
	const negatives: { id: string; color: string; valuePerHh: number; description: string }[] = [];
	let netPerHh = 0;
	for (const line of modelledLines) {
		const valuePerHh = (line.perDecile[decileIdx] ?? 0) / HOUSEHOLDS_PER_DECILE;
		netPerHh += valuePerHh;
		if (valuePerHh > 0.5) {
			positives.push({
				id: line.id,
				color: line.color,
				valuePerHh,
				description: line.description,
			});
		} else if (valuePerHh < -0.5) {
			negatives.push({
				id: line.id,
				color: line.color,
				valuePerHh,
				description: line.description,
			});
		}
	}
	positives.sort((a, b) => b.valuePerHh - a.valuePerHh);
	negatives.sort((a, b) => a.valuePerHh - b.valuePerHh);

	const toPctWidth = (v: number): number =>
		(Math.abs(v) / maxAbsPerHousehold) * 50;
	const netTone =
		netPerHh > 0
			? "text-amber-700"
			: netPerHh < 0
				? "text-blue-700"
				: "text-muted-foreground";

	return (
		<div className="grid grid-cols-[1.5rem_minmax(0,1fr)_70px] items-center gap-2 text-[10px] tabular-nums">
			<span className="text-right text-muted-foreground">D{decile}</span>
			<div className="relative h-3.5 rounded-sm bg-muted/30">
				<span
					aria-hidden="true"
					className="absolute left-1/2 top-0 h-full w-px bg-foreground/40"
				/>
				{(() => {
					let leftCursor = 50;
					return negatives.map((seg) => {
						const w = toPctWidth(seg.valuePerHh);
						leftCursor -= w;
						return (
							<span
								key={`${decile}-${seg.id}-neg`}
								className="absolute top-0 bottom-0"
								style={{
									left: formatStylePct(leftCursor),
									width: formatStylePct(w),
									backgroundColor: seg.color,
								}}
								title={`D${decile} · ${seg.description}: ${formatPerHousehold(
									seg.valuePerHh,
								)}/hh/yr`}
							/>
						);
					});
				})()}
				{(() => {
					let leftCursor = 50;
					return positives.map((seg) => {
						const w = toPctWidth(seg.valuePerHh);
						const node = (
							<span
								key={`${decile}-${seg.id}-pos`}
								className="absolute top-0 bottom-0"
								style={{
									left: formatStylePct(leftCursor),
									width: formatStylePct(w),
									backgroundColor: seg.color,
								}}
								title={`D${decile} · ${seg.description}: ${formatPerHousehold(
									seg.valuePerHh,
								)}/hh/yr`}
							/>
						);
						leftCursor += w;
						return node;
					});
				})()}
			</div>
			<span className={cn("text-right", netTone)}>
				{formatPerHousehold(netPerHh)}
			</span>
		</div>
	);
}

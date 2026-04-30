"use client";

import { REPRESENTATIVE_HOUSEHOLDS } from "@/data/households";
import { asShareOfIncome } from "@/lib/distribution";
import { evaluateHouseholdImpact } from "@/lib/household-impact";
import type { MicrosimAggregate } from "@/lib/microsim/impact";
import type {
	ScenarioDistribution,
	ScenarioResult,
} from "@/lib/scenario";
import { cn } from "@/lib/utils";
import { PerLeverDecileBreakdown } from "./per-lever-decile";

interface Props {
	distribution: ScenarioDistribution;
	microsim?: MicrosimAggregate;
	result: ScenarioResult;
}

const HOUSEHOLDS_PER_DECILE = 2_800_000;

const formatImpactGbp = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 1000) return `${sign}£${Math.round(abs).toLocaleString()}`;
	if (abs >= 100) return `${sign}£${Math.round(abs)}`;
	if (abs >= 10) return `${sign}£${abs.toFixed(0)}`;
	if (abs >= 1) return `${sign}£${abs.toFixed(1)}`;
	return "£0";
};

const formatPct = (n: number): string => `${Math.round(n * 100)}%`;

const formatSharePct = (n: number): string => {
	const abs = Math.abs(n) * 100;
	const sign = n > 0 ? "−" : n < 0 ? "+" : "";
	if (abs >= 0.005) return `${sign}${abs.toFixed(2)}%`;
	return "0%";
};

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(abs / 1_000_000)}m`;
	return `£${Math.round(abs).toLocaleString()}`;
};

const impactToneClassName = (n: number): string =>
	n > 0
		? "text-amber-700"
		: n < 0
			? "text-blue-700"
			: "text-muted-foreground";

const formatStylePct = (n: number): string =>
	`${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

export function WhoPaysOverview({ distribution, microsim, result }: Props) {
	const hasDistribution =
		distribution.modelledLines > 0 &&
		distribution.perDecile.some((value) => Math.abs(value) > 1);
	const householdImpacts = REPRESENTATIVE_HOUSEHOLDS.map((household) => ({
		household,
		impact: evaluateHouseholdImpact(household, result),
	}));
	const hasHouseholdImpact = householdImpacts.some(
		(row) => Math.abs(row.impact.totalImpactGbp) >= 1,
	);
	const hasMicrosim =
		microsim &&
		(microsim.winners > 0 || microsim.losers > 0 || microsim.unaffected > 0) &&
		microsim.decileMean.some((value) => Math.abs(value) >= 1);

	if (!hasDistribution && !hasHouseholdImpact && !hasMicrosim) return null;

	const incomeShares = asShareOfIncome(distribution.perDecile);
	const bottomDecileImpact = distribution.perDecile[0] ?? 0;
	const middleDecileImpact = distribution.perDecile[4] ?? 0;
	const topDecileImpact = distribution.perDecile[9] ?? 0;
	const coveragePct =
		distribution.totalLines > 0
			? distribution.modelledLines / distribution.totalLines
			: 0;
	const unmodelledDelta = Math.max(
		0,
		Math.abs(distribution.totalDelta) - Math.abs(distribution.modelledDelta),
	);
	const hardestHit = householdImpacts.reduce((worst, row) =>
		row.impact.totalImpactGbp > worst.impact.totalImpactGbp ? row : worst,
	);
	const biggestGain = householdImpacts.reduce((best, row) =>
		row.impact.totalImpactGbp < best.impact.totalImpactGbp ? row : best,
	);

	return (
		<section
			aria-label="Who pays overview"
			className="rounded-md border bg-background/70 p-3"
		>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
				<div>
					<h3 className="text-sm font-semibold">Who pays overview</h3>
					<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
						Current-policy baseline = £0/yr; bars show the counterfactual
						household or decile impact after the scenario.
					</p>
				</div>
				<div className="text-[10px] text-muted-foreground">
					{distribution.modelledLines}/{distribution.totalLines} incidence
					lines modelled
				</div>
			</div>

			<div className="mt-3 grid gap-3 xl:grid-cols-2">
				<div className="rounded-sm border bg-muted/20 p-3">
					<div className="flex items-baseline justify-between gap-2">
						<div className="text-xs font-medium text-foreground">
							Decile incidence path
						</div>
						<div className="text-[10px] text-muted-foreground">
							% of disposable income
						</div>
					</div>
					<DecileIncidencePath values={incomeShares} />
					<div className="mt-2 grid grid-cols-3 gap-2 text-[10px] tabular-nums">
						<ImpactSummaryCell
							label="D1"
							value={formatImpactGbp(
								bottomDecileImpact / HOUSEHOLDS_PER_DECILE,
							)}
							detail={formatSharePct(incomeShares[0] ?? 0)}
							toneValue={bottomDecileImpact}
						/>
						<ImpactSummaryCell
							label="D5"
							value={formatImpactGbp(
								middleDecileImpact / HOUSEHOLDS_PER_DECILE,
							)}
							detail={formatSharePct(incomeShares[4] ?? 0)}
							toneValue={middleDecileImpact}
						/>
						<ImpactSummaryCell
							label="D10"
							value={formatImpactGbp(
								topDecileImpact / HOUSEHOLDS_PER_DECILE,
							)}
							detail={formatSharePct(incomeShares[9] ?? 0)}
							toneValue={topDecileImpact}
						/>
					</div>
				</div>

				<div className="rounded-sm border bg-muted/20 p-3">
					<div className="flex items-baseline justify-between gap-2">
						<div className="text-xs font-medium text-foreground">
							Synthetic household split
						</div>
						<div className="text-[10px] text-muted-foreground">
							vs current-policy baseline
						</div>
					</div>
					{microsim ? (
						<>
							<div
								className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted"
								role="img"
								aria-label="Synthetic household split versus current-policy baseline"
							>
								<span
									className="bg-blue-600 transition-[width] duration-300 ease-out"
									style={{ width: formatStylePct(microsim.winners * 100) }}
								/>
								<span
									className="bg-slate-400 transition-[width] duration-300 ease-out"
									style={{ width: formatStylePct(microsim.unaffected * 100) }}
								/>
								<span
									className="bg-amber-500 transition-[width] duration-300 ease-out"
									style={{ width: formatStylePct(microsim.losers * 100) }}
								/>
							</div>
							<div className="mt-2 grid grid-cols-3 gap-2 text-[10px] tabular-nums">
								<SplitCell
									label="Gain"
									value={formatPct(microsim.winners)}
									tone="blue"
								/>
								<SplitCell
									label="Unchanged"
									value={formatPct(microsim.unaffected)}
									tone="muted"
								/>
								<SplitCell
									label="Lose"
									value={formatPct(microsim.losers)}
									tone="amber"
								/>
							</div>
						</>
					) : (
						<div className="mt-3 rounded-sm bg-background/70 p-2 text-[10px] text-muted-foreground">
							No microsimulation impact for this scenario.
						</div>
					)}
					<div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
						<ImpactSummaryCell
							label="Hardest hit"
							value={formatImpactGbp(hardestHit.impact.totalImpactGbp)}
							detail={hardestHit.household.label}
							toneValue={hardestHit.impact.totalImpactGbp}
						/>
						<ImpactSummaryCell
							label="Largest gain"
							value={formatImpactGbp(biggestGain.impact.totalImpactGbp)}
							detail={biggestGain.household.label}
							toneValue={biggestGain.impact.totalImpactGbp}
						/>
					</div>
				</div>

				<div className="xl:col-span-2">
					<PerLeverDecileBreakdown lines={result.lines} />
				</div>

				<div className="rounded-sm border bg-muted/20 p-3 xl:col-span-2">
					<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
						<div className="text-xs font-medium text-foreground">
							Representative household counterfactuals
						</div>
						<div className="text-[10px] text-muted-foreground">
							baseline = £0/yr
						</div>
					</div>
					<RepresentativeHouseholdBars impacts={householdImpacts} />
				</div>

				<div className="rounded-sm border bg-muted/20 p-3 xl:col-span-2">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div>
							<div className="text-xs font-medium text-foreground">
								Modelled incidence coverage
							</div>
							<div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
								Distributional results use explicit incidence vectors where
								available; unmodelled lines are excluded from the decile path
								rather than allocated mechanically.
							</div>
						</div>
						<div className="min-w-[220px]">
							<div className="flex items-baseline justify-between gap-2 text-[10px]">
								<span className="text-muted-foreground">Coverage</span>
								<span className="font-medium tabular-nums text-foreground">
									{formatPct(coveragePct)}
								</span>
							</div>
							<div
								className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
								role="img"
								aria-label="Modelled incidence coverage"
							>
								<span
									className="block h-full bg-blue-600"
									style={{ width: formatStylePct(coveragePct * 100) }}
								/>
							</div>
							{unmodelledDelta > 100_000_000 && (
								<div className="mt-1 text-[10px] text-amber-700">
									{formatBn(unmodelledDelta)} excluded from incidence chart
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function DecileIncidencePath({ values }: { values: readonly number[] }) {
	const width = 360;
	const height = 96;
	const padX = 14;
	const padY = 12;
	const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 0.0001);
	const xAt = (index: number): number =>
		padX + ((width - padX * 2) * index) / Math.max(1, values.length - 1);
	const yAt = (value: number): number =>
		padY + (height - padY * 2) * (0.5 + value / (maxAbs * 2));
	const points = values
		.map(
			(value, index) =>
				`${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`,
		)
		.join(" ");
	const finalValue = values[values.length - 1] ?? 0;
	const stroke =
		finalValue > 0
			? "#d97706"
			: finalValue < 0
				? "#2563eb"
				: "#6b7280";

	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			className="mt-2 h-24 w-full"
			preserveAspectRatio="none"
			role="img"
			aria-label="Decile incidence path versus current-policy baseline"
		>
			<line
				x1={padX}
				x2={width - padX}
				y1={yAt(0)}
				y2={yAt(0)}
				stroke="currentColor"
				strokeDasharray="4 4"
				strokeWidth="1"
				vectorEffect="non-scaling-stroke"
				className="text-foreground/35"
			/>
			<path
				d={points}
				fill="none"
				stroke={stroke}
				strokeWidth="2.2"
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
			/>
			{values.map((value, index) => (
				<circle
					key={index}
					cx={xAt(index)}
					cy={yAt(value)}
					r={index === 0 || index === values.length - 1 ? 2.6 : 1.7}
					fill={value > 0 ? "#d97706" : value < 0 ? "#2563eb" : "#6b7280"}
				>
					<title>{`D${index + 1}: ${formatSharePct(value)} of income vs baseline`}</title>
				</circle>
			))}
			<text
				x={padX}
				y={height - 2}
				fill="currentColor"
				className="text-[10px] text-muted-foreground"
			>
				D1
			</text>
			<text
				x={width - padX}
				y={height - 2}
				textAnchor="end"
				fill="currentColor"
				className="text-[10px] text-muted-foreground"
			>
				D10
			</text>
		</svg>
	);
}

function RepresentativeHouseholdBars({
	impacts,
}: {
	impacts: readonly {
		household: (typeof REPRESENTATIVE_HOUSEHOLDS)[number];
		impact: ReturnType<typeof evaluateHouseholdImpact>;
	}[];
}) {
	const maxAbs = Math.max(
		...impacts.map((row) => Math.abs(row.impact.totalImpactGbp)),
		1,
	);
	return (
		<div
			className="mt-2 grid gap-1.5 lg:grid-cols-3"
			role="img"
			aria-label="Representative household counterfactuals versus baseline"
		>
			{impacts.map((row) => {
				const amount = row.impact.totalImpactGbp;
				const width = (Math.abs(amount) / maxAbs) * 50;
				return (
					<div
						key={row.household.id}
						className="grid grid-cols-[minmax(98px,0.7fr)_minmax(0,1fr)_64px] items-center gap-2 text-[10px] tabular-nums"
					>
						<span
							className="truncate text-muted-foreground"
							title={row.household.label}
						>
							{row.household.label}
						</span>
						<div className="relative h-3 rounded-sm bg-background/80">
							<span className="absolute left-1/2 top-0 h-full w-px bg-foreground/30" />
							<span
								className={cn(
									"absolute top-0 h-full rounded-sm transition-[width] duration-300 ease-out",
									amount > 0
										? "left-1/2 bg-amber-500"
										: "right-1/2 bg-blue-600",
								)}
								style={{ width: formatStylePct(width) }}
							/>
						</div>
						<span className={cn("text-right", impactToneClassName(amount))}>
							{formatImpactGbp(amount)}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function ImpactSummaryCell({
	label,
	value,
	detail,
	toneValue,
}: {
	label: string;
	value: string;
	detail: string;
	toneValue: number;
}) {
	return (
		<div className="rounded-sm border bg-background/70 p-2">
			<div className="uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 font-semibold tabular-nums",
					impactToneClassName(toneValue),
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 truncate text-muted-foreground">{detail}</div>
		</div>
	);
}

function SplitCell({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone: "blue" | "amber" | "muted";
}) {
	return (
		<div className="rounded-sm border bg-background/70 p-2">
			<div className="uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 font-semibold tabular-nums",
					tone === "blue"
						? "text-blue-700"
						: tone === "amber"
							? "text-amber-700"
							: "text-muted-foreground",
				)}
			>
				{value}
			</div>
		</div>
	);
}

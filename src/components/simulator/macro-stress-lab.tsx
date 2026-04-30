import type {
	MacroStressLab,
	MacroStressLabCase,
	MacroStressLabParameter,
} from "@/lib/macro-stress-lab";
import { cn } from "@/lib/utils";

interface Props {
	lab: MacroStressLab;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatBnDelta = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

const formatPpDelta = (n: number): string => {
	const sign = n > 0 ? "+" : n < 0 ? "−" : "";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? n.toFixed(4) : "0.0000"}%`;

const riskClass = (risk: MacroStressLabCase["riskRating"]): string =>
	risk === "breach"
		? "text-red-700"
		: risk === "tight"
			? "text-amber-700"
			: risk === "watch"
				? "text-blue-700"
				: "text-muted-foreground";

export function MacroStressLabPanel({ lab }: Props) {
	const parametersBySwing = [...lab.parameters].sort(
		(a, b) => b.headroomRangeGbp - a.headroomRangeGbp,
	);
	const parametersByDownside = [...lab.parameters].sort(
		(a, b) => a.worstHeadroomDeltaGbp - b.worstHeadroomDeltaGbp,
	);
	const maxAbsDelta = Math.max(
		1,
		...lab.parameters.flatMap((parameter) => [
			Math.abs(parameter.lowCase.headroomDeltaGbp),
			Math.abs(parameter.highCase.headroomDeltaGbp),
		]),
	);
	const maxAbsDownside = Math.max(
		1,
		...lab.parameters.map((parameter) =>
			Math.abs(parameter.worstHeadroomDeltaGbp),
		),
	);

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Macro stress lab
				</h3>
				<span className="text-[10px] text-muted-foreground">
					rule year {lab.ruleYear}
				</span>
			</div>

			<div className="rounded-md border bg-background/60 p-3 space-y-3 text-[10px]">
				<div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
					<Metric
						label="Central headroom"
						value={formatBn(lab.central.adjustedHeadroomGbp)}
						strong
					/>
					<Metric
						label="Central PSNB"
						value={formatBn(lab.central.ruleYearPsnbGbp)}
					/>
					<Metric
						label="Largest downside"
						value={lab.largestDownsideParameterLabel}
						tone="amber"
					/>
					<Metric
						label="Largest swing"
						value={lab.largestSwingParameterLabel}
					/>
				</div>

				<div className="rounded-sm border bg-muted/20 p-2 space-y-1.5">
					<div className="flex items-baseline justify-between">
						<span className="font-medium text-foreground">
							Rule-headroom tornado
						</span>
						<span className="text-muted-foreground">
							low/high cases, delta from central
						</span>
					</div>
					<div className="space-y-1.5">
						{parametersBySwing.map((parameter) => (
							<TornadoRow
								key={parameter.id}
								parameter={parameter}
								maxAbsDelta={maxAbsDelta}
							/>
						))}
					</div>
				</div>

				<DownsideImpactChart
					parameters={parametersByDownside}
					maxAbsDownside={maxAbsDownside}
				/>

				<details className="rounded-sm border bg-muted/20">
					<summary className="cursor-pointer list-none px-2 py-1.5">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-medium text-foreground">
								Show sensitivity matrix
							</span>
							<span className="text-muted-foreground tabular-nums">
								{lab.parameters.length} assumptions
							</span>
						</div>
					</summary>
					<div className="overflow-x-auto border-t">
						<table className="w-full min-w-[900px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="text-left">
									<th className="px-2 py-1 font-medium">Assumption</th>
									<th className="px-2 py-1 font-medium">Low case</th>
									<th className="px-2 py-1 font-medium">High case</th>
									<th className="px-2 py-1 font-medium">Worst headroom</th>
									<th className="px-2 py-1 font-medium">PSNB move</th>
									<th className="px-2 py-1 font-medium">Debt/GDP move</th>
									<th className="px-2 py-1 font-medium">Y5 interest move</th>
								</tr>
							</thead>
							<tbody>
								{lab.parameters.map((parameter) => (
									<tr key={parameter.id} className="border-t border-border/60">
										<td className="px-2 py-1 align-top">
											<div className="font-medium text-foreground">
												{parameter.label}
											</div>
											<div className="text-muted-foreground">
												{parameter.unitLabel}
											</div>
										</td>
										<CaseCell item={parameter.lowCase} />
										<CaseCell item={parameter.highCase} />
										<td
											className={cn(
												"px-2 py-1 align-top",
												parameter.downsideCase.adjustedHeadroomGbp < 0
													? "text-red-700"
													: "text-foreground",
											)}
										>
											<div>
												{formatBn(
													parameter.downsideCase.adjustedHeadroomGbp,
												)}
											</div>
											<div
												className={riskClass(
													parameter.downsideCase.riskRating,
												)}
											>
												{parameter.downsideCase.riskRating}
											</div>
										</td>
										<td className="px-2 py-1 align-top">
											{formatBnDelta(
												parameter.downsideCase.ruleYearPsnbDeltaGbp,
											)}
										</td>
										<td className="px-2 py-1 align-top">
											{formatPpDelta(
												parameter.downsideCase.ruleYearDebtGdpDeltaPp,
											)}
										</td>
										<td className="px-2 py-1 align-top">
											{formatBnDelta(
												parameter.downsideCase.finalDebtInterestDeltaGbp,
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</details>
			</div>
		</div>
	);
}

function TornadoRow({
	parameter,
	maxAbsDelta,
}: {
	parameter: MacroStressLabParameter;
	maxAbsDelta: number;
}) {
	const low = parameter.lowCase.headroomDeltaGbp;
	const high = parameter.highCase.headroomDeltaGbp;
	const rangeLow = Math.min(low, high);
	const rangeHigh = Math.max(low, high);
	const lowPct = 50 + (low / maxAbsDelta) * 50;
	const highPct = 50 + (high / maxAbsDelta) * 50;
	const rangeLeft = 50 + (rangeLow / maxAbsDelta) * 50;
	const rangeWidth = ((rangeHigh - rangeLow) / maxAbsDelta) * 50;
	return (
		<div className="grid gap-1 sm:grid-cols-[140px_1fr_88px] sm:items-center sm:gap-2">
			<div className="min-w-0">
				<div className="truncate font-medium text-foreground">
					{parameter.label}
				</div>
				<div className="truncate text-[9px] text-muted-foreground">
					{parameter.unitLabel}
				</div>
			</div>
			<div
				className="relative h-8 rounded-sm bg-background/80"
				aria-label={`${parameter.label} headroom tornado`}
			>
				<div className="absolute left-1/2 top-0 h-full w-px bg-border" />
				<div
					className={cn(
						"absolute top-2 h-4 rounded-sm",
						rangeHigh <= 0
							? "bg-red-500/70"
							: rangeLow >= 0
								? "bg-blue-500/70"
								: "bg-zinc-500/70",
					)}
					style={{
						left: formatStylePct(rangeLeft),
						width: formatStylePct(rangeWidth),
					}}
					title={`${parameter.lowCase.label}: ${formatBnDelta(
						low,
					)}; ${parameter.highCase.label}: ${formatBnDelta(high)}`}
				/>
				<div
					className="absolute top-1 h-6 w-px bg-foreground/40"
					style={{ left: formatStylePct(lowPct) }}
					title={`${parameter.lowCase.label}: ${formatBnDelta(low)}`}
				/>
				<div
					className="absolute top-1 h-6 w-px bg-foreground/40"
					style={{ left: formatStylePct(highPct) }}
					title={`${parameter.highCase.label}: ${formatBnDelta(high)}`}
				/>
			</div>
			<div className="flex items-baseline justify-between gap-2 tabular-nums sm:block sm:text-right">
				<span className="text-red-700">{formatBnDelta(rangeLow)}</span>
				<span className="text-muted-foreground sm:block">
					swing {formatBn(parameter.headroomRangeGbp)}
				</span>
			</div>
		</div>
	);
}

function DownsideImpactChart({
	parameters,
	maxAbsDownside,
}: {
	parameters: readonly MacroStressLabParameter[];
	maxAbsDownside: number;
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2 space-y-1.5">
			<div className="flex items-baseline justify-between">
				<span className="font-medium text-foreground">
					Downside impact ranking
				</span>
				<span className="text-muted-foreground">
					worst case vs central headroom
				</span>
			</div>
			<div className="space-y-1.5">
				{parameters.map((parameter) => {
					const value = parameter.worstHeadroomDeltaGbp;
					const width = Math.min(100, (Math.abs(value) / maxAbsDownside) * 100);
					return (
						<div
							key={parameter.id}
							className="grid gap-1 sm:grid-cols-[140px_1fr_150px] sm:items-center sm:gap-2"
						>
							<div className="min-w-0">
								<div className="truncate font-medium text-foreground">
									{parameter.label}
								</div>
								<div className="truncate text-[9px] text-muted-foreground">
									{parameter.downsideCase.label}
								</div>
							</div>
							<div
								className="relative h-7 rounded-sm bg-background/80"
								aria-label={`${parameter.label} downside headroom impact`}
							>
								<div className="absolute left-0 top-0 h-full w-px bg-border" />
								<div
									className={cn(
										"absolute top-2 h-3 rounded-sm",
										value < 0 ? "bg-red-500/75" : "bg-blue-500/75",
									)}
									style={{
										left: value < 0 ? formatStylePct(100 - width) : "0.0000%",
										width: formatStylePct(width),
									}}
									title={`${parameter.downsideCase.label}: ${formatBnDelta(
										value,
									)} headroom`}
								/>
							</div>
							<div className="grid grid-cols-3 gap-1 text-[9px] tabular-nums text-muted-foreground">
								<div>
									<div className="uppercase tracking-wider">Headroom</div>
									<div
										className={cn(
											"font-medium",
											value < 0 ? "text-red-700" : "text-blue-700",
										)}
									>
										{formatBnDelta(value)}
									</div>
								</div>
								<div>
									<div className="uppercase tracking-wider">PSNB</div>
									<div className="font-medium text-foreground">
										{formatBnDelta(
											parameter.downsideCase.ruleYearPsnbDeltaGbp,
										)}
									</div>
								</div>
								<div>
									<div className="uppercase tracking-wider">Debt</div>
									<div className="font-medium text-foreground">
										{formatPpDelta(
											parameter.downsideCase.ruleYearDebtGdpDeltaPp,
										)}
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function CaseCell({ item }: { item: MacroStressLabCase }) {
	return (
		<td className="px-2 py-1 align-top">
			<div className="font-medium text-foreground">{item.label}</div>
			<div
				className={cn(
					item.headroomDeltaGbp < 0
						? "text-red-700"
						: item.headroomDeltaGbp > 0
							? "text-blue-700"
							: "text-muted-foreground",
				)}
			>
				{formatBnDelta(item.headroomDeltaGbp)}
			</div>
		</td>
	);
}

function Metric({
	label,
	value,
	strong = false,
	tone = "default",
}: {
	label: string;
	value: string;
	strong?: boolean;
	tone?: "default" | "amber";
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 tabular-nums",
					strong ? "text-sm font-semibold text-foreground" : "text-foreground",
					tone === "amber" && "text-amber-700",
				)}
			>
				{value}
			</div>
		</div>
	);
}

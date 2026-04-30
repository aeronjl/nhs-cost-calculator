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

const riskClass = (risk: MacroStressLabCase["riskRating"]): string =>
	risk === "breach"
		? "text-red-700"
		: risk === "tight"
			? "text-amber-700"
			: risk === "watch"
				? "text-blue-700"
				: "text-muted-foreground";

export function MacroStressLabPanel({ lab }: Props) {
	const maxAbsDelta = Math.max(
		1,
		...lab.parameters.flatMap((parameter) => [
			Math.abs(parameter.lowCase.headroomDeltaGbp),
			Math.abs(parameter.highCase.headroomDeltaGbp),
		]),
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
					/>
					<Metric
						label="Largest swing"
						value={lab.largestSwingParameterLabel}
					/>
				</div>

				<div className="rounded-sm border bg-muted/20 p-2 space-y-1.5">
					<div className="flex items-baseline justify-between">
						<span className="font-medium text-foreground">
							Headroom tornado
						</span>
						<span className="text-muted-foreground">
							delta from central
						</span>
					</div>
					<div className="space-y-1.5">
						{lab.parameters.map((parameter) => (
							<TornadoRow
								key={parameter.id}
								parameter={parameter}
								maxAbsDelta={maxAbsDelta}
							/>
						))}
					</div>
				</div>

				<div className="overflow-x-auto rounded-sm border bg-muted/20">
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
											{formatBn(parameter.downsideCase.adjustedHeadroomGbp)}
										</div>
										<div className={riskClass(parameter.downsideCase.riskRating)}>
											{parameter.downsideCase.riskRating}
										</div>
									</td>
									<td className="px-2 py-1 align-top">
										{formatBnDelta(parameter.downsideCase.ruleYearPsnbDeltaGbp)}
									</td>
									<td className="px-2 py-1 align-top">
										{formatPpDelta(parameter.downsideCase.ruleYearDebtGdpDeltaPp)}
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
	const rangeLeft = `${50 + (rangeLow / maxAbsDelta) * 50}%`;
	const rangeWidth = `${((rangeHigh - rangeLow) / maxAbsDelta) * 50}%`;
	return (
		<div className="grid grid-cols-[116px_1fr_74px] items-center gap-2">
			<div className="truncate font-medium text-foreground">
				{parameter.label}
			</div>
			<div className="relative h-6 rounded-sm bg-background/80">
				<div className="absolute left-1/2 top-0 h-full w-px bg-border" />
				<div
					className={cn(
						"absolute top-1 h-4 rounded-sm",
						rangeHigh <= 0
							? "bg-red-500/70"
							: rangeLow >= 0
								? "bg-blue-500/70"
								: "bg-zinc-500/70",
					)}
					style={{
						left: rangeLeft,
						width: rangeWidth,
					}}
					title={`${parameter.lowCase.label}: ${formatBnDelta(
						low,
					)}; ${parameter.highCase.label}: ${formatBnDelta(high)}`}
				/>
			</div>
			<div className="text-right text-muted-foreground">
				{formatBn(parameter.headroomRangeGbp)}
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
}: {
	label: string;
	value: string;
	strong?: boolean;
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
				)}
			>
				{value}
			</div>
		</div>
	);
}

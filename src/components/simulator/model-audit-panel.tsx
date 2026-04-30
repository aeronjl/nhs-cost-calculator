import type { ModelAuditEvidencePack } from "@/lib/model-audit";
import { cn } from "@/lib/utils";

interface Props {
	audit: ModelAuditEvidencePack;
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n > 0 ? "" : n < 0 ? "−" : "";
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

const formatProbability = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n * 100)}%`;

const formatBp = (n: number | null): string =>
	n === null ? "n/a" : `${Math.round(n)}bp`;

export function ModelAuditPanel({ audit }: Props) {
	const {
		scenario,
		calibration,
		backtests,
		liveRisk,
		limitations,
	} = audit;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Model audit
				</h3>
				<span className="text-[10px] text-muted-foreground">
					evidence pack
				</span>
			</div>

			<div className="rounded-md border bg-background/60 p-3 space-y-3 text-[10px]">
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					<Metric label="Scenario lines" value={String(scenario.lineCount)} />
					<Metric
						label="Composition"
						value={`${scenario.taxLineCount}T / ${scenario.programmeLineCount}P / ${scenario.borrowingLineCount}B`}
					/>
					<Metric
						label="Borrowing"
						value={
							scenario.borrowingAmountGbp > 0
								? formatBn(scenario.borrowingAmountGbp)
								: "none"
						}
					/>
					<Metric
						label="Range coverage"
						value={scenario.methodologyRangeCoverage}
					/>
					<Metric label="Baseline" value={`${scenario.baselineAsOf} EFO`} />
					<Metric label="Rule year" value={scenario.stabilityRuleAt} />
					<Metric
						label="Behavioural tax"
						value={String(scenario.behaviouralTaxLines)}
					/>
					<Metric
						label="Overrides"
						value={String(scenario.overriddenLineCount)}
					/>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
					<Metric
						label="Raw breach risk"
						value={formatProbability(liveRisk.breachProbability)}
						strong
					/>
					<Metric
						label="Post-reaction breach"
						value={formatProbability(liveRisk.postReactionBreachProbability)}
						strong
					/>
					<Metric
						label="Top reaction"
						value={liveRisk.topReactionPackageLabel ?? "none"}
						strong
					/>
				</div>

				<div className="overflow-x-auto rounded-sm border bg-muted/20">
					<table className="w-full min-w-[620px] tabular-nums">
						<thead className="text-muted-foreground">
							<tr className="text-left">
								<th className="px-2 py-1 font-medium">Calibration</th>
								<th className="px-2 py-1 font-medium">As of</th>
								<th className="px-2 py-1 font-medium">Coverage</th>
								<th className="px-2 py-1 font-medium">Source</th>
							</tr>
						</thead>
						<tbody>
							{calibration.map((item) => (
								<tr key={item.label} className="border-t border-border/60">
									<td className="px-2 py-1 font-medium text-foreground">
										{item.label}
									</td>
									<td className="px-2 py-1">{item.asOf}</td>
									<td className="px-2 py-1">{item.coverage}</td>
									<td className="px-2 py-1">{item.sourceLabel}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
					<Metric
						label="Borrowing central fit"
						value={backtests.borrowingCentralFit}
					/>
					<Metric
						label="Borrowing overlay fit"
						value={`${backtests.borrowingOverlayFit} (${formatBp(
							backtests.borrowingMeanOverlayMissBp,
						)} mean miss)`}
					/>
					<Metric
						label="Regime classifier"
						value={`${backtests.borrowingRegimeClassifierFit} (${formatProbability(
							backtests.borrowingRegimeMeanLabelProbability,
						)})`}
					/>
					<Metric
						label="Fiscal reaction fit"
						value={`${backtests.fiscalReactionPriorFit} vs ${backtests.fiscalReactionRuleOnlyFit} rule-only`}
					/>
				</div>

				{liveRisk.regimeProbabilities.length > 0 && (
					<div className="rounded-sm border bg-muted/20 p-2">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-medium text-foreground">
								Current borrowing regime
								{liveRisk.borrowingRegimeLabel
									? `: ${liveRisk.borrowingRegimeLabel}`
									: ""}
							</span>
							<span
								className={cn(
									"uppercase tracking-wider",
									liveRisk.borrowingStressRating === "stress"
										? "text-red-700"
										: liveRisk.borrowingStressRating === "watch"
											? "text-amber-700"
											: "text-muted-foreground",
								)}
							>
								{liveRisk.borrowingStressRating ?? "n/a"} ·{" "}
								{formatBp(liveRisk.borrowingExpectedPeakPressureBp)}
							</span>
						</div>
						<div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-1">
							{liveRisk.regimeProbabilities.map((row) => (
								<div key={row.id} className="rounded-sm bg-background/70 p-1">
									<div className="font-medium text-foreground">
										{row.label} {formatProbability(row.probability)}
									</div>
									<div className="text-muted-foreground">
										overlay {formatBp(row.expectedOverlayBp)} · nearest{" "}
										{row.nearestEpisode}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{liveRisk.uncertaintyLayers.length > 0 && (
					<div className="overflow-x-auto rounded-sm border bg-muted/20">
						<table className="w-full min-w-[560px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="text-left">
									<th className="px-2 py-1 font-medium">Risk layer</th>
									<th className="px-2 py-1 font-medium">Breach</th>
									<th className="px-2 py-1 font-medium">p5 headroom</th>
									<th className="px-2 py-1 font-medium">p5 move</th>
								</tr>
							</thead>
							<tbody>
								{liveRisk.uncertaintyLayers.map((row) => (
									<tr key={row.label} className="border-t border-border/60">
										<td className="px-2 py-1 font-medium text-foreground">
											{row.label}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.breachProbability)}
										</td>
										<td className="px-2 py-1">
											{formatBn(row.p5HeadroomGbp)}
										</td>
										<td
											className={cn(
												"px-2 py-1",
												row.p5MoveGbp < -250_000_000
													? "text-red-700"
													: row.p5MoveGbp > 250_000_000
														? "text-blue-700"
														: "text-muted-foreground",
											)}
										>
											{row.label === "Central path"
												? "base"
												: formatBnDelta(row.p5MoveGbp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{liveRisk.largestDownsideLayerLabel && (
							<div className="border-t px-2 py-1 text-muted-foreground">
								Largest downside layer:{" "}
								<span className="font-medium text-foreground">
									{liveRisk.largestDownsideLayerLabel}
								</span>
							</div>
						)}
					</div>
				)}

				{liveRisk.priorSensitivityRows.length > 0 && (
					<div className="overflow-x-auto rounded-sm border bg-muted/20">
						<table className="w-full min-w-[560px] tabular-nums">
							<thead className="text-muted-foreground">
								<tr className="text-left">
									<th className="px-2 py-1 font-medium">Prior</th>
									<th className="px-2 py-1 font-medium">Dominant package</th>
									<th className="px-2 py-1 font-medium">Trigger</th>
									<th className="px-2 py-1 font-medium">Post-breach</th>
									<th className="px-2 py-1 font-medium">p95 action</th>
								</tr>
							</thead>
							<tbody>
								{liveRisk.priorSensitivityRows.map((row) => (
									<tr key={row.label} className="border-t border-border/60">
										<td className="px-2 py-1 font-medium text-foreground">
											{row.label}
										</td>
										<td className="px-2 py-1">
											{row.dominantPackageLabel ?? "none"}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.triggerProbability)}
										</td>
										<td className="px-2 py-1">
											{formatProbability(row.postReactionBreachProbability)}
										</td>
										<td className="px-2 py-1">
											{formatBn(row.p95GrossActionGbp)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<ul className="space-y-1 border-t pt-2 text-muted-foreground leading-snug">
					{limitations.map((limitation) => (
						<li key={limitation}>- {limitation}</li>
					))}
				</ul>

				<details className="border-t pt-2">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
						Evidence payload
					</summary>
					<pre className="mt-2 max-h-64 overflow-auto rounded-sm bg-muted/50 p-2 text-[10px] leading-snug">
						{JSON.stringify(audit, null, 2)}
					</pre>
				</details>
			</div>
		</div>
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	auditFiscalReactionBacktests,
	type FiscalReactionBacktestRow,
	type FiscalReactionBacktestStatus,
} from "@/lib/fiscal-reaction-backtest";
import { cn } from "@/lib/utils";

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return `£${Math.round(n).toLocaleString()}`;
};

const formatPct = (n: number): string => `${Math.round(n * 100)}%`;

const statusClass = (status: FiscalReactionBacktestStatus): string =>
	status === "match"
		? "bg-blue-50 text-blue-800 border-blue-200"
		: status === "partial"
			? "bg-amber-50 text-amber-800 border-amber-200"
			: "bg-red-50 text-red-800 border-red-200";

const statusLabel = (status: FiscalReactionBacktestStatus): string =>
	status === "match" ? "match" : status === "partial" ? "partial" : "miss";

const packageLabel = (id: string | null): string =>
	id === null
		? "none"
		: id === "tax-led"
			? "tax-led"
			: id === "spending-led"
				? "spending-led"
				: id;

const rowKey = (row: FiscalReactionBacktestRow): string => row.episode.id;

export function FiscalReactionBacktestSection() {
	const audit = auditFiscalReactionBacktests();
	if (audit.rows.length === 0) return null;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light">
					Fiscal reaction backtests
					<br />
					<span className="text-base text-muted-foreground font-normal">
						Historical consolidation packages against the rule-reaction model
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="rounded-lg bg-muted/40 p-4 text-sm leading-snug">
					<p>
						The stress-contingent selector matches{" "}
						<strong>
							{audit.matches}/{audit.rows.length}
						</strong>{" "}
						historical package labels, with{" "}
						<strong>{audit.partials}</strong> partials and{" "}
						<strong>{audit.misses}</strong> misses. Mean lever overlap is{" "}
						<span className="tabular-nums">
							{formatPct(audit.meanLeverOverlap)}
						</span>
						; mean tax/spend-share distance is{" "}
						<span className="tabular-nums">
							{formatPct(audit.meanShareDistance)}
						</span>
						.
					</p>
					<p className="text-xs text-muted-foreground mt-2">
						This audit is deliberately small-sample. It tests whether a model
						conditioned only on fiscal stress, inflation, growth, and rate
						pressure can recover the package shape actually chosen by
						Chancellors. Misses are useful: they identify missing political
						preference priors, especially spending-led austerity episodes.
					</p>
				</div>

				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full min-w-[920px] text-xs">
						<thead className="bg-muted/50 text-muted-foreground">
							<tr className="text-left">
								<th className="px-3 py-2 font-medium">Episode</th>
								<th className="px-3 py-2 font-medium">Stress context</th>
								<th className="px-3 py-2 font-medium">Actual package</th>
								<th className="px-3 py-2 font-medium">Model package</th>
								<th className="px-3 py-2 font-medium">Fit</th>
							</tr>
						</thead>
						<tbody className="divide-y">
							{audit.rows.map((row) => (
								<tr key={rowKey(row)} className="align-top">
									<td className="px-3 py-2">
										<div className="font-semibold">{row.budgetName}</div>
										<div className="text-muted-foreground">
											{row.episode.date.slice(0, 7)} ·{" "}
											{row.episode.chancellor}
										</div>
										<div className="mt-1 tabular-nums">
											target {formatBn(row.episode.targetCorrectionGbp)}
										</div>
									</td>
									<td className="px-3 py-2">
										<div className="leading-snug">
											{row.episode.context}
										</div>
										<div className="mt-1 text-muted-foreground tabular-nums">
											rate stress {formatPct(row.episode.rateStress)} ·
											inflation shock{" "}
											{formatPct(row.episode.inflationShock)}
										</div>
									</td>
									<td className="px-3 py-2 tabular-nums">
										<div className="font-medium">
											{packageLabel(row.actualPackageId)}
										</div>
										<div className="text-muted-foreground">
											tax {formatPct(row.actualComposition.taxShare)} ·
											spend {formatPct(row.actualComposition.spendingShare)}
										</div>
										<div className="text-muted-foreground">
											gross {formatBn(row.actualComposition.grossTighteningGbp)}
										</div>
									</td>
									<td className="px-3 py-2 tabular-nums">
										<div className="font-medium">
											{row.selectedPackageLabel}
										</div>
										{row.modelComposition && (
											<>
												<div className="text-muted-foreground">
													tax {formatPct(row.modelComposition.taxShare)} ·
													spend{" "}
													{formatPct(row.modelComposition.spendingShare)}
												</div>
												<div className="text-muted-foreground">
													gross{" "}
													{formatBn(
														row.modelComposition.grossTighteningGbp,
													)}
												</div>
											</>
										)}
									</td>
									<td className="px-3 py-2">
										<div
											className={cn(
												"inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
												statusClass(row.status),
											)}
										>
											{statusLabel(row.status)}
										</div>
										<div className="mt-2 text-muted-foreground leading-snug">
											{row.diagnosis}
										</div>
										<div className="mt-1 text-muted-foreground tabular-nums">
											lever overlap {formatPct(row.leverOverlap)}
											{row.shareDistance !== null
												? ` · share distance ${formatPct(row.shareDistance)}`
												: ""}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<p className="text-xs text-muted-foreground pt-2 border-t leading-snug">
					Episodes are encoded from the annotated budget corpus. Actual package
					labels capture the policy intent over the forecast horizon, so the
					2010 Emergency Budget is treated as spending-led despite its large VAT
					rise because the multi-year consolidation relied mainly on welfare and
					departmental restraint.
				</p>
			</CardContent>
		</Card>
	);
}

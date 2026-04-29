"use client";

import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { getBorrowingStrategy } from "@/data/levers/borrowing";
import { getTaxLever } from "@/data/levers/tax-rates";
import {
	estimateMonetaryFiscalExposure,
	optimiseBorrowingStrategy,
	projectBorrowingFan,
	projectBorrowingMarketReactionPath,
	projectBorrowingPath,
	projectBorrowingStrategyCases,
	projectBorrowingStrategyFrontier,
	projectBorrowingStressCases,
} from "@/lib/borrowing";
import { estimateBorrowingStressRegime } from "@/lib/borrowing-regime";
import {
	type BehaviouralModelSummary,
	describeBehaviouralModel,
} from "@/lib/elasticity";
import { cn } from "@/lib/utils";
import {
	type LineEvaluation,
	evaluateLineDynamic,
} from "@/lib/scenario";

// Renders a compact "Assumptions" section in the output rail. Each scenario
// line gets a short caveat (the "what would a domain expert object to first"
// line from its methodology) plus a popover trigger for the full alternatives
// / range / source.
//
// Lives next to the comparisons-afforded list in the right rail so the
// "lead with the headline, expose assumptions on demand" principle is
// always visible — assumptions are not behind a tab the user has to find.

interface Props {
	lines: readonly LineEvaluation[];
}

export function ScenarioAssumptions({ lines }: Props) {
	if (lines.length === 0) return null;

	return (
		<div className="space-y-2">
			<div className="flex items-baseline justify-between">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Assumptions
				</h3>
				<span className="text-[10px] text-muted-foreground">
					{lines.length} line{lines.length === 1 ? "" : "s"}
				</span>
			</div>

			<ul className="space-y-2">
				{lines.map((ev) => (
					<AssumptionItem key={ev.line.id} evaluation={ev} />
				))}
			</ul>

			<p className="text-[10px] text-muted-foreground pt-1 border-t leading-snug">
				Tap ⓘ on any line for alternatives, plausible range, and source. Every
				calibration is HMRC ready-reckoner / IFS / OBR; tax levers with a
				behavioural model are re-scored from their marginal tax wedge.
			</p>
		</div>
	);
}

function AssumptionItem({ evaluation }: { evaluation: LineEvaluation }) {
	const { line, deltaGbp, description, methodology } = evaluation;
	const dynamic = evaluateLineDynamic(evaluation);
	const modelSummary =
		line.type === "tax"
			? describeBehaviouralModel(
					getTaxLever(line.leverId).behaviour,
					line.magnitude,
				)
			: null;
	const borrowingSummary =
		line.type === "borrow"
			? projectBorrowingPath(line.magnitude, 5, {
					strategyId: line.borrowingStrategyId,
				})
			: null;
	const borrowingStress =
		line.type === "borrow"
			? projectBorrowingStressCases(line.magnitude, 5, {
					strategyId: line.borrowingStrategyId,
				})
			: null;
	const borrowingStrategies =
		line.type === "borrow"
			? projectBorrowingStrategyCases(line.magnitude, 5)
			: null;
	const borrowingFrontier =
		line.type === "borrow"
			? projectBorrowingStrategyFrontier(line.magnitude, 5)
			: null;
	const borrowingOptimisation =
		line.type === "borrow" ? optimiseBorrowingStrategy(line.magnitude, 5) : null;
	const borrowingFan =
		line.type === "borrow"
			? projectBorrowingFan(
					line.magnitude,
					5,
					{ strategyId: line.borrowingStrategyId },
					500,
				)
			: null;
	const borrowingMarketReaction =
		line.type === "borrow"
			? projectBorrowingMarketReactionPath(line.magnitude, 5, {
					strategyId: line.borrowingStrategyId,
				})
			: null;
	const borrowingRegime =
		line.type === "borrow"
			? estimateBorrowingStressRegime(line.magnitude, 5, {
					strategyId: line.borrowingStrategyId,
				})
			: null;
	const adjustmentPct = Math.round(dynamic.behaviouralAdjustmentFraction * 100);
	const adjustmentSignificant = dynamic.behaviouralAdjustmentFraction > 0.05;
	const outputSignificant = Math.abs(dynamic.outputEffectGbp) > 1_000_000;
	const cevSignificant = Math.abs(dynamic.workerCevGbp) > 1_000_000;

	const sign = deltaGbp >= 0 ? "+" : "−";
	const formatted = formatBn(Math.abs(deltaGbp));
	const colour =
		deltaGbp > 0
			? "text-blue-700"
			: deltaGbp < 0
				? "text-amber-700"
				: "text-muted-foreground";

	return (
		<li className="rounded-md border bg-background/60 p-2 space-y-1">
			<div className="flex items-start gap-2">
				<span aria-hidden="true" className="text-sm leading-tight">
					{line.type === "tax" ? "💰" : line.type === "programme" ? "✂️" : "🏦"}
				</span>
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline justify-between gap-2">
						<span className="text-xs font-medium leading-snug">
							{description}
						</span>
						<span
							className={cn(
								"text-xs tabular-nums font-medium shrink-0",
								colour,
							)}
						>
							{sign}£{formatted}
						</span>
					</div>
					{adjustmentSignificant && (
						<div className="text-[10px] text-amber-700 leading-snug mt-0.5">
							Dynamic: {sign}£
							{formatBn(Math.abs(dynamic.dynamicDelta))} ({adjustmentPct}%
							behavioural adjustment at this magnitude)
						</div>
					)}
					{(outputSignificant || cevSignificant) && (
						<div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
							{outputSignificant && (
								<>
									Output: {formatSignedBn(dynamic.outputEffectGbp)}
								</>
							)}
							{outputSignificant && cevSignificant ? "; " : ""}
							{cevSignificant && (
								<>
									worker CEV: {formatSignedBn(dynamic.workerCevGbp)}
								</>
							)}
						</div>
					)}
				</div>
			</div>

			{methodology.caveat && (
				<p className="text-[11px] text-muted-foreground leading-snug pl-6">
					<span className="font-medium text-foreground/70">Caveat: </span>
					{methodology.caveat}
				</p>
			)}

			<div className="pl-6">
				<MethodologyPopover methodology={methodology} label="full methodology">
					<BehaviouralModelBlock summary={modelSummary} />
					<BorrowingModelBlock
						strategyId={line.borrowingStrategyId}
						path={borrowingSummary}
						stress={borrowingStress}
						strategyCases={borrowingStrategies}
						strategyFrontier={borrowingFrontier}
						strategyOptimisation={borrowingOptimisation}
						fan={borrowingFan}
						marketReaction={borrowingMarketReaction}
						regime={borrowingRegime}
					/>
				</MethodologyPopover>
			</div>
		</li>
	);
}

function BehaviouralModelBlock({
	summary,
}: {
	summary: BehaviouralModelSummary | null;
}) {
	if (!summary) return null;
	return (
		<div>
			<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
				{summary.title}
			</div>
			<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
				{summary.rows.map((row) => (
					<div key={row.label} className="contents">
						<dt className="text-muted-foreground">{row.label}</dt>
						<dd className="tabular-nums text-right font-medium">{row.value}</dd>
					</div>
				))}
			</dl>
			{summary.note && (
				<p className="text-xs text-muted-foreground italic mt-2 leading-snug">
					{summary.note}
				</p>
			)}
			{summary.source && (
				<a
					href={summary.source.url}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-1 inline-block text-xs text-muted-foreground hover:underline"
				>
					{summary.source.label}
				</a>
			)}
		</div>
	);
}

function BorrowingModelBlock({
	strategyId,
	path,
	stress,
	strategyCases,
	strategyFrontier,
	strategyOptimisation,
	fan,
	marketReaction,
	regime,
}: {
	strategyId: Parameters<typeof getBorrowingStrategy>[0];
	path: ReturnType<typeof projectBorrowingPath> | null;
	stress: ReturnType<typeof projectBorrowingStressCases> | null;
	strategyCases: ReturnType<typeof projectBorrowingStrategyCases> | null;
	strategyFrontier: ReturnType<typeof projectBorrowingStrategyFrontier> | null;
	strategyOptimisation: ReturnType<typeof optimiseBorrowingStrategy> | null;
	fan: ReturnType<typeof projectBorrowingFan> | null;
	marketReaction: ReturnType<typeof projectBorrowingMarketReactionPath> | null;
	regime: ReturnType<typeof estimateBorrowingStressRegime> | null;
}) {
	if (!path || path.length === 0) return null;
	const year1 = path[0]!;
	const yearN = path[path.length - 1]!;
	const strategy = getBorrowingStrategy(strategyId);
	const auctionBottleneck =
		yearN.instruments.find(
			(instrument) => instrument.id === yearN.absorptionBottleneck,
		) ?? null;
	const fanYearN = fan?.at(-1);
	const marketYearN = marketReaction?.at(-1);
	const monetaryExposure = estimateMonetaryFiscalExposure(0.01);
	const selectedFrontierCase = strategyFrontier?.cases.find(
		(item) => item.id === strategy.id,
	);
	const frontierPenaltyGbp =
		selectedFrontierCase && strategyFrontier
			? Math.max(
					0,
					selectedFrontierCase.objectiveGbp -
						strategyFrontier.recommended.objectiveGbp,
				)
			: 0;
	const optimisedMix = strategyOptimisation
		? formatPortfolioMix(strategyOptimisation.optimum.path.at(-1)?.instruments ?? [])
		: null;
	return (
		<div>
			<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
				Debt financing model
			</div>
			<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
				<div className="contents">
					<dt className="text-muted-foreground">Financing strategy</dt>
					<dd className="tabular-nums text-right font-medium">
						{strategy.label}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Year-1 cash</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedBn(year1.primaryFinancingGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Effective rate</dt>
					<dd className="tabular-nums text-right font-medium">
						{(year1.effectiveRate * 100).toFixed(2)}%
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Year-1 interest</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedBn(-year1.interestCostGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Year-{yearN.year} interest</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedBn(-yearN.interestCostGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Debt stock by year {yearN.year}</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedBn(yearN.debtStockDeltaGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Debt/GDP</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedPp(yearN.debtGdpDeltaPp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Annual refinancing</dt>
					<dd className="tabular-nums text-right font-medium">
						£{formatBn(yearN.refinancingGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Risk premium</dt>
					<dd className="tabular-nums text-right font-medium">
						{(yearN.riskPremium * 10_000).toFixed(1)}bp
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Absorption concession</dt>
					<dd className="tabular-nums text-right font-medium">
						{(yearN.absorptionPremium * 10_000).toFixed(1)}bp
					</dd>
				</div>
				{yearN.absorptionBottleneck !== "none" && (
					<div className="contents">
						<dt className="text-muted-foreground">Market bottleneck</dt>
						<dd className="tabular-nums text-right font-medium">
							{yearN.absorptionStressIndex.toFixed(1)}x{" "}
							{yearN.absorptionBottleneck.replaceAll("-", " ")}
						</dd>
					</div>
				)}
				{auctionBottleneck && (
					<div className="contents">
						<dt className="text-muted-foreground">Auction cover / tail</dt>
						<dd className="tabular-nums text-right font-medium">
							{auctionBottleneck.auctionCoverRatio.toFixed(1)}x /{" "}
							{auctionBottleneck.auctionTailBp.toFixed(1)}bp
						</dd>
					</div>
				)}
				<div className="contents">
					<dt className="text-muted-foreground">r - g</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedPct(yearN.rMinusG)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Stabilising primary balance</dt>
					<dd className="tabular-nums text-right font-medium">
						{formatSignedBn(yearN.stabilisingPrimaryBalanceGbp)}
					</dd>
				</div>
				<div className="contents">
					<dt className="text-muted-foreground">Interest/GDP</dt>
					<dd className="tabular-nums text-right font-medium">
						{yearN.debtInterestPctGdp.toFixed(3)}%
					</dd>
				</div>
			</dl>
			{stress && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Stress cases, year {yearN.year}
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						{stress.slice(1).map((item) => {
							const finalYear = item.path.at(-1)!;
							return (
								<div key={item.id} className="contents">
									<dt className="text-muted-foreground">{item.label}</dt>
									<dd className="tabular-nums text-right font-medium">
										{formatSignedBn(-finalYear.interestCostGbp)}
									</dd>
								</div>
							);
						})}
					</dl>
				</div>
			)}
			{strategyCases && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Strategy cases, year {yearN.year} interest
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						{strategyCases.map((item) => {
							const finalYear = item.path.at(-1)!;
							return (
								<div key={item.id} className="contents">
									<dt className="text-muted-foreground">{item.label}</dt>
									<dd className="tabular-nums text-right font-medium">
										{formatSignedBn(-finalYear.interestCostGbp)}
									</dd>
								</div>
							);
						})}
					</dl>
				</div>
			)}
			{strategyFrontier && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Cost-risk frontier
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						<div className="contents">
							<dt className="text-muted-foreground">Lowest objective</dt>
							<dd className="tabular-nums text-right font-medium">
								{strategyFrontier.recommended.label}
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Selected penalty</dt>
							<dd className="tabular-nums text-right font-medium">
								£{formatBn(frontierPenaltyGbp)}
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Frontier risk reserve</dt>
							<dd className="tabular-nums text-right font-medium">
								£{formatBn(strategyFrontier.recommended.totalRiskScoreGbp)}
							</dd>
						</div>
					</dl>
				</div>
			)}
			{strategyOptimisation && optimisedMix && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Dynamic optimiser
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						<div className="contents">
							<dt className="text-muted-foreground">Least-cost-risk mix</dt>
							<dd className="tabular-nums text-right font-medium">
								{optimisedMix}
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Objective gain vs DMO</dt>
							<dd className="tabular-nums text-right font-medium">
								£{formatBn(strategyOptimisation.improvementVsDmoGbp)}
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Feasible portfolios</dt>
							<dd className="tabular-nums text-right font-medium">
								{strategyOptimisation.feasiblePortfolios}/
								{strategyOptimisation.searchedPortfolios}
							</dd>
						</div>
					</dl>
				</div>
			)}
			{fanYearN && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Stochastic rate fan, year {fanYearN.year}
					</div>
					<div className="text-xs text-muted-foreground leading-snug">
						Debt-interest 90% band:{" "}
						<span className="font-medium text-foreground">
							{formatSignedBn(-fanYearN.interestCostBand.p95)}
						</span>{" "}
						to{" "}
						<span className="font-medium text-foreground">
							{formatSignedBn(-fanYearN.interestCostBand.p5)}
						</span>
					</div>
				</div>
			)}
			{marketYearN && marketYearN.marketReactionPremium > 0.0001 && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Market reaction path, year {marketYearN.year}
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						<div className="contents">
							<dt className="text-muted-foreground">Credibility premium</dt>
							<dd className="tabular-nums text-right font-medium">
								{(marketYearN.marketReactionPremium * 10_000).toFixed(1)}bp
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Interest vs central</dt>
							<dd className="tabular-nums text-right font-medium">
								{formatSignedBn(
									-(marketYearN.interestCostGbp - yearN.interestCostGbp),
								)}
							</dd>
						</div>
					</dl>
				</div>
			)}
			{regime && (
				<div className="mt-2 border-t pt-2">
					<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
						Regime classifier
					</div>
					<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
						<div className="contents">
							<dt className="text-muted-foreground">Top regime</dt>
							<dd className="tabular-nums text-right font-medium">
								{regime.topRegime.label} (
								{formatProbability(regime.topRegime.probability)})
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Expected overlay</dt>
							<dd className="tabular-nums text-right font-medium">
								{formatSignedBp(regime.expectedOverlayBp)}
							</dd>
						</div>
						<div className="contents">
							<dt className="text-muted-foreground">Peak pressure</dt>
							<dd className="tabular-nums text-right font-medium">
								{regime.expectedPeakPressureBp.toFixed(0)}bp
							</dd>
						</div>
					</dl>
					<div className="mt-1 text-[10px] text-muted-foreground leading-snug">
						{regime.probabilities
							.map(
								(item) =>
									`${item.label}: ${formatProbability(item.probability)}`,
							)
							.join(" · ")}
					</div>
				</div>
			)}
			<div className="mt-2 border-t pt-2">
				<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
					Monetary-fiscal overlay
				</div>
				<dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
					<div className="contents">
						<dt className="text-muted-foreground">+100bp reserves/APF exposure</dt>
						<dd className="tabular-nums text-right font-medium">
							{formatSignedBn(-monetaryExposure.totalExposureGbp)}
						</dd>
					</div>
					<div className="contents">
						<dt className="text-muted-foreground">APF/QT competing supply</dt>
						<dd className="tabular-nums text-right font-medium">
							£{formatBn(monetaryExposure.annualApfCompetingSupplyGbp)}
						</dd>
					</div>
				</dl>
			</div>
			<p className="text-xs text-muted-foreground italic mt-2 leading-snug">
				Borrowing is modelled as year-1 financing plus debt-service costs; PSNB
				worsens when gilts are issued and again when interest is financed.
			</p>
		</div>
	);
}

const formatBn = (n: number): string => {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}bn`;
	if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}m`;
	return Math.round(n).toLocaleString();
};

const formatPortfolioMix = (
	instruments: readonly { id: string; share: number }[],
): string =>
	instruments
		.filter((instrument) => instrument.share >= 0.025)
		.map((instrument) => {
			const label =
				instrument.id === "treasury-bills"
					? "Bills"
					: instrument.id === "index-linked-gilts"
						? "IL"
						: instrument.id.replace("-gilts", "").replace("-", " ");
			return `${label} ${Math.round(instrument.share * 100)}%`;
		})
		.join(" · ");

const formatSignedBn = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}£${formatBn(Math.abs(n))}`;
};

const formatSignedPp = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}${Math.abs(n).toFixed(2)}pp`;
};

const formatSignedBp = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}${Math.abs(n).toFixed(0)}bp`;
};

const formatProbability = (n: number): string => `${Math.round(n * 100)}%`;

const formatSignedPct = (n: number): string => {
	const sign = n >= 0 ? "+" : "−";
	return `${sign}${Math.abs(n * 100).toFixed(2)}%`;
};

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { cn } from "@/lib/utils";
import { type ResolvedComparison } from "@/data/comparisons";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import { BORROWING } from "@/data/levers/borrowing";
import {
	type Allocation,
	adjustLever,
	describeBorrow,
	describeCut,
	describeTax,
	rescale,
} from "@/lib/trade-off";
import { allocationToScenario, serializeScenario } from "@/lib/scenario";
import {
	DEFAULT_TO_GOAL,
	DEFAULT_TO_PROG,
	DEFAULT_TO_TAX,
	SIMULATOR_OWNED_PARAMS,
	buildUrl,
} from "@/lib/url-write";
import { formatMoney } from "./utils/formatters";

interface Props {
	comparisons: readonly ResolvedComparison[];
	initialGoalId: string | null;
	initialCustomAmount: number | null;
	initialQuantity: number;
	initialTaxId: string;
	initialProgId: string;
	initialAllocation: Allocation;
}

const formatBig = (n: number): string => formatMoney(n, "GBP");

const formatGiltInterest = (amount: number): string => {
	if (amount === 0) return "£0/yr";
	if (amount >= 1_000_000_000) {
		return `£${(amount / 1_000_000_000).toFixed(1)}bn/yr`;
	}
	if (amount >= 1_000_000) {
		return `£${Math.round(amount / 1_000_000).toLocaleString()}m/yr`;
	}
	return `${formatMoney(amount)}/yr`;
};

export default function TradeOffEngine({
	comparisons,
	initialGoalId,
	initialCustomAmount,
	initialQuantity,
	initialTaxId,
	initialProgId,
	initialAllocation,
}: Props) {
	const router = useRouter();

	const [goalMode, setGoalMode] = useState<"preset" | "custom">(
		initialGoalId ? "preset" : "custom",
	);
	const [goalId, setGoalId] = useState<string>(
		initialGoalId ?? comparisons[0]?.id ?? "",
	);
	const [quantity, setQuantity] = useState<number>(initialQuantity);
	const [customAmount, setCustomAmount] = useState<number>(
		initialCustomAmount ?? initialAllocation.tax * 3,
	);
	const [allocation, setAllocation] = useState<Allocation>(initialAllocation);
	const [taxLeverId, setTaxLeverId] = useState(initialTaxId);
	const [programmeId, setProgrammeId] = useState(initialProgId);

	const goal = comparisons.find((c) => c.id === goalId);
	const target =
		goalMode === "preset" && goal ? goal.cost * quantity : customAmount;

	// Rescale when the goal/amount changes.
	useEffect(() => {
		setAllocation((prev) => rescale(prev, target));
	}, [target]);

	// Mirror state to the URL — write the unified `?scenario=&editor=triptych`
	// shape with `g`/`gq`/`ga` for the funding-target anchor. Legacy `?to_*=`
	// params get cleared on every write (they may still arrive on first load).
	useEffect(() => {
		const handle = setTimeout(() => {
			const lines = allocationToScenario(allocation, taxLeverId, programmeId);
			const scenarioStr = serializeScenario(lines);
			const url = buildUrl(
				new URLSearchParams(window.location.search),
				SIMULATOR_OWNED_PARAMS,
				{
					scenario: scenarioStr || undefined,
					editor: "triptych",
					g:
						goalMode === "preset" && goalId !== DEFAULT_TO_GOAL
							? goalId
							: undefined,
					gq:
						goalMode === "preset" && goal && quantity !== goal.quantity
							? String(quantity)
							: undefined,
					ga:
						goalMode === "custom"
							? String(Math.round(customAmount))
							: undefined,
				},
			);
			router.replace(url, { scroll: false });
		}, 250);
		return () => clearTimeout(handle);
	}, [
		goalMode,
		goalId,
		quantity,
		customAmount,
		allocation,
		taxLeverId,
		programmeId,
		goal,
		router,
	]);

	const taxImpact = describeTax(allocation.tax, taxLeverId);
	const borrowImpact = describeBorrow(allocation.borrow);
	const cutImpact = describeCut(allocation.cut, programmeId);

	const setLever = (lever: keyof Allocation, value: number) => {
		setAllocation(adjustLever(allocation, lever, value, target));
	};

	const goalLabel = goal
		? `${quantity > 1 ? `${quantity.toLocaleString()} ${goal.pluralName}` : goal.name}`
		: "this proposal";

	return (
		<Card className="mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl sm:text-3xl font-light text-center">
					Want to fund <span className="font-semibold">{goalLabel}</span>?
					{goal && (
						<MethodologyPopover
							methodology={goal.methodology}
							className="ml-1 align-middle"
						/>
					)}
					<br />
					<span className="text-base text-muted-foreground font-normal">
						Total: {formatBig(target)}. Choose how to pay.
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Goal selector */}
				<div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-center">
					<label
						htmlFor="goal-select"
						className="text-sm font-medium text-muted-foreground"
					>
						Funding target:
					</label>
					<select
						id="goal-select"
						value={goalMode === "custom" ? "__custom__" : goalId}
						onChange={(e) => {
							if (e.target.value === "__custom__") {
								setGoalMode("custom");
							} else {
								setGoalMode("preset");
								setGoalId(e.target.value);
								// Reset quantity to the new goal's default.
								const next = comparisons.find((c) => c.id === e.target.value);
								if (next) setQuantity(next.quantity);
							}
						}}
						className="rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
					>
						{comparisons.map((c) => (
							<option key={c.id} value={c.id}>
								{c.quantity > 1
									? `${c.quantity.toLocaleString()} ${c.pluralName}`
									: c.name}
							</option>
						))}
						<option value="__custom__">Custom amount…</option>
					</select>
					{goalMode === "custom" && (
						<Input
							type="text"
							inputMode="numeric"
							value={customAmount.toLocaleString()}
							onChange={(e) => {
								const cleaned = e.target.value.replace(/\D/g, "");
								setCustomAmount(cleaned === "" ? 0 : Number.parseInt(cleaned));
							}}
							className="w-40"
						/>
					)}
				</div>

				{/* Tax lever */}
				<Lever
					emoji="💰"
					title="Tax"
					amount={allocation.tax}
					target={target}
					onChange={(v) => setLever("tax", v)}
				>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span>From</span>
						<select
							value={taxLeverId}
							onChange={(e) => setTaxLeverId(e.target.value)}
							className="rounded border border-input bg-background px-2 py-0.5"
						>
							{TAX_LEVERS.map((l) => (
								<option key={l.id} value={l.id}>
									{l.name}
								</option>
							))}
						</select>
						<span>
							{taxImpact.lever.unit === "pp" ? (
								<>
									= +{taxImpact.ppChange.toFixed(2)}pp (
									{((taxImpact.lever.currentRate ?? 0) * 100).toFixed(0)}% →{" "}
									{(taxImpact.newRate * 100).toFixed(2)}%)
								</>
							) : (
								<>
									= {taxImpact.yearsOfFreeze.toFixed(1)} year
									{Math.abs(taxImpact.yearsOfFreeze) === 1 ? "" : "s"} of
									freeze
								</>
							)}
						</span>
					</div>
					<p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
						<a
							href={taxImpact.lever.source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
						>
							{taxImpact.lever.source.label}
						</a>
						<MethodologyPopover
							methodology={taxImpact.lever.methodology}
							label="why this number?"
						/>
					</p>
				</Lever>

				{/* Borrow lever */}
				<Lever
					emoji="🏦"
					title="Borrow"
					amount={allocation.borrow}
					target={target}
					onChange={(v) => setLever("borrow", v)}
				>
					<p className="text-xs text-muted-foreground">
						{formatGiltInterest(borrowImpact.annualInterest)} interest at{" "}
						{(BORROWING.thirtyYearGiltYield * 100).toFixed(2)}% gilt yield · +
						{borrowImpact.debtGdpDelta.toFixed(2)}pp debt:GDP
					</p>
					<p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
						<a
							href={BORROWING.source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
						>
							{BORROWING.source.label}
						</a>
						<MethodologyPopover
							methodology={BORROWING.methodology}
							label="why this number?"
						/>
					</p>
				</Lever>

				{/* Cut lever */}
				<Lever
					emoji="✂️"
					title="Cut"
					amount={allocation.cut}
					target={target}
					onChange={(v) => setLever("cut", v)}
				>
					<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<span>From</span>
						<select
							value={programmeId}
							onChange={(e) => setProgrammeId(e.target.value)}
							className="rounded border border-input bg-background px-2 py-0.5"
						>
							{UK_SPENDING_PROGRAMMES.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
						<span>
							= {(cutImpact.fraction * 100).toFixed(1)}% of {cutImpact.programme.name}
							{cutImpact.fraction > 1 && (
								<span className="text-red-600 font-semibold">
									{" "}
									(exceeds 100% — programme couldn't fund this)
								</span>
							)}
							{cutImpact.exceedsCuttable && cutImpact.fraction <= 1 && (
								<span className="text-amber-700 font-semibold">
									{" "}
									(exceeds cuttable {(cutImpact.cuttableFraction * 100).toFixed(0)}% — political/legal floors)
								</span>
							)}
						</span>
					</div>
					<p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
						<a
							href={cutImpact.programme.source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
						>
							{cutImpact.programme.source.label}
						</a>
						<MethodologyPopover
							methodology={cutImpact.programme.methodology}
							label="cuttability?"
						/>
					</p>
				</Lever>

				<div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
					<strong>Net effect:</strong>{" "}
					{taxImpact.lever.unit === "pp"
						? `+${taxImpact.ppChange.toFixed(2)}pp on ${taxImpact.lever.name}`
						: `${taxImpact.yearsOfFreeze.toFixed(1)} year${Math.abs(taxImpact.yearsOfFreeze) === 1 ? "" : "s"} of freeze on ${taxImpact.lever.name}`}
					, {formatGiltInterest(borrowImpact.annualInterest)} of new interest,{" "}
					{(cutImpact.fraction * 100).toFixed(1)}% cut to{" "}
					{cutImpact.programme.name}.
				</div>

				<p className="text-xs text-muted-foreground text-center">
					Tax figures are HMRC's first-year ready reckoner, with behavioural
					response handled by the scenario model for tax levers. Borrowing
					assumes new gilts at the current 30-year yield. Spending lines are
					PESA approximations; the DEL/AME distinction matters for fiscal
					mechanics not modelled here.
				</p>
			</CardContent>
		</Card>
	);
}

interface LeverProps {
	emoji: string;
	title: string;
	amount: number;
	target: number;
	onChange: (value: number) => void;
	children?: React.ReactNode;
}

function Lever({ emoji, title, amount, target, onChange, children }: LeverProps) {
	const fraction = target === 0 ? 0 : amount / target;
	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="flex items-center justify-between mb-2">
				<div className="flex items-center gap-2">
					<span className="text-xl" aria-hidden="true">
						{emoji}
					</span>
					<span className="font-semibold">{title}</span>
				</div>
				<div className="text-right">
					<div className="text-lg font-semibold tabular-nums">
						<AnimatedNumber value={Math.round(amount)} />
					</div>
					<div className="text-xs text-muted-foreground">
						{(fraction * 100).toFixed(0)}% of {formatMoney(target)}
					</div>
				</div>
			</div>
			<input
				type="range"
				min={0}
				max={target}
				step={Math.max(1, target / 1000)}
				value={amount}
				onChange={(e) => onChange(Number(e.target.value))}
				className={cn(
					"w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-200",
					"[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
					"[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600",
					"[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full",
					"[&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-0",
				)}
				aria-label={`${title} amount`}
			/>
			<div className="mt-2">{children}</div>
		</div>
	);
}

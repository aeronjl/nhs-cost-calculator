"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ComparisonsAffordedList } from "@/components/ui/comparisons-afforded-list";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { cn } from "@/lib/utils";
import type { ResolvedComparison } from "@/data/comparisons";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import {
	type Counterfactual,
	comparisonsCovered,
	evaluateCounterfactual,
} from "@/lib/counterfactual";
import {
	counterfactualToScenario,
	serializeScenario,
} from "@/lib/scenario";
import {
	SIMULATOR_OWNED_PARAMS,
	buildUrl,
} from "@/lib/url-write";

interface Props {
	comparisons: readonly ResolvedComparison[];
	usdPerGbp: number;
	initialMode: "programme" | "tax";
	initialProgId: string;
	initialProgPct: number;
	initialTaxId: string;
	initialTaxPp: number;
}

type Mode = "programme" | "tax";

export default function CounterfactualPanel({
	comparisons,
	usdPerGbp,
	initialMode,
	initialProgId,
	initialProgPct,
	initialTaxId,
	initialTaxPp,
}: Props) {
	const router = useRouter();
	const [mode, setMode] = useState<Mode>(initialMode);
	const [programmeId, setProgrammeId] = useState(initialProgId);
	// Stored as a fraction (-0.5..0.5) but shown to user as percent.
	const [programmeDelta, setProgrammeDelta] = useState(initialProgPct / 100);
	const [taxId, setTaxId] = useState(initialTaxId);
	// Stored as decimal pp (e.g. 0.01 = +1pp on the slider's percentage-point axis).
	// NB: the actual slider range is in pp directly (-5..5), not fractions.
	const [taxDelta, setTaxDelta] = useState(initialTaxPp);

	const cf: Counterfactual =
		mode === "programme"
			? { type: "programme", id: programmeId, deltaFraction: programmeDelta }
			: { type: "tax", id: taxId, deltaPp: taxDelta };

	const result = evaluateCounterfactual(cf);
	const items = comparisonsCovered(result.deltaGbp, comparisons, usdPerGbp);

	// Mirror state to the URL — write the unified `?scenario=&editor=single`
	// shape. Legacy `?cf_*=` params are cleared (they may still arrive on a
	// fresh page load, where url-state.ts decodes them).
	useEffect(() => {
		const handle = setTimeout(() => {
			const lines = counterfactualToScenario(cf);
			const scenarioStr = serializeScenario(lines);
			const url = buildUrl(
				new URLSearchParams(window.location.search),
				SIMULATOR_OWNED_PARAMS,
				{
					scenario: scenarioStr || undefined,
					editor: "single",
				},
			);
			router.replace(url, { scroll: false });
		}, 250);
		return () => clearTimeout(handle);
	}, [cf, router]);

	return (
		<Card className="mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl sm:text-3xl font-light text-center">
					What if…?
					<br />
					<span className="text-base text-muted-foreground font-normal">
						Move one fiscal lever; see what changes.
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="flex justify-center gap-2">
					<ModeButton
						active={mode === "programme"}
						onClick={() => setMode("programme")}
					>
						Adjust spending
					</ModeButton>
					<ModeButton active={mode === "tax"} onClick={() => setMode("tax")}>
						Adjust a tax
					</ModeButton>
				</div>

				{mode === "programme" ? (
					<ProgrammeControls
						programmeId={programmeId}
						setProgrammeId={setProgrammeId}
						delta={programmeDelta}
						setDelta={setProgrammeDelta}
					/>
				) : (
					<TaxControls
						taxId={taxId}
						setTaxId={setTaxId}
						delta={taxDelta}
						setDelta={setTaxDelta}
					/>
				)}

				{/* Headline outcome */}
				<div className="text-center py-2">
					<p className="text-sm text-muted-foreground mb-1">
						{result.description}
					</p>
					<p className="text-3xl font-light">
						{result.isRevenue ? (
							<>
								frees up{" "}
								<span className="text-blue-600 font-semibold">
									£
									<AnimatedNumber
										value={Math.abs(Math.round(result.deltaGbp))}
									/>
								</span>
							</>
						) : (
							<>
								requires{" "}
								<span className="text-amber-700 font-semibold">
									£
									<AnimatedNumber
										value={Math.abs(Math.round(result.deltaGbp))}
									/>
								</span>
							</>
						)}
					</p>
					<p className="text-xs text-muted-foreground mt-2 inline-flex items-center justify-center gap-1">
						<a
							href={result.source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline"
						>
							{result.source.label}
						</a>
						<MethodologyPopover
							methodology={result.methodology}
							label={
								mode === "programme" ? "cuttability?" : "why this number?"
							}
						/>
					</p>
				</div>

				{/* Comparison list */}
				<ComparisonsAffordedList
					items={items}
					caption={
						result.isRevenue
							? "That's enough to fund any one of:"
							: "That's the cost of any one of:"
					}
					hasNonZeroMagnitude={Math.abs(result.deltaGbp) > 0}
				/>

				<p className="text-xs text-muted-foreground text-center pt-2 border-t">
					Counterfactuals are first-order: they don't model behavioural
					responses, multiplier effects, or the time it takes for a policy
					change to flow through the economy. The methodology popovers flag
					where these matter most.
				</p>
			</CardContent>
		</Card>
	);
}

function ModeButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
				active
					? "bg-primary text-primary-foreground"
					: "bg-muted text-muted-foreground hover:bg-muted/70",
			)}
		>
			{children}
		</button>
	);
}

function ProgrammeControls({
	programmeId,
	setProgrammeId,
	delta,
	setDelta,
}: {
	programmeId: string;
	setProgrammeId: (id: string) => void;
	delta: number;
	setDelta: (v: number) => void;
}) {
	const pct = delta * 100;
	return (
		<div className="space-y-3 max-w-xl mx-auto">
			<div className="flex flex-wrap items-center gap-2 justify-center text-sm">
				<select
					value={programmeId}
					onChange={(e) => setProgrammeId(e.target.value)}
					className="rounded-md border border-input bg-background px-3 py-1 shadow-sm"
				>
					{UK_SPENDING_PROGRAMMES.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				<span className="text-muted-foreground">
					by{" "}
					<span
						className={cn(
							"font-semibold tabular-nums",
							delta < 0
								? "text-blue-600"
								: delta > 0
									? "text-amber-700"
									: "",
						)}
					>
						{delta >= 0 ? "+" : ""}
						{pct.toFixed(1)}%
					</span>
				</span>
			</div>
			<Slider
				min={-0.5}
				max={0.5}
				step={0.005}
				value={delta}
				onChange={setDelta}
				labels={["-50%", "0", "+50%"]}
			/>
		</div>
	);
}

function TaxControls({
	taxId,
	setTaxId,
	delta,
	setDelta,
}: {
	taxId: string;
	setTaxId: (id: string) => void;
	delta: number;
	setDelta: (v: number) => void;
}) {
	const lever = TAX_LEVERS.find((l) => l.id === taxId);
	const isFreeze = lever?.unit === "yr";
	const unitLabel = isFreeze ? "yr" : "pp";
	const verb = isFreeze ? "for" : "by";
	const sliderRange = isFreeze ? 10 : 5;
	const sliderStep = isFreeze ? 0.5 : 0.1;
	return (
		<div className="space-y-3 max-w-xl mx-auto">
			<div className="flex flex-wrap items-center gap-2 justify-center text-sm">
				<span className="text-muted-foreground">
					{isFreeze ? "Freeze" : "Adjust"}
				</span>
				<select
					value={taxId}
					onChange={(e) => setTaxId(e.target.value)}
					className="rounded-md border border-input bg-background px-3 py-1 shadow-sm"
				>
					{TAX_LEVERS.map((l) => (
						<option key={l.id} value={l.id}>
							{l.name}
						</option>
					))}
				</select>
				<span className="text-muted-foreground">
					{verb}{" "}
					<span
						className={cn(
							"font-semibold tabular-nums",
							delta > 0
								? "text-blue-600"
								: delta < 0
									? "text-amber-700"
									: "",
						)}
					>
						{delta >= 0 ? "+" : ""}
						{delta.toFixed(isFreeze ? 1 : 2)}
						{unitLabel}
					</span>
				</span>
			</div>
			<Slider
				min={-sliderRange}
				max={sliderRange}
				step={sliderStep}
				value={delta}
				onChange={setDelta}
				labels={[
					`-${sliderRange}${unitLabel}`,
					"0",
					`+${sliderRange}${unitLabel}`,
				]}
			/>
		</div>
	);
}

function Slider({
	min,
	max,
	step,
	value,
	onChange,
	labels,
}: {
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (v: number) => void;
	labels: [string, string, string];
}) {
	return (
		<div>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className={cn(
					"w-full h-2 rounded-lg appearance-none cursor-pointer bg-neutral-200",
					"[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
					"[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600",
					"[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full",
					"[&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-0",
				)}
				aria-label="counterfactual amount"
			/>
			<div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
				<span>{labels[0]}</span>
				<span>{labels[1]}</span>
				<span>{labels[2]}</span>
			</div>
		</div>
	);
}

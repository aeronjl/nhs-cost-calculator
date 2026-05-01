"use client";

import { cn } from "@/lib/utils";
import type {
	FiscalRuleFan,
	FiscalRuleUncertaintyDecomposition,
} from "@/lib/baseline-projection";

// Probability-of-breach gauge for the trajectory tab. Half-circle dial,
// pre- and post-reaction probability marks, and a per-layer decomposition
// bar showing where the breach risk comes from.
//
// Inputs are the same fan the BaselineComparisonPanel already consumes:
// `fiscalRuleFan` from `projectFiscalRuleFan` and the optional
// `fiscalRuleUncertaintyDecomposition`. The gauge is purely a
// re-presentation — no fresh model work — so it stays cheap to render.

interface Props {
	fiscalRuleFan?: FiscalRuleFan;
	fiscalRuleUncertaintyDecomposition?: FiscalRuleUncertaintyDecomposition;
}

type RiskTone = "blue" | "amber" | "red";

const formatProbability = (n: number): string => `${Math.round(n * 100)}%`;

const formatProbabilityDelta = (n: number): string => {
	const pp = n * 100;
	const sign = pp > 0 ? "+" : pp < 0 ? "−" : "";
	const abs = Math.abs(pp);
	return `${sign}${abs >= 10 ? abs.toFixed(0) : abs.toFixed(1)}pp`;
};

const formatStylePct = (n: number): string =>
	`${Number.isFinite(n) ? Math.max(0, Math.min(100, n)).toFixed(3) : "0.000"}%`;

const riskTone = (probability: number): RiskTone =>
	probability > 0.25 ? "red" : probability > 0.1 ? "amber" : "blue";

const toneStrokeColor = (tone: RiskTone): string =>
	tone === "red" ? "#dc2626" : tone === "amber" ? "#d97706" : "#2563eb";

const toneTextClassName = (tone: RiskTone): string =>
	tone === "red"
		? "text-red-700"
		: tone === "amber"
			? "text-amber-700"
			: "text-blue-700";

export function FiscalRiskGauge({
	fiscalRuleFan,
	fiscalRuleUncertaintyDecomposition,
}: Props) {
	if (!fiscalRuleFan) return null;

	const pre = fiscalRuleFan.breachProbability;
	const post = fiscalRuleFan.postReactionBreachProbability;
	const tone = riskTone(pre);
	const postTone = riskTone(post);
	const reactionEffect = post - pre;

	return (
		<section
			aria-label="Fiscal-rule breach risk gauge"
			className="rounded-md border bg-background/70 p-3"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold">Fiscal-rule breach risk</h3>
					<p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
						Stochastic fan over {fiscalRuleFan.samples} draws of the rule-year
						headroom. Reaction packages can offset some risk; the post-reaction
						mark shows where it lands once they trigger.
					</p>
				</div>
				<div className="text-[10px] text-muted-foreground">
					{fiscalRuleFan.samples} draws
				</div>
			</div>

			<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
				<HalfCircleDial pre={pre} post={post} />
				<div className="grid grid-cols-2 gap-2 sm:flex-1">
					<RiskMetric
						label="Raw breach"
						value={formatProbability(pre)}
						tone={tone}
						subtitle={`p5 headroom ${formatBn(fiscalRuleFan.headroomBand.p5)}`}
					/>
					<RiskMetric
						label="After reaction"
						value={formatProbability(post)}
						tone={postTone}
						subtitle={
							reactionEffect === 0
								? "no reaction triggered"
								: `${formatProbabilityDelta(reactionEffect)} vs raw`
						}
					/>
				</div>
			</div>

			{fiscalRuleUncertaintyDecomposition &&
				fiscalRuleUncertaintyDecomposition.layers.length > 1 && (
					<UncertaintyLayerBar
						decomposition={fiscalRuleUncertaintyDecomposition}
					/>
				)}
		</section>
	);
}

function HalfCircleDial({ pre, post }: { pre: number; post: number }) {
	const width = 132;
	const height = 78;
	const cx = width / 2;
	const cy = height - 12;
	const radius = 50;
	const stroke = 8;

	const tone = riskTone(pre);
	const color = toneStrokeColor(tone);

	// Half circle path from (cx-radius, cy) to (cx+radius, cy), arc going up.
	const arcStart = { x: cx - radius, y: cy };
	const arcEnd = { x: cx + radius, y: cy };

	// SVG circumference of the half-circle arc:
	const halfCircumference = Math.PI * radius;

	// stroke-dasharray trick: full half circle, dash visible = pre * halfCircumference
	const visibleLength = pre * halfCircumference;

	// Marker for post-reaction probability (dot on the arc)
	const postAngle = Math.PI - post * Math.PI; // 180deg start, 0deg end
	const postPoint = {
		x: cx + radius * Math.cos(postAngle),
		y: cy - radius * Math.sin(postAngle),
	};

	return (
		<div className="flex flex-col items-center">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="h-20 w-32"
				role="img"
				aria-label={`Fiscal-rule breach probability ${formatProbability(pre)}`}
			>
				<title>{`Fiscal-rule breach probability ${formatProbability(pre)}; after reaction ${formatProbability(post)}`}</title>
				{/* Background half circle */}
				<path
					d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
					stroke="currentColor"
					strokeWidth={stroke}
					fill="none"
					strokeLinecap="round"
					className="text-muted/40"
				/>
				{/* Foreground arc proportional to pre */}
				<path
					d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
					stroke={color}
					strokeWidth={stroke}
					fill="none"
					strokeLinecap="round"
					strokeDasharray={`${visibleLength} ${halfCircumference}`}
					opacity="0.85"
				/>
				{/* Post-reaction marker */}
				{post < 1 && (
					<circle
						cx={postPoint.x}
						cy={postPoint.y}
						r="3.6"
						fill="white"
						stroke={toneStrokeColor(riskTone(post))}
						strokeWidth="1.6"
					>
						<title>{`After-reaction probability ${formatProbability(post)}`}</title>
					</circle>
				)}
				<text
					x={cx}
					y={cy - 6}
					textAnchor="middle"
					className={cn(
						"fill-current text-[16px] font-semibold tabular-nums",
						toneTextClassName(tone),
					)}
				>
					{formatProbability(pre)}
				</text>
			</svg>
			<div className="text-[9px] uppercase tracking-wider text-muted-foreground">
				Raw / after reaction
			</div>
		</div>
	);
}

function RiskMetric({
	label,
	value,
	tone,
	subtitle,
}: {
	label: string;
	value: string;
	tone: RiskTone;
	subtitle: string;
}) {
	return (
		<div className="rounded-sm border bg-muted/20 p-2">
			<div className="text-[9px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"mt-0.5 text-base font-semibold tabular-nums",
					toneTextClassName(tone),
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
				{subtitle}
			</div>
		</div>
	);
}

function UncertaintyLayerBar({
	decomposition,
}: {
	decomposition: FiscalRuleUncertaintyDecomposition;
}) {
	// Visualise the marginal contribution of each uncertainty layer to the
	// breach probability — i.e. how much each successive uncertainty source
	// adds on top of the previous layer's running probability.
	const layers = decomposition.layers;
	if (layers.length === 0) return null;

	let prev = 0;
	const segments = layers.map((layer) => {
		const delta = Math.max(0, layer.breachProbability - prev);
		prev = layer.breachProbability;
		return { layer, delta };
	});
	const totalProbability = layers[layers.length - 1]!.breachProbability;
	if (totalProbability === 0) return null;
	const remaining = 1 - totalProbability;

	const layerColor = (id: string): string => {
		switch (id) {
			case "central":
				return "#475569"; // slate-600
			case "baseline-forecast-error":
				return "#0891b2"; // cyan-600
			case "macro-shocks":
				return "#d97706"; // amber-600
			case "borrowing-regime":
				return "#dc2626"; // red-600
			case "policy-reaction":
				return "#2563eb"; // blue-600
			default:
				return "#7c3aed"; // violet-600
		}
	};

	return (
		<div className="mt-3 rounded-sm border bg-muted/20 p-2">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Where the risk comes from
				</span>
				<span className="text-[10px] tabular-nums text-muted-foreground">
					{decomposition.samples} draws
				</span>
			</div>
			<div
				className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted"
				role="img"
				aria-label="Uncertainty layer contributions to breach probability"
			>
				{segments.map(({ layer, delta }) => {
					if (delta <= 0) return null;
					return (
						<span
							key={layer.id}
							className="block h-full"
							style={{
								width: formatStylePct(delta * 100),
								backgroundColor: layerColor(layer.id),
							}}
							title={`${layer.label}: +${formatProbability(delta)} marginal contribution to breach probability`}
						/>
					);
				})}
				{remaining > 0 && (
					<span
						className="block h-full bg-emerald-500/20"
						style={{ width: formatStylePct(remaining * 100) }}
						title={`Safe: ${formatProbability(remaining)} of futures don't breach the rule`}
					/>
				)}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
				{segments.map(({ layer, delta }) => {
					if (delta <= 0) return null;
					return (
						<span key={layer.id} className="inline-flex items-center gap-1.5">
							<span
								aria-hidden="true"
								className="inline-block h-2 w-2 rounded-sm"
								style={{ backgroundColor: layerColor(layer.id) }}
							/>
							<span className="text-muted-foreground">
								{layer.label}{" "}
								<span className="tabular-nums text-foreground">
									+{formatProbability(delta)}
								</span>
							</span>
						</span>
					);
				})}
			</div>
		</div>
	);
}

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	const sign = n < 0 ? "−" : "";
	if (abs >= 1_000_000_000)
		return `${sign}£${(abs / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `${sign}£${Math.round(abs / 1_000_000)}m`;
	return `${sign}£${Math.round(abs).toLocaleString()}`;
};

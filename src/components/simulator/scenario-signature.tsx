"use client";

import { cn } from "@/lib/utils";
import type { ScenarioSignature } from "@/lib/scenario-signature";
import { useAnimatedValues } from "@/lib/use-animated-values";

// Pentagonal radar that summarises a scenario's "shape" on five axes:
// tax / spend / borrow / progressive / long-run. Designed to be compact
// (~140×140) so it lives in the TopZone right column alongside the
// "Could fund" and "Household effect" cards, and to morph smoothly when
// the user edits the scenario (axis values are interpolated through
// useAnimatedValues).
//
// Visual convention is intentionally tonal rather than colour-categorical:
// the polygon fills in a single blue tone with progressive opacity, and
// the silhouette IS the identity — distinctive scenarios produce distinct
// shapes on the same canvas, like a fingerprint.

interface Props {
	signature: ScenarioSignature;
}

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const MAX_RADIUS = 32; // leaves room for axis labels around the perimeter
const AXIS_COUNT = 5;

const formatStylePct = (n: number): string =>
	`${Math.max(0, Math.min(100, n)).toFixed(3)}%`;

interface Axis {
	id: keyof ScenarioSignature;
	label: string;
	angle: number; // radians, with -PI/2 at the top
}

const buildAxes = (): readonly Axis[] => {
	const baseAngle = -Math.PI / 2;
	const ids: Axis["id"][] = [
		"tax",
		"spend",
		"borrow",
		"progressive",
		"longRun",
	];
	const labels: Record<Axis["id"], string> = {
		tax: "Tax",
		spend: "Spend",
		borrow: "Borrow",
		progressive: "Progressive",
		longRun: "Long-run",
	};
	return ids.map((id, i) => ({
		id,
		label: labels[id],
		angle: baseAngle + (i * 2 * Math.PI) / AXIS_COUNT,
	}));
};

const AXES = buildAxes();

const project = (axis: Axis, value: number): { x: number; y: number } => ({
	x: CENTER + Math.cos(axis.angle) * MAX_RADIUS * value,
	y: CENTER + Math.sin(axis.angle) * MAX_RADIUS * value,
});

const labelAnchor = (
	angle: number,
): {
	textAnchor: "start" | "middle" | "end";
	dy: number;
} => {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const textAnchor =
		cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
	const dy = sin > 0.3 ? 8 : sin < -0.3 ? -3 : 3;
	return { textAnchor, dy };
};

export function ScenarioSignatureRadar({ signature }: Props) {
	const targetValues = AXES.map((a) => signature[a.id]);
	const animatedValues = useAnimatedValues(targetValues);

	const polygonPoints = AXES.map((axis, i) => {
		const value = animatedValues[i] ?? signature[axis.id];
		const { x, y } = project(axis, value);
		return `${x},${y}`;
	}).join(" ");

	const guideRings = [0.25, 0.5, 0.75, 1] as const;

	return (
		<section
			aria-label="Scenario signature"
			className="rounded-md border bg-background/70 p-3"
		>
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Signature
				</h3>
				<span className="text-[9px] text-muted-foreground">5-axis fingerprint</span>
			</div>
			<div className="mt-2 flex justify-center">
				<svg
					viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
					className="h-32 w-32"
					role="img"
					aria-label="Scenario signature radar"
				>
					<title>
						{`Scenario signature: tax ${percent(signature.tax)}, spend ${percent(
							signature.spend,
						)}, borrow ${percent(signature.borrow)}, progressive ${percent(
							signature.progressive,
						)}, long-run ${percent(signature.longRun)}`}
					</title>
					{guideRings.map((ring) => {
						const pts = AXES.map((axis) => {
							const { x, y } = project(axis, ring);
							return `${x},${y}`;
						}).join(" ");
						return (
							<polygon
								key={ring}
								points={pts}
								fill="none"
								stroke="currentColor"
								strokeWidth="0.4"
								vectorEffect="non-scaling-stroke"
								className="text-foreground/15"
							/>
						);
					})}
					{AXES.map((axis) => {
						const { x: xEnd, y: yEnd } = project(axis, 1);
						return (
							<line
								key={`axis-${axis.id}`}
								x1={CENTER}
								y1={CENTER}
								x2={xEnd}
								y2={yEnd}
								stroke="currentColor"
								strokeWidth="0.4"
								vectorEffect="non-scaling-stroke"
								className="text-foreground/20"
							/>
						);
					})}
					<polygon
						points={polygonPoints}
						fill="#2563eb"
						fillOpacity="0.18"
						stroke="#2563eb"
						strokeWidth="1.4"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
					{AXES.map((axis, i) => {
						const value = animatedValues[i] ?? signature[axis.id];
						const { x, y } = project(axis, value);
						return (
							<circle
								key={`vertex-${axis.id}`}
								cx={x}
								cy={y}
								r="1.6"
								fill="#2563eb"
								vectorEffect="non-scaling-stroke"
							/>
						);
					})}
					{AXES.map((axis) => {
						const { x: lx, y: ly } = project(axis, 1.2);
						const { textAnchor, dy } = labelAnchor(axis.angle);
						return (
							<text
								key={`label-${axis.id}`}
								x={lx}
								y={ly + dy}
								textAnchor={textAnchor}
								className={cn(
									"fill-current text-[6.5px] font-medium",
									"text-muted-foreground",
								)}
							>
								{axis.label}
							</text>
						);
					})}
				</svg>
			</div>
			<dl className="mt-2 grid grid-cols-5 gap-1 text-[9px] text-muted-foreground">
				{AXES.map((axis) => {
					const value = signature[axis.id];
					return (
						<div key={`legend-${axis.id}`} className="min-w-0 text-center">
							<dt className="truncate" title={axis.label}>
								{axis.label}
							</dt>
							<dd className="mt-0.5 h-1 overflow-hidden rounded-sm bg-muted">
								<span
									className="block h-full bg-blue-500"
									style={{ width: formatStylePct(value * 100) }}
								/>
							</dd>
						</div>
					);
				})}
			</dl>
		</section>
	);
}

const percent = (n: number): string => `${Math.round(n * 100)}%`;

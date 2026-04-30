import { ImageResponse } from "next/og";
import { loadResolvedComparisons } from "@/data/comparisons";
import { getUsdPerGbp } from "@/lib/fx";
import { comparisonsCovered } from "@/lib/counterfactual";
import {
	deserializeScenario,
	evaluateScenario,
	evaluateScenarioDistribution,
	projectScenarioOverYears,
} from "@/lib/scenario";
import {
	computeScenarioSignature,
	type ScenarioSignature,
} from "@/lib/scenario-signature";
import { formatMoney } from "@/app/utils/formatters";

export const runtime = "edge";
export const revalidate = 3600;

const SIZE = { width: 1200, height: 630 } as const;

const formatBn = (n: number): string => {
	const abs = Math.abs(n);
	if (abs >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (abs >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return formatMoney(n);
};

const formatCount = (n: number): string => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 10_000) return `${Math.round(n / 1_000).toLocaleString()},000`;
	if (n >= 100) return Math.round(n).toLocaleString();
	if (n >= 10) return Math.round(n).toString();
	return n.toFixed(1);
};

interface OgSignatureRadarProps {
	signature: ScenarioSignature;
	size: number;
}

const OG_SIGNATURE_AXES = [
	{ id: "tax", label: "Tax" },
	{ id: "spend", label: "Spend" },
	{ id: "borrow", label: "Borrow" },
	{ id: "progressive", label: "Progressive" },
	{ id: "longRun", label: "Long-run" },
] as const;

function OgSignatureRadar({ signature, size }: OgSignatureRadarProps) {
	const center = size / 2;
	const maxRadius = size * 0.32;
	const labelRadius = size * 0.42;
	const baseAngle = -Math.PI / 2;
	const points = OG_SIGNATURE_AXES.map((axis, idx) => ({
		...axis,
		angle: baseAngle + (idx * 2 * Math.PI) / OG_SIGNATURE_AXES.length,
		value: signature[axis.id],
	}));

	const coord = (angle: number, radius: number): { x: number; y: number } => ({
		x: center + Math.cos(angle) * radius,
		y: center + Math.sin(angle) * radius,
	});

	const polygonPoints = points
		.map((p) => {
			const { x, y } = coord(p.angle, maxRadius * p.value);
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");

	const guideRings = [0.25, 0.5, 0.75, 1] as const;

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			style={{ display: "block" }}
		>
			{guideRings.map((ring) => {
				const ringPoints = points
					.map((p) => {
						const { x, y } = coord(p.angle, maxRadius * ring);
						return `${x.toFixed(2)},${y.toFixed(2)}`;
					})
					.join(" ");
				return (
					<polygon
						key={`ring-${ring}`}
						points={ringPoints}
						fill="none"
						stroke="white"
						strokeOpacity="0.18"
						strokeWidth="1"
					/>
				);
			})}
			{points.map((p) => {
				const { x, y } = coord(p.angle, maxRadius);
				return (
					<line
						key={`axis-${p.id}`}
						x1={center}
						y1={center}
						x2={x}
						y2={y}
						stroke="white"
						strokeOpacity="0.22"
						strokeWidth="1"
					/>
				);
			})}
			<polygon
				points={polygonPoints}
				fill="white"
				fillOpacity="0.4"
				stroke="white"
				strokeWidth="3"
				strokeLinejoin="round"
			/>
			{points.map((p) => {
				const { x, y } = coord(p.angle, maxRadius * p.value);
				return (
					<circle
						key={`vertex-${p.id}`}
						cx={x}
						cy={y}
						r="4.5"
						fill="white"
					/>
				);
			})}
		</svg>
	);
}

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const [comparisons, usdPerGbp] = await Promise.all([
		loadResolvedComparisons(),
		getUsdPerGbp(),
	]);
	const lines = deserializeScenario(searchParams.get("scenario") ?? "");
	const result = evaluateScenario(lines);
	const items = comparisonsCovered(result.net, comparisons, usdPerGbp, 3);
	const distribution = evaluateScenarioDistribution(result);
	const projection =
		result.lines.length > 0 ? projectScenarioOverYears(result, 5) : [];
	const signature = computeScenarioSignature({
		result,
		distribution,
		year1: projection[0],
		year5: projection[4],
	});

	const netLabel =
		result.net > 0
			? "freed"
			: result.net < 0
				? "shortfall"
				: "balanced budget";
	const netColor = result.net > 0 ? "#bfdbfe" : "#fde68a";

	// Show top 4 lines; truncate the rest with "+N more".
	const displayLines = result.lines.slice(0, 4);
	const moreCount = result.lines.length - displayLines.length;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "60px 80px",
				background:
					"linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)",
				color: "white",
				fontFamily: "sans-serif",
			}}
		>
			<div style={{ display: "flex", fontSize: 24, opacity: 0.85 }}>
				💰 NHSCostCalculator.com · Fiscal scenario
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "flex-start",
					gap: 60,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 14,
						flex: 1,
						minWidth: 0,
					}}
				>
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							alignItems: "baseline",
							gap: 14,
							fontSize: 48,
							fontWeight: 600,
							lineHeight: 1.05,
						}}
					>
						<span style={{ color: netColor }}>
							{result.net !== 0 ? formatBn(Math.abs(result.net)) : "£0"}
						</span>
						<span style={{ opacity: 0.85, fontSize: 36 }}>{netLabel}</span>
					</div>
					{displayLines.length > 0 && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 4,
								fontSize: 22,
								opacity: 0.9,
							}}
						>
							{displayLines.map((ev) => (
								<div
									key={ev.line.id}
									style={{ display: "flex", alignItems: "center", gap: 12 }}
								>
									<span style={{ fontSize: 22 }}>
										{ev.line.type === "tax"
											? "💰"
											: ev.line.type === "programme"
												? "✂️"
												: "🏦"}
									</span>
									<span style={{ flex: 1 }}>{ev.description}</span>
									<span
										style={{
											color: ev.deltaGbp > 0 ? "#bfdbfe" : "#fde68a",
											minWidth: 110,
											textAlign: "right",
										}}
									>
										{ev.deltaGbp > 0 ? "+" : "−"}
										{formatBn(Math.abs(ev.deltaGbp))}
									</span>
								</div>
							))}
							{moreCount > 0 && (
								<div style={{ display: "flex", opacity: 0.6, fontSize: 18 }}>
									+ {moreCount} more line{moreCount === 1 ? "" : "s"}
								</div>
							)}
						</div>
					)}
					{items.length > 0 && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 4,
								fontSize: 20,
								opacity: 0.85,
								marginTop: 6,
							}}
						>
							<div style={{ display: "flex", opacity: 0.7 }}>
								{result.net > 0 ? "Enough for any one of:" : "Equivalent to:"}
							</div>
							{items.map(({ comparison, count }) => (
								<div
									key={comparison.id}
									style={{ display: "flex", alignItems: "center", gap: 12 }}
								>
									<span style={{ fontSize: 22 }}>{comparison.emoji}</span>
									<span style={{ fontWeight: 600 }}>
										{formatCount(count)}{" "}
										{count === 1 ? comparison.name : comparison.pluralName}
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				{signature && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 10,
							flexShrink: 0,
						}}
					>
						<div
							style={{
								display: "flex",
								fontSize: 14,
								opacity: 0.6,
								letterSpacing: 1.4,
								textTransform: "uppercase",
							}}
						>
							Scenario signature
						</div>
						<OgSignatureRadar signature={signature} size={240} />
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 4,
								fontSize: 16,
								opacity: 0.85,
								width: 240,
							}}
						>
							{OG_SIGNATURE_AXES.map((axis) => (
								<div
									key={`axis-row-${axis.id}`}
									style={{
										display: "flex",
										justifyContent: "space-between",
										gap: 12,
									}}
								>
									<span style={{ display: "flex", opacity: 0.75 }}>
										{axis.label}
									</span>
									<span style={{ display: "flex", fontWeight: 600 }}>
										{Math.round(signature[axis.id] * 100)}%
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<div style={{ display: "flex", fontSize: 16, opacity: 0.6 }}>
				HMRC ready reckoner · UK DMO · HMT PESA 2024
			</div>
		</div>,
		SIZE,
	);
}

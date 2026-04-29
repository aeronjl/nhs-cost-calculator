import { ImageResponse } from "next/og";
import { loadResolvedComparisons } from "@/data/comparisons";
import { getUsdPerGbp } from "@/lib/fx";
import { comparisonsCovered } from "@/lib/counterfactual";
import { deserializeScenario, evaluateScenario } from "@/lib/scenario";
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

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const [comparisons, usdPerGbp] = await Promise.all([
		loadResolvedComparisons(),
		getUsdPerGbp(),
	]);
	const lines = deserializeScenario(searchParams.get("scenario") ?? "");
	const result = evaluateScenario(lines);
	const items = comparisonsCovered(result.net, comparisons, usdPerGbp, 3);

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

			<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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

			<div style={{ display: "flex", fontSize: 16, opacity: 0.6 }}>
				HMRC ready reckoner · UK DMO · HMT PESA 2024
			</div>
		</div>,
		SIZE,
	);
}

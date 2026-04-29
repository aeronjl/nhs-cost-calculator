import { ImageResponse } from "next/og";
import { MINUTES_PER_YEAR, loadResolvedSlices } from "@/data/nhs-budget";
import { loadResolvedComparisons } from "@/data/comparisons";
import { resolveState } from "@/lib/url-state";
import { getUsdPerGbp } from "@/lib/fx";
import { formatMoney, formatTime } from "@/app/utils/formatters";

export const runtime = "edge";
// Same URL params yield the same image (FX is cached for an hour upstream).
export const revalidate = 3600;

const SIZE = { width: 1200, height: 630 } as const;

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const [usdPerGbp, slices, comparisons] = await Promise.all([
		getUsdPerGbp(),
		loadResolvedSlices(),
		loadResolvedComparisons(),
	]);
	const { option, quantity, amount, slice } = resolveState(
		{
			id: searchParams.get("id") ?? undefined,
			q: searchParams.get("q") ?? undefined,
			a: searchParams.get("a") ?? undefined,
			slice: searchParams.get("slice") ?? undefined,
		},
		usdPerGbp,
		slices,
		comparisons,
	);

	const headline = option
		? `${quantity.toLocaleString()} ${quantity > 1 ? option.pluralName : option.name}`
		: formatMoney(amount, "GBP");
	const time = formatTime((amount / slice.value) * MINUTES_PER_YEAR);

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "80px",
				background:
					"linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #3b82f6 100%)",
				color: "white",
				fontFamily: "sans-serif",
			}}
		>
			<div style={{ display: "flex", fontSize: 28, opacity: 0.85 }}>
				💰 NHSCostCalculator.com
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				{option && (
					<div style={{ fontSize: 96, lineHeight: 1 }}>{option.emoji}</div>
				)}
				<div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.1 }}>
					{headline}
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						alignItems: "baseline",
						gap: 16,
						fontSize: 48,
						fontWeight: 600,
						lineHeight: 1.15,
					}}
				>
					<span>=</span>
					<span style={{ color: "#bfdbfe" }}>{time}</span>
					<span>of {slice.shortLabel}</span>
				</div>
			</div>
			<div style={{ display: "flex", fontSize: 22, opacity: 0.7 }}>
				{`${slice.label}: ${formatMoney(slice.value, "GBP")} · ${slice.source.label}`}
			</div>
		</div>,
		SIZE,
	);
}

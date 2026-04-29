// LEGACY OG ROUTE — kept for back-compat with share-links that pre-date the
// URL unification (Phase 0). New shares from `page.tsx` always go to
// `/og/scenario`; this route only fires for old `?cf_*=` URLs in the wild.
// Safe to delete after a deprecation window once analytics confirm zero hits.
import { ImageResponse } from "next/og";
import { loadResolvedComparisons } from "@/data/comparisons";
import { getUsdPerGbp } from "@/lib/fx";
import {
	comparisonsCovered,
	evaluateCounterfactual,
} from "@/lib/counterfactual";
import { resolveCounterfactualState } from "@/lib/url-state";
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
	const state = resolveCounterfactualState({
		cf_mode: searchParams.get("cf_mode") ?? undefined,
		cf_prog: searchParams.get("cf_prog") ?? undefined,
		cf_pct: searchParams.get("cf_pct") ?? undefined,
		cf_tax: searchParams.get("cf_tax") ?? undefined,
		cf_pp: searchParams.get("cf_pp") ?? undefined,
	});

	const result = evaluateCounterfactual(
		state.mode === "programme"
			? {
					type: "programme",
					id: state.progId,
					deltaFraction: state.progPct / 100,
				}
			: { type: "tax", id: state.taxId, deltaPp: state.taxPp },
	);
	const items = comparisonsCovered(
		result.deltaGbp,
		comparisons,
		usdPerGbp,
		3,
	);

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
				💰 NHSCostCalculator.com · What if…?
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
				<div style={{ fontSize: 56, fontWeight: 300, lineHeight: 1.05 }}>
					{result.description}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "baseline",
						gap: 16,
						fontSize: 44,
						fontWeight: 600,
						flexWrap: "wrap",
					}}
				>
					<span>=</span>
					<span style={{ color: result.isRevenue ? "#bfdbfe" : "#fde68a" }}>
						{formatBn(Math.abs(result.deltaGbp))}
					</span>
					<span style={{ opacity: 0.85 }}>
						{result.isRevenue ? "freed" : "required"}
					</span>
				</div>
				{items.length > 0 && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
							fontSize: 24,
							opacity: 0.9,
							marginTop: 12,
						}}
					>
						<div style={{ display: "flex", opacity: 0.7 }}>
							{result.isRevenue ? "Enough for any one of:" : "Equivalent to:"}
						</div>
						{items.map(({ comparison, count }) => (
							<div
								key={comparison.id}
								style={{ display: "flex", alignItems: "center", gap: 14 }}
							>
								<span style={{ fontSize: 28 }}>{comparison.emoji}</span>
								<span style={{ fontWeight: 600 }}>
									{formatCount(count)}{" "}
									{count === 1 ? comparison.name : comparison.pluralName}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
			<div style={{ display: "flex", fontSize: 18, opacity: 0.7 }}>
				{result.source.label}
			</div>
		</div>,
		SIZE,
	);
}

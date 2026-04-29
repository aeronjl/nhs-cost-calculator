// LEGACY OG ROUTE — kept for back-compat with share-links that pre-date the
// URL unification (Phase 0). New shares from `page.tsx` always go to
// `/og/scenario`; this route only fires for old `?to_*=` URLs in the wild.
// Safe to delete after a deprecation window once analytics confirm zero hits.
import { ImageResponse } from "next/og";
import { loadResolvedComparisons } from "@/data/comparisons";
import {
	describeBorrow,
	describeCut,
	describeTax,
} from "@/lib/trade-off";
import { resolveTradeOffState } from "@/lib/url-state";
import { formatMoney } from "@/app/utils/formatters";

export const runtime = "edge";
export const revalidate = 3600;

const SIZE = { width: 1200, height: 630 } as const;

const formatBn = (n: number): string => {
	if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
	if (n >= 1_000_000) return `£${Math.round(n / 1_000_000)}m`;
	return formatMoney(n);
};

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const comparisons = await loadResolvedComparisons();
	const state = resolveTradeOffState(
		{
			to_goal: searchParams.get("to_goal") ?? undefined,
			to_q: searchParams.get("to_q") ?? undefined,
			to_amount: searchParams.get("to_amount") ?? undefined,
			to_tax: searchParams.get("to_tax") ?? undefined,
			to_prog: searchParams.get("to_prog") ?? undefined,
			to_split: searchParams.get("to_split") ?? undefined,
		},
		comparisons,
	);

	const goal = state.goalId
		? comparisons.find((c) => c.id === state.goalId)
		: null;
	const headline = goal
		? state.quantity > 1
			? `${state.quantity.toLocaleString()} ${goal.pluralName}`
			: goal.name
		: formatMoney(state.target);

	const tax = describeTax(state.allocation.tax, state.taxId);
	const borrow = describeBorrow(state.allocation.borrow);
	const cut = describeCut(state.allocation.cut, state.progId);

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
				💰 NHSCostCalculator.com · Trade-off
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<div style={{ display: "flex", fontSize: 24, opacity: 0.8 }}>
					Want to fund:
				</div>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						alignItems: "baseline",
						gap: 14,
						fontSize: 56,
						fontWeight: 300,
						lineHeight: 1.05,
					}}
				>
					<span>{headline}</span>
					<span style={{ opacity: 0.7, fontSize: 36 }}>
						({formatBn(state.target)})
					</span>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						fontSize: 28,
						marginTop: 12,
					}}
				>
					<div
						style={{ display: "flex", alignItems: "center", gap: 16 }}
					>
						<span style={{ fontSize: 32 }}>💰</span>
						<span style={{ color: "#bfdbfe", minWidth: 180 }}>
							{formatBn(state.allocation.tax)}
						</span>
						<span style={{ opacity: 0.85 }}>
							{tax.lever.unit === "pp"
								? `+${tax.ppChange.toFixed(2)}pp on ${tax.lever.name}`
								: `${tax.yearsOfFreeze.toFixed(1)}yr freeze on ${tax.lever.name}`}
						</span>
					</div>
					<div
						style={{ display: "flex", alignItems: "center", gap: 16 }}
					>
						<span style={{ fontSize: 32 }}>🏦</span>
						<span style={{ color: "#bfdbfe", minWidth: 180 }}>
							{formatBn(state.allocation.borrow)}
						</span>
						<span style={{ opacity: 0.85 }}>
							{formatBn(borrow.annualInterest)}/yr interest, +
							{borrow.debtGdpDelta.toFixed(2)}pp debt:GDP
						</span>
					</div>
					<div
						style={{ display: "flex", alignItems: "center", gap: 16 }}
					>
						<span style={{ fontSize: 32 }}>✂️</span>
						<span style={{ color: "#bfdbfe", minWidth: 180 }}>
							{formatBn(state.allocation.cut)}
						</span>
						<span style={{ opacity: 0.85 }}>
							{(cut.fraction * 100).toFixed(1)}% from{" "}
							{cut.programme.name}
						</span>
					</div>
				</div>
			</div>
			<div style={{ display: "flex", fontSize: 18, opacity: 0.7 }}>
				HMRC ready reckoner · UK DMO · HMT PESA 2024
			</div>
		</div>,
		SIZE,
	);
}

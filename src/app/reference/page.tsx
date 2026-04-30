import type { Metadata } from "next";
import {
	HeaderAction,
	SimulatorHeader,
} from "@/components/simulator/header";
import { BorrowingBacktestSection } from "@/components/simulator/borrowing-backtest-section";
import { BacktestSection } from "@/components/simulator/backtest-section";
import { FiscalReactionBacktestSection } from "@/components/simulator/fiscal-reaction-backtest-section";
import NHSSpendingCalculator from "../NHSSpendingCalculator";
import PersonalTaxBurden from "../PersonalTaxBurden";
import InternationalPanel from "../InternationalPanel";
import { loadResolvedCountries } from "@/data/international/health-spending";
import {
	MINUTES_PER_YEAR,
	getSlice,
	loadResolvedSlices,
} from "@/data/nhs-budget";
import { loadResolvedComparisons } from "@/data/comparisons";
import { resolveState } from "@/lib/url-state";
import { getUsdPerGbp } from "@/lib/fx";
import { formatMoney, formatTime } from "../utils/formatters";

type SearchParams = Promise<{
	id?: string;
	q?: string;
	a?: string;
	slice?: string;
}>;

const buildOgQuery = (params: {
	id?: string;
	q?: string;
	a?: string;
	slice?: string;
}) => {
	const qs = new URLSearchParams();
	if (params.id) qs.set("id", params.id);
	if (params.q) qs.set("q", params.q);
	if (params.a && !params.id) qs.set("a", params.a);
	if (params.slice && params.slice !== "total") qs.set("slice", params.slice);
	const s = qs.toString();
	return s ? `/og?${s}` : "/og";
};

export async function generateMetadata({
	searchParams,
}: { searchParams: SearchParams }): Promise<Metadata> {
	const params = await searchParams;
	const [usdPerGbp, slices, comparisons] = await Promise.all([
		getUsdPerGbp(),
		loadResolvedSlices(),
		loadResolvedComparisons(),
	]);

	const { option, quantity, amount, slice } = resolveState(
		params,
		usdPerGbp,
		slices,
		comparisons,
	);
	const total = getSlice("total", slices);
	const time = formatTime((amount / slice.value) * MINUTES_PER_YEAR);
	const subject = option
		? `${quantity.toLocaleString()} ${quantity > 1 ? option.pluralName : option.name}`
		: formatMoney(amount, "GBP");
	const title = option
		? `${subject} = ${time} of ${slice.shortLabel}`
		: `Reference: NHS spending, your tax, OECD comparisons`;
	const description = option
		? `NHS England spends ${formatMoney(total.value, "GBP")} per year. Compare any cost to a fraction of that budget — or to a specific slice — at NHSCostCalculator.com.`
		: `Catalog of comparison costs, your personal tax burden, and how UK health spending sits against OECD peers.`;
	const ogUrl = buildOgQuery(params);

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: "/reference",
			images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogUrl],
		},
	};
}

export default async function Reference({
	searchParams,
}: { searchParams: SearchParams }) {
	const params = await searchParams;
	const [usdPerGbp, slices, comparisons, countries] = await Promise.all([
		getUsdPerGbp(),
		loadResolvedSlices(),
		loadResolvedComparisons(),
		loadResolvedCountries(),
	]);
	const initial = resolveState(params, usdPerGbp, slices, comparisons);
	const total = getSlice("total", slices);

	return (
		<div className="min-h-screen bg-background">
			<SimulatorHeader
				actions={<HeaderAction href="/">← Wizard</HeaderAction>}
			/>

			<div className="max-w-[1024px] mx-auto px-4 py-6 space-y-12">
				<header>
					<h1 className="text-2xl font-light">Reference</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Look up specific costs, your personal tax burden, and how UK
						health spending sits against OECD peers.
					</p>
				</header>

				<section aria-labelledby="calc-heading">
					<h2
						id="calc-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						Look up something specific
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						Compare any cost to a fraction of NHS England's budget — or to one
						of its programme-budgeting slices.
					</p>
					<NHSSpendingCalculator
						comparisons={comparisons}
						initialAmount={initial.amount}
						initialOptionId={initial.option?.id ?? null}
						initialQuantity={initial.quantity}
						initialSliceId={initial.slice.id}
						initialUsdPerGbp={usdPerGbp}
						slices={slices}
					/>
				</section>

				<section aria-labelledby="tax-heading">
					<h2
						id="tax-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						Your personal tax burden
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						How a UK salary breaks down into income tax + NICs, and the share
						of that going to NHS England.
					</p>
					<PersonalTaxBurden totalNhsBudget={total.value} />
				</section>

				<section aria-labelledby="intl-heading">
					<h2
						id="intl-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						International comparison
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						UK health spending and outcomes vs OECD peers — % GDP, $ PPP, life
						expectancy, treatable mortality, and clinical-workforce ratios.
					</p>
					<InternationalPanel countries={countries} />
				</section>

				<section aria-labelledby="backtest-heading">
					<h2
						id="backtest-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						Forecast vs reality
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						How real UK budgets have diverged from their announced fiscal
						impact — a credibility check on this calculator's underlying
						methodology.
					</p>
					<BacktestSection />
				</section>

				<section aria-labelledby="fiscal-reaction-backtest-heading">
					<h2
						id="fiscal-reaction-backtest-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						Fiscal reaction backtests
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						How the fiscal-rule reaction selector compares with real UK
						consolidation packages.
					</p>
					<FiscalReactionBacktestSection />
				</section>

				<section aria-labelledby="borrowing-backtest-heading">
					<h2
						id="borrowing-backtest-heading"
						className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-1"
					>
						Borrowing stress backtests
					</h2>
					<p className="text-xs text-muted-foreground mb-4">
						How the gilt-market borrowing model performs against historical UK
						stress episodes and low-stress fiscal events.
					</p>
					<BorrowingBacktestSection />
				</section>
			</div>
		</div>
	);
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { cn } from "@/lib/utils";
import type { CountryHealth } from "@/data/international/health-spending";

interface Props {
	countries: readonly CountryHealth[];
}

type SortKey =
	| "name"
	| "spendPctGdp"
	| "spendPerCapitaPpp"
	| "lifeExpectancy"
	| "treatableMortality"
	| "physiciansPerThousand"
	| "bedsPerThousand"
	| "nursesPerThousand"
	| "breastCancer5yrSurvival";

const COLUMNS: ReadonlyArray<{
	key: SortKey;
	label: string;
	help: string;
	hideOnMobile?: boolean;
}> = [
	{
		key: "name",
		label: "Country",
		help: "Selected OECD peers + the OECD unweighted average.",
	},
	{
		key: "spendPctGdp",
		label: "% GDP",
		help: "Total current health expenditure (public + private) as a share of GDP.",
	},
	{
		key: "spendPerCapitaPpp",
		label: "$/capita PPP",
		help: "Per-capita health spend in US dollars at purchasing power parity. PPP adjusts for cost-of-living differences.",
		hideOnMobile: true,
	},
	{
		key: "lifeExpectancy",
		label: "Life exp.",
		help: "Life expectancy at birth (years). Reflects all causes, not only healthcare; lifestyle and social factors matter too.",
	},
	{
		key: "treatableMortality",
		label: "Treat. mort.",
		help: "Treatable mortality per 100,000 — deaths from causes that should be avoidable with effective healthcare. Lower is better.",
	},
	{
		key: "physiciansPerThousand",
		label: "Doctors/1k",
		help: "Practising physicians per 1,000 population (OECD definition — practising, not licensed-to-practise). Headline workforce-capacity measure cited in NHS reform debates.",
		hideOnMobile: true,
	},
	{
		key: "bedsPerThousand",
		label: "Beds/1k",
		help: "Hospital beds per 1,000 population. UK ranks near the bottom of OECD (~2.4); Germany and Japan are at the top. UK and Australia report public-only because their systems don't decompose by ownership in the OECD format.",
		hideOnMobile: true,
	},
	{
		key: "nursesPerThousand",
		label: "Nurses/1k",
		help: "Practising nurses per 1,000 population (OECD MINU = midwives, nurses and other healthcare assistants combined). UK is mid-pack vs continental Europe.",
		hideOnMobile: true,
	},
	{
		key: "breastCancer5yrSurvival",
		label: "Breast 5y%",
		help: "5-year net survival rate from breast cancer (% of patients alive 5 years after diagnosis). The most-cited cancer-outcome metric — UK consistently bottom of OECD peers.",
		hideOnMobile: true,
	},
];

const formatCell = (key: SortKey, country: CountryHealth): string => {
	switch (key) {
		case "name":
			return country.name;
		case "spendPctGdp":
			return `${(country.spendPctGdp * 100).toFixed(1)}%`;
		case "spendPerCapitaPpp":
			return `$${country.spendPerCapitaPpp.toLocaleString()}`;
		case "lifeExpectancy":
			return country.lifeExpectancy.toFixed(1);
		case "treatableMortality":
			return country.treatableMortality.toString();
		case "physiciansPerThousand":
			return country.physiciansPerThousand.toFixed(2);
		case "bedsPerThousand":
			return country.bedsPerThousand.toFixed(2);
		case "nursesPerThousand":
			return country.nursesPerThousand.toFixed(2);
		case "breastCancer5yrSurvival":
			return `${country.breastCancer5yrSurvival.toFixed(1)}%`;
	}
};

export default function InternationalPanel({ countries }: Props) {
	const [sortKey, setSortKey] = useState<SortKey>("spendPctGdp");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

	const liveCount = countries.filter((c) => c.isLive).length;
	const anyLive = liveCount > 0;

	const sorted = [...countries].sort((a, b) => {
		const av = a[sortKey];
		const bv = b[sortKey];
		const cmp =
			typeof av === "number" && typeof bv === "number"
				? av - bv
				: String(av).localeCompare(String(bv));
		return sortDir === "asc" ? cmp : -cmp;
	});

	const setSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir(sortDir === "asc" ? "desc" : "asc");
		} else {
			setSortKey(key);
			setSortDir(key === "name" ? "asc" : "desc");
		}
	};

	return (
		<Card className="mt-12 mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light text-center">
					How does the UK compare?
					<br />
					<span className="text-base text-muted-foreground font-normal inline-flex items-center justify-center gap-2 flex-wrap">
						Health spending and outcomes across OECD peers
						{anyLive ? (
							<>
								<ProvenanceBadge isLive={true} />
								<span className="text-xs">({liveCount} of {countries.length} live)</span>
							</>
						) : (
							<ProvenanceBadge isLive={false} />
						)}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="overflow-x-auto -mx-2 sm:mx-0">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
								{COLUMNS.map((col) => (
									<th
										key={col.key}
										className={cn(
											"text-left font-medium py-2 px-2 cursor-pointer hover:text-foreground",
											col.hideOnMobile && "hidden sm:table-cell",
											col.key !== "name" && "text-right",
										)}
										onClick={() => setSort(col.key)}
										title={col.help}
									>
										<span className="inline-flex items-center gap-1">
											{col.label}
											{sortKey === col.key && (
												<span aria-hidden="true">
													{sortDir === "asc" ? "↑" : "↓"}
												</span>
											)}
										</span>
									</th>
								))}
								<th className="w-8" />
							</tr>
						</thead>
						<tbody>
							{sorted.map((country) => (
								<tr
									key={country.id}
									className={cn(
										"border-b last:border-0",
										country.isUk && "bg-blue-50",
									)}
								>
									<td className="py-2 px-2">
										<span className="mr-2" aria-hidden="true">
											{country.emoji}
										</span>
										<span
											className={country.isUk ? "font-semibold" : undefined}
										>
											{country.name}
										</span>
									</td>
									<td className="py-2 px-2 text-right tabular-nums">
										{formatCell("spendPctGdp", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
										{formatCell("spendPerCapitaPpp", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums">
										{formatCell("lifeExpectancy", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums">
										{formatCell("treatableMortality", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
										{formatCell("physiciansPerThousand", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
										{formatCell("bedsPerThousand", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
										{formatCell("nursesPerThousand", country)}
									</td>
									<td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
										{formatCell("breastCancer5yrSurvival", country)}
									</td>
									<td className="py-2 px-2">
										<MethodologyPopover methodology={country.methodology} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-2">
					<p>
						<strong>How to read this.</strong> No clean linear relationship
						between spend and outcomes. The US spends 47% more than the UK per
						capita and gets 4 fewer years of life expectancy. Japan spends
						roughly the same as the UK and gets 4 more. France gets better
						outcomes than the UK at slightly higher spend.
					</p>
					<p className="text-muted-foreground text-xs">
						The columns mix figures that aren't directly substitutable. Tap
						the ⓘ on each row for what each country's measure actually
						includes — UK private spending, US public-payer share, German SHI
						vs. private, etc.
					</p>
				</div>

				<p className="text-xs text-muted-foreground text-center pt-2 border-t">
					Headline figures are 2022 from OECD Health at a Glance 2023 — verify
					against the latest edition before significant copy. The "all-payer"
					framing here differs from "NHS England spending" used elsewhere on the
					page; see the UK row's methodology.
				</p>
			</CardContent>
		</Card>
	);
}

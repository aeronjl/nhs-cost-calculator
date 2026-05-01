"use client";

import { useMemo, useState } from "react";
import { TAX_LEVERS } from "@/data/levers/tax-rates";
import { UK_SPENDING_PROGRAMMES } from "@/data/levers/uk-spending";
import { cn } from "@/lib/utils";

// Categorisation of tax levers. Order within category roughly mirrors
// political prominence — biggest revenue lever first.
const TAX_CATEGORIES: ReadonlyArray<{
	label: string;
	leverIds: readonly string[];
}> = [
	{
		label: "Income tax",
		leverIds: [
			"basic-rate-income-tax",
			"higher-rate-income-tax",
			"additional-rate-income-tax",
			"dividend-tax",
		],
	},
	{
		label: "VAT",
		leverIds: ["vat-standard"],
	},
	{
		label: "NICs",
		leverIds: ["nics-main", "employer-nics-main"],
	},
	{
		label: "Corporate",
		leverIds: ["corporation-tax"],
	},
	{
		label: "Asset taxes",
		leverIds: ["capital-gains-tax", "inheritance-tax", "stamp-duty"],
	},
	{
		label: "Threshold freezes (fiscal drag)",
		leverIds: [
			"freeze-personal-allowance",
			"freeze-higher-rate-threshold",
			"freeze-additional-rate-threshold",
		],
	},
	{
		label: "Threshold raises / cuts",
		leverIds: [
			"raise-personal-allowance",
			"raise-higher-rate-threshold",
			"raise-additional-rate-threshold",
			"dividend-allowance",
			"employer-nics-secondary-threshold",
		],
	},
	{
		label: "Sectoral surcharges",
		leverIds: [
			"apprenticeship-levy",
			"bank-surcharge",
			"energy-profits-levy",
		],
	},
	{
		label: "Commodity duties",
		leverIds: ["fuel-duty"],
	},
	{
		label: "Other tax measures",
		leverIds: ["tax-other"],
	},
];

interface PickerLever {
	type: "tax" | "programme" | "borrow";
	id: string;
	label: string;
	sublabel?: string;
}

const buildLevers = (): {
	taxByCategory: { label: string; levers: PickerLever[] }[];
	programmes: PickerLever[];
	borrow: PickerLever;
} => {
	const taxByCategory = TAX_CATEGORIES.map((cat) => ({
		label: cat.label,
		levers: cat.leverIds
			.map((id): PickerLever | null => {
				const lever = TAX_LEVERS.find((l) => l.id === id);
				if (!lever) return null;
				return {
					type: "tax",
					id: lever.id,
					label: lever.name,
					sublabel: lever.unitLabel,
				};
			})
			.filter((x): x is PickerLever => x !== null),
	})).filter((cat) => cat.levers.length > 0);

	const programmes: PickerLever[] = UK_SPENDING_PROGRAMMES.map((p) => ({
		type: "programme",
		id: p.id,
		label: p.name,
		sublabel: `£${(p.value / 1_000_000_000).toFixed(0)}bn/yr`,
	}));

	const borrow: PickerLever = {
		type: "borrow",
		id: "",
		label: "Borrow / repay debt",
		sublabel: "Public-sector net borrowing",
	};

	return { taxByCategory, programmes, borrow };
};

interface Props {
	onAdd: (lever: PickerLever) => void;
	// Optional kind filter: when provided, only the listed lever kinds are
	// rendered. Used by the step-level free-form picker so step 2 (Taxes)
	// shows only tax levers, step 3 (Spending) only programme cards, etc.
	kinds?: readonly ("tax" | "programme" | "borrow")[];
	searchPlaceholder?: string;
}

export function LeverRail({
	onAdd,
	kinds,
	searchPlaceholder = "Search 25+ levers…",
}: Props) {
	const [search, setSearch] = useState("");
	const { taxByCategory, programmes, borrow } = useMemo(buildLevers, []);

	const showTax = !kinds || kinds.includes("tax");
	const showProgrammes = !kinds || kinds.includes("programme");
	const showBorrowKind = !kinds || kinds.includes("borrow");

	const q = search.trim().toLowerCase();
	const matches = (text: string): boolean =>
		!q || text.toLowerCase().includes(q);

	const filteredCategories = showTax
		? taxByCategory
				.map((cat) => ({
					...cat,
					levers: cat.levers.filter((l) => matches(l.label)),
				}))
				.filter((cat) => cat.levers.length > 0)
		: [];

	const filteredProgrammes = showProgrammes
		? programmes.filter((p) => matches(p.label))
		: [];
	const showBorrow = showBorrowKind && matches(borrow.label);

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 border-b sticky top-0 bg-muted/40 backdrop-blur z-10">
				<input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={searchPlaceholder}
					className="w-full px-2.5 py-1.5 text-sm border rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
					aria-label="Search levers"
				/>
			</div>

			<div className="flex-1 overflow-y-auto p-2 space-y-3">
				{filteredCategories.length > 0 && (
					<Section heading="Tax levers">
						{filteredCategories.map((cat) => (
							<SubSection key={cat.label} heading={cat.label}>
								{cat.levers.map((lever) => (
									<LeverButton
										key={lever.id}
										lever={lever}
										onAdd={onAdd}
									/>
								))}
							</SubSection>
						))}
					</Section>
				)}

				{filteredProgrammes.length > 0 && (
					<Section heading="Spending programmes">
						{filteredProgrammes.map((lever) => (
							<LeverButton
								key={lever.id}
								lever={lever}
								onAdd={onAdd}
							/>
						))}
					</Section>
				)}

				{showBorrow && (
					<Section heading="Borrowing">
						<LeverButton lever={borrow} onAdd={onAdd} />
					</Section>
				)}

				{filteredCategories.length === 0 &&
					filteredProgrammes.length === 0 &&
					!showBorrow && (
						<p className="text-sm text-muted-foreground p-3">
							No levers match "{search}".
						</p>
					)}
			</div>
		</div>
	);
}

function Section({
	heading,
	children,
}: {
	heading: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1.5">
				{heading}
			</h3>
			<div className="space-y-2">{children}</div>
		</div>
	);
}

function SubSection({
	heading,
	children,
}: {
	heading: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70 px-2 pb-0.5">
				{heading}
			</h4>
			<div className="space-y-0.5">{children}</div>
		</div>
	);
}

// MIME type for the drag payload. Uses a custom type so other drag sources
// on the page can't be mistaken for a lever drop.
export const LEVER_DRAG_MIME = "application/x-lever";

function LeverButton({
	lever,
	onAdd,
}: {
	lever: PickerLever;
	onAdd: (lever: PickerLever) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onAdd(lever)}
			draggable
			onDragStart={(e) => {
				e.dataTransfer.setData(LEVER_DRAG_MIME, JSON.stringify(lever));
				e.dataTransfer.effectAllowed = "copy";
			}}
			className={cn(
				"w-full text-left px-2.5 py-1.5 rounded-md text-sm",
				"hover:bg-accent transition-colors",
				"flex items-center gap-2",
				"cursor-grab active:cursor-grabbing",
			)}
		>
			<span aria-hidden="true" className="text-base">
				{lever.type === "tax"
					? "💰"
					: lever.type === "programme"
						? "✂️"
						: "🏦"}
			</span>
			<span className="flex-1 min-w-0">
				<span className="block truncate">{lever.label}</span>
				{lever.sublabel && (
					<span className="block text-xs text-muted-foreground truncate">
						{lever.sublabel}
					</span>
				)}
			</span>
		</button>
	);
}

export type { PickerLever };

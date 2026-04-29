import { type TaxLever, getTaxLever } from "@/data/levers/tax-rates";
import {
	type SpendingProgramme,
	getProgramme,
} from "@/data/levers/uk-spending";
import { BORROWING } from "@/data/levers/borrowing";

// A "trade-off allocation" partitions a target funding amount across three
// levers (tax, borrow, cut). State is held in £ rather than fractions so we
// avoid drift from repeated normalisation.
export interface Allocation {
	tax: number;
	borrow: number;
	cut: number;
}

export const allocationTotal = (a: Allocation): number =>
	a.tax + a.borrow + a.cut;

export const evenSplit = (target: number): Allocation => ({
	tax: target / 3,
	borrow: target / 3,
	cut: target / 3,
});

// User adjusts one lever to a new £ value. Distribute the remaining target
// across the other two levers in proportion to their current £ values; if
// both were zero, split equally.
export function adjustLever(
	state: Allocation,
	lever: keyof Allocation,
	newValue: number,
	target: number,
): Allocation {
	const clamped = Math.max(0, Math.min(target, newValue));
	const others = (
		["tax", "borrow", "cut"] as const
	).filter((l) => l !== lever) as [keyof Allocation, keyof Allocation];
	const remaining = target - clamped;
	const otherTotal = state[others[0]] + state[others[1]];
	if (otherTotal === 0) {
		return {
			...state,
			[lever]: clamped,
			[others[0]]: remaining / 2,
			[others[1]]: remaining / 2,
		};
	}
	return {
		...state,
		[lever]: clamped,
		[others[0]]: remaining * (state[others[0]] / otherTotal),
		[others[1]]: remaining * (state[others[1]] / otherTotal),
	};
}

// Goal changed — proportionally rescale the existing allocation to the new
// total so the user's lever ratios are preserved.
export function rescale(state: Allocation, newTotal: number): Allocation {
	const old = allocationTotal(state);
	if (old === 0) return evenSplit(newTotal);
	const factor = newTotal / old;
	return {
		tax: state.tax * factor,
		borrow: state.borrow * factor,
		cut: state.cut * factor,
	};
}

// Policy translations.

export interface TaxImpact {
	lever: TaxLever;
	units: number; // raw magnitude (pp or yr depending on lever.unit)
	ppChange: number; // percentage points (0 for non-rate levers)
	newRate: number; // 0–1 (only meaningful for rate levers)
	yearsOfFreeze: number; // years (0 for rate levers)
}

export function describeTax(amount: number, leverId: string): TaxImpact {
	const lever = getTaxLever(leverId);
	const units = amount / lever.gbpPerUnit;
	return {
		lever,
		units,
		ppChange: lever.unit === "pp" ? units : 0,
		newRate:
			lever.unit === "pp" && lever.currentRate !== undefined
				? lever.currentRate + units / 100
				: (lever.currentRate ?? 0),
		yearsOfFreeze: lever.unit === "yr" ? units : 0,
	};
}

export interface BorrowImpact {
	annualInterest: number; // GBP/yr
	debtGdpDelta: number; // percentage points
}

export function describeBorrow(amount: number): BorrowImpact {
	return {
		annualInterest: amount * BORROWING.thirtyYearGiltYield,
		debtGdpDelta: (amount / BORROWING.ukGdp) * 100,
	};
}

export interface CutImpact {
	programme: SpendingProgramme;
	fraction: number; // 0–1, share of programme cut
	exceedsCuttable: boolean; // fraction > programme.cuttableFraction
	cuttableFraction: number; // 1.0 if not specified
}

export function describeCut(amount: number, programmeId: string): CutImpact {
	const programme = getProgramme(programmeId);
	const fraction = programme.value === 0 ? 0 : amount / programme.value;
	const cuttableFraction = programme.cuttableFraction ?? 1.0;
	return {
		programme,
		fraction,
		exceedsCuttable: fraction > cuttableFraction && cuttableFraction < 1.0,
		cuttableFraction,
	};
}

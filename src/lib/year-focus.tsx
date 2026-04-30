"use client";

import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from "react";

// Shared "year of focus" state. When any year-aware chart on the results page
// is hovered/scrubbed, every other year-aware chart snaps a vertical guide to
// the same year and updates its readout. Threads the multi-year projection
// fan, the PSNB / debt:GDP counterfactual, and the five macro-state
// sparklines into a single connected instrument.
//
// Year is 1-indexed to match `YearProjection.year` and `MacroState.year`. A
// `null` value means "no focus" — charts render their default text/state.

type YearFocusValue = {
	year: number | null;
	setYear: (year: number | null) => void;
	clear: () => void;
};

const noopValue: YearFocusValue = {
	year: null,
	setYear: () => {},
	clear: () => {},
};

const YearFocusContext = createContext<YearFocusValue>(noopValue);

export function YearFocusProvider({ children }: { children: ReactNode }) {
	const [year, setYearState] = useState<number | null>(null);
	const setYear = useCallback((next: number | null) => {
		setYearState(next === null ? null : Math.max(1, Math.round(next)));
	}, []);
	const clear = useCallback(() => setYearState(null), []);
	const value = useMemo(
		() => ({ year, setYear, clear }),
		[year, setYear, clear],
	);
	return (
		<YearFocusContext.Provider value={value}>
			{children}
		</YearFocusContext.Provider>
	);
}

export function useYearFocus(): YearFocusValue {
	return useContext(YearFocusContext);
}

// Map a pointer x-coordinate (in client pixels relative to the SVG bounding
// rect) to a 1-indexed year, given the chart's horizontal padding (in
// viewBox units), inner viewBox width, total years and the SVG's rendered
// width. Returns `null` if `years <= 0`.
export function pointerToYearIndex({
	clientX,
	rect,
	years,
	padX,
	innerWidth,
	viewBoxWidth,
}: {
	clientX: number;
	rect: DOMRect;
	years: number;
	padX: number;
	innerWidth: number;
	viewBoxWidth: number;
}): number | null {
	if (years <= 0 || rect.width <= 0) return null;
	const offsetX = clientX - rect.left;
	const viewBoxX = (offsetX / rect.width) * viewBoxWidth;
	const ratio = (viewBoxX - padX) / Math.max(1, innerWidth);
	const idx = Math.round(ratio * (years - 1));
	const clamped = Math.max(0, Math.min(years - 1, idx));
	return clamped + 1;
}

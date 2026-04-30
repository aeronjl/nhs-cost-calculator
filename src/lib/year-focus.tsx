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
// Year is 1-indexed to match `YearProjection.year` and `MacroState.year`.
//
// Two-tier state lets a visible scrubber and ephemeral chart hover coexist:
//
//   - `lockedYear` is the user's deliberate selection (scrubber drag, click
//     on a year tick). It persists until they explicitly release it via the
//     scrubber's "Auto" button.
//
//   - `hoveredYear` is set by chart pointer-move and cleared on
//     pointer-leave — strictly ephemeral so glance-and-leave doesn't strand
//     a crosshair on the page.
//
//   - `year` is the *effective* focus surfaced to consumers: hovered wins
//     over locked, both null means "no focus".
//
// Existing chart code calls `setYear` / `clear`; those continue to drive the
// hovered slot so today's hover behaviour is preserved.

type YearFocusValue = {
	year: number | null;
	hoveredYear: number | null;
	lockedYear: number | null;
	setYear: (year: number | null) => void;
	clear: () => void;
	setLocked: (year: number | null) => void;
	clearLocked: () => void;
};

const noopValue: YearFocusValue = {
	year: null,
	hoveredYear: null,
	lockedYear: null,
	setYear: () => {},
	clear: () => {},
	setLocked: () => {},
	clearLocked: () => {},
};

const YearFocusContext = createContext<YearFocusValue>(noopValue);

const normaliseYear = (value: number | null): number | null =>
	value === null ? null : Math.max(1, Math.round(value));

export function YearFocusProvider({ children }: { children: ReactNode }) {
	const [hoveredYear, setHoveredState] = useState<number | null>(null);
	const [lockedYear, setLockedState] = useState<number | null>(null);

	const setYear = useCallback((next: number | null) => {
		setHoveredState(normaliseYear(next));
	}, []);
	const clear = useCallback(() => setHoveredState(null), []);
	const setLocked = useCallback((next: number | null) => {
		setLockedState(normaliseYear(next));
	}, []);
	const clearLocked = useCallback(() => setLockedState(null), []);

	const effective = hoveredYear ?? lockedYear;

	const value = useMemo(
		() => ({
			year: effective,
			hoveredYear,
			lockedYear,
			setYear,
			clear,
			setLocked,
			clearLocked,
		}),
		[effective, hoveredYear, lockedYear, setYear, clear, setLocked, clearLocked],
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

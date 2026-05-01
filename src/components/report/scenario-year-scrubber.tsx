"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { useYearFocus } from "@/lib/year-focus";

// Compact horizontal slider that lets users *deliberately* lock the
// year-of-focus state instead of relying on chart hover. Sits at the top
// of the report so the affordance is visible even before users discover
// that hovering a chart triggers focus.
//
// Behaviour:
//   - Drag the slider or click a year tick → setLocked(N). Persists until
//     released.
//   - Hover any chart → setYear(N) (a.k.a. setHovered) — ephemeral, takes
//     precedence over locked while pointing at a chart.
//   - Release the lock with the "Auto" button.
//
// The displayed year always reflects the *effective* state (hover wins
// over locked), so the chip near the slider mirrors what the charts are
// showing right now.

interface Props {
	yearCount: number;
	yearLabels?: readonly string[];
}

export function ScenarioYearScrubber({ yearCount, yearLabels }: Props) {
	const { year, hoveredYear, lockedYear, setLocked, clearLocked } =
		useYearFocus();
	const sliderId = useId();

	if (yearCount <= 1) return null;

	const sliderValue = lockedYear ?? year ?? 1;
	const displayLabel =
		year !== null ? yearLabels?.[year - 1] ?? `Year ${year}` : null;
	const hoverOverridingLock =
		hoveredYear !== null && lockedYear !== null && hoveredYear !== lockedYear;

	return (
		<section
			aria-label="Year of focus scrubber"
			className="rounded-md border bg-background/70 p-3"
		>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<div className="flex flex-wrap items-baseline gap-2">
					<label
						htmlFor={sliderId}
						className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
					>
						Year of focus
					</label>
					{displayLabel ? (
						<span className="text-xs font-semibold tabular-nums text-foreground">
							{displayLabel}
						</span>
					) : (
						<span className="text-[11px] italic text-muted-foreground">
							drag or hover any chart to focus
						</span>
					)}
					{hoverOverridingLock && (
						<span className="text-[10px] text-muted-foreground">
							(hover overrides locked)
						</span>
					)}
				</div>
				<div className="flex flex-1 items-center gap-2">
					<input
						id={sliderId}
						type="range"
						min={1}
						max={yearCount}
						step={1}
						value={sliderValue}
						onChange={(e) => setLocked(Number(e.target.value))}
						aria-label="Year of focus"
						className="flex-1 accent-blue-600"
					/>
					<button
						type="button"
						onClick={clearLocked}
						disabled={lockedYear === null}
						className="rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
					>
						Auto
					</button>
				</div>
			</div>
			<div
				className="mt-1.5 grid gap-1 text-[10px] tabular-nums text-muted-foreground"
				style={{
					gridTemplateColumns: `repeat(${yearCount}, minmax(0, 1fr))`,
				}}
			>
				{Array.from({ length: yearCount }, (_, i) => {
					const yearIndex = i + 1;
					const label = yearLabels?.[i] ?? `Y${yearIndex}`;
					const isFocused = year === yearIndex;
					const isLocked = lockedYear === yearIndex;
					return (
						<button
							key={i}
							type="button"
							onClick={() => setLocked(yearIndex)}
							className={cn(
								"min-w-0 truncate text-left transition-colors hover:text-foreground",
								i === yearCount - 1 && "text-right",
								i > 0 && i < yearCount - 1 && "text-center",
								isFocused && "font-semibold text-foreground",
								isLocked && !isFocused && "text-foreground/70",
							)}
							aria-current={isFocused ? "true" : undefined}
							aria-pressed={isLocked}
						>
							{label}
						</button>
					);
				})}
			</div>
		</section>
	);
}

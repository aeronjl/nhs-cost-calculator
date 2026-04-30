"use client";

import { useEffect, useRef, useState } from "react";

// Interpolated array of numbers, driven by requestAnimationFrame. Each time
// the input `values` change shape or content, the hook tweens from the
// current animated state to the new target over `duration` milliseconds.
//
// Used by chart components to morph SVG path / polygon points on scenario
// edits — adding a lever, scrubbing magnitude, switching templates — so the
// reader sees the chart *flow* into its new shape rather than snapping.
//
// Length changes (lines added or removed) are handled by falling back to
// the available endpoint, giving a smooth fade-in / fade-out without
// fabricating fake history for non-existent indices.
//
// Server-rendered output uses the input values directly — no animation
// runs in SSR, so the first paint always matches the underlying model.

const DEFAULT_DURATION_MS = 360;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const equalArrays = (a: readonly number[], b: readonly number[]): boolean => {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
};

export interface AnimatedValuesOptions {
	duration?: number;
}

export function useAnimatedValues(
	values: readonly number[],
	opts: AnimatedValuesOptions = {},
): readonly number[] {
	const duration = opts.duration ?? DEFAULT_DURATION_MS;
	const [animated, setAnimated] = useState<readonly number[]>(values);
	const animatedRef = useRef<readonly number[]>(values);
	const lastTargetRef = useRef<readonly number[]>(values);
	animatedRef.current = animated;

	useEffect(() => {
		if (equalArrays(values, lastTargetRef.current)) return;
		const from = animatedRef.current;
		const to = values;
		lastTargetRef.current = values;

		if (typeof requestAnimationFrame === "undefined") {
			setAnimated(to);
			return;
		}

		const start =
			typeof performance !== "undefined" && performance.now
				? performance.now()
				: Date.now();
		let frameId = 0;
		const tick = () => {
			const now =
				typeof performance !== "undefined" && performance.now
					? performance.now()
					: Date.now();
			const elapsed = now - start;
			const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration);
			const eased = easeOutCubic(t);
			const len = Math.max(from.length, to.length);
			const next = new Array<number>(len);
			for (let i = 0; i < len; i++) {
				const f = from[i] ?? to[i] ?? 0;
				const v = to[i] ?? from[i] ?? 0;
				next[i] = f + (v - f) * eased;
			}
			setAnimated(next);
			if (t < 1) frameId = requestAnimationFrame(tick);
		};
		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	}, [values, duration]);

	return animated;
}

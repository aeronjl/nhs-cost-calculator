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

// Keyed variant for per-line series in stacked-area charts.
//
// Each line in the input is identified by a stable `id`. New lines fade in
// from zeros (so they grow into the stack instead of snapping); removed
// lines drop from the returned map immediately (no exit animation in v1);
// lines that survive a render morph between their previous animated state
// and the new target. This is the bit the regular `useAnimatedValues` can't
// do — that hook is a position-keyed flat array, so a removed first line
// would visually slide every other line one slot left.

export interface KeyedSeries {
	id: string;
	values: readonly number[];
}

interface KeyedTransition {
	id: string;
	from: readonly number[];
	to: readonly number[];
}

const buildInitialAnimated = (
	lines: readonly KeyedSeries[],
): Map<string, readonly number[]> => {
	const map = new Map<string, readonly number[]>();
	for (const lp of lines) map.set(lp.id, lp.values);
	return map;
};

export function useAnimatedPerLineValues(
	lines: readonly KeyedSeries[],
	opts: AnimatedValuesOptions = {},
): Map<string, readonly number[]> {
	const duration = opts.duration ?? DEFAULT_DURATION_MS;
	const [animated, setAnimated] = useState<Map<string, readonly number[]>>(
		() => buildInitialAnimated(lines),
	);
	const animatedRef = useRef<Map<string, readonly number[]>>(animated);
	animatedRef.current = animated;
	// Start the targets snapshot from the same lines, so the first render is
	// treated as steady state rather than as "everything new" — otherwise an
	// SSR'd page would unnecessarily fade lines in from zero on hydration.
	const lastTargetsRef = useRef<Map<string, readonly number[]> | null>(null);
	if (lastTargetsRef.current === null) {
		lastTargetsRef.current = new Map(lines.map((lp) => [lp.id, lp.values]));
	}

	useEffect(() => {
		if (lastTargetsRef.current === null) {
			lastTargetsRef.current = new Map(lines.map((lp) => [lp.id, lp.values]));
		}
		const last = lastTargetsRef.current;
		const current = animatedRef.current;

		const transitions: KeyedTransition[] = [];
		const nextAnimated = new Map<string, readonly number[]>();
		let structuralChange = false;

		for (const lp of lines) {
			const prevTarget = last.get(lp.id);
			if (!prevTarget) {
				// New line — animate in from zeros so it grows into the stack
				// instead of popping at full size.
				const zeros = lp.values.map(() => 0);
				nextAnimated.set(lp.id, zeros);
				transitions.push({ id: lp.id, from: zeros, to: lp.values });
				structuralChange = true;
				continue;
			}
			const animatedValues = current.get(lp.id) ?? prevTarget;
			nextAnimated.set(lp.id, animatedValues);
			if (!equalArrays(prevTarget, lp.values)) {
				transitions.push({
					id: lp.id,
					from: animatedValues,
					to: lp.values,
				});
			}
		}

		// Removed lines simply don't appear in nextAnimated.
		for (const id of last.keys()) {
			if (!lines.some((lp) => lp.id === id)) {
				structuralChange = true;
			}
		}

		const targetsChanged =
			transitions.length > 0 ||
			structuralChange ||
			current.size !== nextAnimated.size;

		if (!targetsChanged) return;

		// Update last targets snapshot
		const nextLast = new Map<string, readonly number[]>();
		for (const lp of lines) nextLast.set(lp.id, lp.values);
		lastTargetsRef.current = nextLast;

		setAnimated(nextAnimated);

		if (transitions.length === 0) return;

		if (typeof requestAnimationFrame === "undefined") {
			const final = new Map(nextAnimated);
			for (const t of transitions) final.set(t.id, t.to);
			setAnimated(final);
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
			const next = new Map<string, readonly number[]>(nextAnimated);
			for (const tr of transitions) {
				const len = Math.max(tr.from.length, tr.to.length);
				const interpolated = new Array<number>(len);
				for (let i = 0; i < len; i++) {
					const f = tr.from[i] ?? tr.to[i] ?? 0;
					const v = tr.to[i] ?? tr.from[i] ?? 0;
					interpolated[i] = f + (v - f) * eased;
				}
				next.set(tr.id, interpolated);
			}
			setAnimated(next);
			if (t < 1) frameId = requestAnimationFrame(tick);
		};
		frameId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frameId);
	}, [lines, duration]);

	return animated;
}

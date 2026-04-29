"use client";
import { cn } from "@/lib/utils";
import {
	type AnimationPlaybackControls,
	animate,
	motion,
	useMotionValue,
	useTransform,
} from "framer-motion";
import { useEffect, useRef } from "react";

// Time-bounded number-tween. Spring-based animation chained durations to
// the delta — small change finished fast, big change took ages. Switched
// to a tween with a duration computed log-scaled from delta:
//   - small delta (<£1k): ~180ms (still smooth, near-instant)
//   - medium (£1k-£1M): ~280ms (Material's medium-1)
//   - large (£1M-£1bn): ~400ms
//   - huge (£1bn+): clamped at ~500ms (Doherty's instantaneous-ceiling)
// Plus ±15ms organic jitter so a row of numbers animating together
// doesn't look mechanically lock-stepped.
//
// Total animation always finishes well under 600ms — no waiting for
// state to "catch up" mid-edit.

const BASE_DURATION_MS = 150;
const PER_DECADE_MS = 45; // each 10× larger delta adds 45ms
const MIN_DURATION_MS = 150;
const MAX_DURATION_MS = 500;
const JITTER_MS = 30; // ±15ms

const computeDuration = (delta: number): number => {
	const decades = Math.log10(Math.max(1, Math.abs(delta)) + 1);
	const base = BASE_DURATION_MS + decades * PER_DECADE_MS;
	const jitter = (Math.random() - 0.5) * JITTER_MS;
	return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, base + jitter));
};

type AnimatedNumber = {
	value: number;
	className?: string;
};

export function AnimatedNumber({ value, className }: AnimatedNumber) {
	const motionValue = useMotionValue(value);
	const display = useTransform(motionValue, (current) =>
		Math.round(current).toLocaleString(),
	);
	const prevValue = useRef(value);

	useEffect(() => {
		const delta = value - prevValue.current;
		if (delta === 0) return;
		const duration = computeDuration(delta);
		const controls: AnimationPlaybackControls = animate(motionValue, value, {
			duration: duration / 1000,
			ease: [0.16, 1, 0.3, 1], // standard ease-out cubic, matches CollapsibleSection
		});
		prevValue.current = value;
		return () => controls.stop();
	}, [motionValue, value]);

	return (
		<motion.span className={cn("tabular-nums", className)}>
			{display}
		</motion.span>
	);
}

"use client";

import { useEffect, useState } from "react";

// IntersectionObserver-driven scroll spy. Pass a list of element IDs and
// an optional `rootMargin`; the hook returns the id of whichever element
// is currently nearest the top of the viewport. Used by within-tab "you
// are here" navs to highlight the active sub-section as the user scrolls.
//
// Plays nicely with sticky toolbars: the default rootMargin offsets the
// viewport top by 96px so a section is considered "active" once it's
// scrolled past the page header / scrubber. Callers can override.

export interface ScrollSpyOptions {
	rootMargin?: string;
	threshold?: number | number[];
}

export function useScrollSpy(
	ids: readonly string[],
	options: ScrollSpyOptions = {},
): string | null {
	const { rootMargin = "-96px 0px -60% 0px", threshold = 0 } = options;
	const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (typeof IntersectionObserver === "undefined") return;
		if (ids.length === 0) {
			setActiveId(null);
			return;
		}

		const elements = ids
			.map((id) => document.getElementById(id))
			.filter((el): el is HTMLElement => el !== null);
		if (elements.length === 0) return;

		// Track which observed elements are currently intersecting; pick the one
		// nearest the top of the viewport as "active".
		const visible = new Map<string, IntersectionObserverEntry>();

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) visible.set(entry.target.id, entry);
					else visible.delete(entry.target.id);
				}
				if (visible.size === 0) return;
				let best: IntersectionObserverEntry | null = null;
				for (const entry of visible.values()) {
					if (!best) best = entry;
					else if (
						entry.boundingClientRect.top < best.boundingClientRect.top
					) {
						best = entry;
					}
				}
				if (best) setActiveId(best.target.id);
			},
			{ rootMargin, threshold },
		);

		for (const el of elements) observer.observe(el);

		return () => observer.disconnect();
	}, [ids, rootMargin, threshold]);

	return activeId;
}

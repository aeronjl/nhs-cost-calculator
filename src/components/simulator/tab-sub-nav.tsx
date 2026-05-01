"use client";

import { useScrollSpy } from "@/lib/use-scroll-spy";
import { cn } from "@/lib/utils";

// Within-tab "you are here" rail. Sticky toolbar above a long tab's
// content listing each sub-section; the entry whose anchor is currently
// nearest the top of the viewport is highlighted.
//
// Designed for tabs where the content is too tall to scan in one go (the
// who-pays tab in particular: overview + per-lever decile + microsim +
// archetypes + comparisons all stack vertically). Skipped on tabs that
// fit in a single screen.

interface SubSection {
	id: string;
	label: string;
}

interface Props {
	sections: readonly SubSection[];
	rootMargin?: string;
	className?: string;
}

const scrollToSection = (id: string) => {
	if (typeof document === "undefined") return;
	const el = document.getElementById(id);
	if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
};

export function TabSubNav({ sections, rootMargin, className }: Props) {
	const activeId = useScrollSpy(
		sections.map((s) => s.id),
		{ rootMargin },
	);

	if (sections.length <= 1) return null;

	return (
		<nav
			aria-label="Tab section navigation"
			className={cn(
				"sticky top-16 z-10 -mx-3 mb-2 rounded-md border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-4",
				className,
			)}
		>
			<ul className="flex flex-wrap items-center gap-1">
				{sections.map((s) => {
					const isActive = activeId === s.id;
					return (
						<li key={s.id}>
							<button
								type="button"
								onClick={() => scrollToSection(s.id)}
								aria-current={isActive ? "true" : undefined}
								className={cn(
									"rounded-sm px-2 py-0.5 text-[11px] transition-colors hover:text-foreground",
									isActive
										? "bg-blue-50 font-medium text-blue-800"
										: "text-muted-foreground",
								)}
							>
								{s.label}
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Collapsible section wrapper for the output rail. Used to group features
// behind progressive disclosure: top zone always visible; sections like
// "Trajectory", "Who pays", "Macro feedback", "Assumptions" are closed by
// default and openable on demand.
//
// Open/close state is owned by the parent (OutputRail) — the parent reads
// from localStorage and writes back, plus exposes "Expand all" via lifted
// state. This component is purely presentational.
//
// Smooth height + opacity animation on open/close via framer-motion. The
// inner div is needed for height: "auto" measurement.

interface Props {
	id: string;
	title: string;
	subtitle?: string;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}

export function CollapsibleSection({
	id,
	title,
	subtitle,
	open,
	onToggle,
	children,
}: Props) {
	return (
		<section className="rounded-md border bg-background/40 overflow-hidden">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				aria-controls={`section-${id}`}
				className={cn(
					"w-full flex items-center justify-between gap-2 px-3 py-2",
					"text-left hover:bg-accent/40 transition-colors",
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="text-sm font-semibold text-foreground leading-tight">
						{title}
					</div>
					{subtitle && (
						<div className="text-[10px] text-muted-foreground leading-snug truncate mt-0.5">
							{subtitle}
						</div>
					)}
				</div>
				<motion.span
					aria-hidden="true"
					className="text-muted-foreground text-sm shrink-0"
					animate={{ rotate: open ? 90 : 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
				>
					▸
				</motion.span>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="body"
						id={`section-${id}`}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
							opacity: { duration: 0.18, delay: 0.04 },
						}}
						className="overflow-hidden"
					>
						<div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

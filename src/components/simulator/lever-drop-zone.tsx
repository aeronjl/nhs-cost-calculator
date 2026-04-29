"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	LEVER_DRAG_MIME,
	type PickerLever,
} from "./lever-rail";

// Wraps the editor area to accept dropped levers from the rail. Touch users
// keep the click-to-add path on the rail; drag-to-add is a desktop affordance.
//
// The drop zone is only visible (highlighted) while a drag is active over it,
// so it stays out of the way during normal use.

interface Props {
	children: ReactNode;
	onDrop: (lever: PickerLever) => void;
}

export function LeverDropZone({ children, onDrop }: Props) {
	const [isOver, setIsOver] = useState(false);

	return (
		<div
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes(LEVER_DRAG_MIME)) {
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
				}
			}}
			onDragEnter={(e) => {
				if (e.dataTransfer.types.includes(LEVER_DRAG_MIME)) {
					setIsOver(true);
				}
			}}
			onDragLeave={(e) => {
				// Only clear highlight if leaving the wrapper entirely, not when
				// crossing a child element boundary.
				if (e.currentTarget === e.target) {
					setIsOver(false);
				}
			}}
			onDrop={(e) => {
				const data = e.dataTransfer.getData(LEVER_DRAG_MIME);
				setIsOver(false);
				if (!data) return;
				try {
					const lever = JSON.parse(data) as PickerLever;
					onDrop(lever);
				} catch {
					// Malformed payload — silently ignore.
				}
				e.preventDefault();
			}}
			className={cn(
				"relative rounded-lg transition-colors",
				isOver &&
					"ring-2 ring-blue-500 ring-offset-2 ring-offset-background bg-blue-50/30",
			)}
		>
			{isOver && (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
				>
					<div className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium shadow-lg">
						Drop to add lever
					</div>
				</div>
			)}
			{children}
		</div>
	);
}

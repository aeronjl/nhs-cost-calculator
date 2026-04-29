"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Three-pane workspace layout for the simulator.
//
// Widescreen (lg+):  [ lever rail | editor | output rail ]  — three sticky cols.
// Tablet     (md):   [   editor   | output rail        ]   — rail collapses to "+ Add lever" trigger above editor.
// Mobile     (sm):   [   editor                         ]  — rail trigger above; output is a draggable bottom sheet.
//
// The shell owns layout state only. Editor mode + scenario state + lever
// adding all live higher up; the shell is purely structural.

interface Props {
	header: ReactNode;
	leverRail: ReactNode;
	editor: ReactNode;
	outputRail: ReactNode;
}

export function WorkspaceShell({ header, leverRail, editor, outputRail }: Props) {
	const [outputOpen, setOutputOpen] = useState(false);

	return (
		<div className="min-h-screen flex flex-col bg-background">
			{header}

			{/* Mobile: lever rail collapses to a button row above the editor. */}
			<div className="lg:hidden border-b bg-muted/30 px-4 py-2">
				<MobileLeverTrigger>{leverRail}</MobileLeverTrigger>
			</div>

			<div className="flex-1 flex flex-col lg:flex-row lg:gap-0 lg:items-stretch">
				{/* Lever rail — fixed width on desktop; hidden on mobile (above replaces). */}
				<aside className="hidden lg:block w-[260px] flex-none border-r bg-muted/20 sticky top-0 h-screen overflow-y-auto">
					{leverRail}
				</aside>

				{/* Editor — main content area. */}
				<main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-6">
					{editor}
				</main>

				{/* Output rail — fixed width on desktop; bottom sheet on mobile. */}
				<aside className="hidden lg:block w-[340px] flex-none border-l bg-muted/20 sticky top-0 h-screen overflow-y-auto">
					<div className="p-4">{outputRail}</div>
				</aside>
			</div>

			{/* Mobile output sheet trigger + collapsible content. */}
			<MobileOutputSheet open={outputOpen} onOpenChange={setOutputOpen}>
				{outputRail}
			</MobileOutputSheet>
		</div>
	);
}

function MobileLeverTrigger({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="w-full text-left text-sm text-muted-foreground hover:text-foreground py-2 px-3 rounded-md border bg-background hover:bg-accent transition-colors"
			>
				+ Add a lever to your scenario
			</button>
			{open && (
				<div
					className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
					onClick={() => setOpen(false)}
				>
					<div
						className="fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-background border-t shadow-xl rounded-t-xl p-4"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex justify-between items-center mb-3">
							<h2 className="font-semibold">Add a lever</h2>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-muted-foreground hover:text-foreground"
							>
								Close
							</button>
						</div>
						{children}
					</div>
				</div>
			)}
		</>
	);
}

function MobileOutputSheet({
	open,
	onOpenChange,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<div className="lg:hidden fixed inset-x-0 bottom-0 z-40">
			{/* Trigger handle */}
			<button
				type="button"
				onClick={() => onOpenChange(!open)}
				className={cn(
					"w-full text-left bg-primary text-primary-foreground px-4 py-3 shadow-lg",
					"flex items-center justify-between gap-2",
				)}
				aria-expanded={open}
			>
				<span className="text-sm font-medium">
					{open ? "Hide outcome ▾" : "Show outcome ▴"}
				</span>
			</button>
			{open && (
				<div className="bg-background border-t max-h-[60vh] overflow-y-auto p-4">
					{children}
				</div>
			)}
		</div>
	);
}

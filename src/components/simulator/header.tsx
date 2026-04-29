"use client";

import type { ReactNode } from "react";

// Simulator header. Hosts the brand mark + a slot for action triggers
// (Templates drawer, Saved scenarios, Reference link). Action slot is a
// children-as-a-prop so callers can wire concrete components without the
// header importing them.

interface Props {
	actions?: ReactNode;
}

export function SimulatorHeader({ actions }: Props) {
	return (
		<header className="bg-blue-500 text-white drop-shadow-sm flex flex-row items-center justify-between w-full py-2 px-4 sm:px-6">
			<a
				href="/"
				className="font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
			>
				<span aria-hidden="true">💰</span>
				<span>NHSCostCalculator.com</span>
			</a>
			{actions && (
				<nav className="flex items-center gap-1 sm:gap-2">{actions}</nav>
			)}
		</header>
	);
}

interface ActionProps {
	onClick?: () => void;
	href?: string;
	children: ReactNode;
}

// Header buttons / links. Use href for navigation, onClick for drawers.
export function HeaderAction({ onClick, href, children }: ActionProps) {
	const className =
		"text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-md hover:bg-white/15 transition-colors whitespace-nowrap";
	if (href) {
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	}
	return (
		<button type="button" onClick={onClick} className={className}>
			{children}
		</button>
	);
}

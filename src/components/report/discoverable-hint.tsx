"use client";

import { Lightbulb, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// One-shot dismissible hint banner for new affordances. SSR hides it (so
// returning visitors never see a flash) and the post-hydration effect
// reveals it only when the matching `nhs-calc-hint:<key>` flag isn't set
// in localStorage. Dismissing writes the flag, so the hint disappears for
// good on that browser. Bump the storage key when the hint copy meaningfully
// changes — old dismissals shouldn't suppress a fresh tip.

interface Props {
	storageKey: string;
	children: ReactNode;
	className?: string;
}

const STORAGE_PREFIX = "nhs-calc-hint:";

export function DiscoverableHint({ storageKey, children, className }: Props) {
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			const seen = window.localStorage.getItem(
				`${STORAGE_PREFIX}${storageKey}`,
			);
			setDismissed(seen === "1");
		} catch {
			setDismissed(true);
		}
	}, [storageKey]);

	const dismiss = () => {
		setDismissed(true);
		try {
			window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, "1");
		} catch {
			// ignore
		}
	};

	if (dismissed) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-900",
				className,
			)}
		>
			<Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<div className="flex-1 leading-snug">{children}</div>
			<button
				type="button"
				onClick={dismiss}
				className="ml-2 rounded-sm p-0.5 text-blue-700 hover:bg-blue-100"
				aria-label="Dismiss tip"
			>
				<X aria-hidden="true" className="size-3.5" />
			</button>
		</div>
	);
}

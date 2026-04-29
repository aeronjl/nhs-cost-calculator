"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/currency";

const OPTIONS: { value: Currency; symbol: string; label: string }[] = [
	{ value: "GBP", symbol: "£", label: "Show amounts in British pounds" },
	{ value: "USD", symbol: "$", label: "Show amounts in US dollars" },
];

interface Props {
	value: Currency;
	onChange: (next: Currency) => void;
	className?: string;
}

export function CurrencyToggle({ value, onChange, className }: Props) {
	return (
		<div
			role="group"
			aria-label="Display currency"
			className={cn("flex gap-1", className)}
		>
			{OPTIONS.map((opt) => (
				<Button
					key={opt.value}
					type="button"
					variant={value === opt.value ? "default" : "outline"}
					size="sm"
					onClick={() => onChange(opt.value)}
					aria-pressed={value === opt.value}
					aria-label={opt.label}
					className="text-xs"
				>
					{opt.symbol}
				</Button>
			))}
		</div>
	);
}

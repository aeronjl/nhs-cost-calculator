"use client";

import { Info } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Methodology } from "@/lib/methodology";
import { formatMoney } from "@/app/utils/formatters";

interface Props {
	methodology: Methodology;
	className?: string;
	label?: string; // Visible text after the icon (optional)
}

const formatValue = (n: number): string => {
	if (n >= 1_000_000_000) return `${formatMoney(n)}`;
	if (n >= 1_000_000) return `${formatMoney(n)}`;
	if (n < 1) return `${(n * 100).toFixed(2)}%`;
	return n.toLocaleString("en-GB");
};

export function MethodologyPopover({ methodology, className, label }: Props) {
	return (
		<Popover>
			<PopoverTrigger
				className={cn(
					"inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground rounded transition-colors align-middle",
					"focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					className,
				)}
				aria-label="View methodology"
			>
				<Info className="h-3.5 w-3.5" />
				{label ? <span className="text-xs">{label}</span> : null}
			</PopoverTrigger>
			<PopoverContent className="w-80 text-sm" align="start">
				<div className="space-y-3">
					<div>
						<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
							Measures
						</div>
						<div className="text-sm leading-snug">{methodology.measure}</div>
					</div>

					{methodology.range && (
						<div>
							<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
								Plausible range
							</div>
							<div className="text-sm">
								{formatValue(methodology.range.low)} –{" "}
								{formatValue(methodology.range.high)}
							</div>
							<div className="text-xs text-muted-foreground italic mt-0.5">
								{methodology.range.note}
							</div>
						</div>
					)}

					{methodology.alternatives && methodology.alternatives.length > 0 && (
						<div>
							<div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
								Alternative measures
							</div>
							<ul className="space-y-1.5">
								{methodology.alternatives.map((alt) => (
									<li key={alt.label} className="text-xs leading-snug">
										<span className="font-medium">{alt.label}</span>
										{alt.value !== undefined && (
											<>
												{" "}
												<span className="tabular-nums text-muted-foreground">
													({formatValue(alt.value)})
												</span>
											</>
										)}
										<span className="text-muted-foreground"> — {alt.note}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{methodology.caveat && (
						<div className="text-xs text-muted-foreground italic border-l-2 border-amber-300 pl-2">
							{methodology.caveat}
						</div>
					)}

					<div className="pt-2 border-t text-xs text-muted-foreground flex justify-between gap-2">
						<a
							href={methodology.source.url}
							target="_blank"
							rel="noopener noreferrer"
							className="hover:underline truncate"
						>
							{methodology.source.label}
						</a>
						<span className="tabular-nums shrink-0">{methodology.asOf}</span>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

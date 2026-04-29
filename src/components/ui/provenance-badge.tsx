import { cn } from "@/lib/utils";

interface Props {
	isLive: boolean;
	className?: string;
}

// Small inline indicator showing whether a figure is live-fetched or static.
// Sits next to a source link to communicate provenance at a glance.
export function ProvenanceBadge({ isLive, className }: Props) {
	return (
		<span
			className={cn(
				"ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium uppercase tracking-wider",
				isLive
					? "bg-green-50 text-green-700"
					: "bg-neutral-100 text-muted-foreground",
				className,
			)}
			title={
				isLive
					? "Value updated from a live data source"
					: "Static value; verified manually at the asOf date"
			}
		>
			<span
				aria-hidden="true"
				className={cn(
					"inline-block h-1.5 w-1.5 rounded-full",
					isLive ? "bg-green-600" : "bg-neutral-400",
				)}
			/>
			{isLive ? "live" : "static"}
		</span>
	);
}

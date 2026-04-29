import type { CounterfactualComparison } from "@/lib/counterfactual";
import { formatCount } from "@/app/utils/formatters";

// Renders a list of "N comparison units" (e.g. "18 SpaceX launches") for a
// given list of CounterfactualComparison items. Used wherever a scenario
// produces a £ delta that we want to translate into tangible units — the
// counterfactual panel, the scenario builder, and (in Phase 1) the simulator
// output rail.
//
// Caption is caller-supplied because the surrounding framing differs:
//   - "That's enough to fund any one of:"
//   - "Net surplus is enough to fund any one of:"
//   - etc.
//
// emptyMessage is shown when there are no items but the magnitude is non-zero
// (i.e. too small to fund one unit of any catalog item). Pass null to render
// nothing in that case (the scenario builder prefers silence).

interface Props {
	items: readonly CounterfactualComparison[];
	caption?: string;
	emptyMessage?: string | null;
	hasNonZeroMagnitude?: boolean;
}

export function ComparisonsAffordedList({
	items,
	caption,
	emptyMessage = "Too small to fund a meaningful unit of any catalog item.",
	hasNonZeroMagnitude = true,
}: Props) {
	if (items.length === 0) {
		if (!hasNonZeroMagnitude || emptyMessage === null) return null;
		return (
			<p className="text-sm text-muted-foreground text-center">
				{emptyMessage}
			</p>
		);
	}
	return (
		<div>
			{caption && (
				<p className="text-sm text-muted-foreground text-center mb-2">
					{caption}
				</p>
			)}
			<ul className="space-y-1.5 max-w-md mx-auto">
				{items.map(({ comparison, count }) => (
					<li key={comparison.id} className="flex items-center text-sm">
						<span className="text-xl mr-3" aria-hidden="true">
							{comparison.emoji}
						</span>
						<span>
							<span className="font-semibold tabular-nums">
								{formatCount(count)}
							</span>{" "}
							{count === 1 ? comparison.name : comparison.pluralName}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

"use client";

import { ArrowRight, Gauge, Landmark, Scale } from "lucide-react";
import { ERAS, type EraId } from "@/data/eras";
import {
	type PolicyScenarioPreset,
	type PolicyScenarioTone,
	getPolicyScenariosForEra,
} from "@/lib/policy-scenarios";
import { cn } from "@/lib/utils";

interface Props {
	era: EraId;
	onApply: (preset: PolicyScenarioPreset) => void;
}

const toneClassName: Record<PolicyScenarioTone, string> = {
	services: "border-blue-200 bg-blue-50 text-blue-800",
	investment: "border-emerald-200 bg-emerald-50 text-emerald-800",
	consolidation: "border-slate-200 bg-slate-50 text-slate-800",
	"tax-switch": "border-amber-200 bg-amber-50 text-amber-900",
};

const toneIcon: Record<PolicyScenarioTone, typeof Scale> = {
	services: Landmark,
	investment: Gauge,
	consolidation: Scale,
	"tax-switch": Scale,
};

export function PolicyScenarioQuickStarts({ era, onApply }: Props) {
	const presets = getPolicyScenariosForEra(era);
	const eraDef = ERAS[era];

	return (
		<section
			id="policy-scenario-quick-starts"
			data-testid="policy-scenario-quick-starts"
			className="rounded-lg border bg-card p-3 space-y-3"
			aria-labelledby="policy-scenario-quick-starts-title"
		>
			<div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
						Quick build
					</div>
					<h2
						id="policy-scenario-quick-starts-title"
						className="text-base font-semibold"
					>
						Policy scenarios for {eraDef.year}
					</h2>
				</div>
				<p className="text-[11px] text-muted-foreground sm:text-right">
					Load a complete package, then refine it in the report.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
				{presets.map((preset) => {
					const Icon = toneIcon[preset.tone];
					return (
						<button
							key={preset.id}
							type="button"
							data-testid={`policy-scenario-${preset.id}`}
							data-policy-scenario-id={preset.id}
							onClick={() => onApply(preset)}
							className="group text-left rounded-md border bg-background p-3 transition-all hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
						>
							<div className="flex items-start justify-between gap-2">
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
										toneClassName[preset.tone],
									)}
								>
									<Icon aria-hidden="true" className="size-3" />
									{preset.badge}
								</span>
								<ArrowRight
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-blue-700"
								/>
							</div>
							<div className="mt-2 text-sm font-semibold leading-snug">
								{preset.label}
							</div>
							<p className="mt-1 text-xs leading-snug text-muted-foreground">
								{preset.description}
							</p>
							<p className="mt-2 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
								{preset.fiscalLogic}
							</p>
						</button>
					);
				})}
			</div>
		</section>
	);
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { NHS_TAX_SHARE_METHODOLOGY } from "@/data/methodologies";
import { calculateUKTax, nhsShareOfTax } from "@/lib/tax";
import { formatTime } from "./utils/formatters";
import { MINUTES_PER_YEAR } from "@/data/nhs-budget";

interface Props {
	totalNhsBudget: number; // GBP
}

const DEFAULT_SALARY = 35_000; // Roughly UK median full-time.

export default function PersonalTaxBurden({ totalNhsBudget }: Props) {
	const [salary, setSalary] = useState(DEFAULT_SALARY);
	const [editing, setEditing] = useState<string | null>(null);

	const display = editing ?? salary.toLocaleString();

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const cleaned = e.target.value.replace(/\D/g, "");
		setEditing(cleaned);
		setSalary(cleaned === "" ? 0 : Number.parseInt(cleaned, 10));
	};

	const tax = calculateUKTax(salary);
	const nhsShare = nhsShareOfTax(tax.totalTax);
	const nhsShareTime = formatTime(
		(nhsShare / totalNhsBudget) * MINUTES_PER_YEAR,
	);

	return (
		<Card className="mt-12 mb-6 w-full">
			<CardHeader>
				<CardTitle className="text-2xl font-light text-center">
					What do you contribute to the NHS?
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="mb-6 max-w-md mx-auto">
					<label
						htmlFor="salary"
						className="block text-sm font-medium text-gray-700 mb-2 text-center"
					>
						Your gross UK salary (£):
					</label>
					<Input
						type="text"
						id="salary"
						inputMode="numeric"
						value={display}
						onChange={handleChange}
						onFocus={() => setEditing(String(salary))}
						onBlur={() => setEditing(null)}
						className="w-full rounded-full text-center"
					/>
				</div>

				{salary > 0 && (
					<div className="space-y-3 max-w-2xl mx-auto text-center">
						<p className="text-base">
							You pay roughly{" "}
							<span className="font-semibold">
								£<AnimatedNumber value={Math.round(tax.totalTax)} />
							</span>{" "}
							in income tax + NICs each year (
							{Math.round(tax.effectiveRate * 100)}% effective).
						</p>
						<p className="text-base inline-flex items-center justify-center gap-1 w-full">
							About{" "}
							<span className="font-semibold text-blue-600">
								£<AnimatedNumber value={Math.round(nhsShare)} />
							</span>{" "}
							of that funds NHS England.
							<MethodologyPopover methodology={NHS_TAX_SHARE_METHODOLOGY} />
						</p>
						<p className="text-2xl font-light pt-2">
							= <span className="text-blue-500">{nhsShareTime}</span> of NHS
							England spending
						</p>
						<p className="text-xs text-muted-foreground pt-2">
							Income tax + NIC bands per gov.uk (FY24/25). NHS share is a
							rough proportion (~18%) of total UK government revenue —
							earmarked NICs and non-tax revenue not separately accounted.
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

"use client";

import { useState, useEffect } from "react";
import { formatMoney, formatTime } from "./utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/ui/animated-number";
const ANNUAL_NHS_SPENDING = 192000000000; // £192 billion
const MINUTES_PER_YEAR = 525600;

interface SpendingOption {
	name: string;
	pluralName: string;
	cost: number;
	emoji: string;
	quantity: number;
}

const spendingOptions: SpendingOption[] = [
	{
		name: "Hinkley Point C-style nuclear plant",
		pluralName: "Hinkley Point C-style nuclear plants",
		cost: 32000000000,
		emoji: "☢️",
		quantity: 1,
	},
	{
		name: "South Korean-style nuclear plant",
		pluralName: "South Korean-style nuclear plants",
		cost: 5300000000,
		emoji: "⚡",
		quantity: 1,
	},
	{
		name: "mile of HS2",
		pluralName: "miles of HS2",
		cost: 396000000,
		emoji: "🚅",
		quantity: 10,
	},
	{
		name: "km of French-style tram system",
		pluralName: "km of French-style tram systems",
		cost: 20000000,
		emoji: "🚊",
		quantity: 50,
	},
	{
		name: "new home",
		pluralName: "new homes",
		cost: 250000,
		emoji: "🏠",
		quantity: 10000,
	},
	{
		name: "year of world-class research",
		pluralName: "years of world-class research",
		cost: 1000000,
		emoji: "🔬",
		quantity: 100,
	},
	{
		name: "CRISPR gene-editing experiment",
		pluralName: "CRISPR gene-editing experiments",
		cost: 100000,
		emoji: "🧬",
		quantity: 1000,
	},
	{
		name: "advanced AI training run",
		pluralName: "advanced AI training runs",
		cost: 1000000,
		emoji: "🤖",
		quantity: 100,
	},
];

export default function NHSSpendingCalculator() {
	const [amount, setAmount] = useState(ANNUAL_NHS_SPENDING);
	const [inputValue, setInputValue] = useState(ANNUAL_NHS_SPENDING.toString());
	const [selectedOption, setSelectedOption] = useState<SpendingOption | null>(
		null,
	);

	useEffect(() => {
		setInputValue(amount.toLocaleString());
	}, [amount]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/[^0-9]/g, "");
		setInputValue(value);
		const numericValue = Number.parseFloat(value);
		if (!Number.isNaN(numericValue)) {
			setAmount(numericValue);
			setSelectedOption(null);
		}
	};

	const handleQuickInput = (
		cost: number,
		quantity: number,
		option: SpendingOption,
	) => {
		const newAmount = cost * quantity;
		setAmount(newAmount);
		setInputValue(newAmount.toLocaleString());
		setSelectedOption(option);
	};

	const timeInMinutes = (amount / ANNUAL_NHS_SPENDING) * MINUTES_PER_YEAR;
	const formattedTime = formatTime(timeInMinutes);

	return (
		<>
			<div className="min-h-screen">
				<div className="max-w-[1024px] mx-auto px-4 mt-[calc(50vh-200px)]">
					<Card className="mb-6 w-full">
						<CardHeader>
							<CardTitle className="text-3xl font-light text-center">
								{selectedOption ? (
									<>
										{selectedOption.quantity}{" "}
										{selectedOption.quantity > 1
											? selectedOption.pluralName
											: selectedOption.name}{" "}
										({formatMoney(amount)}) is
									</>
								) : (
									<>{formatMoney(amount)} is</>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="mb-6">
								<p
									className="text-4xl text-center font-semibold"
									aria-live="polite"
								>
									<span className="text-blue-500">{formattedTime}</span> of NHS
									spending
								</p>
							</div>
							<div className="mb-6">
								<label
									htmlFor="amount"
									className="block text-sm font-medium text-gray-700 mb-2"
								>
									Enter amount (£):
								</label>
								<Input
									type="text"
									id="amount"
									value={inputValue}
									onChange={handleInputChange}
									className="w-full rounded-full"
									aria-describedby="amount-description"
								/>
								<p
									id="amount-description"
									className="mt-2 text-sm text-gray-500"
								>
									Enter an amount or use the quick input buttons below
								</p>
							</div>
						</CardContent>
					</Card>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 mb-8">
						{spendingOptions.map((option) => (
							<Button
								key={option.name}
								onClick={() =>
									handleQuickInput(option.cost, option.quantity, option)
								}
								className="text-sm h-auto py-2 px-3 whitespace-normal"
								variant="outline"
							>
								<span className="mr-1">{option.emoji}</span>
								<span className="text-xs">
									{option.quantity}{" "}
									{option.quantity > 1 ? option.pluralName : option.name}
								</span>
							</Button>
						))}
					</div>
				</div>

				<div className="max-w-[1024px] w-screen mx-auto px-4">
					<div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
						<h2 className="text-xl font-light mb-2">
							Alternative Progress-Focused Spending Options:
						</h2>
						<ul className="space-y-3">
							{spendingOptions.map((option, index) => {
								const quantity = Math.floor(amount / option.cost);
								if (quantity < 1) return null;
								return (
									<li key={option.name} className="flex items-center">
										<span className="text-2xl mr-3" aria-hidden="true">
											{option.emoji}
										</span>
										<span className="text-sm">
											{formatMoney(amount)} could fund{" "}
											{quantity.toLocaleString()}{" "}
											{quantity !== 1 ? option.pluralName : option.name}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</div>
		</>
	);
}

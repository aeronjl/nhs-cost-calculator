"use client";

import { useState, useEffect } from "react";
import { formatMoney, formatTime } from "./utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { FaSpotify } from "react-icons/fa";
import { SiApplepodcasts } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
const ANNUAL_NHS_SPENDING = 192000000000; // £192 billion
const MINUTES_PER_YEAR = 525600;

interface SpendingOption {
	name: string;
	pluralName: string;
	cost: number;
	emoji: string;
	quantity: number;
	categories: string[];
	citation?: string;
}

const spendingOptions: SpendingOption[] = [
	{
		name: "Hinkley Point C-style nuclear plant",
		pluralName: "Hinkley Point C-style nuclear plants",
		cost: 32000000000,
		emoji: "☢️",
		quantity: 1,
		categories: ["Top", "Energy"],
	},
	{
		name: "South Korean-style nuclear plant",
		pluralName: "South Korean-style nuclear plants",
		cost: 5300000000,
		emoji: "⚡",
		quantity: 1,
		categories: ["Energy"],
	},
	{
		name: "mile of HS2",
		pluralName: "miles of HS2",
		cost: 396000000,
		emoji: "🚅",
		quantity: 10,
		categories: ["Top", "Transport"],
		citation:
			"https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
	},
	{
		name: "km of French-style tram system",
		pluralName: "km of French-style tram systems",
		cost: 20000000,
		emoji: "🚊",
		quantity: 50,
		categories: ["Top", "Transport"],
	},
	{
		name: "new home",
		pluralName: "new homes",
		cost: 250000,
		emoji: "🏠",
		quantity: 10000,
		categories: ["Top", "Housing"],
	},
	{
		name: "year of world-class research",
		pluralName: "years of world-class research",
		cost: 1000000,
		emoji: "🔬",
		quantity: 100,
		categories: ["Top", "Research"],
	},
	{
		name: "CRISPR gene-editing experiment",
		pluralName: "CRISPR gene-editing experiments",
		cost: 100000,
		emoji: "🧬",
		quantity: 1000,
		categories: ["Top", "Research"],
	},
	{
		name: "advanced AI training run",
		pluralName: "advanced AI training runs",
		cost: 1000000,
		emoji: "🤖",
		quantity: 100,
		categories: ["Top", "AI"],
	},
	{
		name: "coronation of King Charles III",
		pluralName: "coronations of King Charles III",
		cost: 72000000,
		emoji: "🤴",
		quantity: 1,
		categories: ["Politics"],
		citation: "https://www.bbc.co.uk/news/articles/c04lyddv2p5o",
	},
	{
		name: "year of profit for the Coca-Cola Company",
		pluralName: "years of profit for the Coca-Cola Company",
		cost: 28021000000,
		emoji: "🥤",
		quantity: 1,
		categories: ["Business"],
		citation:
			"https://www.macrotrends.net/stocks/charts/KO/cocacola/gross-profit",
	},
	{
		name: "year's annual full-time salary for a UK employee",
		pluralName: "years' annual full-time salaries for UK employees",
		cost: 37430,
		emoji: "💼",
		quantity: 1,
		categories: ["Top", "Politics", "Business"],
	},
];

export default function NHSSpendingCalculator() {
	const [amount, setAmount] = useState(ANNUAL_NHS_SPENDING);
	const [inputValue, setInputValue] = useState(ANNUAL_NHS_SPENDING.toString());
	const [selectedOption, setSelectedOption] = useState<SpendingOption | null>(
		null,
	);
	const [selectedCategory, setSelectedCategory] = useState("Top");

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

	const categories = [
		"Top",
		...new Set(
			spendingOptions
				.flatMap((option) => option.categories)
				.filter((category) => category !== "Top"),
		),
	];
	const filteredOptions =
		selectedCategory === "Top"
			? spendingOptions.filter((option) => option.categories.includes("Top"))
			: spendingOptions.filter((option) =>
					option.categories.includes(selectedCategory),
				);

	return (
		<>
			<div className="min-h-screen pb-24">
				<div className="bg-blue-500 text-white drop-shadow-sm flex flex-row items-center justify-between w-screen py-1 px-4 font-semibold">
					<span>💰 NHSCostCalculator.com</span>
					<Link href="/about" className="hover:underline hidden">
						About
					</Link>
				</div>
				<div className="max-w-[1024px] mx-auto px-4 mt-6">
					<div className="flex flex-col items-center lg:items-end justify-end gap-3 mb-4 bg-gradient-to-r from-neutral-100 to-neutral-50 shadow-sm border p-4 rounded-lg">
						<span className="text-muted-foreground w-fit text-sm order-2 lg:order-1 text-center">
							Join the conversation about Britain's future on the{" "}
							<span className="font-semibold">Anglofuturism Podcast</span>
						</span>
						<div className="flex flex-row gap-3 items-center order-1 lg:order-2">
							<Link
								href="https://podcasts.apple.com/gb/podcast/anglofuturism/id1743404902"
								className="text-[#872EC4] hover:opacity-80 transition-opacity"
								aria-label="Listen on Apple Podcasts"
							>
								<SiApplepodcasts size={24} />
							</Link>
							<Link
								href="https://open.spotify.com/show/0PxQEO62ESL7DYmZHLgQID"
								className="text-[#1DB954] hover:opacity-80 transition-opacity"
								aria-label="Listen on Spotify"
							>
								<FaSpotify size={24} />
							</Link>
						</div>
					</div>
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
						<Accordion type="single" collapsible className="px-6 pb-6 hidden">
							<AccordionItem value="spending-breakdown">
								<AccordionTrigger>Where does the money go?</AccordionTrigger>
								<AccordionContent>
									<ul className="space-y-2 text-sm text-muted-foreground">
										<li>• Staff costs (£56.8bn)</li>
										<li>• Hospital drugs (£20.7bn)</li>
										<li>• Primary care (£14.2bn)</li>
										<li>• Community health services (£11.5bn)</li>
										<li>• Mental health (£14.3bn)</li>
										<li>• Specialist care (£19.6bn)</li>
										<li>• Other costs (£54.9bn)</li>
									</ul>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</Card>

					<div className="flex flex-wrap gap-2 mb-4">
						{categories.map((category) => (
							<Badge
								key={category}
								variant={selectedCategory === category ? "default" : "outline"}
								className="cursor-pointer"
								onClick={() => setSelectedCategory(category)}
							>
								{category}
							</Badge>
						))}
					</div>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 mb-8">
						{filteredOptions.map((option) => (
							<Button
								key={option.name}
								onClick={() =>
									handleQuickInput(option.cost, option.quantity, option)
								}
								className="text-sm h-auto py-2 px-3 whitespace-normal"
								variant={
									selectedOption?.name === option.name ? "default" : "outline"
								}
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
							What else could {formatMoney(amount)} fund?
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
											{option.citation && (
												<a
													href={option.citation}
													className="ml-1 text-blue-500 hover:underline"
													target="_blank"
													rel="noopener noreferrer"
												>
													[source]
												</a>
											)}
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

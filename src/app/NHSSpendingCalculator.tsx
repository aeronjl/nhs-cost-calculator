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
import GridPattern from "@/components/ui/grid-pattern";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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
		cost: 32000000000, // £32 billion
		emoji: "☢️",
		quantity: 1,
		categories: ["Top", "Energy"],
		citation: "https://ukfoundations.co/",
	},
	{
		name: "South Korean-style nuclear plant",
		pluralName: "South Korean-style nuclear plants",
		cost: 5300000000, // £5.3 billion
		emoji: "⚡",
		quantity: 1,
		categories: ["Energy"],
		citation: "https://ukfoundations.co/",
	},
	{
		name: "mile of HS2",
		pluralName: "miles of HS2",
		cost: 396000000, // £396 million
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
		citation:
			"https://www.samdumitriu.com/p/britains-infrastructure-is-too-expensive",
	},
	{
		name: "new home",
		pluralName: "new homes",
		cost: 250000, // £250,000
		emoji: "🏠",
		quantity: 10000,
		categories: ["Top", "Housing"],
	},
	{
		name: "year of world-class research",
		pluralName: "years of world-class research",
		cost: 1000000, // $1 million
		emoji: "🔬",
		quantity: 100,
		categories: ["Research"],
	},
	{
		name: "CRISPR gene-editing experiment",
		pluralName: "CRISPR gene-editing experiments",
		cost: 100000, // $100,000
		emoji: "🧬",
		quantity: 1000,
		categories: ["Top", "Research"],
	},
	{
		name: "advanced AI training run",
		pluralName: "advanced AI training runs",
		cost: 1000000, // $1 million
		emoji: "🤖",
		quantity: 100,
		categories: ["Top", "AI"],
	},
	{
		name: "coronation of King Charles III",
		pluralName: "coronations of King Charles III",
		cost: 72000000, // £72 million
		emoji: "🤴",
		quantity: 1,
		categories: ["Politics"],
		citation: "https://www.bbc.co.uk/news/articles/c04lyddv2p5o",
	},
	{
		name: "year of profit for the Coca-Cola Company",
		pluralName: "years of profit for the Coca-Cola Company",
		cost: 28021000000, // $28.021 billion
		emoji: "🥤",
		quantity: 1,
		categories: ["Business"],
		citation:
			"https://www.macrotrends.net/stocks/charts/KO/cocacola/gross-profit",
	},
	{
		name: "average annual full-time salary for a UK employee",
		pluralName: "average annual full-time salaries for UK employees",
		cost: 37430, // £37,430
		emoji: "💼",
		quantity: 1,
		categories: ["Top", "Politics", "Business"],
		citation:
			"https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/bulletins/annualsurveyofhoursandearnings/2024",
	},
	{
		name: "bat-protective tunnel for HS2",
		pluralName: "bat-protective tunnels for HS2",
		cost: 100000000, // £100 million
		emoji: "🦇",
		quantity: 1,
		categories: ["Transport"],
		citation: "https://www.bbc.com/news/articles/c9wryxyljglo",
	},
	{
		name: "average annual full-time salary for a US employee",
		pluralName: "average annual full-time salaries for US employees",
		cost: 61963, // $61,963
		emoji: "💵",
		quantity: 1,
		categories: ["Politics", "Business"],
		citation: "https://www.statista.com/topics/789/wages-and-salary/",
	},
	{
		name: "year of tax revenue for the UK government",
		pluralName: "years of tax revenue for the UK government",
		cost: 829100000000, // £829.1 billion
		emoji: "🇬🇧",
		quantity: 1,
		categories: ["Politics"],
		citation:
			"https://www.gov.uk/government/statistics/hmrc-tax-and-nics-receipts-for-the-uk/hmrc-tax-receipts-and-national-insurance-contributions-for-the-uk-new-annual-bulletin",
	},
	{
		name: "launch of a SpaceX Starship",
		pluralName: "launches of a SpaceX Starship",
		cost: 80000000, // $100 million USD -> £80 million GBP
		emoji: "🚀",
		quantity: 1,
		categories: ["Top", "Space"],
		citation:
			"https://payloadspace.com/payload-research-detailing-artemis-vehicle-rd-costs/",
	},
	{
		name: "year of UK defence spending",
		pluralName: "years of UK defence spending",
		cost: 54000000000, // £54 billion
		emoji: "🛡️",
		quantity: 1,
		categories: ["Defence"],
		citation:
			"https://commonslibrary.parliament.uk/research-briefings/cbp-8175",
	},
	{
		name: "Type 26 frigate",
		pluralName: "Type 26 frigates",
		cost: 525000000, // £525 million
		emoji: "🛳️",
		quantity: 1,
		categories: ["Defence"],
		citation:
			"https://www.gov.uk/government/news/british-shipyard-awarded-42-billion-to-build-royal-navy-ships",
	},
	{
		name: "reclamation of Dogger Bank from the sea",
		pluralName: "reclamations of Dogger Bank from the sea",
		cost: 97500000000, // £97.5 billion
		emoji: "🧜",
		quantity: 1,
		categories: ["Politics", "Housing"],
		citation: "https://model-thinking.com/p/a-new-atlantis",
	},
];

export default function NHSSpendingCalculator() {
	const [amount, setAmount] = useState(ANNUAL_NHS_SPENDING);
	const [inputValue, setInputValue] = useState(ANNUAL_NHS_SPENDING.toString());
	const [selectedOption, setSelectedOption] = useState<SpendingOption | null>(
		null,
	);
	const [selectedCategory, setSelectedCategory] = useState("Top");
	const [selectedQuantity, setSelectedQuantity] = useState<number>(1);

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
		setSelectedQuantity(quantity);
	};

	const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = Number.parseInt(e.target.value) || 1;
		setSelectedQuantity(value);
		if (selectedOption) {
			const newAmount = selectedOption.cost * value;
			setAmount(newAmount);
			setInputValue(newAmount.toLocaleString());
		}
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
					<div className="relative overflow-clip flex flex-col items-center lg:items-end justify-end gap-3 mb-4 bg-gradient-to-r from-neutral-100 to-neutral-50 shadow-sm border p-4 rounded-lg">
						<GridPattern
							squares={[
								[4, 4],
								[5, 1],
								[8, 2],
								[5, 3],
								[5, 5],
								[10, 10],
								[12, 15],
								[15, 10],
							]}
							className={cn(
								"[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]",
								"absolute inset-y-[-30%] h-[200%] skew-y-12 opacity-50 lg:opacity-100",
							)}
						/>
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
										{selectedQuantity}{" "}
										{selectedQuantity > 1
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
								<p className="text-xs text-muted-foreground mt-2">
									NHSCostCalculator.com is not affiliated with the NHS.
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

					{selectedOption && (
						<div className="max-w-[1024px] mx-auto px-4 mb-8">
							<div className="flex items-center gap-4">
								<div className="flex-1">
									<label
										htmlFor="quantity"
										className="block text-sm font-medium text-gray-700 mb-2"
									>
										Number of {selectedOption.pluralName}:
									</label>
									<Input
										type="number"
										id="quantity"
										min="1"
										value={selectedQuantity}
										onChange={handleQuantityChange}
										className="w-full"
									/>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="max-w-[1024px] w-screen mx-auto px-4">
					<div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
						<h2 className="text-xl font-light mb-2">
							What else could {formatMoney(amount)} fund?
						</h2>
						<ul className="space-y-3">
							<AnimatePresence mode="popLayout">
								{spendingOptions.map((option, index) => {
									const quantity = Math.floor(amount / option.cost);
									if (quantity < 1) return null;
									return (
										<motion.li
											key={option.name}
											className="flex items-center"
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											transition={{ duration: 0.2 }}
										>
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
										</motion.li>
									);
								})}
							</AnimatePresence>
						</ul>
					</div>
				</div>
			</div>
		</>
	);
}

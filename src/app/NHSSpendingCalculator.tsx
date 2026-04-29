"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, formatTime } from "./utils/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { FaSpotify } from "react-icons/fa";
import { SiApplepodcasts } from "react-icons/si";
import { badgeVariants } from "@/components/ui/badge";
import { CurrencyToggle } from "@/components/ui/currency-toggle";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { MethodologyPopover } from "@/components/ui/methodology-popover";
import { UK_POPULATION_METHODOLOGY } from "@/data/methodologies";
import GridPattern from "@/components/ui/grid-pattern";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { type Currency, fromGBP, toGBP } from "@/lib/currency";
import type { ResolvedComparison } from "@/data/comparisons";
import {
	type BudgetSlice,
	MINUTES_PER_YEAR,
	UK_POPULATION,
	getSlice,
} from "@/data/nhs-budget";

interface Props {
	initialAmount: number;
	initialOptionId: string | null;
	initialQuantity: number;
	initialSliceId: string;
	initialUsdPerGbp: number;
	slices: readonly BudgetSlice[];
	comparisons: readonly ResolvedComparison[];
}

export default function NHSSpendingCalculator({
	initialAmount,
	initialOptionId,
	initialQuantity,
	initialSliceId,
	initialUsdPerGbp,
	slices,
	comparisons,
}: Props) {
	const router = useRouter();
	const initialOption = useMemo(
		() =>
			initialOptionId
				? (comparisons.find((c) => c.id === initialOptionId) ?? null)
				: null,
		[initialOptionId, comparisons],
	);
	const initialSlice = useMemo(
		() => getSlice(initialSliceId, slices),
		[initialSliceId, slices],
	);

	// `amount` is canonical and always in GBP. Display-currency conversion
	// happens at render time via fromGBP(); option costs declared in USD are
	// converted to GBP via toGBP() before being multiplied/compared.
	const [amount, setAmount] = useState(initialAmount);
	// While the amount input is focused, `editingAmount` holds whatever digits
	// the user has typed verbatim — the field is not reformatted on every
	// keystroke, which prevents the caret from jumping. While blurred this is
	// `null` and the field shows `amount.toLocaleString()` instead.
	const [editingAmount, setEditingAmount] = useState<string | null>(null);
	const [selectedOption, setSelectedOption] = useState<ResolvedComparison | null>(
		initialOption,
	);
	const [selectedCategory, setSelectedCategory] = useState("Top");
	const [selectedQuantity, setSelectedQuantity] =
		useState<number>(initialQuantity);
	const [selectedSlice, setSelectedSlice] =
		useState<BudgetSlice>(initialSlice);
	const [currency, setCurrency] = useState<Currency>("GBP");
	// FX rate is fetched server-side and passed in as a prop; the client
	// doesn't re-fetch. The rate is cached upstream for an hour, which is
	// fresh enough for a session.
	const usdPerGbp = initialUsdPerGbp;

	// Reflect state in the URL so links are shareable. Debounced so typing
	// doesn't thrash history; preserves unrelated query params (utm_*, etc.).
	// The calculator lives at /reference (Phase 2); URL writes target that path.
	useEffect(() => {
		const handle = setTimeout(() => {
			const params = new URLSearchParams(window.location.search);
			params.delete("id");
			params.delete("q");
			params.delete("a");
			params.delete("slice");
			if (selectedOption) {
				params.set("id", selectedOption.id);
				if (selectedQuantity !== selectedOption.quantity) {
					params.set("q", String(selectedQuantity));
				}
			} else if (Math.round(amount) !== selectedSlice.value) {
				params.set("a", String(Math.round(amount)));
			}
			if (selectedSlice.id !== "total") {
				params.set("slice", selectedSlice.id);
			}
			const qs = params.toString();
			router.replace(qs ? `/reference?${qs}` : "/reference", {
				scroll: false,
			});
		}, 250);
		return () => clearTimeout(handle);
	}, [amount, selectedOption, selectedQuantity, selectedSlice, router]);

	const optionCostInGBP = (option: ResolvedComparison) =>
		toGBP(option.cost, option.nativeCurrency, usdPerGbp);

	const amountInputDisplay = editingAmount ?? amount.toLocaleString();

	const handleAmountFocus = () => {
		setEditingAmount(String(amount));
	};

	const handleAmountBlur = () => {
		setEditingAmount(null);
	};

	const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const cleaned = e.target.value.replace(/\D/g, "");
		setEditingAmount(cleaned);
		setAmount(cleaned === "" ? 0 : Number.parseInt(cleaned, 10));
		setSelectedOption(null);
	};

	const handleQuickInput = (option: ResolvedComparison, quantity: number) => {
		const newAmount = optionCostInGBP(option) * quantity;
		setAmount(newAmount);
		setEditingAmount(null);
		setSelectedOption(option);
		setSelectedQuantity(quantity);
	};

	const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const cleaned = e.target.value.replace(/\D/g, "");
		const numericValue =
			cleaned === "" ? 1 : Math.max(1, Number.parseInt(cleaned, 10));
		setSelectedQuantity(numericValue);
		if (selectedOption) {
			const newAmount = optionCostInGBP(selectedOption) * numericValue;
			setAmount(newAmount);
			setEditingAmount(null);
		}
	};

	const handleSliceChange = (slice: BudgetSlice) => {
		setSelectedSlice(slice);
		// When the user picks a denominator they're framing the budget; auto-fill
		// the amount with that slice's value so the headline lands on
		// "1 year of <slice>" — but only if they haven't typed a custom amount or
		// picked a comparison. This keeps prior input intact.
		if (
			!selectedOption &&
			Math.round(amount) === Math.round(selectedSlice.value)
		) {
			setAmount(slice.value);
			setEditingAmount(null);
		}
	};

	const timeInMinutes = (amount / selectedSlice.value) * MINUTES_PER_YEAR;
	const formattedTime = formatTime(timeInMinutes);

	const categories = [
		"Top",
		...new Set(
			comparisons.flatMap((option) => option.categories).filter(
				(category) => category !== "Top",
			),
		),
	];
	const filteredOptions =
		selectedCategory === "Top"
			? comparisons.filter((option) => option.categories.includes("Top"))
			: comparisons.filter((option) =>
					option.categories.includes(selectedCategory),
				);

	const displayAmount = fromGBP(amount, currency, usdPerGbp);
	const currencySymbol = currency === "GBP" ? "£" : "$";

	return (
		<>
			<div className="pb-24">
				<div className="max-w-[1024px] mx-auto px-4">
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
					<Card className="mb-6 w-full relative">
						<CurrencyToggle
							value={currency}
							onChange={setCurrency}
							className="absolute right-2 top-2 hidden sm:flex"
						/>
						<CurrencyToggle
							value={currency}
							onChange={setCurrency}
							className="justify-center sm:hidden pt-4"
						/>
						<CardHeader>
							<CardTitle className="text-3xl font-light text-center max-w-[80%] mx-auto">
								{selectedOption ? (
									<>
										{selectedQuantity}{" "}
										{selectedQuantity > 1
											? selectedOption.pluralName
											: selectedOption.name}{" "}
										({currencySymbol}
										<AnimatedNumber value={Math.round(displayAmount)} />) is
									</>
								) : (
									<>
										{currencySymbol}
										<AnimatedNumber value={Math.round(displayAmount)} /> is
									</>
								)}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="mb-6">
								<p
									className="text-4xl text-center font-semibold"
									aria-live="polite"
								>
									<span className="text-blue-500">{formattedTime}</span> of{" "}
									{selectedSlice.shortLabel}
								</p>
								<p className="mt-1 text-center text-sm text-muted-foreground inline-flex items-center justify-center gap-1 w-full">
									= {currencySymbol}
									<AnimatedNumber
										value={Math.round(displayAmount / UK_POPULATION.value)}
									/>{" "}
									per UK person
									<MethodologyPopover
										methodology={UK_POPULATION_METHODOLOGY}
									/>
								</p>
								<div
									role="group"
									aria-label="Choose which NHS England budget to compare against"
									className="flex flex-wrap gap-2 justify-center mt-4"
								>
									{slices.map((slice) => {
										const active = selectedSlice.id === slice.id;
										return (
											<button
												key={slice.id}
												type="button"
												aria-pressed={active}
												onClick={() => handleSliceChange(slice)}
												className={cn(
													badgeVariants({
														variant: active ? "default" : "outline",
													}),
													"cursor-pointer",
												)}
											>
												{slice.label}
											</button>
										);
									})}
								</div>
								<p className="mt-2 text-center text-xs text-muted-foreground">
									{selectedSlice.label}:{" "}
									{currencySymbol}
									{Math.round(
										fromGBP(selectedSlice.value, currency, usdPerGbp),
									).toLocaleString()}
									/yr · {currencySymbol}
									{Math.round(
										fromGBP(
											selectedSlice.value / UK_POPULATION.value,
											currency,
											usdPerGbp,
										),
									).toLocaleString()}
									/person ·{" "}
									<a
										href={selectedSlice.source.url}
										target="_blank"
										rel="noopener noreferrer"
										className="hover:underline"
									>
										{selectedSlice.source.label}
									</a>
									<ProvenanceBadge isLive={selectedSlice.isLive ?? false} />
									<MethodologyPopover
										methodology={selectedSlice.methodology}
										className="ml-1"
									/>
								</p>
							</div>
							<div className="mb-6">
								<label
									htmlFor="amount"
									className="block text-sm font-medium text-gray-700 mb-2"
								>
									Enter amount ({currency === "GBP" ? "£" : "$"}):
								</label>
								<Input
									type="text"
									id="amount"
									inputMode="numeric"
									value={amountInputDisplay}
									onChange={handleAmountChange}
									onFocus={handleAmountFocus}
									onBlur={handleAmountBlur}
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
					</Card>

					<div
						role="group"
						aria-label="Filter comparisons by category"
						className="flex flex-wrap gap-2 mb-4"
					>
						{categories.map((category) => {
							const active = selectedCategory === category;
							return (
								<button
									key={category}
									type="button"
									aria-pressed={active}
									onClick={() => setSelectedCategory(category)}
									className={cn(
										badgeVariants({
											variant: active ? "default" : "outline",
										}),
										"cursor-pointer",
									)}
								>
									{category}
								</button>
							);
						})}
					</div>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 mb-8">
						{filteredOptions.map((option) => (
							<Button
								key={option.id}
								onClick={() => handleQuickInput(option, option.quantity)}
								className="text-sm h-auto py-2 px-3 whitespace-normal"
								variant={
									selectedOption?.id === option.id ? "default" : "outline"
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
										type="text"
										id="quantity"
										value={selectedQuantity}
										onChange={handleQuantityChange}
										onFocus={(e) => e.currentTarget.select()}
										className="w-full"
										inputMode="numeric"
										pattern="[0-9]*"
									/>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="max-w-[1024px] w-screen mx-auto px-4">
					<div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
						<h2 className="text-xl font-light mb-2">
							What else could {currencySymbol}
							<AnimatedNumber value={Math.round(displayAmount)} /> fund?
						</h2>
						<ul className="space-y-3">
							<AnimatePresence mode="popLayout">
								{comparisons.map((option) => {
									const quantity = Math.floor(amount / optionCostInGBP(option));
									if (quantity < 1) return null;
									return (
										<motion.li
											key={option.id}
											className="flex items-center"
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											transition={{ duration: 0.2 }}
										>
											<span className="text-2xl mr-3" aria-hidden="true">
												{option.emoji}
											</span>
											<span className="text-sm">
												{formatMoney(displayAmount, currency)} could fund{" "}
												{quantity.toLocaleString()}{" "}
												{quantity !== 1 ? option.pluralName : option.name}
												{option.source && (
													<a
														href={option.source.url}
														className="ml-1 text-blue-500 hover:underline"
														target="_blank"
														rel="noopener noreferrer"
													>
														[source]
													</a>
												)}
												{option.dynamic && (
													<ProvenanceBadge isLive={option.isLive} />
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

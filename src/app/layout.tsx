import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = localFont({
	src: "./fonts/GeistVF.woff",
	variable: "--font-geist-sans",
	weight: "100 900",
});

export const metadata: Metadata = {
	metadataBase: new URL("https://nhscostcalculator.com"),
	title: {
		default: "NHS Cost Calculator",
		template: "%s · NHSCostCalculator.com",
	},
	description:
		"Compare any cost to a fraction of the NHS's annual budget. Type a number, pick a comparison, share the link.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${geistSans.variable} antialiased`}>
				{children}
				<footer>
					<div className="text-xs text-neutral-400 px-4 py-2 flex justify-center">
						<p>
							Inspired by{" "}
							<Link
								href="https://x.com/DaysofNHS"
								className="hover:text-neutral-600 transition-colors duration-400"
							>
								@DaysofNHS
							</Link>
							. Made by{" "}
							<Link
								href="https://x.com/findboundary"
								className="hover:text-neutral-600 transition-colors duration-400"
							>
								Aeron Laffere
							</Link>
							.
						</p>
					</div>
				</footer>
			</body>
		</html>
	);
}

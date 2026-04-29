export type Currency = "GBP" | "USD";

// Reasonable fallback used until the live FX fetch resolves. Avoids the
// previous behaviour where USD-native items appeared at 1:1 to GBP on first
// paint.
export const FALLBACK_USD_PER_GBP = 1.27;

export const toGBP = (
	cost: number,
	native: Currency,
	usdPerGbp: number,
): number => (native === "USD" ? cost / usdPerGbp : cost);

export const fromGBP = (
	gbp: number,
	target: Currency,
	usdPerGbp: number,
): number => (target === "USD" ? gbp * usdPerGbp : gbp);

import { FALLBACK_USD_PER_GBP } from "@/lib/currency";

const CURRENCY_API_URL = "https://api.exchangerate-api.com/v4/latest/GBP";

// Server-side FX fetcher. Next dedupes identical fetches within a render and
// caches the response for `revalidate` seconds, so a burst of requests at the
// same moment hits the upstream API once per hour at most.
export async function getUsdPerGbp(): Promise<number> {
	try {
		const response = await fetch(CURRENCY_API_URL, {
			next: { revalidate: 3600 },
		});
		if (!response.ok) return FALLBACK_USD_PER_GBP;
		const data = await response.json();
		const rate = data?.rates?.USD;
		return typeof rate === "number" && rate > 0 ? rate : FALLBACK_USD_PER_GBP;
	} catch {
		return FALLBACK_USD_PER_GBP;
	}
}

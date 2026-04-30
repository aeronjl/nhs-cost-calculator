import type { Metadata } from "next";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | undefined>>;

export const metadata: Metadata = {
	title: "Scenario results — NHS Cost Calculator",
	description:
		"The scenario sandbox has moved into the fiscal report results page.",
	robots: {
		index: false,
		follow: true,
	},
};

const hasAnyParam = (params: Record<string, string | undefined>): boolean =>
	Object.values(params).some((value) => typeof value === "string" && value.length > 0);

export default async function SandboxRedirect({
	searchParams,
}: { searchParams: SearchParams }) {
	const params = await searchParams;
	const qs = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (typeof value === "string" && value.length > 0) qs.set(key, value);
	}

	if (!hasAnyParam(params)) {
		qs.set("wstep", "5");
	}

	const query = qs.toString();
	redirect(query ? `/?${query}` : "/?wstep=5");
}

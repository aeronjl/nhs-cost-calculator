import { permanentRedirect } from "next/navigation";

// /wizard now lives at /. Permanent redirect preserves any wizard URL
// state (?wera=… / ?wgoal=… / ?wstep=… / ?wiz=… etc.). Old bookmarks +
// share-links keep working.
export default async function WizardPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (typeof v === "string") qs.set(k, v);
	}
	const s = qs.toString();
	permanentRedirect(s ? `/?${s}` : "/");
}

// A `Source<T>` is a typed pair: a server-side fetcher that may return null
// (network failure, missing config, malformed response — handled inside) and
// a static fallback used when the fetcher gives up. `loadSource` is the
// canonical "give me the value" entry point.
export type Source<T> = {
	fetch: () => Promise<T | null>;
	fallback: T;
};

export async function loadSource<T>(source: Source<T>): Promise<T> {
	const result = await source.fetch();
	return result ?? source.fallback;
}

const inFlight = new Map<string, Promise<any>>()
export async function coalesce<T>(
	key: string,
	fetcher: () => Promise<T>,
): Promise<T> {
	const existing = inFlight.get(key)

	if (existing) {
		return existing
	}

	const promise = (async () => {
		try {
			return await fetcher()
		} finally {
			inFlight.delete(key)
		}
	})()

	inFlight.set(key, promise)

	return promise
}

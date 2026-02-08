
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}


export async function advanceTimers(ms: number): Promise<void> {
	if (typeof jest !== 'undefined' && jest.advanceTimersByTime) {
		jest.advanceTimersByTime(ms)
		await Promise.resolve()
	} else {
		await sleep(ms)
	}
}

export async function waitForBackgroundRefresh(): Promise<void> {
	await sleep(50)
}

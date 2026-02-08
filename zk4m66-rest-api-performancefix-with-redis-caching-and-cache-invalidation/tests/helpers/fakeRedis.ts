type Entry = {
	value: string
	expiresAt: number | null
}

export class FakeRedis {
	private store = new Map<string, Entry>()

	async get(key: string): Promise<string | null> {
		const entry = this.store.get(key)
		if (!entry) return null

		if (entry.expiresAt && entry.expiresAt < Date.now()) {
			this.store.delete(key)
			return null
		}

		return entry.value
	}

	async set(
		key: string,
		value: string,
		modeOrOpts?: any,
		ttlSeconds?: number,
	): Promise<'OK'> {
		let expiresAt: number | null = null
		if (modeOrOpts === 'EX' && typeof ttlSeconds === 'number') {
			expiresAt = Date.now() + ttlSeconds * 1000
		}
		if (
			modeOrOpts &&
			typeof modeOrOpts === 'object' &&
			typeof modeOrOpts.EX === 'number'
		) {
			expiresAt = Date.now() + modeOrOpts.EX * 1000
		}

		this.store.set(key, { value, expiresAt })
		return 'OK'
	}

	async del(...keys: string[]): Promise<number> {
		let count = 0
		for (const key of keys) {
			if (this.store.delete(key)) count++
		}
		return count
	}
	async keys(pattern: string): Promise<string[]> {
		const all = Array.from(this.store.keys())
		return all.filter((k) => matchPattern(k, pattern))
	}

	async ttl(key: string): Promise<number> {
		const entry = this.store.get(key)
		if (!entry) return -2
		if (!entry.expiresAt) return -1

		const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000)
		return remaining > 0 ? remaining : -2
	}

	async scan(
		cursor: string,
		_match: string,
		pattern: string,
		_count: string,
		countStr: string,
	): Promise<[string, string[]]> {
		const count = Number(countStr) || 100

		const keys = Array.from(this.store.keys())
		const start = Number(cursor)
		const matchedAll = keys.filter((key) => matchPattern(key, pattern))
		const slice = matchedAll.slice(start, start + count)

		const nextCursor =
			start + count >= matchedAll.length ? '0' : String(start + count)

		return [nextCursor, slice]
	}

	pipeline() {
		const commands: Array<() => void> = []

		return {
			set: (key: string, value: string) => {
				commands.push(() => {
					this.store.set(key, { value, expiresAt: null })
				})
				return this
			},

			del: (...keys: string[]) => {
				commands.push(() => {
					keys.forEach((k) => this.store.delete(k))
				})
				return this
			},

			exec: async () => {
				commands.forEach((fn) => fn())
				return []
			},
		}
	}

	clear() {
		this.store.clear()
	}
}

function matchPattern(key: string, pattern: string): boolean {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
	const regex = new RegExp(
		'^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
	)
	return regex.test(key)
}

import { createClient, type RedisClientType } from 'redis'

export type RedisLike = {
	get(key: string): Promise<string | null>
	set(
		key: string,
		val: string,
		modeOrOpts?: any,
		ttlSecondsMaybe?: number,
	): Promise<any>
	del(...keys: string[]): Promise<number>
	scan(
		cursor: string,
		_match: 'MATCH',
		pattern: string,
		_count: 'COUNT',
		countStr: string,
	): Promise<[string, string[]]>
	keys?(pattern: string): Promise<string[]>
}

function makeNoopRedis(): RedisLike {
	return {
		async get() {
			return null
		},
		async set() {
			return 'OK'
		},
		async del() {
			return 0
		},
		async scan() {
			return ['0', []]
		},
		async keys() {
			return []
		},
	}
}

function makeRealRedis(): RedisLike {
	const url = process.env.REDIS_URL || 'redis://redis:6379'
	const client: RedisClientType = createClient({ url })

	let connected = false
	client.on('ready', () => (connected = true))
	client.on('end', () => (connected = false))
	client.on('error', () => (connected = false))

	void client.connect().catch(() => {
		/* swallow */
	})

	function isUp() {
		return connected
	}

	return {
		async get(key: string) {
			try {
				if (!isUp()) return null
				return await client.get(key)
			} catch {
				return null
			}
		},

		async set(
			key: string,
			val: string,
			modeOrOpts?: any,
			ttlSecondsMaybe?: number,
		) {
			try {
				if (!isUp()) return 'OK'

				if (
					modeOrOpts === 'EX' &&
					typeof ttlSecondsMaybe === 'number'
				) {
					return await client.set(key, val, { EX: ttlSecondsMaybe })
				}

				if (
					modeOrOpts &&
					typeof modeOrOpts === 'object' &&
					typeof modeOrOpts.EX === 'number'
				) {
					return await client.set(key, val, { EX: modeOrOpts.EX })
				}

				return await client.set(key, val)
			} catch {
				return 'OK'
			}
		},

		async del(...keys: string[]) {
			try {
				if (!isUp()) return 0
				if (keys.length === 0) return 0
				return await client.del(keys)
			} catch {
				return 0
			}
		},

		async scan(
			cursor: string,
			_match: 'MATCH',
			pattern: string,
			_count: 'COUNT',
			countStr: string,
		): Promise<[string, string[]]> {
			try {
				if (!isUp()) return ['0', []]
				const count = Number(countStr) || 100
				const res = (await (client as any).scan(cursor, {
					MATCH: pattern,
					COUNT: count,
				})) as any

				if (Array.isArray(res)) return [String(res[0]), res[1] ?? []]
				if (
					res &&
					typeof res === 'object' &&
					'cursor' in res &&
					'keys' in res
				) {
					return [String(res.cursor), res.keys ?? []]
				}
				return ['0', []]
			} catch {
				return ['0', []]
			}
		},

		async keys(pattern: string): Promise<string[]> {
			try {
				if (!isUp()) return []
				return await client.keys(pattern)
			} catch {
				return []
			}
		},
	}
}

let CURRENT: RedisLike = makeRealRedis()


export const safeRedis: RedisLike = new Proxy({} as RedisLike, {
	get(_t, prop: keyof RedisLike) {
		const impl: any = CURRENT as any
		const v = impl[prop]
		return typeof v === 'function' ? v.bind(impl) : v
	},
}) as RedisLike


export function __setSafeRedisForTests(next: RedisLike) {
	CURRENT = next
}


export function __resetSafeRedisForTests() {
	CURRENT = makeRealRedis()
}

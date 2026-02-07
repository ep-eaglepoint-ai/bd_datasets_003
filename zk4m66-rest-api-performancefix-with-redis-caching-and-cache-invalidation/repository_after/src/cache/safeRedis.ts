
import type { Redis } from 'ioredis'

type LogFn = (msg: string, meta?: Record<string, unknown>) => void

export type SafeRedis = {
	get(key: string): Promise<string | null>
	set(
		key: string,
		value: string,
		mode: 'EX',
		ttlSeconds: number,
	): Promise<'OK' | null>
	del(...keys: string[]): Promise<number>
	ttl(key: string): Promise<number>
	scan(cursor: string, ...args: string[]): Promise<[string, string[]]>
	pipeline(): ReturnType<Redis['pipeline']>
}

function defaultLog(msg: string, meta?: Record<string, unknown>) {
	// eslint-disable-next-line no-console
	console.warn(`[redis] ${msg}`, meta || {})
}

export function makeSafeRedis(
	redis: Redis | null,
	log: LogFn = defaultLog,
): SafeRedis {
	const unavailable = async <T>(
		op: string,
		fallback: T,
		err?: unknown,
	): Promise<T> => {
		log(`Redis unavailable during ${op}`, {
			error: err instanceof Error ? err.message : String(err),
		})
		return fallback
	}

	return {
		async get(key: string) {
			if (!redis) return unavailable('GET', null)
			try {
				return await redis.get(key)
			} catch (err) {
				return unavailable('GET', null, err)
			}
		},

		async set(key: string, value: string, mode: 'EX', ttlSeconds: number) {
			if (!redis) return unavailable('SET', null)
			try {
				return await redis.set(key, value, mode, ttlSeconds)
			} catch (err) {
				return unavailable('SET', null, err)
			}
		},

		async del(...keys: string[]) {
			if (!redis) return unavailable('DEL', 0)
			try {
				return await redis.del(...keys)
			} catch (err) {
				return unavailable('DEL', 0, err)
			}
		},

		async ttl(key: string) {
			if (!redis) return unavailable('TTL', -2)
			try {
				return await redis.ttl(key)
			} catch (err) {
				return unavailable('TTL', -2, err)
			}
		},

		async scan(cursor: string, ...args: string[]) {
			if (!redis)
				return unavailable('SCAN', ['0', []] as [string, string[]])
			try {
				return await (redis as any).scan(cursor, ...args)
			} catch (err) {
				return unavailable('SCAN', ['0', []] as [string, string[]], err)
			}
		},

		pipeline() {
			if (!redis) {
				const dummy = {
					set: () => dummy,
					del: () => dummy,
					exec: async () => [],
				}
				return dummy as any
			}
			try {
				return redis.pipeline()
			} catch (err) {
				log('Redis pipeline unavailable', {
					error: err instanceof Error ? err.message : String(err),
				})
				const dummy = {
					set: () => dummy,
					del: () => dummy,
					exec: async () => [],
				}
				return dummy as any
			}
		},
	}
}

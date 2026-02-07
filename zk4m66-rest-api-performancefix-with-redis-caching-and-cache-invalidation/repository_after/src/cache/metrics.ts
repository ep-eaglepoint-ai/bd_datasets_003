type MetricsSnapshot = {
	hits: number
	misses: number
	sets: number
	errors: number
	hitRate: number
	avgLatencyMs: number
}

class CacheMetrics {
	private hits = 0
	private misses = 0
	private sets = 0
	private errors = 0

	private totalLatencyMs = 0
	private latencyCount = 0

	recordHit(latencyMs: number) {
		this.hits++
		this.totalLatencyMs += latencyMs
		this.latencyCount++
	}

	recordMiss(latencyMs: number) {
		this.misses++
		this.totalLatencyMs += latencyMs
		this.latencyCount++
	}

	recordSet() {
		this.sets++
	}

	recordError() {
		this.errors++
	}

	reset() {
		this.hits = 0
		this.misses = 0
		this.sets = 0
		this.errors = 0
		this.totalLatencyMs = 0
		this.latencyCount = 0
	}

	snapshot(): MetricsSnapshot {
		const totalRequests = this.hits + this.misses

		const hitRate = totalRequests === 0 ? 0 : this.hits / totalRequests

		const avgLatencyMs =
			this.latencyCount === 0
				? 0
				: this.totalLatencyMs / this.latencyCount

		return {
			hits: this.hits,
			misses: this.misses,
			sets: this.sets,
			errors: this.errors,
			hitRate,
			avgLatencyMs,
		}
	}
}

export const cacheMetrics = new CacheMetrics()

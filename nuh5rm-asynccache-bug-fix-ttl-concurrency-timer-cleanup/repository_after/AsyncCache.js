class AsyncCache {
  constructor(defaultTTL = null) {
    this.cache = new Map();
    this.timers = new Map();
    this.pending = new Map();
    this.defaultTTL = defaultTTL;
  }

  async get(key, loader, ttl) {
    const cached = this.cache.get(key);
    if (cached && !this._isExpired(cached)) {
      return cached.value;
    }

    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    const promise = loader()
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);

    try {
      const value = await promise;
      this.set(key, value, ttl);
      return value;
    } catch (e) {
      throw e;
    }
  }

  set(key, value, ttl) {
    const effectiveTTL = ttl ?? this.defaultTTL;
    
    const expiresAt = effectiveTTL ? Date.now() + effectiveTTL : null;
    this.cache.set(key, { value, expiresAt });

    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    if (effectiveTTL) {
      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, effectiveTTL);
      this.timers.set(key, timer);
    }
  }

  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.cache.delete(key);
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
    this.pending.clear();
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this._isExpired(entry)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  get size() {
    for (const [key, entry] of this.cache) {
      if (this._isExpired(entry)) {
        this.delete(key);
      }
    }
    return this.cache.size;
  }

  keys() {
    for (const [key, entry] of this.cache) {
      if (this._isExpired(entry)) {
        this.delete(key);
      }
    }
    return Array.from(this.cache.keys());
  }

  _isExpired(entry) {
    if (entry.expiresAt === null) return false;
    return entry.expiresAt <= Date.now();
  }
}

module.exports = AsyncCache;

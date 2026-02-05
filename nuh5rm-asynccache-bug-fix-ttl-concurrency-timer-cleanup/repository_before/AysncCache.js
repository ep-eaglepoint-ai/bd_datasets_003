class AsyncCache {
  constructor(defaultTTL = null) {
    this.cache = new Map();
    this.timers = new Map();
    this.defaultTTL = defaultTTL;
  }

  async get(key, loader, ttl) {
    const cached = this.cache.get(key);
    if (cached && !this._isExpired(cached)) {
      return cached.value;
    }

    const value = await loader();
    this.set(key, value, ttl);
    return value;
  }

  set(key, value, ttl) {
    const effectiveTTL = ttl ?? this.defaultTTL;
    
    const expiresAt = effectiveTTL ? Date.now() + effectiveTTL : null;
    this.cache.set(key, { value, expiresAt });

    if (effectiveTTL) {
      const timer = setTimeout(() => {
        this.delete(key);
      }, effectiveTTL);
      this.timers.set(key, timer);
    }
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    return this.cache.has(key);
  }

  get size() {
    return this.cache.size;
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && entry.expiresAt > Date.now();
  }
}

module.exports = AsyncCache;
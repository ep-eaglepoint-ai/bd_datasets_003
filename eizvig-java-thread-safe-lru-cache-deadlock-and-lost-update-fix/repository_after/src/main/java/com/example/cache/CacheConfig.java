package com.example.cache;

public class CacheConfig {
    private final int maxSize;
    
    public CacheConfig(int maxSize) {
        if (maxSize <= 0) {
            throw new IllegalArgumentException("Max size must be positive");
        }
        this.maxSize = maxSize;
    }
    
    public int getMaxSize() {
        return maxSize;
    }
    
    public static CacheConfig defaultConfig() {
        return new CacheConfig(10000);
    }
}

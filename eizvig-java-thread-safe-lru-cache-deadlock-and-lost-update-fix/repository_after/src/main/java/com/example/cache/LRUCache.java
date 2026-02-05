package com.example.cache;

import java.util.HashMap;
import java.util.Map;

public class LRUCache<K, V> {
    private final CacheConfig config;
    private final Map<K, CacheEntry<K, V>> cache;
    private CacheEntry<K, V> head;
    private CacheEntry<K, V> tail;
    private int size;
    
    // Single lock for all operations to ensure consistency
    private final Object lock = new Object();
    
    public LRUCache(CacheConfig config) {
        this.config = config;
        this.cache = new HashMap<>();
        this.size = 0;
    }
    
    public V get(K key) {
        if (key == null) {
            return null;
        }
        
        synchronized (lock) {
            CacheEntry<K, V> entry = cache.get(key);
            
            if (entry == null) {
                return null;
            }
            
            moveToFront(entry);
            return entry.getValue();
        }
    }
    
    public void put(K key, V value) {
        if (key == null) {
            return;
        }
        
        synchronized (lock) {
            CacheEntry<K, V> existing = cache.get(key);
            
            if (existing != null) {
                existing.setValue(value);
                moveToFront(existing);
                return;
            }
            
            // Should evict if we are at capacity
            if (size >= config.getMaxSize()) {
                evictLRU();
            }
            
            CacheEntry<K, V> newEntry = new CacheEntry<>(key, value);
            cache.put(key, newEntry);
            addToFront(newEntry);
            size++;
        }
    }
    
    public V remove(K key) {
        if (key == null) {
            return null;
        }
        
        synchronized (lock) {
            CacheEntry<K, V> entry = cache.remove(key);
            
            if (entry == null) {
                return null;
            }
            
            removeFromList(entry);
            
            // Clear pointers to assist GC and prevent issues if node is somehow retained
            entry.setPrev(null);
            entry.setNext(null);
            
            size--;
            
            return entry.getValue();
        }
    }
    
    public int size() {
        synchronized (lock) {
            return size;
        }
    }
    
    public void clear() {
        synchronized (lock) {
            cache.clear();
            head = null;
            tail = null;
            size = 0;
        }
    }
    
    public boolean containsKey(K key) {
        synchronized (lock) {
            return cache.containsKey(key);
        }
    }
    
    // Internal helper methods must be called with lock held
    
    private void moveToFront(CacheEntry<K, V> entry) {
        if (entry == head) {
            return;
        }
        
        removeFromList(entry);
        addToFront(entry);
    }
    
    private void addToFront(CacheEntry<K, V> entry) {
        entry.setPrev(null);
        entry.setNext(head);
        
        if (head != null) {
            head.setPrev(entry);
        }
        
        head = entry;
        
        if (tail == null) {
            tail = entry;
        }
    }
    
    private void removeFromList(CacheEntry<K, V> entry) {
        CacheEntry<K, V> prevEntry = entry.getPrev();
        CacheEntry<K, V> nextEntry = entry.getNext();
        
        if (prevEntry != null) {
            prevEntry.setNext(nextEntry);
        } else {
            head = nextEntry;
        }
        
        if (nextEntry != null) {
            nextEntry.setPrev(prevEntry);
        } else {
            tail = prevEntry;
        }
    }
    
    private void evictLRU() {
        if (tail == null) {
            return;
        }
        
        CacheEntry<K, V> lru = tail;
        removeFromList(lru);
        cache.remove(lru.getKey());
        
        // Clear pointers
        lru.setPrev(null);
        lru.setNext(null);
        
        size--;
    }
}

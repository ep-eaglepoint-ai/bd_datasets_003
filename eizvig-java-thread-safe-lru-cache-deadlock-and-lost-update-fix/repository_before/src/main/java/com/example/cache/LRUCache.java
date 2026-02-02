package com.example.cache;

import java.util.HashMap;
import java.util.Map;

public class LRUCache<K, V> {
    private final CacheConfig config;
    private final Map<K, CacheEntry<K, V>> cache;
    private CacheEntry<K, V> head;
    private CacheEntry<K, V> tail;
    private int size;
    
    private final Object mapLock = new Object();
    private final Object listLock = new Object();
    
    public LRUCache(CacheConfig config) {
        this.config = config;
        this.cache = new HashMap<>();
        this.size = 0;
    }
    
    public V get(K key) {
        if (key == null) {
            return null;
        }
        
        CacheEntry<K, V> entry;
        
        synchronized (mapLock) {
            entry = cache.get(key);
        }
        
        if (entry == null) {
            return null;
        }
        
        synchronized (listLock) {
            moveToFront(entry);
        }
        
        return entry.getValue();
    }
    
    public void put(K key, V value) {
        if (key == null) {
            return;
        }
        
        synchronized (listLock) {
            synchronized (mapLock) {
                CacheEntry<K, V> existing = cache.get(key);
                
                if (existing != null) {
                    existing.setValue(value);
                    moveToFront(existing);
                    return;
                }
                
                CacheEntry<K, V> newEntry = new CacheEntry<>(key, value);
                
                if (size >= config.getMaxSize()) {
                    evictLRU();
                }
                
                cache.put(key, newEntry);
                addToFront(newEntry);
                size++;
            }
        }
    }
    
    public V remove(K key) {
        if (key == null) {
            return null;
        }
        
        synchronized (mapLock) {
            CacheEntry<K, V> entry = cache.remove(key);
            
            if (entry == null) {
                return null;
            }
            
            removeFromList(entry);
            size--;
            
            return entry.getValue();
        }
    }
    
    public int size() {
        return size;
    }
    
    public void clear() {
        synchronized (mapLock) {
            cache.clear();
            head = null;
            tail = null;
            size = 0;
        }
    }
    
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
        size--;
    }
    
    public boolean containsKey(K key) {
        synchronized (mapLock) {
            return cache.containsKey(key);
        }
    }
}

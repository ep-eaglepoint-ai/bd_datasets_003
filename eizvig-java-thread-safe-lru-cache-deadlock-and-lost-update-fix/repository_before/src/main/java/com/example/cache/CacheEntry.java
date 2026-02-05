package com.example.cache;

public class CacheEntry<K, V> {
    private final K key;
    private V value;
    private CacheEntry<K, V> prev;
    private CacheEntry<K, V> next;
    
    public CacheEntry(K key, V value) {
        this.key = key;
        this.value = value;
    }
    
    public K getKey() {
        return key;
    }
    
    public V getValue() {
        return value;
    }
    
    public void setValue(V value) {
        this.value = value;
    }
    
    public CacheEntry<K, V> getPrev() {
        return prev;
    }
    
    public void setPrev(CacheEntry<K, V> prev) {
        this.prev = prev;
    }
    
    public CacheEntry<K, V> getNext() {
        return next;
    }
    
    public void setNext(CacheEntry<K, V> next) {
        this.next = next;
    }
}

package com.quantflow.tests;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Map;
import java.util.concurrent.ConcurrentMap;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Structural tests that enforce the algorithmic and concurrency requirements
 * in an implementation-agnostic way.
 *
 * Any correct implementation must:
 * - Use a hash-based or direct-mapping structure (e.g., Map) for lookups.
 * - Use a thread-safe collection (e.g., ConcurrentMap) for concurrent reads.
 */
public class MarketRegistryStructureTest {

    @Test
    void usesHashBasedLookupStructure() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();
        Class<?> registryClass = loaded.registryClass;

        boolean hasMapField = false;
        for (Field field : registryClass.getDeclaredFields()) {
            Class<?> type = field.getType();
            if (Map.class.isAssignableFrom(type)) {
                hasMapField = true;
                break;
            }
        }

        assertTrue(
                hasMapField,
                "Registry implementation must expose at least one Map-based field " +
                        "to satisfy the O(1) hash-based lookup requirement."
        );
    }

    @Test
    void usesThreadSafeCollectionForQueriesWhenRequired() throws Exception {
        RegistryTestSupport.LoadedRegistry loaded = RegistryTestSupport.loadRegistry();
        Class<?> registryClass = loaded.registryClass;

        boolean hasConcurrentMapField = false;
        for (Field field : registryClass.getDeclaredFields()) {
            Class<?> type = field.getType();
            if (ConcurrentMap.class.isAssignableFrom(type)) {
                // Extra sanity check: non-static field so it is actually part of instance state.
                if (!Modifier.isStatic(field.getModifiers())) {
                    hasConcurrentMapField = true;
                    break;
                }
            }
        }

        assertTrue(
                hasConcurrentMapField,
                "Registry implementation must use a thread-safe Map (e.g., ConcurrentHashMap) " +
                        "to satisfy the concurrent read-access requirement."
        );
    }
}



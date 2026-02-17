package com.audit.engine.core;

import com.audit.engine.annotation.Auditable;
import com.audit.engine.model.FieldChange;
import org.hibernate.proxy.HibernateProxy;
import org.springframework.stereotype.Component;
import org.springframework.util.ReflectionUtils;

import jakarta.persistence.Id;
import java.lang.reflect.Field;
import java.util.*;

@Component
public class ChangeDetector {

    private static final int MAX_DEPTH = 3;

    public List<FieldChange> detectChanges(Object oldState, Object newState) {
        return detectChanges("", oldState, newState, 0);
    }

    private List<FieldChange> detectChanges(String prefix, Object oldState, Object newState, int depth) {
        final Object effectiveOldState = unproxy(oldState);
        final Object effectiveNewState = unproxy(newState);

        List<FieldChange> changes = new ArrayList<>();

        if (effectiveOldState == null && effectiveNewState == null) return changes;

        // Handle Null to Non-Null and vice versa
        if (effectiveOldState == null || effectiveNewState == null) {
            String propertyName = prefix.isEmpty() ? "root" : prefix;
            changes.add(new FieldChange(
                    propertyName,
                    effectiveOldState == null ? "null" : safeToString(effectiveOldState),
                    effectiveNewState == null ? "null" : safeToString(effectiveNewState)
            ));
            return changes;
        }

        Class<?> clazz = effectiveOldState.getClass();
        
        if (!clazz.equals(effectiveNewState.getClass())) {
             changes.add(new FieldChange(
                    prefix,
                    safeToString(effectiveOldState),
                    safeToString(effectiveNewState)
            ));
            return changes;
        }

        if (isSimpleType(clazz)) {
            if (!Objects.equals(effectiveOldState, effectiveNewState)) {
                changes.add(new FieldChange(
                        prefix,
                        safeToString(effectiveOldState),
                        safeToString(effectiveNewState)
                ));
            }
            return changes;
        }

        if (depth >= MAX_DEPTH) { 
             return changes;
        }

        if (effectiveOldState instanceof Collection && effectiveNewState instanceof Collection) {
            return detectCollectionChanges(prefix, (Collection<?>) effectiveOldState, (Collection<?>) effectiveNewState, depth);
        }

        if (effectiveOldState instanceof Map && effectiveNewState instanceof Map) {
             if (!Objects.equals(effectiveOldState, effectiveNewState)) {
                 changes.add(new FieldChange(prefix, safeToString(effectiveOldState), safeToString(effectiveNewState)));
             }
             return changes;
        }

        // It is a complex object, recurse fields
        boolean isClassAuditable = clazz.isAnnotationPresent(Auditable.class);

        ReflectionUtils.doWithFields(clazz, field -> {
            boolean isFieldAuditable = field.isAnnotationPresent(Auditable.class);
            if (!isClassAuditable && !isFieldAuditable) {
                return;
            }

            field.setAccessible(true);
            Object oldValue = field.get(effectiveOldState);
            Object newValue = field.get(effectiveNewState);
            
            boolean mask = false;
            if (isFieldAuditable) {
                mask = field.getAnnotation(Auditable.class).mask();
            } else if (isClassAuditable) {
                 mask = clazz.getAnnotation(Auditable.class).mask();
            }

            String fieldName = prefix.isEmpty() ? field.getName() : prefix + "." + field.getName();

            // Recurse
            List<FieldChange> fieldDiffs = detectChanges(fieldName, oldValue, newValue, depth + 1);
                 
            if (mask && !fieldDiffs.isEmpty()) {
                for (FieldChange fc : fieldDiffs) {
                    fc.setPreviousValue("****");
                    fc.setNewValue("****");
                }
            }
            changes.addAll(fieldDiffs);
        });

        return changes;
    }
    
    // Improved Collection Auditing
    private List<FieldChange> detectCollectionChanges(String prefix, Collection<?> oldColl, Collection<?> newColl, int depth) {
        List<FieldChange> changes = new ArrayList<>();
        
        if (oldColl instanceof List && newColl instanceof List) {
            // List specific handling for modification at index
            List<?> oldList = (List<?>) oldColl;
            List<?> newList = (List<?>) newColl;
            int max = Math.max(oldList.size(), newList.size());
            
            for (int i = 0; i < max; i++) {
                String itemPrefix = prefix + "[" + i + "]";
                if (i < oldList.size() && i < newList.size()) {
                    changes.addAll(detectChanges(itemPrefix, oldList.get(i), newList.get(i), depth + 1));
                } else if (i < newList.size()) {
                    changes.add(new FieldChange(prefix, null, "Added: " + safeToString(newList.get(i))));
                } else {
                    changes.add(new FieldChange(prefix, safeToString(oldList.get(i)), "Removed"));
                }
            }
            return changes;
        }
        
        // For Set or general Collection
        Map<Object, Object> oldMap = mapByIdOrValue(oldColl);
        Map<Object, Object> newMap = mapByIdOrValue(newColl);
        
        Set<Object> allKeys = new HashSet<>();
        allKeys.addAll(oldMap.keySet());
        allKeys.addAll(newMap.keySet());
        
        for (Object key : allKeys) {
            Object oldVal = oldMap.get(key);
            Object newVal = newMap.get(key);
            
            if (oldVal != null && newVal != null) {
                // Both exist, did it modify?
                String itemPrefix = prefix + "[" + key + "]"; 
                changes.addAll(detectChanges(itemPrefix, oldVal, newVal, depth + 1));
            } else if (oldVal == null && newVal != null) {
                changes.add(new FieldChange(prefix, null, "Added: " + safeToString(newVal)));
            } else if (oldVal != null && newVal == null) {
                changes.add(new FieldChange(prefix, safeToString(oldVal), "Removed"));
            }
        }
        
        return changes;
    }

    private Map<Object, Object> mapByIdOrValue(Collection<?> coll) {
        Map<Object, Object> map = new HashMap<>();
        for (Object item : coll) {
            Object id = getId(item);
            if (id != null) {
                map.put(id, item);
            } else {
                map.put(item, item);
            }
        }
        return map;
    }

    private Object getId(Object o) {
        if (o == null || isSimpleType(o.getClass())) return null;
        
        // Try @Id annotation
        Class<?> clazz = o.getClass();
        
        for (Field f : clazz.getDeclaredFields()) {
            if (f.isAnnotationPresent(Id.class) || f.getName().equalsIgnoreCase("id")) {
                try {
                    f.setAccessible(true);
                    return f.get(o);
                } catch (IllegalAccessException e) {
                    // ignore
                }
            }
        }
        return null; // No ID found
    }

    private Object unproxy(Object o) {
        if (o instanceof HibernateProxy) {
            return ((HibernateProxy) o).getHibernateLazyInitializer().getImplementation();
        }
        return o;
    }

    private boolean isSimpleType(Class<?> clazz) {
        return clazz.isPrimitive() || 
               clazz.equals(String.class) || 
               Number.class.isAssignableFrom(clazz) || 
               Boolean.class.isAssignableFrom(clazz) || 
               Date.class.isAssignableFrom(clazz) ||
               java.time.temporal.Temporal.class.isAssignableFrom(clazz) ||
               clazz.isEnum();
    }

    private String safeToString(Object o) {
        return o == null ? "null" : o.toString();
    }
}

package com.audit.engine.core;

import com.audit.engine.annotation.Auditable;
import com.audit.engine.model.FieldChange;
import org.hibernate.proxy.HibernateProxy;
import org.springframework.stereotype.Component;
import org.springframework.util.ReflectionUtils;

import java.lang.reflect.Field;
import java.util.*;

@Component
public class ChangeDetector {

    public List<FieldChange> detectChanges(Object oldState, Object newState) {
        return detectChanges("", oldState, newState, 0);
    }

    private List<FieldChange> detectChanges(String prefix, Object oldState, Object newState, int depth) {
        final Object effectiveOldState = (oldState instanceof HibernateProxy) ? 
            ((HibernateProxy) oldState).getHibernateLazyInitializer().getImplementation() : oldState;
            
        final Object effectiveNewState = (newState instanceof HibernateProxy) ? 
            ((HibernateProxy) newState).getHibernateLazyInitializer().getImplementation() : newState;

        List<FieldChange> changes = new ArrayList<>();
        if (depth > 2) { 
             return changes;
        }

        if (effectiveOldState == null && effectiveNewState == null) return changes;

        // Handle Null to Non-Null and vice versa
        if (effectiveOldState == null || effectiveNewState == null) {
            // Whole object changed
            String propertyName = prefix.isEmpty() ? "root" : prefix;
             changes.add(new FieldChange(
                    propertyName,
                    effectiveOldState == null ? "null" : safeToString(effectiveOldState),
                    effectiveNewState == null ? "null" : safeToString(effectiveNewState)
            ));
            return changes;
        }

        if (effectiveOldState instanceof Collection && effectiveNewState instanceof Collection) {
            // Collection handling
            Collection<?> oldColl = (Collection<?>) effectiveOldState;
            Collection<?> newColl = (Collection<?>) effectiveNewState;
            
            boolean equals = collectionsEqual(oldColl, newColl);
            if (!equals) {
                String diff = computeCollectionDiff(oldColl, newColl);
                changes.add(new FieldChange(prefix, safeToString(effectiveOldState), diff));
            }
            return changes;
        }

        if (effectiveOldState instanceof Map && effectiveNewState instanceof Map) {
             if (!Objects.equals(effectiveOldState, effectiveNewState)) {
                 changes.add(new FieldChange(prefix, safeToString(effectiveOldState), safeToString(effectiveNewState)));
             }
             return changes;
        }

        Class<?> clazz = effectiveOldState.getClass();
        if (!clazz.equals(effectiveNewState.getClass())) {
            // Classes differ? Treat as value replace.
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

        // It is a complex object, recurse fields
        // Check if class is Auditable or we are recursing so we check fields
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
            // Masking priority: Field level overrides? Or if present?
            if (isFieldAuditable) {
                mask = field.getAnnotation(Auditable.class).mask();
            } else if (isClassAuditable) {
                 // Check if field has override? No, Auditable is the only annotation.
                 // If field didn't have annotation, and class did, we check if class wanted mask?
                 // No, Class level mask=true would mean "Audit all fields AND mask them"? Unlikely.
                 // Usually Class level enables auditing. Field level configures it.
                 // If Class has @Auditable(mask=true), maybe all fields are masked.
                 // Let's assume field level wins or fallback to class.
                 mask = clazz.getAnnotation(Auditable.class).mask();
            }

            String fieldName = prefix.isEmpty() ? field.getName() : prefix + "." + field.getName();

            // Recursion Limit check
            if (isSimpleType(field.getType()) || Collection.class.isAssignableFrom(field.getType()) || Map.class.isAssignableFrom(field.getType())) {
                 // Compare immediately
                 List<FieldChange> fieldDiffs = detectChanges(fieldName, oldValue, newValue, depth + 1);
                 
                 // Apply masking to the results if needed
                 if (mask && !fieldDiffs.isEmpty()) {
                     for (FieldChange fc : fieldDiffs) {
                         fc.setPreviousValue("****");
                         fc.setNewValue("****");
                     }
                 }
                 changes.addAll(fieldDiffs);
            } else {
                // Nested Object
                if (depth < 2) {
                     List<FieldChange> fieldDiffs = detectChanges(fieldName, oldValue, newValue, depth + 1);
                     
                     // Apply masking to nested object changes too
                     if (mask && !fieldDiffs.isEmpty()) {
                         for (FieldChange fc : fieldDiffs) {
                             fc.setPreviousValue("****");
                             fc.setNewValue("****");
                         }
                     }
                     
                     changes.addAll(fieldDiffs);
                }
            }

        });

        return changes;
    }

    private boolean collectionsEqual(Collection<?> c1, Collection<?> c2) {
        if (c1 == c2) return true;
        if (c1 == null || c2 == null) return false;
        if (c1.size() != c2.size()) return false;
        
        Iterator<?> i1 = c1.iterator();
        Iterator<?> i2 = c2.iterator();
        while (i1.hasNext()) {
            Object o1 = i1.next();
            Object o2 = i2.next();
            if (!Objects.equals(o1, o2)) {
                 return false;
            }
        }
        return true;
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
    
    // Naive collection diff for the requirement
    private String computeCollectionDiff(Collection<?> oldColl, Collection<?> newColl) {
        // This is a simplified "New Value" representation that shows diff
        // Ideally we put this in newValue and keep old value as simple toString
        
        List<Object> added = new ArrayList<>(newColl);
        added.removeAll(oldColl);
        
        List<Object> removed = new ArrayList<>(oldColl);
        removed.removeAll(newColl);
        
        if (added.isEmpty() && removed.isEmpty()) {
            // Order changed or something?
            return newColl.toString();
        }
        
        StringBuilder sb = new StringBuilder();
        sb.append(newColl.toString()); // The actual new state
        sb.append(" (Diff: ");
        if (!added.isEmpty()) sb.append("Added: ").append(added).append(" ");
        if (!removed.isEmpty()) sb.append("Removed: ").append(removed);
        sb.append(")");
        return sb.toString();
    }
}

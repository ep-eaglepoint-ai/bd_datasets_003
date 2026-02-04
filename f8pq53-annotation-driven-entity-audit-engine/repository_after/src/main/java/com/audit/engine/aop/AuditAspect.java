package com.audit.engine.aop;

import com.audit.engine.annotation.Auditable;
import com.audit.engine.core.ChangeDetector;
import com.audit.engine.event.AuditLogEvent;
import com.audit.engine.model.AuditLog;
import com.audit.engine.model.FieldChange;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Id;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.hibernate.proxy.HibernateProxy;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.util.ReflectionUtils;

import java.lang.reflect.Field;
import java.util.List;

@Aspect
@Component
@RequiredArgsConstructor
public class AuditAspect {

    private final ChangeDetector changeDetector;
    private final ApplicationEventPublisher eventPublisher;

    @PersistenceContext
    private EntityManager entityManager;

    @Around("execution(public * org.springframework.data.repository.Repository+.save(..))")
    public Object auditSave(ProceedingJoinPoint joinPoint) throws Throwable {
        Object[] args = joinPoint.getArgs();
        if (args.length == 0) return joinPoint.proceed();

        Object entity = args[0];
        if (entity == null) return joinPoint.proceed();

        Class<?> clazz = getEffectiveClass(entity);
        if (!clazz.isAnnotationPresent(Auditable.class)) {
            boolean hasAuditableField = false;
            for (Field f : clazz.getDeclaredFields()) {
                 if (f.isAnnotationPresent(Auditable.class)) {
                     hasAuditableField = true;
                     break;
                 }
            }
            if (!hasAuditableField) {
                return joinPoint.proceed();
            }
        }

        // Get ID
        Object id = getId(entity);
        Object oldState = null;

        if (id != null) {
             if (entityManager.contains(entity)) {
                 entityManager.detach(entity);
             } 
             oldState = entityManager.find(clazz, id);
             if (oldState != null) {
                 entityManager.detach(oldState);
             }
        }

        // Proceed (perform update)
        Object result = joinPoint.proceed();

        // Calculate Diff
        try {
            List<FieldChange> changes = changeDetector.detectChanges(oldState, result);

            if (!changes.isEmpty() && oldState != null) {
                AuditLog log = new AuditLog();
                log.setEntityId(id != null ? id.toString() : (getId(result) != null ? getId(result).toString() : "unknown"));
                log.setEntityType(clazz.getSimpleName());
                log.setAction("UPDATE");
                log.setUserId(getCurrentUser());
                log.setTimestamp(java.time.LocalDateTime.now());
                log.setChanges(changes);

                eventPublisher.publishEvent(new AuditLogEvent(this, log));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return result;
    }

    private Class<?> getEffectiveClass(Object entity) {
        if (entity instanceof HibernateProxy) {
            return ((HibernateProxy) entity).getHibernateLazyInitializer().getPersistentClass();
        }
        return entity.getClass();
    }

    private Object getId(Object entity) {
        final Object[] idWrapper = new Object[1];
        ReflectionUtils.doWithFields(entity.getClass(), field -> {
            if (field.isAnnotationPresent(Id.class) || field.isAnnotationPresent(org.springframework.data.annotation.Id.class)) {
                field.setAccessible(true);
                idWrapper[0] = field.get(entity);
            }
        });
        return idWrapper[0];
    }

    private String getCurrentUser() {
        return "system";
    }
}

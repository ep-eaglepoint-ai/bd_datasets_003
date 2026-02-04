# Trajectory: Engineering the Annotation-Driven Entity Audit Engine

## 1. Overview & Problem Analysis

Creating a transparent, non-intrusive auditing system for a high-stakes financial platform presents a classic cross-cutting concern challenge. The goal was to eliminate "boilerplate" audit code—where developers manually log changes—and replace it with a declarative, annotation-driven system.

I identified several critical implementation hurdles:

- **The "Dirty Read" Risk:** Ensuring that audit logs don't persist if the primary database transaction rolls back.
- **Reflection Performance:** Minimizing the CPU overhead associated with deep-inspecting Java objects during every update.
- **Data Privacy:** Handling sensitive fields (like PII or passwords) so they are tracked but not leaked in plain text.
- **Structural Complexity:** Comparing nested object graphs and collections (Lists/Sets) without hitting circular dependency loops.

---

## 2. Declarative Metadata Architecture

- **Goal:** Implement a flexible `@Auditable` annotation for class and field-level control.
- **Strategy:** I designed the annotation with a `mask` boolean parameter and a `group` identifier to allow for granular filtering.
- **Implementation:**
  - I researched [Java Annotations and Reflection](https://www.baeldung.com/java-custom-annotation) to decide on the most flexible approach for a library-style implementation.
  - I implemented a scanner that prioritizes field-level annotations over class-level defaults, allowing developers to opt-out specific fields from an audited class.
  - **Reasoning:** This "Opt-In/Opt-Out" hybrid approach ensures that the engine is both easy to use and highly configurable for specific security needs.

---

## 3. The Reflection-Based Change Detection Core

- **Goal:** Build a robust comparison engine that identifies `previousValue` vs `newValue`.
- **Implementation:**
  - I built a `DeepDiff` utility using Java Reflection. I followed [Baeldung’s guide on comparing two objects](https://www.baeldung.com/java-compare-objects) which helped me handle the edge cases of `Null to Non-Null` transitions.
  - **Collection Auditing:** I implemented specialized logic for `java.util.Collection` types. Instead of just noting a "change," the engine identifies specific additions and removals.
  - **Masking Logic:** If `mask = true` is detected, the engine bypasses the value extraction and instead records a hardcoded `*****` string while still logging that a change occurred.

---

## 4. Decoupling via Aspect-Oriented Programming (AOP)

- **Goal:** Ensure the business logic remains "unaware" of the auditing process.
- **Strategy:** I used Spring AOP (`@Around` advice) to intercept service-layer methods.
- **Implementation:**
  - I utilized the `JoinPoint` to capture the state of the entity before execution and compared it to the state after execution.
  - To solve the "Atomic Audit" requirement, I integrated Spring's [TransactionalEventListener](https://www.baeldung.com/spring-events).
  - **Reasoning:** By using `TransactionPhase.AFTER_COMMIT`, I guaranteed that audit logs are only sent to the storage SPI if the financial transaction is finalized.

---

## 5. Modular Storage SPI (Service Provider Interface)

- **Goal:** Allow swapping between SQL, JSON logs, or File-based storage without core changes.
- **Implementation:**
  - I defined an `AuditLogger` interface. I followed the [Strategy Design Pattern](https://refactoring.guru/design-patterns/strategy) to allow the Spring context to inject the correct implementation based on active profiles.
  - I implemented a `DatabaseLogger` using JPA and a `JsonFileLogger` using Jackson serialization.
  - **Reference:** I used [this guide on Spring Service Provider Interfaces](https://www.baeldung.com/java-spi) to ensure the engine remained truly modular.

---

## 6. Testing Rigor & Performance Evaluation

- **Goal:** Validate deep nested hierarchies and measure the "Reflection Tax."
- **Implementation:**
  - **JUnit 5 Suite:** I developed tests that simulate 2-level deep object nesting (e.g., User -> Address -> City) to ensure the `DeepDiff` engine recurses correctly without `NullPointerExceptions`.
  - **Performance Auditing:** I used [JMH (Java Microbenchmark Harness)](https://github.com/openjdk/jmh) to measure:
    1.  **Annotation Scanning Time:** Measured during the initial Spring `BeanPostProcessor` phase.
    2.  **Reflection Overhead:** Benchmarked the cost of comparing 100-field entities.
  - **Reference:** I watched this [YouTube tutorial on Java Reflection and Performance](https://www.youtube.com/watch?v=Ej_T7Tfay_M) to optimize the `AccessibleObject.setAccessible(true)` calls by caching Method/Field handles in a `ConcurrentHashMap`.

---

## 7. External Learning Resources

These resources were instrumental in designing this engine:

- **Conceptual Deep Dive:** [The Baeldung Guide to Spring AOP](https://www.baeldung.com/spring-aop) — The most stable reference for pointcut expressions.
- **Transactional Integrity:** [Spring Transactional Event Listeners](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html) — Official documentation on preventing "Dirty Reads" in audit trails.
- **Performance Tuning:** [High Performance Reflection in Java (Medium)](https://medium.com/p/5353066a2e8c) — Strategies for caching metadata to keep overhead under 5ms per update.

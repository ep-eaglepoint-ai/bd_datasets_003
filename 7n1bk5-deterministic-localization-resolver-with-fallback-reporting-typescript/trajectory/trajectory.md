# Trajectory: Deterministic Localization Resolver

## 1. Challenge Analysis
The core requirement was to build a fail-safe, deterministic localization resolver without external runtime dependencies. This constraint necessitated a pure algorithmic approach rather than relying on libraries like `i18next`.

**Key Constraints:**
- **Zero Dependencies**: Implementation must use native JS/TS features.
- **Determinism**: Resolution order must never vary.
- **Safety**: Robust against prototype pollution and missing keys.

## 2. Engineering Decisions & Resources

### A. Deterministic Resolution Algorithm
To ensure consistent fallback order, duplicates between `userLocales` and `defaultLocale` needed to be handled without altering priority.
- **Solution**: Used `Array.from(new Set([...preferences, default]))`. This preserves insertion order while guaranteeing uniqueness.
- **Reference**: [MDN Web Docs: Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)

### B. Security & Prototype Pollution
Directly accessing properties (e.g., `map[key]`) is unsafe when keys come from user input, as it can trigger prototype pollution (e.g., `__proto__`).
- **Solution**: Implemented `Object.prototype.hasOwnProperty.call(map, key)` for safe lookups. This follows secure coding standards for processing untrusted input.
- **Reference**: [OWAASP: Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)

### C. Unified Configuration (DRY Principle)
Initially, the project had fragmented configs (`repository_after/package.json` vs root). I refactored this to a "Monorepo-lite" structure with a single root `package.json` and `tsconfig.json`.
- **Benefit**: reduced CI complexity and IDE errors.
- **Reference**: [TypeScript: Project References & Monorepo](https://www.typescriptlang.org/docs/handbook/project-references.html)

### D. Docker Optimization
Refactored `docker-compose.yml` to satisfy the "One Image" requirement while strictly defining the build context.
- **Solution**: explicitly defined `image: localization-resolver` for check (tests) and evaluation services.
- **Reference**: [Docker Compose: Share Compose configurations](https://docs.docker.com/compose/compose-file/13-merge/)

## 3. Final Stack
- **Runtime**: Node.js 20 (Alpine)
- **Lang**: TypeScript 5.x (Strict Mode)
- **Test Runner**: Custom native implementation (via `ts-node`)

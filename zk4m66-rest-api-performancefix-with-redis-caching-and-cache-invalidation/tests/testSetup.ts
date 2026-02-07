// tests/testSetup.ts

const target = process.env.TARGET_REPO || 'after'

const basePath =
	target === 'before' ? '/app/repository_before' : '/app/repository_after'

;(global as any).__TARGET_REPO__ = basePath

console.log('[TEST SETUP] Using repo:', basePath)

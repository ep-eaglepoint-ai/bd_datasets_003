import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
// Polyfill for structuredClone (not available in Node test environment)
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import '@testing-library/jest-dom';

// Polyfill structuredClone
if (typeof global.structuredClone === 'undefined') {
    global.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;

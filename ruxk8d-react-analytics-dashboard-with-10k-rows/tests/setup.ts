import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock height/width properties for virtualization
Object.defineProperties(window.HTMLElement.prototype, {
    offsetHeight: { get() { return parseFloat(this.style.height) || 0; } },
    offsetWidth: { get() { return parseFloat(this.style.width) || 0; } },
    clientHeight: { get() { return parseFloat(this.style.height) || 0; } },
    clientWidth: { get() { return parseFloat(this.style.width) || 0; } },
    scrollHeight: { get() { return 10000; } },
});

// Mock WebSocket
const MockWS = class {
    url: string;
    onmessage: ((ev: any) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    onclose: ((ev: any) => void) | null = null;
    readyState = 1;

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url: string) {
        this.url = url;
    }
    send(data: any) { }
    close() { }
};

global.WebSocket = MockWS as any;

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Service Worker Strategy', () => {
    const swPath = path.resolve(__dirname, '../repository_after/client/src/sw/service-worker.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    it('should call skipWaiting() in the install phase', () => {
        // Once installed, the service worker must skip waiting to take control of all open clients
        expect(swContent).toMatch(/self\.skipWaiting\(\)/);
    });

    it('should call clients.claim() in the activate phase', () => {
        // Once activated, the service worker must take control of all open clients immediately
        expect(swContent).toMatch(/self\.clients\.claim\(\)/);
    });

    it('should implement Cache-First strategy (caches.match before fetch)', () => {
        // Assert that caches.match comes before fetch in the respondWith block
        const fetchHandlerRegex = /self\.addEventListener\(['"]fetch['"][\s\S]*?event\.respondWith\([\s\S]*?caches\.match\([\s\S]*?fetch\(/;
        expect(swContent).toMatch(fetchHandlerRegex);
    });
});
